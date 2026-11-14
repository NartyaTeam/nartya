//! Rich Presence Discord, par l'IPC local du client (tube nommé `discord-ipc-N` sous Windows,
//! socket Unix ailleurs). Client Discord fermé : on retente plus tard. L'ID d'application vient de
//! la page (`VITE_DISCORD_RPC_CLIENT_ID`) ; sans lui, le service reste inactif. Discord n'accepte
//! que des URL http(s) sur les boutons : une page du site ouvre le deep-link.

use std::time::Duration;

use serde_json::{json, Value};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    sync::mpsc,
};

use crate::config::SITE_URL;

const RECONNECT_DELAY: Duration = Duration::from_secs(30);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_FRAME: usize = 1 << 20;
const LOGO_URL: &str = "https://nartya.app/assets/discord-rpc.png";

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const OP_CLOSE: u32 = 2;
const OP_PING: u32 = 3;
const OP_PONG: u32 = 4;

enum Command {
    Connect(String),
    /// `None` : effacer.
    Set(Option<Value>),
}

/// Poignée vers la tâche qui tient la connexion.
pub struct Discord(mpsc::UnboundedSender<Command>);

impl Discord {
    pub fn start() -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        tauri::async_runtime::spawn(run(rx));
        Self(tx)
    }

    pub fn connect(&self, client_id: &str) {
        let id = client_id.trim();
        if !id.is_empty() && id.len() <= 32 && id.chars().all(|c| c.is_ascii_digit()) {
            let _ = self.0.send(Command::Connect(id.to_string()));
        }
    }

    pub fn set(&self, params: Value) {
        let _ = self.0.send(Command::Set(Some(params)));
    }

    pub fn clear(&self) {
        let _ = self.0.send(Command::Set(None));
    }
}

fn open_anime_button(slug: Option<&str>) -> Option<Value> {
    let slug = slug.filter(|s| !s.is_empty())?;
    Some(json!({
        "label": "Regarder cet anime",
        "url": format!("{SITE_URL}/open?anime={}", urlencoding::encode(slug)),
    }))
}

/// Comme `${valeur}` en JavaScript, vide pour null.
fn text(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) if s.is_empty() => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) if n.as_f64() == Some(0.0) => None,
        other => Some(other.to_string()),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Début du chrono affiché par Discord. Sans `timestamps`, Discord le relance à chaque mise à
/// jour de l'activité : en navigation il compte depuis l'ouverture de l'app, en lecture depuis le
/// début de l'épisode, et ne repart de zéro qu'au changement d'épisode.
struct Chrono {
    session: u64,
    watching: Option<(String, u64)>,
}

impl Chrono {
    fn new() -> Self {
        Self { session: now_ms(), watching: None }
    }

    fn start_for(&mut self, params: &Value, now: u64) -> u64 {
        if params["type"].as_str() != Some("watching") {
            self.watching = None;
            return self.session;
        }
        // Les titres arrivent parfois après le début de la lecture : ils ne comptent que faute
        // d'identifiant.
        let field = |k: &str| text(&params[k]).unwrap_or_default();
        let mut key = format!(
            "{}|{}|{}",
            field("animeSlug"),
            field("seasonNumber"),
            field("episodeNumber")
        );
        if key == "||" {
            key = format!("{}|{}", field("animeTitle"), field("episodeTitle"));
        }
        match &self.watching {
            Some((current, start)) if *current == key => *start,
            _ => {
                self.watching = Some((key, now));
                now
            }
        }
    }
}

/// Même rendu qu'Electron. Le logo est une image hébergée : en changer ne demande pas de repasser
/// par le portail Discord.
pub fn build_activity(params: &Value, start_ms: u64) -> Value {
    let website = json!({ "label": "Visiter le site", "url": SITE_URL });
    let title = text(&params["animeTitle"]);
    let slug = params["animeSlug"].as_str();
    let buttons = |anime: bool| -> Vec<Value> {
        let mut list = Vec::new();
        if anime {
            list.extend(open_anime_button(slug));
        }
        list.push(website.clone());
        list
    };
    let (details, state, large_text, buttons) = match params["type"].as_str() {
        Some("anime") => (
            "Choix d'un épisode".to_string(),
            title.clone().unwrap_or_else(|| "Un anime".into()),
            title.clone(),
            buttons(true),
        ),
        Some("watching") => {
            let state = match text(&params["episodeNumber"]) {
                Some(ep) => {
                    let season = params["seasonNumber"]
                        .as_f64()
                        .or_else(|| params["seasonNumber"].as_str()?.parse().ok());
                    match season {
                        Some(s) if s > 1.0 => {
                            let season = text(&params["seasonNumber"]).unwrap_or_default();
                            format!("Épisode {ep} · Saison {season}")
                        }
                        _ => format!("Épisode {ep}"),
                    }
                }
                None => text(&params["episodeTitle"]).unwrap_or_else(|| "En cours de lecture".into()),
            };
            (
                format!("Regarde {}", title.as_deref().unwrap_or("un anime")),
                state,
                title.clone(),
                buttons(true),
            )
        }
        _ => (
            "Navigue sur Nartya".to_string(),
            "Exploration du catalogue".to_string(),
            None,
            buttons(false),
        ),
    };
    json!({
        "details": details,
        "state": state,
        "assets": {
            "large_image": LOGO_URL,
            "large_text": large_text.unwrap_or_else(|| "Nartya — Streaming Anime".into()),
        },
        "buttons": buttons,
        "timestamps": { "start": start_ms },
        "instance": false,
    })
}

