//! Cast : la TV va chercher la vidéo elle-même sur le listener LAN du proxy local (jeton propre au
//! cast, ouvert le temps de la session). Même contrat qu'Electron : `cast:devices` / `cast:status`.

mod castv2;
mod discovery;
mod firewall;
pub mod net;

use std::{
    net::Ipv4Addr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::{sync::mpsc, task::AbortHandle};

use crate::stream::Proxy;
use castv2::{Client, Event, NS_MEDIA, NS_RECEIVER, PLATFORM_ID};
use discovery::{Device, Devices, Discovery, DEFAULT_PORT};

/// Application « Default Media Receiver ».
const MEDIA_APP_ID: &str = "CC1AD845";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_TIMEOUT: Duration = Duration::from_millis(1500);
const DISCOVERY_IDLE: Duration = Duration::from_secs(3 * 60);
const REQUERY_EVERY: Duration = Duration::from_secs(10);
/// L'appareil ne diffuse pas l'avancée : on sonde.
const STATUS_POLL: Duration = Duration::from_secs(1);

struct Session {
    id: u64,
    client: Arc<Client>,
    device_id: String,
    transport_id: String,
    receiver_session_id: String,
    media_session_id: Option<i64>,
    media: Value,
    /// Le volume de l'appareil vit dans RECEIVER_STATUS ; celui du média reste souvent à 1.
    volume: Option<(f64, bool)>,
    tasks: Vec<AbortHandle>,
}

pub struct Cast {
    app: AppHandle,
    proxy: Option<Arc<Proxy>>,
    devices: Devices,
    discovery: Mutex<Option<Discovery>>,
    idle_gen: AtomicU64,
    session_gen: AtomicU64,
    session: Mutex<Option<Session>>,
}

struct Failure {
    stage: &'static str,
    message: String,
}

fn fail(stage: &'static str, message: impl Into<String>) -> Failure {
    Failure {
        stage,
        message: message.into(),
    }
}

fn first_status(payload: &Value) -> Option<&Value> {
    payload["status"].as_array().and_then(|a| a.first())
}

/// Application lancée (identifiant de transport et de session) dans un RECEIVER_STATUS.
fn media_app(payload: &Value) -> Option<(String, String)> {
    payload["status"]["applications"]
        .as_array()?
        .iter()
        .find(|a| a["appId"] == MEDIA_APP_ID)
        .and_then(|a| {
            Some((
                a["transportId"].as_str()?.to_string(),
                a["sessionId"].as_str()?.to_string(),
            ))
        })
}

fn volume_of(v: &Value) -> Option<(f64, bool)> {
    let level = v["level"].as_f64()?;
    Some((level, v["muted"].as_bool().unwrap_or(false)))
}

impl Cast {
    pub fn new(app: AppHandle, proxy: Option<Arc<Proxy>>) -> Arc<Self> {
        Arc::new(Self {
            app,
            proxy,
            devices: Devices::default(),
            discovery: Mutex::default(),
            idle_gen: AtomicU64::new(0),
            session_gen: AtomicU64::new(0),
            session: Mutex::default(),
        })
    }

    fn emit(&self, event: &str, payload: Value) {
        let _ = self.app.emit_to("main", event, payload);
    }

    fn push_devices(&self) {
        let list: Vec<Value> = self.devices.lock().unwrap().values().map(Device::to_json).collect();
        self.emit("cast:devices", Value::Array(list));
    }

    // ---- Découverte

    pub fn discover(self: &Arc<Self>) -> Value {
        self.arm_idle();
        {
            let mut guard = self.discovery.lock().unwrap();
            match guard.as_ref() {
                Some(d) => d.rebrowse(),
                None => {
                    let this = Arc::downgrade(self);
                    match Discovery::start(self.devices.clone(), move || {
                        if let Some(cast) = this.upgrade() {
                            cast.push_devices();
                        }
                    }) {
                        Ok(d) => {
                            println!("[cast] découverte démarrée");
                            *guard = Some(d);
                            self.spawn_requery();
                        }
                        Err(e) => eprintln!("[cast] découverte impossible : {e}"),
                    }
                }
            }
        }
        Value::Array(self.devices.lock().unwrap().values().map(Device::to_json).collect())
    }

    /// Un paquet multicast se perd facilement : on redemande tant que l'écoute est ouverte.
    fn spawn_requery(self: &Arc<Self>) {
        let weak = Arc::downgrade(self);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(REQUERY_EVERY).await;
                let Some(cast) = weak.upgrade() else { return };
                let guard = cast.discovery.lock().unwrap();
                let Some(d) = guard.as_ref() else { return };
                d.rebrowse();
            }
        });
    }

    /// Sans nouvel appel ni session active, l'écoute est coupée.
    fn arm_idle(self: &Arc<Self>) {
        let generation = self.idle_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let weak = Arc::downgrade(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(DISCOVERY_IDLE).await;
            let Some(cast) = weak.upgrade() else { return };
            if cast.idle_gen.load(Ordering::SeqCst) == generation
                && cast.session.lock().unwrap().is_none()
            {
                cast.stop_discovery();
            }
        });
    }

    fn stop_discovery(&self) {
        if self.discovery.lock().unwrap().take().is_none() {
            return;
        }
        let keep = self.session.lock().unwrap().as_ref().map(|s| s.device_id.clone());
        self.devices
            .lock()
            .unwrap()
            .retain(|id, d| d.manual || keep.as_deref() == Some(id));
        println!("[cast] découverte arrêtée");
    }

    pub async fn add_host(&self, ip: &str) -> Value {
        let Some(ip) = ip.trim().parse::<Ipv4Addr>().ok().filter(|a| net::is_private_ipv4(*a)) else {
            return json!({ "success": false, "error": "Adresse IP locale invalide (ex. 192.168.1.20)" });
        };
        if !castv2::probe(ip, DEFAULT_PORT, CONNECT_TIMEOUT).await {
            return json!({ "success": false, "error": "Aucun appareil Cast ne répond à cette adresse." });
        }
        let device = Device {
            id: format!("manual:{ip}"),
            name: format!("Appareil {ip}"),
            host: ip,
            port: DEFAULT_PORT,
            manual: true,
        };
        let public = device.to_json();
        self.devices.lock().unwrap().insert(device.id.clone(), device);
        self.push_devices();
        json!({ "success": true, "device": public })
    }

    pub async fn diagnostics(&self) -> Value {
        let interfaces: Vec<Value> = net::lan_interfaces()
            .iter()
            .map(|i| json!({ "name": i.name, "address": i.address.to_string(), "error": null }))
            .collect();
        json!({
            "discovering": self.discovery.lock().unwrap().is_some(),
            "devices": self.devices.lock().unwrap().len(),
            "listenerError": null,
            "interfaces": interfaces,
            "packets": 0,
            "castAnswers": 0,
            "firewall": firewall::status().await.map(|f| f.to_json()),
        })
    }

    // ---- Session

    fn emit_status(&self, media: Option<&Value>, extra: Value) {
        let (device_id, device_name, volume) = {
            let guard = self.session.lock().unwrap();
            match guard.as_ref() {
                Some(s) => (
                    Some(s.device_id.clone()),
                    self.devices.lock().unwrap().get(&s.device_id).map(|d| d.name.clone()),
                    s.volume,
                ),
                None => (None, None, None),
            }
        };
        let mut status = json!({
            "deviceId": device_id,
            "deviceName": device_name,
            "playerState": media.and_then(|m| m["playerState"].as_str()),
            "idleReason": media.and_then(|m| m["idleReason"].as_str()),
            "currentTime": media.and_then(|m| m["currentTime"].as_f64()),
            "duration": media.and_then(|m| m["media"]["duration"].as_f64()),
            "volume": volume.map(|v| v.0).or_else(|| media.and_then(|m| m["volume"]["level"].as_f64())),
            "muted": volume.map(|v| v.1).or_else(|| media.and_then(|m| m["volume"]["muted"].as_bool())),
        });
        if let (Some(base), Some(add)) = (status.as_object_mut(), extra.as_object()) {
            base.extend(add.clone());
        }
        self.emit("cast:status", status);
    }

    fn on_media_status(self: &Arc<Self>, session_id: u64, status: &Value) {
        {
            let mut guard = self.session.lock().unwrap();
            let Some(s) = guard.as_mut().filter(|s| s.id == session_id) else {
                return;
            };
            if let Some(id) = status["mediaSessionId"].as_i64() {
                s.media_session_id = Some(id);
            }
            s.media = status.clone();
        }
        self.emit_status(Some(status), json!({}));
        if status["playerState"] == "IDLE" && status["idleReason"] == "ERROR" {
            self.end_detached("media-error");
        }
    }

    /// `end_session` abat les tâches de la session : appelé depuis l'une d'elles, il s'annulerait.
    fn end_detached(self: &Arc<Self>, reason: &'static str) {
        let this = self.clone();
        tokio::spawn(async move { this.end_session(reason, json!({})).await });
    }

    fn on_receiver_volume(self: &Arc<Self>, session_id: u64, payload: &Value) {
        let Some(volume) = volume_of(&payload["status"]["volume"]) else {
            return;
        };
        let media = {
            let mut guard = self.session.lock().unwrap();
            let Some(s) = guard.as_mut().filter(|s| s.id == session_id) else {
                return;
            };
            s.volume = Some(volume);
            s.media.clone()
        };
        self.emit_status(Some(&media), json!({}));
    }

    pub async fn end_session(self: &Arc<Self>, reason: &str, extra: Value) {
        let Some(session) = self.session.lock().unwrap().take() else {
            return;
        };
        for t in &session.tasks {
            t.abort();
        }
        if reason == "stop" || reason == "shutdown" {
            // Sans ça, la TV garde la dernière image.
            let _ = session
                .client
                .request(
                    NS_RECEIVER,
                    PLATFORM_ID,
                    json!({ "type": "STOP", "sessionId": session.receiver_session_id }),
                    STOP_TIMEOUT,
                )
                .await;
        }
        drop(session);
        let mut payload = json!({ "ended": true, "reason": reason });
        if let (Some(base), Some(add)) = (payload.as_object_mut(), extra.as_object()) {
            base.extend(add.clone());
        }
        self.emit_status(None, payload);
        println!("[cast] session terminée ({reason})");
        if let Some(proxy) = &self.proxy {
            proxy.stop_lan();
        }
    }

    /// Connexion, lancement du récepteur, chargement du média ; ne rend la main qu'une fois lu.
    async fn load(
        self: &Arc<Self>,
        device: &Device,
        media: &Value,
        cast_url: &str,
    ) -> Result<(), Failure> {
        let (tx, mut rx) = mpsc::unbounded_channel::<Event>();
        let client = Client::connect(device.host, device.port, CONNECT_TIMEOUT, tx)
            .await
            .map_err(|e| fail("connect", e))?;

        let launch = client
            .request(
                NS_RECEIVER,
                PLATFORM_ID,
                json!({ "type": "LAUNCH", "appId": MEDIA_APP_ID }),
                LOAD_TIMEOUT,
            )
            .await
            .map_err(|e| fail("launch", e))?;
        if launch["type"] == "LAUNCH_ERROR" {
            return Err(fail("launch", launch["reason"].as_str().unwrap_or("LAUNCH_ERROR")));
        }
        let (transport_id, receiver_session_id) = match media_app(&launch) {
            Some(found) => found,
            // L'appareil répond parfois avant que l'application soit prête.
            None => wait_for(&mut rx, LOAD_TIMEOUT, |ns, p| {
                (ns == NS_RECEIVER).then(|| media_app(p)).flatten()
            })
            .await
            .ok_or_else(|| fail("launch", "timeout"))?,
        };
        client.open_channel(&transport_id);

        let start_at = media["startAt"].as_f64().filter(|t| *t > 2.0).map(f64::floor).unwrap_or(0.0);
        let poster = media["poster"].as_str().filter(|p| !p.is_empty());
        let loaded = client
            .request(
                NS_MEDIA,
                &transport_id,
                json!({
                    "type": "LOAD",
                    "autoplay": true,
                    "currentTime": start_at,
                    "media": {
                        "contentId": cast_url,
                        "contentType": media["contentType"].as_str().unwrap_or("application/vnd.apple.mpegurl"),
                        "streamType": "BUFFERED",
                        "metadata": {
                            "type": 0,
                            "metadataType": 0,
                            "title": media["title"].as_str().unwrap_or("Nartya"),
                            "images": poster.map(|p| vec![json!({ "url": p })]).unwrap_or_default(),
                        },
                    },
                }),
                LOAD_TIMEOUT,
            )
            .await
            .map_err(|e| fail("load", e))?;
        if matches!(loaded["type"].as_str(), Some("LOAD_FAILED" | "INVALID_REQUEST" | "LOAD_CANCELLED")) {
            return Err(fail("load", loaded["type"].as_str().unwrap_or("LOAD_FAILED")));
        }
        let status = match first_status(&loaded) {
            Some(s) => s.clone(),
            None => wait_for(&mut rx, LOAD_TIMEOUT, |ns, p| {
                (ns == NS_MEDIA && p["type"] == "MEDIA_STATUS")
                    .then(|| first_status(p).cloned())
                    .flatten()
            })
            .await
            .ok_or_else(|| fail("load", "timeout"))?,
        };

        let id = self.session_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let client = Arc::new(client);
        let events = tokio::spawn(self.clone().run_events(id, rx));
        let poll = {
            let (client, transport) = (client.clone(), transport_id.clone());
            tokio::spawn(async move {
                let mut tick = tokio::time::interval(STATUS_POLL);
                loop {
                    tick.tick().await;
                    client.send(NS_MEDIA, &transport, &json!({ "type": "GET_STATUS" }));
                }
            })
        };
        *self.session.lock().unwrap() = Some(Session {
            id,
            client: client.clone(),
            device_id: device.id.clone(),
            transport_id,
            receiver_session_id,
            media_session_id: status["mediaSessionId"].as_i64(),
            media: status.clone(),
            volume: None,
            tasks: vec![events.abort_handle(), poll.abort_handle()],
        });
        client.send(NS_RECEIVER, PLATFORM_ID, &json!({ "type": "GET_STATUS" }));
        self.emit_status(Some(&status), json!({}));
        Ok(())
    }

    async fn run_events(self: Arc<Self>, id: u64, mut rx: mpsc::UnboundedReceiver<Event>) {
        while let Some(event) = rx.recv().await {
            match event {
                Event::Message { namespace, payload } => match (namespace.as_str(), payload["type"].as_str()) {
                    (NS_MEDIA, Some("MEDIA_STATUS")) => {
                        if let Some(status) = first_status(&payload) {
                            self.on_media_status(id, status);
                        }
                    }
                    (NS_RECEIVER, Some("RECEIVER_STATUS")) => self.on_receiver_volume(id, &payload),
                    (castv2::NS_CONNECTION, Some("CLOSE")) => {
                        self.end_detached("device-closed");
                        return;
                    }
                    _ => {}
                },
                Event::Closed => {
                    self.end_detached("device-closed");
                    return;
                }
            }
        }
    }

    /// `mediaFailed` : la TV a récupéré la vidéo sans savoir la lire, une autre source peut passer.
    async fn explain_failure(&self, failure: &Failure, device: &Device, started: Instant) -> Value {
        match failure.stage {
            "connect" => json!({ "error": "L'appareil ne répond pas. Vérifie qu'il est allumé et sur le même réseau que ce PC." }),
            "launch" => json!({ "error": "L'appareil a refusé de lancer la lecture. Réessaie dans quelques secondes." }),
            _ => {
                let reached = self
                    .proxy
                    .as_ref()
                    .and_then(|p| p.last_lan_request_from(device.host.into()))
                    .is_some_and(|at| at >= started);
                if reached {
                    return json!({ "error": "La TV n'a pas pu lire cette vidéo. Essaie une autre source.", "mediaFailed": true });
                }
                if firewall::status().await.is_some_and(|f| f.explains_unreachable()) {
                    json!({ "error": "Le pare-feu Windows empêche la TV de récupérer la vidéo sur ce PC. Autorise Nartya dans « Pare-feu Windows Defender › Autoriser une application », ou passe ce réseau en « Privé »." })
                } else {
                    json!({ "error": "La TV n'arrive pas à récupérer la vidéo sur ce PC. Vérifie ton pare-feu, et coupe ton VPN s'il est actif." })
                }
            }
        }
    }

    pub async fn start(self: &Arc<Self>, device_id: &str, media: Value) -> Value {
        let device = self.devices.lock().unwrap().get(device_id).cloned();
        let Some(device) = device else {
            return json!({ "success": false, "error": "Appareil introuvable, relance la recherche." });
        };
        let Some(url) = media["url"].as_str().filter(|u| !u.is_empty()) else {
            return json!({ "success": false, "error": "Aucune vidéo à caster pour le moment." });
        };
        let cast_url = match &self.proxy {
            Some(proxy) => proxy.to_cast_url(url, device.host).await,
            None => None,
        };
        let Some(cast_url) = cast_url else {
            return json!({ "success": false, "error": "Cette vidéo ne peut pas être castée.", "mediaFailed": true });
        };

        self.end_session("switch", json!({})).await;
        self.idle_gen.fetch_add(1, Ordering::SeqCst);

        let started = Instant::now();
        match self.load(&device, &media, &cast_url).await {
            Ok(()) => json!({ "success": true, "deviceId": device.id }),
            Err(failure) => {
                eprintln!("[cast] échec ({}) : {}", failure.stage, failure.message);
                let explained = self.explain_failure(&failure, &device, started).await;
                if let Some(proxy) = &self.proxy {
                    proxy.stop_lan();
                }
                let mut out = json!({ "success": false });
                out.as_object_mut().unwrap().extend(explained.as_object().cloned().unwrap_or_default());
                out
            }
        }
    }

    pub async fn control(self: &Arc<Self>, action: &str, value: &Value) -> Value {
        if action == "stop" {
            self.end_session("stop", json!({})).await;
            return json!({ "success": true });
        }
        let (client, transport, media_session, id) = {
            let guard = self.session.lock().unwrap();
            let Some(s) = guard.as_ref() else {
                return json!({ "success": false, "error": "Aucun cast actif" });
            };
            (s.client.clone(), s.transport_id.clone(), s.media_session_id, s.id)
        };
        let media_request = |payload: Value| {
            let client = client.clone();
            let transport = transport.clone();
            async move { client.request(NS_MEDIA, &transport, payload, LOAD_TIMEOUT).await }
        };
        let reply = match action {
            "play" | "pause" | "seek" => {
                let Some(msid) = media_session else {
                    return json!({ "success": false, "error": "Lecture pas encore prête" });
                };
                let mut payload = json!({
                    "type": action.to_uppercase(),
                    "mediaSessionId": msid,
                });
                if action == "seek" {
                    payload["currentTime"] = json!(value.as_f64().unwrap_or(0.0));
                }
                match media_request(payload).await {
                    Ok(r) => {
                        if let Some(st) = first_status(&r) {
                            self.on_media_status(id, st);
                        }
                        return json!({ "success": true });
                    }
                    Err(e) => return json!({ "success": false, "error": e }),
                }
            }
            "volume" => {
                let level = value.as_f64().unwrap_or(0.0).clamp(0.0, 1.0);
                json!({ "type": "SET_VOLUME", "volume": { "level": level } })
            }
            "mute" => json!({ "type": "SET_VOLUME", "volume": { "muted": value.as_bool().unwrap_or(false) } }),
            _ => return json!({ "success": false, "error": "Action inconnue" }),
        };
        match client.request(NS_RECEIVER, PLATFORM_ID, reply, LOAD_TIMEOUT).await {
            Ok(r) => {
                self.on_receiver_volume(id, &r);
                json!({ "success": true })
            }
            Err(e) => json!({ "success": false, "error": e }),
        }
    }

    pub async fn shutdown(self: &Arc<Self>) {
        self.end_session("shutdown", json!({})).await;
        self.stop_discovery();
    }
}

