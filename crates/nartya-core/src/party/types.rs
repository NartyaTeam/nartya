//! Contrat JSON du moteur de watch party (voir `docs/WATCHPARTY-CONTRACT.md`).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Me {
    pub client_id: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub premium: Option<String>,
}

/// Une entrée de présence, telle que Realtime la rapporte.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub client_id: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub premium: Option<String>,
    #[serde(default)]
    pub joined_at: u64,
    #[serde(default)]
    pub is_host_claim: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub is_public: bool,
    pub wait_on_source_load: bool,
    pub wait_on_join: bool,
    pub wait_on_buffer: bool,
    pub drift_tolerance: f64,
    /// Clés inconnues (`app`, …) : conservées telles quelles, la base s'en sert.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            is_public: false,
            wait_on_source_load: true,
            wait_on_join: true,
            wait_on_buffer: true,
            drift_tolerance: 1.5,
            extra: Map::new(),
        }
    }
}

impl Options {
    /// Applique un fragment venu de la page ou du fil, avec les bornes de sécurité.
    pub fn merged(&self, patch: &Value) -> Options {
        let mut base = serde_json::to_value(self).unwrap_or_else(|_| json!({}));
        if let (Some(b), Some(p)) = (base.as_object_mut(), patch.as_object()) {
            for (k, v) in p {
                b.insert(k.clone(), v.clone());
            }
        }
        let mut out: Options = serde_json::from_value(base).unwrap_or_default();
        out.drift_tolerance = if out.drift_tolerance.is_finite() && out.drift_tolerance > 0.0 {
            out.drift_tolerance.clamp(0.1, 10.0)
        } else {
            Options::default().drift_tolerance
        };
        out
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    Create,
    Join,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceStatus {
    Loading,
    Ready,
    Error,
    Buffering,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportStatus {
    Subscribed,
    Reconnecting,
    Lost,
    /// Refus du serveur : salon inexistant, plein, ou connexion refusée (compte, bannissement).
    NotFound,
    Full,
    Refused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlayerKind {
    Play,
    Pause,
    Seek,
    Stall,
    StallEnd,
    Ended,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueueOp {
    Add,
    Remove,
    Replace,
}

/// Ce que la page transmet au moteur.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum Input {
    Open {
        code: String,
        intent: Intent,
        me: Me,
        #[serde(default)]
        seed: Option<Value>,
        #[serde(default)]
        is_public: bool,
    },
    Close,
    Transport {
        status: TransportStatus,
    },
    Message {
        event: String,
        #[serde(default)]
        payload: Value,
    },
    Presence {
        members: Vec<Member>,
    },
    RpcResult {
        id: u64,
        ok: bool,
        #[serde(default)]
        data: Option<Value>,
    },
    PlayerTick {
        media_id: Option<String>,
        position: f64,
        #[serde(default)]
        duration: f64,
        paused: bool,
    },
    PlayerEvent {
        media_id: Option<String>,
        kind: PlayerKind,
        #[serde(default)]
        position: f64,
    },
    Source {
        media_id: Option<String>,
        status: SourceStatus,
        #[serde(default)]
        source_key: Option<String>,
    },
    SetCurrent {
        descriptor: Option<Value>,
    },
    PlayNow {
        descriptor: Value,
    },
    SetQueue {
        op: QueueOp,
        #[serde(default)]
        item: Option<Value>,
        #[serde(default)]
        items: Option<Vec<Value>>,
    },
    SetOptions {
        patch: Value,
    },
    ChangeLang {
        lang: String,
    },
    Next,
    Prev,
    Chat {
        text: String,
    },
    Reaction {
        emoji: String,
    },
}

/// Ce que la page doit exécuter.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum Effect {
    PlayerLoad {
        media_id: Option<String>,
        pinned_source: Option<String>,
    },
    PlayerSeek {
        position: f64,
    },
    PlayerPlay,
    PlayerPause,
    PlayerRate {
        rate: f64,
    },
    PlayerNotice {
        text: String,
    },
    Send {
        event: String,
        payload: Value,
    },
    Track {
        meta: Value,
    },
    /// `host` : on se présente comme l'hôte (création, ou reconnexion de l'hôte) ; le serveur
    /// tranche.
    Subscribe {
        channel: String,
        host: bool,
    },
    Unsubscribe,
    Rpc {
        id: u64,
        name: String,
        args: Value,
    },
    Chat {
        message: Value,
    },
    Reaction {
        reaction: Value,
    },
    Progress {
        slug: Value,
        season: Value,
        ep: Value,
        lang: Value,
        position: f64,
        duration: f64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Connecting,
    InRoom,
    NotFound,
    Full,
    Lost,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    pub client_id: String,
    pub user_id: Option<String>,
    pub username: String,
    pub avatar: Option<String>,
    pub premium: Option<String>,
    pub is_host: bool,
    pub source_status: SourceStatus,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Waiting {
    pub active: bool,
    #[serde(rename = "for")]
    pub for_clients: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LangChanging {
    pub username: Option<String>,
    pub to_lang: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourcePin {
    pub media_id: Option<String>,
    pub source_key: String,
}

/// Tout ce que la page affiche. Remplacé en bloc à chaque `rev`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub rev: u64,
    pub phase: Phase,
    pub code: Option<String>,
    pub role: &'static str,
    pub client_id: Option<String>,
    pub error: Option<String>,
    pub participants: Vec<Participant>,
    /// `None` : illimité.
    pub capacity: Option<usize>,
    pub current: Option<Value>,
    pub queue: Vec<Value>,
    pub options: Options,
    pub waiting: Waiting,
    pub lang_changing: Option<LangChanging>,
    pub source_pin: Option<SourcePin>,
}

#[derive(Debug, Default)]
pub struct Output {
    pub effects: Vec<Effect>,
    pub state: Option<Snapshot>,
}