// ---- Transport

#[cfg(windows)]
type Pipe = tokio::net::windows::named_pipe::NamedPipeClient;
#[cfg(unix)]
type Pipe = tokio::net::UnixStream;

#[cfg(windows)]
async fn open(n: u8) -> std::io::Result<Pipe> {
    tokio::net::windows::named_pipe::ClientOptions::new().open(format!(r"\\?\pipe\discord-ipc-{n}"))
}

#[cfg(unix)]
async fn open(n: u8) -> std::io::Result<Pipe> {
    let prefix = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
        .iter()
        .find_map(|v| std::env::var(v).ok())
        .unwrap_or_else(|| "/tmp".into());
    tokio::net::UnixStream::connect(format!("{}/discord-ipc-{n}", prefix.trim_end_matches('/'))).await
}

async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, op: u32, body: &Value) -> std::io::Result<()> {
    let payload = serde_json::to_vec(body)?;
    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    frame.extend_from_slice(&payload);
    w.write_all(&frame).await?;
    w.flush().await
}

async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> std::io::Result<(u32, Value)> {
    let mut header = [0u8; 8];
    r.read_exact(&mut header).await?;
    let op = u32::from_le_bytes(header[..4].try_into().unwrap());
    let len = u32::from_le_bytes(header[4..].try_into().unwrap()) as usize;
    if len > MAX_FRAME {
        return Err(std::io::Error::other("trame Discord trop grande"));
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).await?;
    Ok((op, serde_json::from_slice(&body).unwrap_or(Value::Null)))
}

/// Premier tube qui répond, puis poignée de main jusqu'à `READY`.
async fn connect(client_id: &str) -> std::io::Result<Pipe> {
    let mut last = std::io::Error::other("Discord fermé");
    for n in 0..10 {
        match open(n).await {
            Ok(mut pipe) => {
                write_frame(&mut pipe, OP_HANDSHAKE, &json!({ "v": 1, "client_id": client_id })).await?;
                let ready = tokio::time::timeout(HANDSHAKE_TIMEOUT, read_frame(&mut pipe))
                    .await
                    .map_err(|_| std::io::Error::other("pas de réponse de Discord"))??;
                return match ready {
                    (OP_FRAME, body) if body["evt"] == "READY" => Ok(pipe),
                    (_, body) => Err(std::io::Error::other(format!(
                        "poignée de main refusée : {}",
                        body["message"].as_str().unwrap_or("?")
                    ))),
                };
            }
            Err(e) => last = e,
        }
    }
    Err(last)
}

fn set_activity_frame(activity: Option<Value>, nonce: u64) -> Value {
    json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce.to_string(),
    })
}

