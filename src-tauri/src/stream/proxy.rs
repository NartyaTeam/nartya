//! Proxy local sur le loopback : flux distants (par poignée). Toute requête porte le jeton `t`.
//! La page ne connaît jamais l'URL réelle de l'hébergeur.

use std::{
    collections::HashMap,
    io,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::{
        atomic::{AtomicU16, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use bytes::Bytes;
use futures_util::{
    future::{BoxFuture, Shared},
    stream, FutureExt, Stream, StreamExt,
};
use indexmap::IndexMap;
use reqwest::Method as UpMethod;
use tokio::sync::{mpsc, oneshot, Semaphore};

use super::{
    handles::{random_token, Handles, Target},
    hls::{transform_playlist, Rewrite},
    net::{redact_urls, Net, NetError},
    provider::build_provider_request,
    range::{parse_byte_range, slice_stream},
    recipe::RecipeStore,
};
use crate::downloads::SharedRoot;

// Le <video> natif n'a pas le buffer de hls.js : la file découple la lecture du CDN de l'écriture
// vers le lecteur et absorbe la gigue.
const MP4_READAHEAD_BYTES: usize = 24 * 1024 * 1024;
// Courte : une URL signée périmée se re-résout toute seule.
const SIGNED_URL_TTL: Duration = Duration::from_secs(10 * 60);
// Servie seulement si le lecteur la réclame aussitôt.
const WARM_PLAYLIST_TTL: Duration = Duration::from_secs(30);
const SEGMENT_CACHE_MAX_BYTES: usize = 80 * 1024 * 1024;
const SEGMENT_CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const SEGMENT_MAX_CACHEABLE: usize = 6 * 1024 * 1024;
const HEADERS_TIMEOUT: Duration = Duration::from_secs(60);

type WarmFuture = Shared<BoxFuture<'static, Option<(String, String)>>>;

struct Segment {
    buf: Bytes,
    content_type: String,
    at: Instant,
}

/// Les segments sont immuables : les garder évite un aller-retour CDN lors des seeks (LRU).
#[derive(Default)]
struct SegmentCache {
    entries: IndexMap<String, Segment>,
    used: usize,
}

impl SegmentCache {
    fn get(&mut self, url: &str) -> Option<(Bytes, String)> {
        let entry = self.entries.shift_remove(url)?;
        if entry.at.elapsed() > SEGMENT_CACHE_TTL {
            self.used -= entry.buf.len();
            return None;
        }
        let out = (entry.buf.clone(), entry.content_type.clone());
        self.entries.insert(url.to_string(), entry);
        Some(out)
    }

    fn put(&mut self, url: &str, buf: Bytes, content_type: String) {
        if buf.len() > SEGMENT_MAX_CACHEABLE {
            return;
        }
        if let Some(old) = self.entries.shift_remove(url) {
            self.used -= old.buf.len();
        }
        while self.used + buf.len() > SEGMENT_CACHE_MAX_BYTES {
            let Some((_, oldest)) = self.entries.shift_remove_index(0) else {
                break;
            };
            self.used -= oldest.buf.len();
        }
        self.used += buf.len();
        self.entries.insert(
            url.to_string(),
            Segment {
                buf,
                content_type,
                at: Instant::now(),
            },
        );
    }
}

pub fn is_segment_url(url: &str) -> bool {
    let path = url.split('?').next().unwrap_or("").to_lowercase();
    path.ends_with(".ts")
        || path.ends_with(".m4s")
        || path.ends_with(".aac")
        || (path.ends_with(".mp4") && !path.contains("/embed") && !path.contains("shell.php"))
}

/// Où et avec quel jeton le client nous joint : loopback pour la page, réseau local pour la TV.
struct Scope {
    origin: String,
    token: String,
}

impl Scope {
    fn token_suffix(&self) -> String {
        format!("&t={}", urlencoding::encode(&self.token))
    }
}

/// Listener ouvert sur le réseau local le temps d'un cast, protégé par son propre jeton.
struct Lan {
    port: u16,
    token: String,
    _stop: oneshot::Sender<()>,
}

#[derive(Clone)]
struct Ctx {
    proxy: Arc<Proxy>,
    lan: bool,
}

pub struct Proxy {
    pub net: Arc<Net>,
    pub recipe: Arc<RecipeStore>,
    pub handles: Arc<Handles>,
    token: String,
    port: AtomicU16,
    segments: Mutex<SegmentCache>,
    warm: Mutex<IndexMap<String, (WarmFuture, Instant)>>,
    signed: Mutex<IndexMap<String, (String, Instant)>>,
    /// Racine des téléchargements, servis sous `/local`.
    local_root: SharedRoot,
    lan: Mutex<Option<Lan>>,
    /// Dernière requête reçue de chaque appareil sur le listener LAN.
    lan_seen: Mutex<HashMap<IpAddr, Instant>>,
}

fn cors(builder: axum::http::response::Builder) -> axum::http::response::Builder {
    builder
        .header("access-control-allow-origin", "*")
        .header("access-control-allow-methods", "GET, OPTIONS")
        .header("access-control-allow-headers", "Range, Content-Type")
}

fn json_error(status: StatusCode, message: &str) -> Response {
    let body = serde_json::json!({ "success": false, "error": message }).to_string();
    cors(Response::builder())
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap()
}

fn permits_for(len: usize, total: usize) -> u32 {
    (len / 1024 + 1).min(total) as u32
}

/// Le producteur lit le CDN jusqu'à `max_bytes` d'avance ; un client qui coupe (seek) arrête la lecture
/// amont aussitôt.
fn read_ahead<S>(upstream: S, max_bytes: usize) -> Body
where
    S: Stream<Item = Result<Bytes, io::Error>> + Send + 'static,
{
    let total = max_bytes / 1024;
    let (tx, rx) = mpsc::unbounded_channel::<Result<Bytes, io::Error>>();
    let sem = Arc::new(Semaphore::new(total));
    let producer_sem = sem.clone();

    tokio::spawn(async move {
        let mut upstream = Box::pin(upstream);
        while let Some(item) = upstream.next().await {
            match item {
                Ok(chunk) => {
                    let permits = permits_for(chunk.len(), total);
                    tokio::select! {
                        _ = tx.closed() => return,
                        acquired = producer_sem.acquire_many(permits) => match acquired {
                            Ok(p) => p.forget(),
                            Err(_) => return,
                        },
                    }
                    if tx.send(Ok(chunk)).is_err() {
                        return;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                    return;
                }
            }
        }
    });

    let body = stream::unfold((rx, sem), move |(mut rx, sem)| async move {
        let item = rx.recv().await?;
        if let Ok(chunk) = &item {
            sem.add_permits(permits_for(chunk.len(), total) as usize);
        }
        Some((item, (rx, sem)))
    });
    Body::from_stream(body)
}

fn to_io(e: reqwest::Error) -> io::Error {
    io::Error::other(redact_urls(&e.without_url().to_string()))
}

impl Proxy {
    pub fn new(
        net: Arc<Net>,
        recipe: Arc<RecipeStore>,
        handles: Arc<Handles>,
        local_root: SharedRoot,
    ) -> Arc<Self> {
        Arc::new(Self {
            net,
            recipe,
            handles,
            token: random_token(24),
            port: AtomicU16::new(0),
            segments: Mutex::default(),
            warm: Mutex::default(),
            signed: Mutex::default(),
            local_root,
            lan: Mutex::default(),
            lan_seen: Mutex::default(),
        })
    }

    pub fn port(&self) -> Option<u16> {
        match self.port.load(Ordering::SeqCst) {
            0 => None,
            p => Some(p),
        }
    }

    /// `None` si le proxy n'a pas démarré.
    pub fn playback_url(&self, handle: &str, is_hls: bool) -> Option<String> {
        let port = self.port()?;
        let kind = if is_hls { "&kind=hls" } else { "" };
        Some(format!(
            "http://127.0.0.1:{port}/video/proxy?h={handle}{kind}&t={}",
            self.token
        ))
    }

    /// Fichier téléchargé ; `None` si le proxy n'a pas démarré.
    pub fn local_url(&self, id: &str, rel: &str) -> Option<String> {
        let port = self.port()?;
        Some(format!(
            "http://127.0.0.1:{port}/local?id={}&path={}&t={}",
            urlencoding::encode(id),
            urlencoding::encode(rel),
            urlencoding::encode(&self.token)
        ))
    }

    fn token_ok(given: Option<&String>, expected: &str) -> bool {
        let Some(given) = given else { return false };
        let (a, b) = (given.as_bytes(), expected.as_bytes());
        // Temps constant sur la longueur attendue.
        !b.is_empty()
            && a.len() == b.len()
            && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
    }

    /// `None` : jeton invalide. Sur le LAN, l'hôte demandé n'est cru que s'il est une IPv4 avec
    /// notre port (il finit dans les playlists réécrites).
    fn scope_for(
        &self,
        lan: bool,
        query: &HashMap<String, String>,
        headers: &HeaderMap,
    ) -> Option<Scope> {
        let given = query.get("t");
        if !lan {
            if !Self::token_ok(given, &self.token) {
                return None;
            }
            return Some(Scope {
                origin: format!("http://127.0.0.1:{}", self.port().unwrap_or(0)),
                token: self.token.clone(),
            });
        }
        let guard = self.lan.lock().unwrap();
        let lan = guard.as_ref()?;
        if !Self::token_ok(given, &lan.token) {
            return None;
        }
        let host = headers
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .and_then(|h| h.parse::<SocketAddr>().ok())
            .filter(|a| a.is_ipv4() && a.port() == lan.port)
            .map(|a| a.to_string())
            .unwrap_or_else(|| format!("127.0.0.1:{}", lan.port));
        Some(Scope {
            origin: format!("http://{host}"),
            token: lan.token.clone(),
        })
    }

    fn router(self: &Arc<Self>, lan: bool) -> Router {
        Router::new()
            .route("/video/proxy", get(handle_get).options(handle_preflight))
            .route("/local", get(handle_local).options(handle_preflight))
            .fallback(|| async { json_error(StatusCode::NOT_FOUND, "Not Found") })
            .with_state(Ctx {
                proxy: self.clone(),
                lan,
            })
    }

    pub async fn start(self: &Arc<Self>) -> io::Result<u16> {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let port = listener.local_addr()?.port();
        self.port.store(port, Ordering::SeqCst);
        let app = self
            .router(false)
            .into_make_service_with_connect_info::<SocketAddr>();
        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        Ok(port)
    }

    /// Ouvre le listener LAN (0.0.0.0) s'il ne l'est pas déjà.
    async fn start_lan(self: &Arc<Self>) -> io::Result<()> {
        if self.lan.lock().unwrap().is_some() {
            return Ok(());
        }
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).await?;
        let port = listener.local_addr()?.port();
        let (stop, stopped) = oneshot::channel::<()>();
        {
            let mut guard = self.lan.lock().unwrap();
            if guard.is_some() {
                return Ok(());
            }
            *guard = Some(Lan {
                port,
                token: random_token(24),
                _stop: stop,
            });
        }
        let app = self
            .router(true)
            .into_make_service_with_connect_info::<SocketAddr>();
        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = stopped.await;
                })
                .await;
        });
        println!("[cast] serveur LAN démarré sur le port {port}");
        Ok(())
    }

    pub fn stop_lan(&self) {
        if self.lan.lock().unwrap().take().is_some() {
            self.lan_seen.lock().unwrap().clear();
            println!("[cast] serveur LAN arrêté");
        }
    }

    pub fn last_lan_request_from(&self, ip: IpAddr) -> Option<Instant> {
        self.lan_seen.lock().unwrap().get(&ip).copied()
    }

    /// Adresse du proxy vue de `device_ip` : carte du même sous-réseau, port LAN, jeton de cast.
    /// Seul ce qui sort de notre proxy loopback (avec son jeton) est accepté.
    pub async fn to_cast_url(
        self: &Arc<Self>,
        local_url: &str,
        device_ip: Ipv4Addr,
    ) -> Option<String> {
        let mut url = url::Url::parse(local_url).ok()?;
        let port = self.port()?;
        let loopback = matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"));
        if !loopback
            || url.port() != Some(port)
            || !matches!(url.path(), "/video/proxy" | "/local")
        {
            return None;
        }
        let given = url
            .query_pairs()
            .find(|(k, _)| k == "t")
            .map(|(_, v)| v.into_owned());
        if !Self::token_ok(given.as_ref(), &self.token) {
            return None;
        }
        self.start_lan().await.ok()?;
        let (lan_port, lan_token) = {
            let guard = self.lan.lock().unwrap();
            let lan = guard.as_ref()?;
            (lan.port, lan.token.clone())
        };
        let local = crate::cast::net::local_address_for(device_ip);
        url.set_host(Some(&local.to_string())).ok()?;
        url.set_port(Some(lan_port)).ok()?;
        let pairs: Vec<(String, String)> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .filter(|(k, _)| k != "t")
            .chain(std::iter::once(("t".to_string(), lan_token)))
            .collect();
        url.query_pairs_mut().clear().extend_pairs(pairs);
        Some(url.to_string())
    }

    /// Le lecteur la demande dans la seconde : la connexion au CDN est déjà ouverte.
    pub fn warm_up(self: &Arc<Self>, handle: &str) {
        let Some(target) = self.handles.resolve(handle) else {
            return;
        };
        if self.warm.lock().unwrap().contains_key(handle) {
            return;
        }
        let this = self.clone();
        let fut: BoxFuture<'static, Option<(String, String)>> = async move {
            let recipe = this.recipe.current();
            let provider = provider_of(&target, recipe.as_deref());
            let mut req =
                build_provider_request(&target.url, recipe.as_deref(), provider.as_deref(), None);
            apply_referer(&mut req.headers, &target);
            let response = this
                .net
                .fetch_checked_with_retry(
                    UpMethod::GET,
                    &req.url,
                    &req.headers,
                    Duration::from_secs(10),
                )
                .await
                .ok()?;
            if !response.status().is_success() {
                return None;
            }
            let url = response.url().to_string();
            Some((response.text().await.ok()?, url))
        }
        .boxed();
        let shared = fut.shared();
        // Avance sans attendre qu'on la réclame.
        tokio::spawn(shared.clone());

        let mut warm = self.warm.lock().unwrap();
        warm.insert(handle.to_string(), (shared, Instant::now()));
        if warm.len() > 16 {
            warm.shift_remove_index(0);
        }
    }

    /// Servie une fois ; `None` si absente ou périmée.
    fn take_warm(&self, handle: &str) -> Option<WarmFuture> {
        let (fut, at) = self.warm.lock().unwrap().shift_remove(handle)?;
        (at.elapsed() <= WARM_PLAYLIST_TTL).then_some(fut)
    }

    /// Certains hôtes redirigent vers une URL signée dont la première requête ignore `Range` : on
    /// résout la chaîne une fois en consommant ce premier appel. `None` sans redirection.
    async fn signed_url_for(
        &self,
        original: &str,
        headers: &HashMap<String, String>,
    ) -> Option<String> {
        if let Some((url, at)) = self.signed.lock().unwrap().get(original) {
            if at.elapsed() < SIGNED_URL_TTL {
                return Some(url.clone());
            }
        }
        let timeout = Duration::from_secs(15);
        let head = self
            .net
            .fetch_checked(UpMethod::HEAD, original, headers, timeout)
            .await
            .ok()?;
        let url = head.url().to_string();
        drop(head);
        if url == original {
            return None;
        }
        let mut primer = headers.clone();
        primer.insert("Range".into(), "bytes=0-1".into());
        drop(
            self.net
                .fetch_checked(UpMethod::GET, &url, &primer, timeout)
                .await
                .ok()?,
        );

        let mut signed = self.signed.lock().unwrap();
        signed.insert(original.to_string(), (url.clone(), Instant::now()));
        if signed.len() > 32 {
            signed.shift_remove_index(0);
        }
        Some(url)
    }

    fn send_playlist(
        &self,
        target: &Target,
        provider: Option<&str>,
        content: &str,
        base: &str,
        scope: &Scope,
    ) -> Response {
        let rewrite = Rewrite {
            provider,
            referer: &target.referer,
            origin: &target.origin,
            token_suffix: &scope.token_suffix(),
        };
        let body = transform_playlist(
            content,
            base,
            &format!("{}/video/proxy", scope.origin),
            &rewrite,
            &|t| self.handles.mint(t),
        );
        cors(Response::builder())
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
            .body(Body::from(body))
            .unwrap()
    }

    async fn handle_proxy(
        self: &Arc<Self>,
        handle: &str,
        target: Arc<Target>,
        range: Option<String>,
        scope: &Scope,
    ) -> Response {
        let recipe = self.recipe.current();
        let provider = provider_of(&target, recipe.as_deref());
        let log_target = format!("poignée {handle} ({})", provider.as_deref().unwrap_or("?"));

        if range.is_none() && is_segment_url(&target.url) {
            if let Some((buf, content_type)) = self.segments.lock().unwrap().get(&target.url) {
                return cors(Response::builder())
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, content_type)
                    .header(header::CONTENT_LENGTH, buf.len())
                    .header(header::CACHE_CONTROL, "public, max-age=3600, immutable")
                    .header("x-proxy-cache", "HIT")
                    .body(Body::from(buf))
                    .unwrap();
            }
        }

        let mut req = build_provider_request(
            &target.url,
            recipe.as_deref(),
            provider.as_deref(),
            range.as_deref(),
        );
        apply_referer(&mut req.headers, &target);

        if range.is_none() {
            if let Some(warm) = self.take_warm(handle) {
                if let Some((text, url)) = warm.await {
                    return self.send_playlist(&target, provider.as_deref(), &text, &url, scope);
                }
            }
        }

        let fetched = self
            .net
            .fetch_checked_with_retry(UpMethod::GET, &req.url, &req.headers, HEADERS_TIMEOUT)
            .await;
        let mut response = match fetched {
            Ok(r) => r,
            Err(e) => return upstream_failure(&e, &log_target),
        };

        if range.is_some() && response.status() == reqwest::StatusCode::OK {
            if let Some(signed) = self.signed_url_for(&req.url, &req.headers).await {
                if signed != req.url {
                    match self
                        .net
                        .fetch_checked_with_retry(
                            UpMethod::GET,
                            &signed,
                            &req.headers,
                            HEADERS_TIMEOUT,
                        )
                        .await
                    {
                        Ok(retry) if retry.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                            response = retry
                        }
                        Ok(_) => {}
                        Err(e) => eprintln!("[proxy] Range sur URL signée a échoué : {e}"),
                    }
                }
            }
        }

        let status = response.status();
        if !status.is_success() {
            eprintln!(
                "[proxy] HTTP {} (provider={}) {log_target}",
                status.as_u16(),
                provider.as_deref().unwrap_or("inconnu")
            );
            let reason = status.canonical_reason().unwrap_or("");
            return json_error(
                StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
                &format!("Erreur HTTP {}: {reason}", status.as_u16()),
            );
        }

        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let is_playlist = content_type.contains("application/vnd.apple.mpegurl")
            || content_type
                .to_lowercase()
                .contains("application/x-mpegurl")
            || req.url.contains(".m3u8");

        if is_playlist {
            let base = response.url().to_string();
            return match response.text().await {
                Ok(text) => self.send_playlist(&target, provider.as_deref(), &text, &base, scope),
                Err(e) => json_error(
                    StatusCode::BAD_GATEWAY,
                    &redact_urls(&e.without_url().to_string()),
                ),
            };
        }
        if range.is_none() && is_segment_url(&req.url) {
            return self.stream_and_cache(response, req.url, content_type);
        }
        self.stream_media(
            response,
            range.as_deref(),
            &content_type,
            &req.url,
            provider.as_deref(),
        )
    }

    /// Chaque morceau part au lecteur dès réception, une copie s'accumule pour le cache. Jamais un
    /// segment incomplet : hls.js abandonne souvent une requête en route, et un segment tronqué
    /// peut perdre sa piste audio.
    fn stream_and_cache(
        self: &Arc<Self>,
        response: reqwest::Response,
        url: String,
        content_type: String,
    ) -> Response {
        let expected = response.content_length();
        let mut builder = cors(Response::builder())
            .status(StatusCode::OK)
            .header(
                header::CONTENT_TYPE,
                if content_type.is_empty() {
                    "video/mp2t"
                } else {
                    content_type.as_str()
                },
            )
            .header(header::CACHE_CONTROL, "public, max-age=3600, immutable");
        if let Some(len) = expected {
            builder = builder.header(header::CONTENT_LENGTH, len);
        }

        let (tx, mut rx) = mpsc::channel::<Result<Bytes, io::Error>>(32);
        let this = self.clone();
        let cache_type = if content_type.is_empty() {
            "video/mp2t".to_string()
        } else {
            content_type
        };
        tokio::spawn(async move {
            let mut upstream = response.bytes_stream();
            let mut buffer: Vec<u8> = Vec::new();
            let mut received = 0usize;
            let mut cacheable = true;
            let mut client_gone = false;
            while let Some(item) = upstream.next().await {
                match item {
                    Ok(chunk) => {
                        received += chunk.len();
                        if tx.send(Ok(chunk.clone())).await.is_err() {
                            client_gone = true;
                            break;
                        }
                        if cacheable {
                            if buffer.len() + chunk.len() > SEGMENT_MAX_CACHEABLE {
                                cacheable = false;
                                buffer = Vec::new();
                            } else {
                                buffer.extend_from_slice(&chunk);
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(to_io(e))).await;
                        return;
                    }
                }
            }
            let complete = expected == Some(received as u64) && !client_gone;
            if cacheable && complete && received > 0 {
                this.segments
                    .lock()
                    .unwrap()
                    .put(&url, Bytes::from(buffer), cache_type);
            } else if cacheable && !complete {
                // Fréquent au démarrage et sur les seeks.
                eprintln!(
                    "[proxy] segment non mis en cache : incomplet ({received}/{} octets{})",
                    expected
                        .map(|e| e.to_string())
                        .unwrap_or_else(|| "?".into()),
                    if client_gone { ", client parti" } else { "" }
                );
            }
        });

        let body = stream::poll_fn(move |cx| rx.poll_recv(cx));
        builder.body(Body::from_stream(body)).unwrap()
    }

    /// Streaming normal (Range, ressources diverses), tronqué aux bornes demandées si l'hôte a ignoré `Range`.
    fn stream_media(
        &self,
        response: reqwest::Response,
        range: Option<&str>,
        content_type: &str,
        url: &str,
        provider: Option<&str>,
    ) -> Response {
        let mut builder = cors(Response::builder());
        if !content_type.is_empty() {
            builder = builder.header(header::CONTENT_TYPE, content_type);
        }
        let lower = url.to_lowercase();
        if lower.contains(".ts")
            || lower.contains(".m4s")
            || lower.contains(".mp4")
            || content_type.contains("video/")
        {
            builder = builder.header(header::CACHE_CONTROL, "public, max-age=3600, immutable");
        }

        let status = response.status();
        let header_of = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string)
        };
        let content_range = header_of("content-range");
        let content_length = header_of("content-length");
        let upstream = response.bytes_stream().map(|r| r.map_err(to_io));

        let body = match (range, status.as_u16()) {
            (Some(_), 206) => {
                builder = builder
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::ACCEPT_RANGES, "bytes");
                if let Some(v) = content_range {
                    builder = builder.header(header::CONTENT_RANGE, v);
                }
                if let Some(v) = content_length {
                    builder = builder.header(header::CONTENT_LENGTH, v);
                }
                read_ahead(upstream, MP4_READAHEAD_BYTES)
            }
            (Some(range), 200) => {
                let total = content_length
                    .as_deref()
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(0);
                match parse_byte_range(range, total) {
                    Some((start, end)) => {
                        builder = builder
                            .status(StatusCode::PARTIAL_CONTENT)
                            .header(
                                header::CONTENT_RANGE,
                                format!("bytes {start}-{end}/{total}"),
                            )
                            .header(header::CONTENT_LENGTH, end - start + 1)
                            .header(header::ACCEPT_RANGES, "bytes");
                        if start > 0 {
                            eprintln!(
                                "[proxy] Range ignoré par l'hôte (provider={}) : {:.1} Mo téléchargés puis jetés pour servir {start}-{end}",
                                provider.unwrap_or("inconnu"),
                                start as f64 / 1e6
                            );
                        }
                        read_ahead(
                            slice_stream(Box::pin(upstream), start, end),
                            MP4_READAHEAD_BYTES,
                        )
                    }
                    None => {
                        // `Accept-Ranges: none` dit au lecteur que le seek n'est pas supporté.
                        if let Some(v) = content_length {
                            builder = builder.header(header::CONTENT_LENGTH, v);
                        }
                        builder = builder
                            .status(StatusCode::OK)
                            .header(header::ACCEPT_RANGES, "none");
                        read_ahead(upstream, MP4_READAHEAD_BYTES)
                    }
                }
            }
            _ => {
                if let Some(v) = content_length {
                    builder = builder.header(header::CONTENT_LENGTH, v);
                }
                builder = builder
                    .status(StatusCode::OK)
                    .header(header::ACCEPT_RANGES, "bytes");
                read_ahead(upstream, MP4_READAHEAD_BYTES)
            }
        };
        builder.body(body).unwrap()
    }
}

