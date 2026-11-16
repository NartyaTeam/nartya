//! Moteur de watch party : une machine à états pure. Entrées datées en, effets à exécuter et
//! instantané à afficher en sortie. Il ne lit jamais l'horloge, ne touche ni réseau ni lecteur.
//!
//! `now` est l'heure murale en millisecondes (epoch) : le protocole échange des heures d'hôte
//! corrigées par un décalage estimé, il faut donc la même échelle partout.

use std::collections::{HashMap, VecDeque};

use serde_json::{json, Value};

use super::types::*;

const CHANNEL_PREFIX: &str = "wp:";
const MAX_CHAT_CHARS: usize = 500;
const MAX_EMOJI_CHARS: usize = 8;
const CHAT_BURST: usize = 8;
const CHAT_WINDOW_MS: u64 = 10_000;

const HEARTBEAT_PLAYING_MS: u64 = 1_500;
const HEARTBEAT_PAUSED_MS: u64 = 4_000;
const PERSIST_THROTTLE_MS: u64 = 10_000;
const PUBLIC_BEAT_MS: u64 = 30_000;
const STATS_BEAT_MS: u64 = 60_000;
const CLOCK_PING_MS: u64 = 8_000;
const CLOCK_BURST_MS: u64 = 400;
const CLOCK_BURST_COUNT: usize = 4;
const CLOCK_WINDOW: usize = 8;
const CLOCK_MAX_RTT_MS: f64 = 5_000.0;
const SUBSCRIBE_TIMEOUT_MS: u64 = 10_000;
const WAIT_SOURCES_TIMEOUT_MS: u64 = 30_000;
const BUFFER_WAIT_COOLDOWN_MS: u64 = 20_000;
const JOIN_PROBE_MS: u64 = 2_500;
const PIN_WAIT_MS: u64 = 4_000;
const STALL_GRACE_MS: u64 = 1_200;
const SEEK_COOLDOWN_MS: u64 = 1_500;
const PLAY_CMD_COOLDOWN_MS: u64 = 1_000;
const MIN_DRIFT_S: f64 = 0.12;

#[derive(Debug, Clone, Copy)]
struct Remote {
    time: f64,
    playing: bool,
    sent_at: u64,
}

#[derive(Debug, Clone, Default)]
struct Local {
    media_id: Option<String>,
    position: f64,
    duration: f64,
    paused: bool,
    at: u64,
    seen: bool,
}

#[derive(Debug, Clone, Copy)]
enum Pending {
    Save,
    Restore,
    Probe,
    Ignore,
}

#[derive(Debug, Clone)]
struct PendingLoad {
    media_id: Option<String>,
    deadline: u64,
}

pub struct Engine {
    rev: u64,
    dirty: bool,
    rpc_seq: u64,
    out: Vec<Effect>,

    phase: Phase,
    code: Option<String>,
    me: Option<Me>,
    error: Option<String>,
    is_host: bool,
    epoch: u64,
    joined_at: u64,
    ever_subscribed: bool,
    members: Vec<Member>,
    seen_presence: bool,
    saw_peers: bool,
    joined_as_guest: bool,

    synced: bool,
    data_rev: u64,
    current: Option<Value>,
    queue: Vec<Value>,
    options: Options,
    host_pos: f64,

    remote: Option<Remote>,
    last_seq: Option<u64>,
    send_seq: u64,
    local: Local,
    rate: f64,
    last_seek_at: u64,
    last_play_cmd_at: u64,

    statuses: HashMap<String, SourceStatus>,
    waiting_until: Option<u64>,
    lang_changing: Option<LangChanging>,
    pin: Option<SourcePin>,
    pending_load: Option<PendingLoad>,
    stall_at: Option<u64>,
    stalled: bool,
    last_buffer_wait: u64,

    clock: VecDeque<(f64, f64)>,
    clock_next: Option<u64>,

    pending: HashMap<u64, Pending>,
    subscribe_deadline: Option<u64>,
    probe_at: Option<u64>,
    heartbeat_next: u64,
    last_persist: u64,
    saved_once: bool,
    published: bool,
    last_published_count: usize,
    public_next: u64,
    last_progress: u64,

    chat_out: VecDeque<u64>,
    chat_in: HashMap<String, VecDeque<u64>>,
}

fn desc_id(v: &Value) -> Option<&str> {
    v.get("id").and_then(Value::as_str)
}

fn within_window(q: &mut VecDeque<u64>, now: u64) -> bool {
    while q.front().is_some_and(|t| now.saturating_sub(*t) > CHAT_WINDOW_MS) {
        q.pop_front();
    }
    if q.len() >= CHAT_BURST {
        return false;
    }
    q.push_back(now);
    true
}

fn capacity_for(tier: Option<&str>) -> Option<usize> {
    match tier {
        Some("ultimate") => None,
        Some("plus") => Some(10),
        _ => Some(5),
    }
}