/// Premier message de `rx` que `pick` accepte, dans le délai.
async fn wait_for<T>(
    rx: &mut mpsc::UnboundedReceiver<Event>,
    timeout: Duration,
    pick: impl Fn(&str, &Value) -> Option<T>,
) -> Option<T> {
    let wait = async {
        while let Some(event) = rx.recv().await {
            match event {
                Event::Message { namespace, payload } => {
                    if let Some(found) = pick(&namespace, &payload) {
                        return Some(found);
                    }
                }
                Event::Closed => return None,
            }
        }
        None
    };
    tokio::time::timeout(timeout, wait).await.ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn application_dans_le_statut_du_recepteur() {
        let p = json!({ "type": "RECEIVER_STATUS", "status": { "applications": [
            { "appId": "OTHER", "transportId": "x", "sessionId": "y" },
            { "appId": MEDIA_APP_ID, "transportId": "web-1", "sessionId": "abc" },
        ]}});
        assert_eq!(media_app(&p), Some(("web-1".into(), "abc".into())));
        assert_eq!(media_app(&json!({ "status": {} })), None);
    }

    #[test]
    fn volume_du_recepteur() {
        assert_eq!(volume_of(&json!({ "level": 0.4, "muted": true })), Some((0.4, true)));
        assert_eq!(volume_of(&json!({ "muted": true })), None);
    }

    #[test]
    fn premier_statut_media() {
        let p = json!({ "type": "MEDIA_STATUS", "status": [{ "mediaSessionId": 3 }] });
        assert_eq!(first_status(&p).unwrap()["mediaSessionId"], 3);
        assert!(first_status(&json!({ "status": [] })).is_none());
    }
}