fn provider_of(target: &Target, recipe: Option<&super::recipe::Recipe>) -> Option<String> {
    target
        .provider
        .clone()
        .filter(|p| p != "unknown")
        .or_else(|| recipe.and_then(|r| r.detect_source_key(&target.url)))
}

/// La page d'embed sert de Referer/Origin à la playlist et à ses segments.
fn apply_referer(headers: &mut HashMap<String, String>, target: &Target) {
    if !target.referer.is_empty() {
        headers.insert("Referer".into(), target.referer.clone());
    }
    if !target.origin.is_empty() {
        headers.insert("Origin".into(), target.origin.clone());
    }
}

fn upstream_failure(error: &NetError, log_target: &str) -> Response {
    let blocked = matches!(error, NetError::Blocked(_));
    eprintln!("[proxy] {error} ({log_target})");
    json_error(
        if blocked {
            StatusCode::FORBIDDEN
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        },
        &error.to_string(),
    )
}

async fn handle_preflight() -> Response {
    cors(Response::builder())
        .status(StatusCode::OK)
        .header(header::CONTENT_LENGTH, "0")
        .header("access-control-max-age", "86400")
        .header("access-control-allow-private-network", "true")
        .body(Body::empty())
        .unwrap()
}

/// Trace la requête LAN (même refusée) : sert à savoir si la TV est venue chercher la vidéo.
fn note_lan_peer(ctx: &Ctx, peer: SocketAddr) {
    if ctx.lan {
        ctx.proxy
            .lan_seen
            .lock()
            .unwrap()
            .insert(peer.ip().to_canonical(), Instant::now());
    }
}