fn blocking(s: Option<&SourceStatus>) -> bool {
    matches!(s, Some(SourceStatus::Loading | SourceStatus::Buffering))
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        Self {
            rev: 0,
            dirty: true,
            rpc_seq: 0,
            out: Vec::new(),
            phase: Phase::Idle,
            code: None,
            me: None,
            error: None,
            is_host: false,
            epoch: 0,
            joined_at: 0,
            ever_subscribed: false,
            members: Vec::new(),
            seen_presence: false,
            saw_peers: false,
            joined_as_guest: false,
            synced: false,
            data_rev: 0,
            current: None,
            queue: Vec::new(),
            options: Options::default(),
            host_pos: 0.0,
            remote: None,
            last_seq: None,
            send_seq: 0,
            local: Local::default(),
            rate: 1.0,
            last_seek_at: 0,
            last_play_cmd_at: 0,
            statuses: HashMap::new(),
            waiting_until: None,
            lang_changing: None,
            pin: None,
            pending_load: None,
            stall_at: None,
            stalled: false,
            last_buffer_wait: 0,
            clock: VecDeque::new(),
            clock_next: None,
            pending: HashMap::new(),
            subscribe_deadline: None,
            probe_at: None,
            heartbeat_next: 0,
            last_persist: 0,
            saved_once: false,
            published: false,
            last_published_count: 0,
            public_next: 0,
            last_progress: 0,
            chat_out: VecDeque::new(),
            chat_in: HashMap::new(),
        }
    }

    // ---------- points d'entrée ----------

    pub fn handle(&mut self, now: u64, input: Input) -> Output {
        match input {
            Input::Open { code, intent, me, seed, is_public } => {
                self.open(now, code, intent, me, seed, is_public)
            }
            Input::Close => self.close(),
            Input::Transport { status } => self.on_transport(now, status),
            Input::Message { event, payload } => self.on_message(now, &event, payload),
            Input::Presence { members } => self.on_presence(now, members),
            Input::RpcResult { id, ok, data } => self.on_rpc_result(now, id, ok, data),
            Input::PlayerTick { media_id, position, duration, paused } => {
                self.on_tick(now, media_id, position, duration, paused)
            }
            Input::PlayerEvent { media_id, kind, position } => {
                self.on_player_event(now, media_id, kind, position)
            }
            Input::Source { media_id, status, source_key } => {
                self.on_source(now, media_id, status, source_key)
            }
            Input::SetCurrent { descriptor } => self.set_current(now, descriptor),
            Input::PlayNow { descriptor } => {
                if self.host_can_act() {
                    self.queue_add(&descriptor);
                    self.bump_and_send_queue();
                    self.set_current(now, Some(descriptor));
                }
            }
            Input::SetQueue { op, item, items } => self.set_queue(now, op, item, items),
            Input::SetOptions { patch } => self.set_options(now, patch),
            Input::ChangeLang { lang } => self.change_lang(now, lang),
            Input::Next => self.step_queue(now, 1),
            Input::Prev => self.step_queue(now, -1),
            Input::Chat { text } => self.send_chat(now, text),
            Input::Reaction { emoji } => self.send_reaction(now, emoji),
        }
        self.run_timers(now);
        self.finish()
    }

    /// À appeler quand `next_deadline()` est atteint.
    pub fn poll(&mut self, now: u64) -> Output {
        self.run_timers(now);
        self.finish()
    }

    /// Prochaine échéance interne, en ms epoch ; `None` si le moteur n'attend rien.
    pub fn next_deadline(&self) -> Option<u64> {
        if matches!(self.phase, Phase::Idle | Phase::NotFound | Phase::Full | Phase::Lost) {
            return None;
        }
        let mut d: Vec<u64> = Vec::new();
        d.extend(self.subscribe_deadline);
        d.extend(self.probe_at);
        d.extend(self.clock_next);
        d.extend(self.waiting_until);
        d.extend(self.stall_at);
        d.extend(self.pending_load.as_ref().map(|p| p.deadline));
        if self.is_host && self.phase == Phase::InRoom && self.current.is_some() {
            d.push(self.heartbeat_next);
        }
        if self.is_host && self.phase == Phase::InRoom && self.options.is_public && self.saved_once {
            d.push(self.public_next);
        }
        d.into_iter().min()
    }

    pub fn snapshot(&self) -> Snapshot {
        self.build_snapshot()
    }

    // ---------- cycle de vie ----------

    fn open(&mut self, now: u64, code: String, intent: Intent, me: Me, seed: Option<Value>, is_public: bool) {
        let (rev, rpc_seq, out) = (self.rev, self.rpc_seq, std::mem::take(&mut self.out));
        *self = Engine::new();
        self.rev = rev;
        self.rpc_seq = rpc_seq;
        self.out = out;
        self.phase = Phase::Connecting;
        self.code = Some(code.clone());
        self.me = Some(me);
        self.joined_at = now;
        self.joined_as_guest = intent == Intent::Join;
        self.subscribe_deadline = Some(now + SUBSCRIBE_TIMEOUT_MS);
        if intent == Intent::Create {
            self.is_host = true;
            self.epoch = 1;
            self.synced = true;
            self.options.is_public = is_public;
            self.queue = seed.iter().cloned().collect();
            self.current = seed;
        }
        self.out.push(Effect::Subscribe { channel: format!("{CHANNEL_PREFIX}{code}") });
        self.dirty = true;
    }

    fn close(&mut self) {
        let alone = self.members.len() <= 1;
        let code = self.code.clone();
        let was_host = self.is_host;
        if self.phase != Phase::Idle {
            self.out.push(Effect::Unsubscribe);
        }
        if was_host && alone && self.phase == Phase::InRoom {
            if let Some(code) = code {
                self.rpc("close", json!({ "code": code }), Pending::Ignore);
            }
        }
        self.teardown(Phase::Idle, None);
    }

    fn teardown(&mut self, phase: Phase, error: Option<String>) {
        let (rev, rpc_seq, code) = (self.rev, self.rpc_seq, self.code.clone());
        let out = std::mem::take(&mut self.out);
        *self = Engine::new();
        self.rev = rev;
        self.rpc_seq = rpc_seq;
        self.out = out;
        self.phase = phase;
        if matches!(phase, Phase::NotFound | Phase::Full | Phase::Lost) {
            self.code = code;
        }
        self.error = error;
        self.dirty = true;
    }

    fn on_transport(&mut self, now: u64, status: TransportStatus) {
        let Some(me) = self.me.clone() else { return };
        match status {
            TransportStatus::Subscribed => {
                if self.phase != Phase::Connecting && self.phase != Phase::InRoom {
                    return;
                }
                self.subscribe_deadline = None;
                self.phase = Phase::InRoom;
                self.out.push(Effect::Track { meta: self.track_meta(&me) });
                if self.ever_subscribed {
                    self.notice(now, "Connexion au salon rétablie.");
                }
                let first = !self.ever_subscribed;
                self.ever_subscribed = true;
                if self.is_host {
                    self.send_all_state(now);
                    if first {
                        self.persist(now, true);
                    }
                } else {
                    self.send("request_sync", json!({}));
                    self.clock.clear();
                    self.clock_next = Some(now);
                    if first {
                        self.probe_at = Some(now + JOIN_PROBE_MS);
                    }
                }
                self.dirty = true;
            }
            TransportStatus::Reconnecting => {}
            TransportStatus::Lost => {
                self.out.push(Effect::Unsubscribe);
                self.teardown(Phase::Lost, Some("Connexion au salon impossible.".into()));
            }
        }
    }

    fn track_meta(&self, me: &Me) -> Value {
        json!({
            "clientId": me.client_id, "userId": me.user_id, "username": me.username,
            "avatar": me.avatar, "premium": me.premium,
            "joinedAt": self.joined_at, "isHostClaim": self.is_host,
        })
    }

    // ---------- présence et élection ----------

    fn on_presence(&mut self, now: u64, members: Vec<Member>) {
        let Some(me) = self.me.clone() else { return };
        if self.phase != Phase::InRoom || members.is_empty() {
            return;
        }
        let old = std::mem::replace(&mut self.members, members);
        if self.members.iter().any(|m| m.client_id != me.client_id) {
            self.saw_peers = true;
        }
        let had_presence = self.seen_presence;
        self.seen_presence = true;

        if had_presence {
            let joined: Vec<Member> = self
                .members
                .iter()
                .filter(|m| m.client_id != me.client_id && !old.iter().any(|o| o.client_id == m.client_id))
                .cloned()
                .collect();
            for m in joined {
                self.notice(now, &format!("{} a rejoint le salon", name_or(&m.username)));
                if self.is_host
                    && self.options.wait_on_join
                    && self.options.wait_on_source_load
                    && !self.local.paused
                    && self.local.seen
                {
                    self.statuses.insert(m.client_id.clone(), SourceStatus::Loading);
                    self.arm_wait(now);
                }
            }
            let left: Vec<Member> = old
                .iter()
                .filter(|o| o.client_id != me.client_id && !self.members.iter().any(|m| m.client_id == o.client_id))
                .cloned()
                .collect();
            for m in left {
                self.notice(now, &format!("{} a quitté le salon", name_or(&m.username)));
                self.statuses.remove(&m.client_id);
                self.chat_in.remove(&m.client_id);
            }
            if self.waiting_until.is_some() && self.all_ready() {
                self.release_wait(now, true);
            }
        }

        let host = self.effective_host().cloned();
        let am_host = host.as_ref().is_some_and(|h| h.client_id == me.client_id);
        if am_host && !self.is_host {
            self.promote(now, &me);
        } else if !am_host && self.is_host {
            self.is_host = false;
            self.clock.clear();
            self.clock_next = Some(now);
            self.waiting_until = None;
            self.out.push(Effect::Track { meta: self.track_meta(&me) });
        }

        if !am_host {
            let cap = capacity_for(host.as_ref().and_then(|h| h.premium.as_deref()));
            if let Some(cap) = cap {
                let idx = self.ordered().iter().position(|m| m.client_id == me.client_id);
                if idx.is_some_and(|i| i >= cap) {
                    self.out.push(Effect::Unsubscribe);
                    self.teardown(Phase::Full, None);
                    return;
                }
            }
        }
        self.dirty = true;
    }

    fn ordered(&self) -> Vec<&Member> {
        let mut v: Vec<&Member> = self.members.iter().collect();
        v.sort_by(|a, b| a.joined_at.cmp(&b.joined_at).then_with(|| a.client_id.cmp(&b.client_id)));
        v
    }

    fn effective_host(&self) -> Option<&Member> {
        let ordered = self.ordered();
        ordered.iter().find(|m| m.is_host_claim).or_else(|| ordered.first()).copied()
    }

    fn promote(&mut self, now: u64, me: &Me) {
        self.is_host = true;
        self.epoch += 1;
        self.clock_next = None;
        if let Some(r) = self.remote.take() {
            self.host_pos = self.extrapolate(now, &r);
        }
        self.heartbeat_next = now;
        self.out.push(Effect::Track { meta: self.track_meta(me) });
        if self.synced {
            self.send_all_state(now);
            self.persist(now, true);
        } else if let Some(code) = self.code.clone() {
            self.rpc("get_state", json!({ "code": code }), Pending::Restore);
        }
    }

    // ---------- messages du fil ----------

    fn on_message(&mut self, now: u64, event: &str, payload: Value) {
        if self.phase != Phase::InRoom {
            return;
        }
        match event {
            "playback" => self.msg_playback(now, &payload),
            "current" => self.msg_current(now, payload),
            "queue" => self.msg_queue(now, &payload),
            "options" => self.msg_options(&payload),
            "request_sync" => {
                if self.is_host {
                    self.send_all_state(now);
                }
            }
            "clock_ping" => {
                if self.is_host {
                    if let Some(cid) = payload.get("clientId").and_then(Value::as_str) {
                        self.send(
                            "clock_pong",
                            json!({ "clientId": cid, "t0": payload.get("t0"), "t1": now }),
                        );
                    }
                }
            }
            "clock_pong" => self.msg_clock_pong(now, &payload),
            "source_loading" | "source_ready" | "source_error" | "source_stall" => {
                let status = match event {
                    "source_ready" => SourceStatus::Ready,
                    "source_error" => SourceStatus::Error,
                    "source_stall" => SourceStatus::Buffering,
                    _ => SourceStatus::Loading,
                };
                let cid = payload.get("clientId").and_then(Value::as_str).map(String::from);
                let mid = payload.get("mediaId").and_then(Value::as_str).map(String::from);
                if let Some(cid) = cid {
                    self.note_status(now, &cid, status, mid.as_deref());
                }
            }
            "source_pin" => self.msg_pin(now, &payload),
            "lang_changing" => {
                if !self.is_host && self.accept_host(&payload) {
                    self.lang_changing = Some(LangChanging {
                        username: str_field(&payload, "username"),
                        to_lang: str_field(&payload, "toLang"),
                    });
                    self.dirty = true;
                }
            }
            "chat" => self.msg_chat(now, &payload),
            "reaction" => self.msg_reaction(now, &payload),
            _ => {}
        }
    }

    /// Écarte un message d'une époque d'hôte périmée. Les anciens clients n'en envoient pas.
    fn accept_host(&mut self, payload: &Value) -> bool {
        let Some(e) = payload.get("epoch").and_then(Value::as_u64) else {
            return true;
        };
        if e < self.epoch {
            return false;
        }
        if e > self.epoch {
            self.epoch = e;
            self.last_seq = None;
        }
        true
    }

    /// Tient le compteur de révisions et réclame une resynchronisation en cas de trou.
    fn accept_rev(&mut self, payload: &Value) -> bool {
        let Some(r) = payload.get("rev").and_then(Value::as_u64) else {
            return true;
        };
        if r < self.data_rev {
            return false;
        }
        if self.data_rev > 0 && r > self.data_rev + 1 {
            self.send("request_sync", json!({}));
        }
        self.data_rev = r;
        true
    }

    fn msg_playback(&mut self, now: u64, p: &Value) {
        if self.is_host || !self.accept_host(p) {
            return;
        }
        if let Some(s) = p.get("seq").and_then(Value::as_u64) {
            if self.last_seq.is_some_and(|l| s <= l) {
                return;
            }
            self.last_seq = Some(s);
        }
        self.remote = Some(Remote {
            time: p.get("currentTime").and_then(Value::as_f64).unwrap_or(0.0).max(0.0),
            playing: p.get("isPlaying").and_then(Value::as_bool).unwrap_or(false),
            sent_at: p.get("sentAt").and_then(Value::as_u64).unwrap_or(now),
        });
        self.apply_remote(now, false);
    }

    fn msg_current(&mut self, now: u64, payload: Value) {
        if self.is_host || !self.accept_host(&payload) {
            return;
        }
        // Les anciens clients envoient le descripteur nu ; les nouveaux, `{ descriptor, rev }`.
        let (desc, wrapped) = match payload.get("descriptor") {
            Some(d) if payload.get("rev").is_some() => (d.clone(), true),
            _ => (payload.clone(), false),
        };
        if wrapped && !self.accept_rev(&payload) {
            return;
        }
        self.synced = true;
        self.current = if desc.is_null() { None } else { Some(desc) };
        self.remote = Some(Remote { time: 0.0, playing: false, sent_at: now });
        self.lang_changing = None;
        self.pin = None;
        self.local.seen = false;
        self.stall_at = None;
        self.stalled = false;
        self.rate = 1.0;
        if self.current.is_some() {
            self.begin_load(now);
        }
        self.dirty = true;
    }

    fn msg_queue(&mut self, _now: u64, p: &Value) {
        if self.is_host || !self.accept_host(p) || !self.accept_rev(p) {
            return;
        }
        self.synced = true;
        self.queue = p.get("queue").and_then(Value::as_array).cloned().unwrap_or_default();
        self.dirty = true;
    }

    fn msg_options(&mut self, p: &Value) {
        if self.is_host || !self.accept_host(p) || !self.accept_rev(p) {
            return;
        }
        self.synced = true;
        self.options = Options::default().merged(p);
        self.dirty = true;
    }

    fn msg_clock_pong(&mut self, now: u64, p: &Value) {
        let me = self.me.as_ref().map(|m| m.client_id.as_str());
        if self.is_host || p.get("clientId").and_then(Value::as_str) != me {
            return;
        }
        let (Some(t0), Some(t1)) = (p.get("t0").and_then(Value::as_f64), p.get("t1").and_then(Value::as_f64))
        else {
            return;
        };
        let rtt = now as f64 - t0;
        if !rtt.is_finite() || !(0.0..=CLOCK_MAX_RTT_MS).contains(&rtt) {
            return;
        }
        self.clock.push_back((rtt, t1 - (t0 + rtt / 2.0)));
        if self.clock.len() > CLOCK_WINDOW {
            self.clock.pop_front();
        }
    }

    /// Le décalage de l'échantillon au plus faible aller-retour : le moins pollué par la file.
    fn clock_offset(&self) -> f64 {
        self.clock
            .iter()
            .min_by(|a, b| a.0.total_cmp(&b.0))
            .map(|s| s.1)
            .unwrap_or(0.0)
    }

    fn msg_pin(&mut self, now: u64, p: &Value) {
        if self.is_host || !self.accept_host(p) {
            return;
        }
        let Some(key) = p.get("sourceKey").and_then(Value::as_str) else { return };
        self.pin = Some(SourcePin { media_id: str_field(p, "mediaId"), source_key: key.to_string() });
        self.dirty = true;
        self.try_start_load(now, false);
    }

    fn msg_chat(&mut self, now: u64, p: &Value) {
        let Some(text) = p.get("text").and_then(Value::as_str) else { return };
        let text: String = text.trim().chars().take(MAX_CHAT_CHARS).collect();
        if text.is_empty() {
            return;
        }
        let cid = str_field(p, "clientId").unwrap_or_default();
        if !within_window(self.chat_in.entry(cid.clone()).or_default(), now) {
            return;
        }
        self.out.push(Effect::Chat {
            message: json!({
                "type": "chat", "clientId": cid, "userId": p.get("userId"),
                "username": p.get("username"), "avatar": p.get("avatar"),
                "text": text, "ts": p.get("ts").and_then(Value::as_u64).unwrap_or(now),
            }),
        });
    }

    fn msg_reaction(&mut self, _now: u64, p: &Value) {
        let Some(emoji) = p.get("emoji").and_then(Value::as_str) else { return };
        let emoji: String = emoji.trim().chars().take(MAX_EMOJI_CHARS).collect();
        if emoji.is_empty() {
            return;
        }
        self.out.push(Effect::Reaction {
            reaction: json!({
                "userId": p.get("userId"), "username": p.get("username"),
                "emoji": emoji, "ts": p.get("ts"),
            }),
        });
    }

    // ---------- lecteur ----------

    fn local_ready(&self) -> bool {
        self.local.seen
            && self.local.media_id.as_deref().is_some()
            && self.local.media_id.as_deref() == self.current.as_ref().and_then(desc_id)
    }

    fn local_pos(&self, now: u64) -> f64 {
        if self.local.paused {
            self.local.position
        } else {
            self.local.position + now.saturating_sub(self.local.at) as f64 / 1000.0
        }
    }

    fn host_playback(&self, now: u64) -> (f64, bool) {
        if self.local_ready() {
            (self.local_pos(now), !self.local.paused)
        } else {
            (self.host_pos, false)
        }
    }

    fn extrapolate(&self, now: u64, r: &Remote) -> f64 {
        if !r.playing {
            return r.time;
        }
        let corrected = now as f64 + self.clock_offset();
        r.time + (corrected - r.sent_at as f64).max(0.0) / 1000.0
    }

    fn on_tick(&mut self, now: u64, media_id: Option<String>, position: f64, duration: f64, paused: bool) {
        self.local = Local {
            media_id,
            position: position.max(0.0),
            duration: duration.max(0.0),
            paused,
            at: now,
            seen: true,
        };
        if self.phase != Phase::InRoom {
            return;
        }
        if !self.is_host {
            self.apply_remote(now, false);
        } else if !paused {
            self.heartbeat_next = self.heartbeat_next.min(now + HEARTBEAT_PLAYING_MS);
        }
        if let Some(cur) = &self.current {
            if self.local_ready()
                && duration > 0.0
                && position > 1.0
                && now.saturating_sub(self.last_progress) >= STATS_BEAT_MS
            {
                self.last_progress = now;
                self.out.push(Effect::Progress {
                    slug: cur.get("slug").cloned().unwrap_or(Value::Null),
                    season: cur.get("season").cloned().unwrap_or(Value::Null),
                    ep: cur.get("ep").cloned().unwrap_or(Value::Null),
                    lang: cur.get("lang").cloned().unwrap_or(Value::Null),
                    position,
                    duration,
                });
            }
        }
    }

    fn on_player_event(&mut self, now: u64, media_id: Option<String>, kind: PlayerKind, position: f64) {
        if self.phase != Phase::InRoom {
            return;
        }
        let cur = self.current.as_ref().and_then(desc_id).map(String::from);
        if media_id.is_some() && cur.is_some() && media_id != cur {
            return;
        }
        match kind {
            PlayerKind::Play | PlayerKind::Pause | PlayerKind::Seek => {
                self.local.media_id = media_id.or(self.local.media_id.take());
                self.local.seen = true;
                self.local.position = position.max(0.0);
                self.local.at = now;
                match kind {
                    PlayerKind::Play => self.local.paused = false,
                    PlayerKind::Pause => self.local.paused = true,
                    _ => {}
                }
                if self.is_host {
                    self.send_playback(now);
                    self.persist(now, false);
                    self.heartbeat_next = now + self.heartbeat_ms();
                } else {
                    self.apply_remote(now, true);
                }
            }
            PlayerKind::Stall => {
                if self.stall_at.is_none() && !self.stalled {
                    self.stall_at = Some(now + STALL_GRACE_MS);
                }
            }
            PlayerKind::StallEnd => {
                self.stall_at = None;
                if self.stalled {
                    self.stalled = false;
                    self.report_own(now, SourceStatus::Ready);
                }
            }
            PlayerKind::Ended => {
                if self.is_host {
                    self.step_queue(now, 1);
                }
            }
            PlayerKind::Error => self.report_own(now, SourceStatus::Error),
        }
    }

    /// Participant : ramène le lecteur local sur l'hôte.
    fn apply_remote(&mut self, now: u64, notify: bool) {
        let Some(r) = self.remote else { return };
        if self.is_host || !self.local_ready() {
            return;
        }
        let target = self.extrapolate(now, &r);
        let diff = target - self.local_pos(now);
        let tol = self.options.drift_tolerance;
        let dur = self.local.duration;

        if diff.abs() > tol && (dur == 0.0 || target < dur - 1.0) {
            if now.saturating_sub(self.last_seek_at) >= SEEK_COOLDOWN_MS {
                self.last_seek_at = now;
                self.set_rate(1.0);
                self.out.push(Effect::PlayerSeek { position: target });
                if notify {
                    self.out.push(Effect::PlayerNotice { text: "Resynchronisé sur l'hôte".into() });
                }
                self.local.position = target;
                self.local.at = now;
            }
        } else if r.playing && diff.abs() > MIN_DRIFT_S.max(tol / 4.0) {
            self.set_rate(if diff > 0.0 { 1.05 } else { 0.95 });
        } else {
            self.set_rate(1.0);
        }

        if now.saturating_sub(self.last_play_cmd_at) >= PLAY_CMD_COOLDOWN_MS {
            if r.playing && self.local.paused {
                self.last_play_cmd_at = now;
                self.out.push(Effect::PlayerPlay);
            } else if !r.playing && !self.local.paused {
                self.last_play_cmd_at = now;
                self.out.push(Effect::PlayerPause);
            }
        }
    }

    fn set_rate(&mut self, rate: f64) {
        if (self.rate - rate).abs() > f64::EPSILON {
            self.rate = rate;
            self.out.push(Effect::PlayerRate { rate });
        }
    }

    // ---------- sources ----------

    fn begin_load(&mut self, now: u64) {
        let media_id = self.current.as_ref().and_then(desc_id).map(String::from);
        if let Some(me) = self.me.as_ref().map(|m| m.client_id.clone()) {
            self.statuses.insert(me, SourceStatus::Loading);
        }
        self.send_status(SourceStatus::Loading);
        self.pending_load = Some(PendingLoad {
            media_id,
            deadline: if self.is_host { now } else { now + PIN_WAIT_MS },
        });
        self.try_start_load(now, false);
    }

    /// Participant : l'extraction attend l'hébergeur de l'hôte, sans dépasser `PIN_WAIT_MS`.
    fn try_start_load(&mut self, now: u64, timed_out: bool) {
        let Some(p) = self.pending_load.clone() else { return };
        let pinned = self
            .pin
            .as_ref()
            .filter(|pin| pin.media_id == p.media_id)
            .map(|pin| pin.source_key.clone());
        if self.is_host || pinned.is_some() || timed_out || now >= p.deadline {
            self.pending_load = None;
            self.out.push(Effect::PlayerLoad { media_id: p.media_id, pinned_source: pinned });
        }
    }

    fn on_source(&mut self, now: u64, media_id: Option<String>, status: SourceStatus, key: Option<String>) {
        if self.phase != Phase::InRoom {
            return;
        }
        let cur = self.current.as_ref().and_then(desc_id).map(String::from);
        if media_id.is_some() && cur.is_some() && media_id != cur {
            return;
        }
        if status == SourceStatus::Ready {
            if let Some(key) = key {
                let pin = SourcePin { media_id: cur.clone(), source_key: key };
                if self.is_host {
                    self.send_pin(&pin);
                }
                self.pin = Some(pin);
                self.dirty = true;
            }
        }
        self.report_own(now, status);
    }

    fn report_own(&mut self, now: u64, status: SourceStatus) {
        let Some(me) = self.me.as_ref().map(|m| m.client_id.clone()) else { return };
        let mid = self.current.as_ref().and_then(desc_id).map(String::from);
        self.send_status(status);
        self.note_status(now, &me, status, mid.as_deref());
    }

    fn send_status(&mut self, status: SourceStatus) {
        let Some(me) = self.me.clone() else { return };
        let event = match status {
            SourceStatus::Ready => "source_ready",
            SourceStatus::Error => "source_error",
            SourceStatus::Buffering => "source_stall",
            SourceStatus::Loading => "source_loading",
        };
        let mid = self.current.as_ref().and_then(desc_id).map(String::from);
        self.send(event, json!({ "clientId": me.client_id, "username": me.username, "mediaId": mid }));
    }

    /// Un statut daté d'un autre épisode est écarté.
    fn note_status(&mut self, now: u64, client_id: &str, status: SourceStatus, media_id: Option<&str>) {
        let cur = self.current.as_ref().and_then(desc_id);
        if media_id.is_some() && cur.is_some() && media_id != cur {
            return;
        }
        self.statuses.insert(client_id.to_string(), status);
        self.dirty = true;
        if !self.is_host {
            return;
        }
        match status {
            SourceStatus::Buffering => {
                if self.options.wait_on_buffer
                    && !self.local.paused
                    && self.waiting_until.is_none()
                    && now.saturating_sub(self.last_buffer_wait) >= BUFFER_WAIT_COOLDOWN_MS
                {
                    self.last_buffer_wait = now;
                    self.arm_wait(now);
                }
            }
            SourceStatus::Loading => {}
            _ => {
                if self.waiting_until.is_some() && self.all_ready() {
                    self.release_wait(now, true);
                }
            }
        }
    }

    /// Sans statut connu, c'est un présent hors séance, pas un retardataire.
    fn all_ready(&self) -> bool {
        !self.members.is_empty() && self.members.iter().all(|m| !blocking(self.statuses.get(&m.client_id)))
    }

    fn arm_wait(&mut self, now: u64) {
        self.waiting_until = Some(now + WAIT_SOURCES_TIMEOUT_MS);
        if self.is_host {
            let (pos, _) = self.host_playback(now);
            self.out.push(Effect::PlayerPause);
            self.local.position = pos;
            self.local.paused = true;
            self.local.at = now;
            self.send_playback(now);
        }
        self.dirty = true;
    }

    fn release_wait(&mut self, now: u64, resume: bool) {
        self.waiting_until = None;
        self.dirty = true;
        let me_ready = self
            .me
            .as_ref()
            .is_some_and(|m| self.statuses.get(&m.client_id) == Some(&SourceStatus::Ready));
        if resume && self.is_host && me_ready {
            // Le premier battement du lecteur peut ne pas être arrivé : on annonce la reprise
            // depuis la dernière position connue plutôt que d'attendre.
            let (pos, _) = self.host_playback(now);
            self.out.push(Effect::PlayerPlay);
            if self.local_ready() {
                self.local.paused = false;
                self.local.position = pos;
                self.local.at = now;
            }
            self.send_playback_as(now, pos, true);
        }
    }

    // ---------- intentions de l'hôte ----------

    fn host_can_act(&self) -> bool {
        self.is_host && self.phase == Phase::InRoom
    }

    fn set_current(&mut self, now: u64, descriptor: Option<Value>) {
        if !self.host_can_act() {
            return;
        }
        self.current = descriptor.filter(|d| !d.is_null());
        self.host_pos = 0.0;
        self.local = Local::default();
        self.stall_at = None;
        self.stalled = false;
        self.pin = None;
        self.rate = 1.0;
        self.lang_changing = None;
        self.data_rev += 1;
        self.send_current();
        if self.current.is_some() {
            if self.options.wait_on_source_load {
                self.statuses = self
                    .members
                    .iter()
                    .map(|m| (m.client_id.clone(), SourceStatus::Loading))
                    .collect();
                self.arm_wait(now);
            }
            self.begin_load(now);
        }
        self.heartbeat_next = now + HEARTBEAT_PAUSED_MS;
        self.persist(now, true);
        self.dirty = true;
    }

    fn queue_add(&mut self, item: &Value) -> bool {
        let id = desc_id(item);
        if id.is_some() && self.queue.iter().any(|q| desc_id(q) == id) {
            return false;
        }
        self.queue.push(item.clone());
        true
    }

    fn bump_and_send_queue(&mut self) {
        self.data_rev += 1;
        self.send_queue();
        self.dirty = true;
    }

    fn set_queue(&mut self, now: u64, op: QueueOp, item: Option<Value>, items: Option<Vec<Value>>) {
        if !self.host_can_act() {
            return;
        }
        let mut start = None;
        match op {
            QueueOp::Add => {
                let Some(item) = item else { return };
                if self.queue_add(&item) && self.current.is_none() {
                    start = Some(item);
                }
            }
            QueueOp::Remove => {
                let Some(id) = item.as_ref().and_then(desc_id).map(String::from) else { return };
                self.queue.retain(|q| desc_id(q) != Some(id.as_str()));
            }
            QueueOp::Replace => self.queue = items.unwrap_or_default(),
        }
        self.bump_and_send_queue();
        self.persist(now, true);
        if let Some(first) = start {
            self.set_current(now, Some(first));
        }
    }

    fn set_options(&mut self, now: u64, patch: Value) {
        if !self.host_can_act() {
            return;
        }
        self.options = self.options.merged(&patch);
        self.data_rev += 1;
        self.send_options();
        if !self.options.wait_on_source_load && self.waiting_until.is_some() {
            self.release_wait(now, true);
        }
        self.persist(now, true);
        self.dirty = true;
    }

    fn change_lang(&mut self, now: u64, lang: String) {
        if !self.host_can_act() {
            return;
        }
        let Some(cur) = self.current.clone() else { return };
        if cur.get("lang").and_then(Value::as_str) == Some(lang.as_str()) {
            return;
        }
        let username = self.me.as_ref().map(|m| m.username.clone());
        self.send_host("lang_changing", json!({ "username": username, "toLang": lang }));
        let mut next = cur.clone();
        let part = |k: &str| match cur.get(k) {
            Some(Value::String(s)) => s.clone(),
            Some(v) if !v.is_null() => v.to_string(),
            _ => String::new(),
        };
        let id = format!("{}:{}:{}:{}", part("slug"), part("season"), part("ep"), lang);
        if let Some(o) = next.as_object_mut() {
            o.insert("lang".into(), json!(lang));
            o.insert("id".into(), json!(id));
        }
        self.set_current(now, Some(next));
    }

    fn step_queue(&mut self, now: u64, delta: i64) {
        if !self.host_can_act() {
            return;
        }
        let cur = self.current.as_ref().and_then(desc_id);
        let Some(idx) = self.queue.iter().position(|q| desc_id(q) == cur && cur.is_some()) else { return };
        let next = idx as i64 + delta;
        if next < 0 || next as usize >= self.queue.len() {
            return;
        }
        let item = self.queue[next as usize].clone();
        self.set_current(now, Some(item));
    }

    // ---------- chat ----------

    fn send_chat(&mut self, now: u64, text: String) {
        let Some(me) = self.me.clone() else { return };
        if self.phase != Phase::InRoom {
            return;
        }
        let text: String = text.trim().chars().take(MAX_CHAT_CHARS).collect();
        if text.is_empty() || !within_window(&mut self.chat_out, now) {
            return;
        }
        let msg = json!({
            "clientId": me.client_id, "userId": me.user_id, "username": me.username,
            "avatar": me.avatar, "text": text, "ts": now,
        });
        self.send("chat", msg.clone());
        let mut local = msg;
        local["type"] = json!("chat");
        self.out.push(Effect::Chat { message: local });
    }

    fn send_reaction(&mut self, now: u64, emoji: String) {
        let Some(me) = self.me.clone() else { return };
        let emoji: String = emoji.trim().chars().take(MAX_EMOJI_CHARS).collect();
        if self.phase != Phase::InRoom || emoji.is_empty() {
            return;
        }
        let r = json!({ "userId": me.user_id, "username": me.username, "emoji": emoji, "ts": now });
        self.send("reaction", r.clone());
        self.out.push(Effect::Reaction { reaction: r });
    }

    fn notice(&mut self, now: u64, text: &str) {
        self.out.push(Effect::Chat { message: json!({ "type": "system", "text": text, "ts": now }) });
    }

    // ---------- émissions ----------

    fn send(&mut self, event: &str, mut payload: Value) {
        if let Some(o) = payload.as_object_mut() {
            o.insert("v".into(), json!(PROTOCOL_VERSION));
        }
        self.out.push(Effect::Send { event: event.into(), payload });
    }

    /// Messages d'autorité : portent l'époque de l'hôte.
    fn send_host(&mut self, event: &str, mut payload: Value) {
        if let Some(o) = payload.as_object_mut() {
            o.insert("epoch".into(), json!(self.epoch));
        }
        self.send(event, payload);
    }

    fn send_playback(&mut self, now: u64) {
        let (t, playing) = self.host_playback(now);
        self.send_playback_as(now, t, playing);
    }

    fn send_playback_as(&mut self, now: u64, t: f64, playing: bool) {
        self.send_seq += 1;
        let seq = self.send_seq;
        self.send_host(
            "playback",
            json!({ "currentTime": t, "isPlaying": playing, "sentAt": now, "seq": seq }),
        );
    }

    fn send_current(&mut self) {
        // Rétro-compatible : un ancien client lit `payload` comme le descripteur nu.
        let payload = match self.current.clone() {
            Some(Value::Object(mut o)) => {
                o.insert("rev".into(), json!(self.data_rev));
                o.insert("descriptor".into(), Value::Object(o.clone()));
                Value::Object(o)
            }
            _ => json!({ "rev": self.data_rev, "descriptor": null }),
        };
        self.send_host("current", payload);
    }

    fn send_queue(&mut self) {
        let q = self.queue.clone();
        self.send_host("queue", json!({ "queue": q, "rev": self.data_rev }));
    }

    fn send_options(&mut self) {
        let mut v = serde_json::to_value(&self.options).unwrap_or_else(|_| json!({}));
        v["rev"] = json!(self.data_rev);
        self.send_host("options", v);
    }

    fn send_pin(&mut self, pin: &SourcePin) {
        self.send_host("source_pin", json!({ "mediaId": pin.media_id, "sourceKey": pin.source_key }));
    }

    fn send_all_state(&mut self, now: u64) {
        self.send_current();
        self.send_queue();
        self.send_options();
        let pin = self.pin.clone().filter(|p| p.media_id.as_deref() == self.current.as_ref().and_then(desc_id));
        if let Some(pin) = pin {
            self.send_pin(&pin);
        }
        self.send_playback(now);
    }

    // ---------- persistance et RPC ----------

    fn rpc(&mut self, name: &str, args: Value, kind: Pending) {
        self.rpc_seq += 1;
        let id = self.rpc_seq;
        self.pending.insert(id, kind);
        self.out.push(Effect::Rpc { id, name: name.into(), args });
    }

    fn persist(&mut self, now: u64, force: bool) {
        if !self.is_host || self.phase != Phase::InRoom {
            return;
        }
        if !force && now.saturating_sub(self.last_persist) < PERSIST_THROTTLE_MS {
            return;
        }
        let (Some(code), Some(me)) = (self.code.clone(), self.me.clone()) else { return };
        self.last_persist = now;
        let (t, playing) = self.host_playback(now);
        let args = json!({
            "code": code, "hostClientId": me.client_id, "current": self.current,
            "queue": self.queue, "playback": { "currentTime": t, "isPlaying": playing },
            "options": self.options,
        });
        self.rpc("save_state", args, Pending::Save);
    }

    fn on_rpc_result(&mut self, now: u64, id: u64, ok: bool, data: Option<Value>) {
        let Some(kind) = self.pending.remove(&id) else { return };
        let row = data.filter(|d| d.is_object());
        match kind {
            Pending::Save => {
                if ok {
                    self.saved_once = true;
                }
            }
            Pending::Ignore => {}
            Pending::Restore => {
                if !self.is_host {
                    return;
                }
                self.synced = true;
                match row.filter(|_| ok) {
                    // Un code tapé de travers ne doit pas créer de salon : tant qu'on n'a vu
                    // personne, la sonde tranche.
                    None => {
                        if !(self.joined_as_guest && !self.saw_peers) {
                            self.persist(now, true);
                        }
                    }
                    Some(r) => {
                        self.current = r.get("current").filter(|v| !v.is_null()).cloned();
                        self.queue = r.get("queue").and_then(Value::as_array).cloned().unwrap_or_default();
                        self.options = Options::default().merged(r.get("options").unwrap_or(&Value::Null));
                        self.host_pos = r
                            .get("playback")
                            .and_then(|p| p.get("currentTime"))
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0);
                        self.data_rev += 1;
                        self.send_all_state(now);
                        self.dirty = true;
                    }
                }
            }
            Pending::Probe => {
                if self.phase == Phase::InRoom && !self.saw_peers && self.current.is_none() && row.is_none() {
                    self.out.push(Effect::Unsubscribe);
                    self.teardown(Phase::NotFound, None);
                }
            }
        }
    }

    // ---------- minuteurs ----------

    fn heartbeat_ms(&self) -> u64 {
        if self.local_ready() && !self.local.paused {
            HEARTBEAT_PLAYING_MS
        } else {
            HEARTBEAT_PAUSED_MS
        }
    }

    fn run_timers(&mut self, now: u64) {
        if self.phase == Phase::Connecting && self.subscribe_deadline.is_some_and(|d| now >= d) {
            self.out.push(Effect::Unsubscribe);
            self.teardown(Phase::Lost, Some("Le salon ne répond pas. Vérifie ta connexion.".into()));
            return;
        }
        if self.phase != Phase::InRoom {
            return;
        }

        if self.pending_load.as_ref().is_some_and(|p| now >= p.deadline) {
            self.try_start_load(now, true);
        }

        if self.stall_at.is_some_and(|d| now >= d) {
            self.stall_at = None;
            self.stalled = true;
            self.report_own(now, SourceStatus::Buffering);
        }

        if self.waiting_until.is_some_and(|d| now >= d) {
            self.release_wait(now, true);
            self.notice(now, "Reprise sans les participants qui n'ont pas chargé à temps.");
        }

        if self.probe_at.is_some_and(|d| now >= d) {
            self.probe_at = None;
            if self.current.is_none() && !self.saw_peers {
                if let Some(code) = self.code.clone() {
                    self.rpc("get_state", json!({ "code": code }), Pending::Probe);
                }
            }
        }

        if !self.is_host {
            if self.clock_next.is_some_and(|d| now >= d) {
                let t0 = now;
                let cid = self.me.as_ref().map(|m| m.client_id.clone()).unwrap_or_default();
                self.send("clock_ping", json!({ "clientId": cid, "t0": t0 }));
                self.clock_next = Some(
                    now + if self.clock.len() < CLOCK_BURST_COUNT { CLOCK_BURST_MS } else { CLOCK_PING_MS },
                );
            }
            return;
        }

        if self.current.is_some() && now >= self.heartbeat_next {
            self.heartbeat_next = now + self.heartbeat_ms();
            self.send_playback(now);
            self.persist(now, false);
        }
        self.public_beat(now);
    }

    fn public_beat(&mut self, now: u64) {
        let Some(code) = self.code.clone() else { return };
        let count = self.members.len().max(1);
        if !self.options.is_public {
            if self.published {
                self.published = false;
                self.rpc("publish", json!({ "code": code, "public": false, "participants": count }), Pending::Ignore);
            }
            return;
        }
        if !self.saved_once {
            return;
        }
        if now >= self.public_next || count != self.last_published_count || !self.published {
            self.published = true;
            self.last_published_count = count;
            self.public_next = now + PUBLIC_BEAT_MS;
            self.rpc("publish", json!({ "code": code, "public": true, "participants": count }), Pending::Ignore);
        }
    }

    // ---------- instantané ----------

    fn finish(&mut self) -> Output {
        let effects = std::mem::take(&mut self.out);
        let state = if self.dirty {
            self.dirty = false;
            self.rev += 1;
            Some(self.build_snapshot())
        } else {
            None
        };
        Output { effects, state }
    }

    fn build_snapshot(&self) -> Snapshot {
        let me_id = self.me.as_ref().map(|m| m.client_id.clone());
        let host = self.effective_host();
        let host_id = host.map(|h| h.client_id.clone());
        let participants: Vec<Participant> = self
            .ordered()
            .into_iter()
            .map(|m| Participant {
                client_id: m.client_id.clone(),
                user_id: m.user_id.clone(),
                username: m.username.clone(),
                avatar: m.avatar.clone(),
                premium: m.premium.clone(),
                is_host: Some(&m.client_id) == host_id.as_ref(),
                source_status: self.statuses.get(&m.client_id).copied().unwrap_or(SourceStatus::Loading),
            })
            .collect();
        let waiting_for: Vec<String> = if self.waiting_until.is_some() {
            self.members
                .iter()
                .filter(|m| Some(&m.client_id) != me_id.as_ref() && blocking(self.statuses.get(&m.client_id)))
                .map(|m| m.client_id.clone())
                .collect()
        } else {
            Vec::new()
        };
        Snapshot {
            rev: self.rev,
            phase: self.phase,
            code: self.code.clone(),
            role: if self.is_host { "host" } else { "guest" },
            client_id: me_id,
            error: self.error.clone(),
            participants,
            capacity: capacity_for(host.and_then(|h| h.premium.as_deref())),
            current: self.current.clone(),
            queue: self.queue.clone(),
            options: self.options.clone(),
            waiting: Waiting { active: self.waiting_until.is_some(), for_clients: waiting_for },
            lang_changing: self.lang_changing.clone(),
            source_pin: self.pin.clone(),
        }
    }
}

fn name_or(n: &str) -> &str {
    if n.is_empty() {
        "Quelqu'un"
    } else {
        n
    }
}

fn str_field(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(String::from)
}