/// Tient la connexion : reconnexion toutes les 30 s, activité courante ré-appliquée.
async fn run(mut rx: mpsc::UnboundedReceiver<Command>) {
    let mut client_id: Option<String> = None;
    // Paramètres de la page ; `None` : effacée. Ré-appliquée après une reconnexion.
    let mut current: Option<Value> = None;
    let mut pipe: Option<Pipe> = None;
    let mut retry_at: Option<tokio::time::Instant> = None;
    let mut nonce = 0u64;
    let mut chrono = Chrono::new();

    loop {
        // Connexion (ou reconnexion) dès qu'on a un ID et que le délai est écoulé.
        if pipe.is_none() {
            let due = retry_at.map_or(true, |at| tokio::time::Instant::now() >= at);
            if let (Some(id), true) = (client_id.as_deref(), due) {
                match connect(id).await {
                    Ok(mut p) => {
                        nonce += 1;
                        let params = current.clone().unwrap_or_else(|| json!({ "type": "home" }));
                        let activity = build_activity(&params, chrono.start_for(&params, now_ms()));
                        if write_frame(&mut p, OP_FRAME, &set_activity_frame(Some(activity), nonce))
                            .await
                            .is_ok()
                        {
                            pipe = Some(p);
                            retry_at = None;
                        } else {
                            retry_at = Some(tokio::time::Instant::now() + RECONNECT_DELAY);
                        }
                    }
                    Err(e) => {
                        let msg = e.to_string();
                        // Discord fermé : silencieux, on retentera.
                        if !(e.kind() == std::io::ErrorKind::NotFound || msg.contains("Discord fermé")) {
                            eprintln!("[discord] connexion impossible : {msg}");
                        }
                        retry_at = Some(tokio::time::Instant::now() + RECONNECT_DELAY);
                    }
                }
            }
        }

        let sleep_until = retry_at.unwrap_or_else(|| tokio::time::Instant::now() + Duration::from_secs(3600));
        tokio::select! {
            cmd = rx.recv() => {
                let Some(cmd) = cmd else { return };
                match cmd {
                    Command::Connect(id) => {
                        if client_id.as_deref() != Some(id.as_str()) {
                            client_id = Some(id);
                            pipe = None;
                            retry_at = None;
                        }
                    }
                    Command::Set(params) => {
                        current = params;
                        if let Some(p) = pipe.as_mut() {
                            nonce += 1;
                            let activity = current
                                .as_ref()
                                .map(|p| build_activity(p, chrono.start_for(p, now_ms())));
                            if write_frame(p, OP_FRAME, &set_activity_frame(activity, nonce)).await.is_err() {
                                pipe = None;
                                retry_at = Some(tokio::time::Instant::now() + RECONNECT_DELAY);
                            }
                        }
                    }
                }
            }
            frame = async {
                match pipe.as_mut() {
                    Some(p) => read_frame(p).await,
                    None => std::future::pending().await,
                }
            } => {
                match frame {
                    Ok((OP_PING, body)) => {
                        if let Some(p) = pipe.as_mut() {
                            let _ = write_frame(p, OP_PONG, &body).await;
                        }
                    }
                    Ok((OP_CLOSE, _)) | Err(_) => {
                        // Discord quitté : on retentera.
                        pipe = None;
                        retry_at = Some(tokio::time::Instant::now() + RECONNECT_DELAY);
                    }
                    Ok((OP_FRAME, body)) if body["evt"] == "ERROR" => {
                        eprintln!("[discord] activité refusée : {}", body["data"]["message"].as_str().unwrap_or("?"));
                    }
                    Ok(_) => {}
                }
            }
            _ = tokio::time::sleep_until(sleep_until), if retry_at.is_some() && pipe.is_none() => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activite_accueil() {
        let a = build_activity(&json!({ "type": "home" }), 1);
        assert_eq!(a["details"], "Navigue sur Nartya");
        assert_eq!(a["buttons"].as_array().unwrap().len(), 1);
        assert_eq!(a["assets"]["large_text"], "Nartya — Streaming Anime");
    }

    #[test]
    fn activite_lecture() {
        let a = build_activity(&json!({
            "type": "watching", "animeTitle": "Re:Zero", "animeSlug": "re-zero",
            "episodeNumber": 5, "seasonNumber": 2
        }), 1);
        assert_eq!(a["details"], "Regarde Re:Zero");
        assert_eq!(a["state"], "Épisode 5 · Saison 2");
        assert_eq!(a["assets"]["large_text"], "Re:Zero");
        assert!(a["buttons"][0]["url"].as_str().unwrap().ends_with("/open?anime=re-zero"));

        let s1 = build_activity(&json!({ "type": "watching", "episodeNumber": "3", "seasonNumber": 1 }), 1);
        assert_eq!(s1["state"], "Épisode 3");
        assert_eq!(s1["details"], "Regarde un anime");
        let no_ep = build_activity(&json!({ "type": "watching", "episodeTitle": "Film" }), 1);
        assert_eq!(no_ep["state"], "Film");
    }

    #[test]
    fn activite_fiche_anime() {
        let a = build_activity(&json!({ "type": "anime" }), 1);
        assert_eq!(a["state"], "Un anime");
        assert_eq!(a["buttons"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn chrono_stable_tant_que_l_episode_ne_change_pas() {
        let mut c = Chrono { session: 100, watching: None };
        let ep5 = json!({ "type": "watching", "animeSlug": "re-zero", "episodeNumber": 5 });
        let ep6 = json!({ "type": "watching", "animeSlug": "re-zero", "episodeNumber": 6 });
        assert_eq!(c.start_for(&json!({ "type": "home" }), 500), 100);
        assert_eq!(c.start_for(&json!({ "type": "anime" }), 600), 100);
        assert_eq!(c.start_for(&ep5, 700), 700);
        // Pause, reprise, mise à jour du titre : même épisode, même chrono.
        assert_eq!(c.start_for(&ep5, 900), 700);
        let titled = json!({ "type": "watching", "animeSlug": "re-zero", "episodeNumber": 5, "episodeTitle": "Un pas" });
        assert_eq!(c.start_for(&titled, 950), 700);
        assert_eq!(c.start_for(&ep6, 1000), 1000);
        assert_eq!(c.start_for(&json!({ "type": "home" }), 1100), 100);
        assert_eq!(c.start_for(&ep6, 1200), 1200);
    }

    #[tokio::test]
    async fn trames_aller_retour() {
        let (mut a, mut b) = tokio::io::duplex(1024);
        write_frame(&mut a, OP_FRAME, &json!({ "cmd": "X" })).await.unwrap();
        let (op, body) = read_frame(&mut b).await.unwrap();
        assert_eq!(op, OP_FRAME);
        assert_eq!(body["cmd"], "X");
    }
}