async fn handle_get(
    State(ctx): State<Ctx>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    method: Method,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let proxy = ctx.proxy.clone();
    note_lan_peer(&ctx, peer);
    if method != Method::GET {
        return json_error(StatusCode::METHOD_NOT_ALLOWED, "Method Not Allowed");
    }
    let Some(scope) = proxy.scope_for(ctx.lan, &query, &headers) else {
        return json_error(StatusCode::FORBIDDEN, "Jeton invalide");
    };
    let Some(handle) = query.get("h") else {
        return json_error(StatusCode::BAD_REQUEST, "Lien de lecture expiré");
    };
    // Poignée évincée ou session redémarrée : le lecteur doit relancer une résolution.
    let Some(target) = proxy.handles.resolve(handle) else {
        return json_error(StatusCode::GONE, "Lien de lecture expiré");
    };
    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    proxy.handle_proxy(handle, target, range, &scope).await
}

async fn handle_local(
    State(ctx): State<Ctx>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let proxy = ctx.proxy.clone();
    note_lan_peer(&ctx, peer);
    let Some(scope) = proxy.scope_for(ctx.lan, &query, &headers) else {
        return json_error(StatusCode::FORBIDDEN, "Jeton invalide");
    };
    let id = query.get("id").map(String::as_str).unwrap_or("");
    let rel = query.get("path").map(String::as_str).unwrap_or("video.mp4");
    let range = headers.get(header::RANGE).and_then(|v| v.to_str().ok());
    let root = proxy.local_root.read().unwrap().clone();
    super::local::serve(&root, id, rel, range, &scope.origin, &scope.token_suffix()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query_param(url: &str, key: &str) -> String {
        url::Url::parse(url)
            .unwrap()
            .query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn listener_lan_avec_son_propre_jeton() {
        let root: SharedRoot = Arc::new(std::sync::RwLock::new(std::env::temp_dir()));
        let proxy = Proxy::new(
            Arc::new(Net::new()),
            Arc::new(RecipeStore::default()),
            Arc::new(Handles::default()),
            root,
        );
        let port = proxy.start().await.unwrap();
        let local = proxy.local_url("x", "video.mp4").unwrap();
        let device = Ipv4Addr::new(192, 168, 1, 20);

        // Seul ce qui sort de notre proxy, avec son jeton, devient une URL de cast.
        assert!(proxy.to_cast_url("https://exemple.com/video/proxy?t=a", device).await.is_none());
        let bad = format!("http://127.0.0.1:{port}/video/proxy?h=x&t=faux");
        assert!(proxy.to_cast_url(&bad, device).await.is_none());

        let cast = proxy.to_cast_url(&local, device).await.unwrap();
        let lan_port: u16 = url::Url::parse(&cast).unwrap().port().unwrap();
        assert_ne!(lan_port, port);
        assert!(cast.contains("/local?"));
        let (loop_token, lan_token) = (query_param(&local, "t"), query_param(&cast, "t"));
        assert_ne!(loop_token, lan_token);

        let http = reqwest::Client::builder().no_proxy().build().unwrap();
        let status = |port: u16, token: &str| {
            let http = http.clone();
            let url = format!("http://127.0.0.1:{port}/local?id=x&path=video.mp4&t={token}");
            async move { http.get(url).send().await.unwrap().status().as_u16() }
        };
        assert_eq!(status(lan_port, &loop_token).await, 403);
        assert_eq!(status(port, &lan_token).await, 403);
        assert_eq!(status(lan_port, "").await, 403);
        assert_ne!(status(lan_port, &lan_token).await, 403);
        assert_ne!(status(port, &loop_token).await, 403);
        assert!(proxy.last_lan_request_from(Ipv4Addr::LOCALHOST.into()).is_some());

        proxy.stop_lan();
        tokio::time::sleep(Duration::from_millis(200)).await;
        let url = format!("http://127.0.0.1:{lan_port}/local?t={lan_token}");
        assert!(http.get(url).send().await.is_err());
    }

    #[test]
    fn urls_de_segments() {
        assert!(is_segment_url("https://cdn/a/seg1.ts?x=1"));
        assert!(is_segment_url("https://cdn/a.M4S"));
        assert!(is_segment_url("https://cdn/a.aac"));
        assert!(is_segment_url("https://cdn/film.mp4"));
        assert!(!is_segment_url("https://cdn/embed/film.mp4"));
        assert!(!is_segment_url("https://cdn/shell.php"));
        assert!(!is_segment_url("https://cdn/index.m3u8"));
    }

    #[test]
    fn cache_de_segments_lru() {
        let mut cache = SegmentCache::default();
        cache.put("a", Bytes::from(vec![0u8; 1000]), "video/mp2t".into());
        cache.put("b", Bytes::from(vec![0u8; 1000]), "video/mp2t".into());
        assert_eq!(cache.used, 2000);
        assert!(cache.get("a").is_some());
        assert_eq!(cache.entries.keys().last().map(String::as_str), Some("a"));
        // Trop gros pour être gardé.
        cache.put(
            "gros",
            Bytes::from(vec![0u8; SEGMENT_MAX_CACHEABLE + 1]),
            "x".into(),
        );
        assert!(cache.get("gros").is_none());
        // Remplacer ne double pas le compte.
        cache.put("a", Bytes::from(vec![0u8; 500]), "video/mp2t".into());
        assert_eq!(cache.used, 1500);
    }

    #[test]
    fn permis_de_lecture_anticipee() {
        assert_eq!(permits_for(0, 100), 1);
        assert_eq!(permits_for(2048, 100), 3);
        assert_eq!(permits_for(10_000_000, 100), 100);
    }
}
