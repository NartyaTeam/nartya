//! L'URL de l'hébergeur n'existe que dans la coque. L'extraction se fait depuis la machine du
//! client : beaucoup d'hébergeurs lient le flux à l'IP qui a chargé l'embed.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use futures_util::{
    future::{BoxFuture, Shared},
    FutureExt,
};
use indexmap::IndexMap;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use url::Url;

use super::{
    extract::{extract_from_html, is_consistent_with_embed},
    handles::Target,
    net::{host_of, NetError},
    provider::{canonicalize_url, provider_headers},
    proxy::Proxy,
    recipe::Recipe,
};
use crate::config::API_URL;

const STREAM_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const STREAM_TIMEOUT: Duration = Duration::from_secs(15);
const API_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_CACHED: usize = 200;

/// Fixée côté coque : le jeton de session accompagne ces appels, la page ne choisit pas leur destination.
pub fn api_base_url() -> String {
    if cfg!(debug_assertions) {
        std::env::var("NARTYA_DEV_API").unwrap_or_else(|_| "http://localhost:3000".into())
    } else {
        API_URL.to_string()
    }
}

#[derive(Debug, Clone)]
pub struct Resolved {
    pub handle: String,
    pub is_hls: bool,
}

type Outcome = Result<Resolved, String>;
type Pending = Shared<BoxFuture<'static, Outcome>>;

#[derive(Default, Deserialize)]
pub struct ResolveRequest {
    pub token: Option<String>,
    #[serde(rename = "forceRefresh")]
    pub force_refresh: Option<bool>,
    pub mode: Option<String>,
}

pub struct StreamService {
    pub proxy: Arc<Proxy>,
    cache: Mutex<IndexMap<String, (Resolved, Instant)>>,
    inflight: Mutex<HashMap<String, Pending>>,
}

fn clip_error(e: &NetError) -> String {
    e.friendly()
}

impl StreamService {
    pub fn new(proxy: Arc<Proxy>) -> Arc<Self> {
        Arc::new(Self {
            proxy,
            cache: Mutex::default(),
            inflight: Mutex::default(),
        })
    }

    /// En téléchargement, le téléchargeur résout la poignée dans la coque.
    fn stream_result(&self, resolved: &Resolved, mode: Option<&str>) -> Value {
        if mode == Some("download") {
            return json!({ "success": true, "handle": resolved.handle });
        }
        match self.proxy.playback_url(&resolved.handle, resolved.is_hls) {
            Some(url) => json!({ "success": true, "url": url }),
            None => json!({ "success": false, "error": "Proxy local indisponible" }),
        }
    }

    pub async fn resolve(
        self: &Arc<Self>,
        request: ResolveRequest,
        access_token: Option<String>,
    ) -> Value {
        let Some(token) = request.token.filter(|t| !t.is_empty()) else {
            return json!({ "success": false, "error": "Jeton manquant" });
        };
        let mode = request.mode;

        if request.force_refresh == Some(true) {
            self.cache.lock().unwrap().shift_remove(&token);
        }
        let cached = self
            .cache
            .lock()
            .unwrap()
            .get(&token)
            .filter(|(_, at)| at.elapsed() < STREAM_CACHE_TTL)
            .map(|(r, _)| r.clone());
        if let Some(resolved) = cached {
            let mut result = self.stream_result(&resolved, mode.as_deref());
            result["cached"] = json!(true);
            return result;
        }

        // Un survol a pu lancer la même résolution juste avant le clic.
        let pending = {
            let mut inflight = self.inflight.lock().unwrap();
            inflight
                .entry(token.clone())
                .or_insert_with(|| {
                    let this = self.clone();
                    let key = token.clone();
                    let fut: BoxFuture<'static, Outcome> = async move {
                        let outcome = this.resolve_token(&key, access_token.as_deref()).await;
                        this.inflight.lock().unwrap().remove(&key);
                        outcome
                    }
                    .boxed();
                    fut.shared()
                })
                .clone()
        };

        match pending.await {
            Err(error) => json!({ "success": false, "error": error }),
            Ok(resolved) => {
                // Chargée pendant que le lecteur se monte.
                if resolved.is_hls && mode.as_deref() != Some("download") {
                    self.proxy.warm_up(&resolved.handle);
                }
                self.stream_result(&resolved, mode.as_deref())
            }
        }
    }

    /// Descellement par l'API, page d'embed, extraction.
    async fn resolve_token(&self, token: &str, access_token: Option<&str>) -> Outcome {
        let started = Instant::now();
        let api = api_base_url();
        let net = &self.proxy.net;

        // Demandés ensemble : la première lecture ne paie qu'un aller-retour API.
        let recipe_fut = self.proxy.recipe.ensure(&net.client, &api, access_token);
        let token_fut = self.fetch_embed_url(&api, token, access_token);
        let (recipe, embed) = tokio::join!(recipe_fut, token_fut);
        let (embed_url, provider) = embed?;
        let Some(recipe) = recipe else {
            return Err("Configuration des sources indisponible".into());
        };
        let token_ms = started.elapsed().as_millis();

        let html = self
            .fetch_embed_html(&recipe, &embed_url, provider.as_deref(), STREAM_TIMEOUT)
            .await?;
        let video_url = extract_from_html(&html, &embed_url, provider.as_deref(), &recipe)
            .map_err(|e| {
                if cfg!(debug_assertions) {
                    eprintln!(
                        "[stream] ✗ {} {} : extraction : {e}",
                        provider.as_deref().unwrap_or("?"),
                        host_of(&embed_url)
                    );
                }
                e
            })?;
        if !is_consistent_with_embed(&embed_url, &video_url, &recipe) {
            return Err("Flux extrait incohérent avec la source".into());
        }

        let origin = Url::parse(&embed_url)
            .map(|u| u.origin().ascii_serialization())
            .map_err(|_| "Source introuvable".to_string())?;
        // La page d'embed sert de Referer/Origin à la playlist et à ses segments.
        let handle = self
            .proxy
            .handles
            .mint(Target {
                url: video_url.clone(),
                provider: provider.clone(),
                referer: embed_url.clone(),
                origin,
            })
            .ok_or_else(|| "Flux non enregistrable".to_string())?;

        // Sans extension dans l'URL de proxy, c'est `kind=hls` qui fait monter hls.js.
        let is_hls = regex::Regex::new(r"(?i)\.m3u8(\?|$)")
            .unwrap()
            .is_match(&video_url);
        let resolved = Resolved { handle, is_hls };
        {
            let mut cache = self.cache.lock().unwrap();
            cache.insert(token.to_string(), (resolved.clone(), Instant::now()));
            if cache.len() > MAX_CACHED {
                cache.shift_remove_index(0);
            }
        }
        println!(
            "[stream] {} résolu en {} ms (API {token_ms} ms){}",
            provider.as_deref().unwrap_or("?"),
            started.elapsed().as_millis(),
            if cfg!(debug_assertions) {
                format!(" → {}", host_of(&video_url))
            } else {
                String::new()
            }
        );
        Ok(resolved)
    }

    async fn fetch_embed_url(
        &self,
        api: &str,
        token: &str,
        access_token: Option<&str>,
    ) -> Result<(String, Option<String>), String> {
        let mut request = self
            .proxy
            .net
            .client
            .get(format!("{api}/v1/streams/{}", urlencoding::encode(token)));
        if let Some(access) = access_token {
            request = request.bearer_auth(access);
        }
        let response = tokio::time::timeout(API_TIMEOUT, request.send())
            .await
            .map_err(|_| NetError::Timeout.friendly())?
            .map_err(|e| NetError::Request(e).friendly())?;
        match response.status().as_u16() {
            401 => return Err("Connecte-toi pour lancer la lecture.".into()),
            410 => return Err("Lien expiré, recharge l'épisode.".into()),
            429 => return Err("Trop de lectures d'affilée, patiente un instant.".into()),
            s if !(200..300).contains(&s) => return Err(format!("Résolution indisponible ({s})")),
            _ => {}
        }
        let json: Value = response
            .json()
            .await
            .map_err(|_| "Source introuvable".to_string())?;
        let url = json["data"]["url"]
            .as_str()
            .filter(|u| !u.is_empty())
            .ok_or("Source introuvable")?;
        Ok((
            url.to_string(),
            json["data"]["provider"].as_str().map(str::to_string),
        ))
    }

    /// Avec les règles de la recette pour son hébergeur.
    async fn fetch_embed_html(
        &self,
        recipe: &Recipe,
        embed_url: &str,
        source_key: Option<&str>,
        timeout: Duration,
    ) -> Result<String, String> {
        let parsed = Url::parse(embed_url).map_err(|_| "URL invalide".to_string())?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("Embed bloqué : Protocole non autorisé".into());
        }
        let host = parsed.host_str().unwrap_or("").to_lowercase();
        // Sans recette, aucun hôte n'est autorisé.
        if !recipe.is_allowed_embed_host(&host) {
            return Err(format!("Embed bloqué : Hostname non autorisé : {host}"));
        }

        let key = source_key
            .map(str::to_string)
            .or_else(|| recipe.detect_source_key(embed_url));
        let key = key.as_deref();
        let (mut headers, source_timeout) = provider_headers(Some(recipe), key);
        let rules = key.and_then(|k| recipe.source(k));
        let mut final_url = canonicalize_url(embed_url, Some(recipe), key);

        if let Some(query) = rules.and_then(|r| r.embed_query.as_deref()) {
            let name = format!("{}=", query.split('=').next().unwrap_or(""));
            if !final_url.contains(&name) {
                final_url.push(if final_url.contains('?') { '&' } else { '?' });
                final_url.push_str(query);
            }
        }
        if rules.is_some_and(|r| r.referer_from_embed) {
            headers.insert("Referer".into(), final_url.clone());
            if let Ok(u) = Url::parse(&final_url) {
                headers.insert("Origin".into(), u.origin().ascii_serialization());
            }
        }

        let wait = if timeout > Duration::ZERO && timeout <= Duration::from_secs(60) {
            timeout
        } else {
            source_timeout
        };
        let response = self
            .proxy
            .net
            .fetch_checked(Method::GET, &final_url, &headers, wait)
            .await
            .map_err(|e| {
                eprintln!("[stream] fetch de la page d'embed en erreur : {e}");
                clip_error(&e)
            })?;
        if !response.status().is_success() {
            let status = response.status();
            return Err(format!(
                "HTTP {}: {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }
        response
            .text()
            .await
            .map_err(|e| NetError::Request(e).friendly())
    }
}
