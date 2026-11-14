//! Téléchargements hors ligne, compatibles avec ceux d'Electron : même index
//! (`<données>/nartya/downloads.json`, clés `items` et `root`), mêmes dossiers
//! (`<racine>/<id en base64url>/`), mêmes champs. Les deux coques voient la même bibliothèque.

mod hls;
mod mp4;
pub mod paths;
mod scans;
mod transfer;

use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Map, Value};
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::{
    host::{Host, MoveChoice, MovePrompt},
    stream::{api_base_url, Handles, Net, RecipeStore},
};
use paths::{is_valid_id, item_dir, validate_root};
use transfer::{Ctx, DlError};

const STORE_FILE: &str = "downloads.json";
const SAVE_DELAY: Duration = Duration::from_secs(2);
const DEFAULT_MAX_CONCURRENT: usize = 2;

/// Racine courante, partagée avec le proxy qui sert les fichiers (`/local`).
pub type SharedRoot = Arc<RwLock<PathBuf>>;

struct Job {
    id: String,
    url: Option<String>,
    provider: Option<String>,
    max_height: u32,
}

struct State {
    /// Fichier entier : les clés inconnues sont conservées.
    doc: Map<String, Value>,
    queue: VecDeque<Job>,
    active: HashMap<String, CancellationToken>,
    running: usize,
    max_concurrent: usize,
    dirty: bool,
}

impl State {
    fn items(&mut self) -> &mut Map<String, Value> {
        let entry = self
            .doc
            .entry("items")
            .or_insert_with(|| Value::Object(Map::new()));
        if !entry.is_object() {
            *entry = Value::Object(Map::new());
        }
        entry.as_object_mut().unwrap()
    }

    fn item(&mut self, id: &str) -> Option<&mut Map<String, Value>> {
        self.items().get_mut(id).and_then(Value::as_object_mut)
    }

    fn busy(&self) -> bool {
        !self.active.is_empty() || !self.queue.is_empty()
    }
}

pub struct Downloads {
    host: Arc<dyn Host>,
    net: Arc<Net>,
    recipe: Arc<RecipeStore>,
    handles: Arc<Handles>,
    ffmpeg: Option<PathBuf>,
    store_path: PathBuf,
    default_root: PathBuf,
    root: SharedRoot,
    state: Mutex<State>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn str_field<'a>(item: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    item.get(key).and_then(Value::as_str)
}

/// Comme `${valeur}` en JavaScript.
fn js_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

fn load_doc(path: &Path) -> Map<String, Value> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| match v {
            Value::Object(m) => Some(m),
            _ => None,
        })
        .unwrap_or_default()
}

/// Écriture atomique : un arrêt brutal ne laisse jamais un index tronqué.
fn write_doc(path: &Path, doc: &Map<String, Value>) -> std::io::Result<()> {
    let body = serde_json::to_vec_pretty(doc)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, path)
}

/// Prépare l'index et la racine avant le proxy, qui sert les fichiers téléchargés.
pub fn open_root(data_dir: &Path) -> (Map<String, Value>, PathBuf, SharedRoot) {
    let _ = std::fs::create_dir_all(data_dir);
    let doc = load_doc(&data_dir.join(STORE_FILE));
    let default_root = data_dir.join("downloads");
    // Racine choisie si elle est encore utilisable, sinon le défaut, sans perdre le réglage.
    let root = match doc.get("root").and_then(Value::as_str).map(PathBuf::from) {
        Some(saved) if validate_root(&saved).is_none() => saved,
        Some(saved) => {
            eprintln!(
                "[downloads] racine « {} » inutilisable, repli sur le dossier par défaut",
                saved.display()
            );
            default_root.clone()
        }
        None => default_root.clone(),
    };
    let _ = std::fs::create_dir_all(&root);
    (doc, default_root, Arc::new(RwLock::new(root)))
}

pub struct Init {
    pub data_dir: PathBuf,
    pub doc: Map<String, Value>,
    pub default_root: PathBuf,
    pub root: SharedRoot,
    pub net: Arc<Net>,
    pub recipe: Arc<RecipeStore>,
    pub handles: Arc<Handles>,
}

impl Downloads {
    pub fn new(host: Arc<dyn Host>, init: Init) -> Arc<Self> {
        let mut state = State {
            doc: init.doc,
            queue: VecDeque::new(),
            active: HashMap::new(),
            running: 0,
            max_concurrent: DEFAULT_MAX_CONCURRENT,
            dirty: false,
        };
        let items = state.items();
        let before = items.len();
        // Corrompus (sans slug) : purgés.
        items.retain(|_, it| it.get("slug").and_then(Value::as_str).is_some());
        let mut changed = items.len() != before;
        // Laissés « en cours » par un arrêt brutal.
        for item in items.values_mut().filter_map(Value::as_object_mut) {
            if matches!(str_field(item, "status"), Some("downloading" | "queued")) {
                item.insert("status".into(), json!("error"));
                item.insert("error".into(), json!("Interrompu"));
                changed = true;
            }
        }
        state.dirty = changed;

        let ffmpeg = hls::find_ffmpeg();
        if ffmpeg.is_none() {
            eprintln!("[downloads] ffmpeg introuvable : les téléchargements HLS resteront en playlist + segments");
        }

        let this = Arc::new(Self {
            host,
            net: init.net,
            recipe: init.recipe,
            handles: init.handles,
            ffmpeg,
            store_path: init.data_dir.join(STORE_FILE),
            default_root: init.default_root,
            root: init.root,
            state: Mutex::new(state),
        });
        this.flush();

        // Sauvegarde différée : la progression change l'index plusieurs fois par seconde.
        let weak = Arc::downgrade(&this);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(SAVE_DELAY).await;
                let Some(this) = weak.upgrade() else { return };
                this.flush();
            }
        });
        this
    }

    fn root(&self) -> PathBuf {
        self.root.read().unwrap().clone()
    }

    /// Écrit l'index s'il a changé. À appeler aussi avant de quitter.
    pub fn flush(&self) {
        let mut state = self.state.lock().unwrap();
        if !state.dirty {
            return;
        }
        state.dirty = false;
        if let Err(e) = write_doc(&self.store_path, &state.doc) {
            eprintln!("[downloads] index non enregistré : {e}");
            state.dirty = true;
        }
    }

    /// Fusionne `patch` dans l'entrée et renvoie l'entrée complète (pour la page).
    fn patch(&self, id: &str, patch: Value, flush: bool) -> Option<Value> {
        let item = {
            let mut state = self.state.lock().unwrap();
            let item = state.item(id)?;
            if let Value::Object(fields) = patch {
                item.extend(fields);
            }
            let snapshot = Value::Object(item.clone());
            state.dirty = true;
            snapshot
        };
        if flush {
            self.flush();
        }
        Some(item)
    }

    fn emit(&self, item: Option<Value>) {
        if let Some(item) = item {
            self.host.emit("downloads:progress", item);
        }
    }

    fn update(&self, id: &str, patch: Value, flush: bool) {
        let item = self.patch(id, patch, flush);
        self.emit(item);
    }

    fn insert(&self, id: &str, item: Value) {
        {
            let mut state = self.state.lock().unwrap();
            state.items().insert(id.to_string(), item.clone());
            state.dirty = true;
        }
        self.emit(Some(item));
    }

    fn get(&self, id: &str) -> Option<Map<String, Value>> {
        self.state.lock().unwrap().item(id).cloned()
    }

    // ---- File d'attente

    fn process_queue(self: &Arc<Self>) {
        loop {
            let (job, token) = {
                let mut state = self.state.lock().unwrap();
                if state.running >= state.max_concurrent {
                    return;
                }
                let Some(job) = state.queue.pop_front() else {
                    return;
                };
                // Supprimée pendant qu'elle patientait : ne pas la recréer.
                if state.item(&job.id).is_none() {
                    continue;
                }
                state.running += 1;
                let token = CancellationToken::new();
                state.active.insert(job.id.clone(), token.clone());
                (job, token)
            };
            let this = self.clone();
            tokio::spawn(async move {
                this.run(job, token).await;
            });
        }
    }

    async fn run(self: Arc<Self>, job: Job, cancel: CancellationToken) {
        let id = job.id.clone();
        self.update(&id, json!({ "status": "downloading", "percent": 0 }), false);

        let ctx = Ctx {
            net: self.net.clone(),
            recipe: self.recipe.clone(),
            cancel: cancel.clone(),
        };
        let result = self.transfer(&ctx, &job).await;

        match result {
            Ok((file, size)) => self.update(
                &id,
                json!({
                    "status": "done", "percent": 100,
                    "file": if file.is_empty() { Value::Null } else { json!(file) },
                    "sizeBytes": size,
                    "finishedAt": now_ms(), "failedProviders": [],
                }),
                true,
            ),
            Err(_) if cancel.is_cancelled() => self.remove_files_and_record(&id).await,
            Err(e) => {
                eprintln!("[downloads] {id} en erreur : {e}");
                if let Some(item) = self.get(&id) {
                    let is_scan = str_field(&item, "type") == Some("scan");
                    let mut failed: Vec<Value> = item
                        .get("failedProviders")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let provider = job
                        .provider
                        .clone()
                        .or_else(|| str_field(&item, "provider").map(str::to_string));
                    if let Some(p) = provider.filter(|_| !is_scan && !e.is_local()) {
                        if !failed.iter().any(|v| v.as_str() == Some(p.as_str())) {
                            failed.push(json!(p));
                        }
                    }
                    self.update(
                        &id,
                        json!({ "status": "error", "error": e.friendly(), "failedProviders": failed }),
                        true,
                    );
                }
            }
        }

        {
            let mut state = self.state.lock().unwrap();
            state.active.remove(&id);
            state.running -= 1;
        }
        self.process_queue();
    }

    async fn transfer(&self, ctx: &Ctx, job: &Job) -> Result<(String, u64), DlError> {
        let dir = item_dir(&self.root(), &job.id).ok_or(DlError::Other("id invalide".into()))?;
        let item = self.get(&job.id).ok_or(DlError::Aborted)?;
        let id = job.id.clone();
        let progress = |patch: Value| {
            let mut patch = patch;
            patch["status"] = json!("downloading");
            self.update(&id, patch, false);
        };

        if str_field(&item, "type") == Some("scan") {
            let chapter = scans::Chapter {
                image_base: str_field(&item, "imageBase").unwrap_or(""),
                oeuvre: str_field(&item, "oeuvre").unwrap_or(""),
                folder: &item.get("folder").and_then(js_string).unwrap_or_default(),
                pages: item.get("pages").and_then(Value::as_u64).unwrap_or(0) as usize,
            };
            println!("[downloads] démarrage {} | scan | {} page(s)", job.id, chapter.pages);
            let size = scans::download(ctx, &dir, chapter, &progress).await?;
            // Un chapitre n'a pas de fichier principal : `file` vaut null, comme sous Electron.
            return Ok((String::new(), size));
        }

        let url = job.url.as_deref().ok_or(DlError::Other("lien manquant".into()))?;
        let provider = job.provider.as_deref();
        let is_hls = url.split('?').next().unwrap_or("").to_lowercase().ends_with(".m3u8");
        println!(
            "[downloads] démarrage {} | {} | {} | plafond {}",
            job.id,
            provider.unwrap_or("?"),
            if is_hls { "HLS" } else { "MP4" },
            if job.max_height > 0 { format!("{}p", job.max_height) } else { "aucun".into() }
        );
        if is_hls {
            let done = || {
                let _ = self.patch(&id, json!({ "processing": false }), false);
            };
            hls::download(
                ctx,
                &dir,
                url,
                provider,
                hls::Options {
                    max_height: (job.max_height > 0).then_some(job.max_height),
                    ffmpeg: self.ffmpeg.as_deref(),
                    progress: &progress,
                    processing_done: &done,
                    label: &job.id,
                },
            )
            .await
        } else {
            mp4::download(ctx, &dir, url, provider, &progress).await
        }
    }

    // ---- Commandes

    pub fn list(&self) -> Value {
        let mut state = self.state.lock().unwrap();
        let items: Vec<Value> = state
            .items()
            .iter()
            .filter_map(|(id, it)| {
                let mut it = it.as_object()?.clone();
                str_field(&it, "slug")?;
                it.insert("id".into(), json!(id));
                Some(Value::Object(it))
            })
            .collect();
        json!({ "items": items })
    }

    async fn cache_image(&self, url: &str, dest: &Path) -> bool {
        let Ok(parsed) = Url::parse(url) else {
            return false;
        };
        if !matches!(parsed.scheme(), "http" | "https") {
            return false;
        }
        let fetched = self
            .net
            .fetch_checked(
                reqwest::Method::GET,
                url,
                &HashMap::new(),
                Duration::from_secs(15),
            )
            .await;
        let Ok(response) = fetched else { return false };
        if !response.status().is_success() {
            return false;
        }
        match response.bytes().await {
            Ok(bytes) => tokio::fs::write(dest, bytes).await.is_ok(),
            Err(_) => false,
        }
    }

    fn already_running(&self, id: &str) -> bool {
        self.get(id).is_some_and(|it| {
            matches!(str_field(&it, "status"), Some("done" | "downloading"))
        })
    }

    pub async fn start(self: &Arc<Self>, payload: Value) -> Value {
        if payload["type"].as_str() == Some("scan") {
            return self.start_scan(payload).await;
        }
        let id = payload["id"].as_str().unwrap_or("").to_string();
        let handle = payload["handle"].as_str().unwrap_or("");
        // La page n'envoie qu'une poignée, jamais d'URL.
        if !is_valid_id(&id) || handle.is_empty() {
            return json!({ "success": false, "error": "Paramètres manquants" });
        }
        let Some(target) = self.handles.resolve(handle) else {
            return json!({ "success": false, "error": "Lien de téléchargement expiré, relance-le." });
        };
        if self.already_running(&id) {
            return json!({ "success": true, "alreadyExists": true });
        }
        let Some(dir) = item_dir(&self.root(), &id) else {
            return json!({ "success": false, "error": "Identifiant invalide" });
        };
        if let Err(e) = tokio::fs::create_dir_all(&dir).await {
            return json!({ "success": false, "error": DlError::Io(e).friendly() });
        }

        // Pour la bibliothèque hors ligne.
        let mut cover_file = Value::Null;
        if let Some(cover) = payload["animeCover"].as_str() {
            if self.cache_image(cover, &dir.join("cover.jpg")).await {
                cover_file = json!("cover.jpg");
            }
        }
        let mut thumb_file = Value::Null;
        if let Some(thumb) = payload["epThumb"].as_str() {
            if self.cache_image(thumb, &dir.join("thumb.jpg")).await {
                thumb_file = json!("thumb.jpg");
            }
        }

        let max_height = payload["maxHeight"].as_f64().filter(|h| *h > 0.0).unwrap_or(0.0) as u32;
        let provider = target.provider.clone().or_else(|| {
            self.recipe
                .current()
                .and_then(|r| r.detect_source_key(&target.url))
        });
        let or_null = |key: &str| {
            payload
                .get(key)
                .filter(|v| !v.is_null() && v.as_str() != Some(""))
                .cloned()
                .unwrap_or(Value::Null)
        };
        self.insert(
            &id,
            json!({
                "id": id,
                "slug": payload["slug"],
                "seasonId": payload["seasonId"],
                "ep": payload["ep"],
                "lang": payload["lang"],
                "animeTitle": payload.get("animeTitle").filter(|v| v.as_str().is_some_and(|s| !s.is_empty())).cloned().unwrap_or_else(|| payload["slug"].clone()),
                "animeCover": or_null("animeCover"),
                "coverFile": cover_file,
                "epThumb": or_null("epThumb"),
                "thumbFile": thumb_file,
                "epTitle": or_null("epTitle"),
                "seasonName": or_null("seasonName"),
                "provider": provider,
                // Pour « Reprendre », avec la même qualité et la même source.
                "maxHeight": max_height,
                "sourcePreference": payload["sourcePreference"].as_str().unwrap_or("auto"),
                "status": "queued",
                "error": null,
                "percent": 0,
                "sizeBytes": 0,
                "createdAt": now_ms(),
            }),
        );
        self.enqueue(Job {
            id,
            url: Some(target.url.clone()),
            provider,
            max_height,
        });
        json!({ "success": true })
    }

    /// Pages servies par notre API : seule cette origine est acceptée (plus localhost en dev).
    fn is_trusted_scan_base(image_base: &str) -> bool {
        let Ok(url) = Url::parse(image_base) else {
            return false;
        };
        let api = Url::parse(&api_base_url()).ok();
        if api.is_some_and(|a| a.origin() == url.origin()) {
            return true;
        }
        cfg!(debug_assertions) && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
    }

    async fn start_scan(self: &Arc<Self>, payload: Value) -> Value {
        let id = payload["id"].as_str().unwrap_or("").to_string();
        let image_base = payload["imageBase"].as_str().unwrap_or("");
        let pages = payload["pages"].as_u64().unwrap_or(0);
        if !is_valid_id(&id)
            || payload["oeuvre"].as_str().map_or(true, str::is_empty)
            || payload["chapter"].is_null()
            || payload["folder"].is_null()
            || pages == 0
            || image_base.is_empty()
        {
            return json!({ "success": false, "error": "Paramètres manquants" });
        }
        if !Self::is_trusted_scan_base(image_base) {
            return json!({ "success": false, "error": "Source des pages non reconnue" });
        }
        if self.already_running(&id) {
            return json!({ "success": true, "alreadyExists": true });
        }
        let Some(dir) = item_dir(&self.root(), &id) else {
            return json!({ "success": false, "error": "Identifiant invalide" });
        };
        if let Err(e) = tokio::fs::create_dir_all(&dir).await {
            return json!({ "success": false, "error": DlError::Io(e).friendly() });
        }
        let mut cover_file = Value::Null;
        if let Some(cover) = payload["animeCover"].as_str() {
            if self.cache_image(cover, &dir.join("cover.jpg")).await {
                cover_file = json!("cover.jpg");
            }
        }
        self.insert(
            &id,
            json!({
                "id": id,
                "type": "scan",
                "slug": payload["slug"],
                "oeuvre": payload["oeuvre"],
                "oeuvreLabel": payload.get("oeuvreLabel").cloned().unwrap_or(Value::Null),
                "chapter": payload["chapter"],
                "folder": payload["folder"],
                "pages": pages,
                "imageBase": image_base,
                "animeTitle": payload.get("animeTitle").filter(|v| v.as_str().is_some_and(|s| !s.is_empty())).cloned().unwrap_or_else(|| payload["slug"].clone()),
                "animeCover": payload.get("animeCover").cloned().unwrap_or(Value::Null),
                "coverFile": cover_file,
                "status": "queued",
                "error": null,
                "percent": 0,
                "sizeBytes": 0,
                "createdAt": now_ms(),
            }),
        );
        self.enqueue(Job {
            id,
            url: None,
            provider: None,
            max_height: 0,
        });
        json!({ "success": true })
    }

    fn enqueue(self: &Arc<Self>, job: Job) {
        self.state.lock().unwrap().queue.push_back(job);
        self.process_queue();
    }

    pub async fn cancel(&self, id: &str) -> Value {
        if !is_valid_id(id) {
            return json!({ "success": false, "error": "Identifiant invalide" });
        }
        let (token, was_queued) = {
            let mut state = self.state.lock().unwrap();
            let token = state.active.get(id).cloned();
            let before = state.queue.len();
            state.queue.retain(|j| j.id != id);
            (token, state.queue.len() != before)
        };
        // Le nettoyage revient à la tâche, une fois le transfert arrêté.
        if let Some(token) = token {
            token.cancel();
            return json!({ "success": true });
        }
        let stuck = self.get(id).is_some_and(|it| {
            matches!(str_field(&it, "status"), Some("downloading" | "queued"))
        });
        if was_queued || stuck {
            self.remove_files_and_record(id).await;
        }
        json!({ "success": true })
    }

    /// Par préfixe d'id (`slug::seasonId::`) ; `{ type: "scan", slug, oeuvre }` pour une édition.
    pub async fn cancel_season(&self, payload: Value) -> Value {
        let slug = payload["slug"].as_str().unwrap_or("");
        let (prefix, suffix) = if payload["type"].as_str() == Some("scan") {
            let oeuvre = payload["oeuvre"].as_str().unwrap_or("");
            if slug.is_empty() || oeuvre.is_empty() {
                return json!({ "success": false, "error": "Paramètres manquants" });
            }
            (format!("scan::{slug}::{oeuvre}::"), None)
        } else {
            let Some(season) = payload.get("seasonId").and_then(js_string) else {
                return json!({ "success": false, "error": "Paramètres manquants" });
            };
            if slug.is_empty() {
                return json!({ "success": false, "error": "Paramètres manquants" });
            }
            let lang = payload["lang"].as_str().filter(|l| !l.is_empty());
            (format!("{slug}::{season}::"), lang.map(|l| format!("::{l}")))
        };
        let matches = |id: &str| {
            id.starts_with(&prefix) && suffix.as_deref().map_or(true, |s| id.ends_with(s))
        };

        // File vidée d'abord, sinon chaque abandon démarrerait l'épisode suivant.
        let ids: Vec<String> = {
            let mut state = self.state.lock().unwrap();
            state.queue.retain(|j| !matches(&j.id));
            state
                .items()
                .iter()
                .filter(|(id, it)| {
                    matches(id)
                        && matches!(
                            it.get("status").and_then(Value::as_str),
                            Some("queued" | "downloading")
                        )
                })
                .map(|(id, _)| id.clone())
                .collect()
        };
        // Les épisodes terminés sont épargnés.
        for id in &ids {
            self.remove(id).await;
        }
        json!({ "success": true, "canceled": ids.len() })
    }

    async fn remove_files_and_record(&self, id: &str) {
        if let Some(dir) = item_dir(&self.root(), id) {
            let _ = tokio::fs::remove_dir_all(dir).await;
        }
        {
            let mut state = self.state.lock().unwrap();
            state.items().remove(id);
            state.dirty = true;
        }
        self.flush();
    }

    pub async fn remove(&self, id: &str) -> Value {
        if !is_valid_id(id) {
            return json!({ "success": false, "error": "Identifiant invalide" });
        }
        let token = {
            let mut state = self.state.lock().unwrap();
            // Un id supprimé ne doit jamais être repris par la file.
            state.queue.retain(|j| j.id != id);
            state.active.get(id).cloned()
        };
        if let Some(token) = token {
            token.cancel();
        }
        self.remove_files_and_record(id).await;
        json!({ "success": true })
    }

    /// Borné à [1, 99]. Une hausse relance la file.
    pub fn set_max_concurrent(self: &Arc<Self>, n: f64) {
        let next = if n.is_finite() { n.floor().clamp(1.0, 99.0) as usize } else { 1 };
        self.state.lock().unwrap().max_concurrent = next;
        self.process_queue();
    }

    pub fn get_dir(&self) -> Value {
        let root = self.root();
        let mut state = self.state.lock().unwrap();
        let count = state.items().len();
        json!({
            "dir": root,
            "defaultDir": self.default_root,
            "isDefault": root == self.default_root,
            "itemCount": count,
            "busy": state.busy(),
        })
    }

    pub fn open_dir(&self) -> Value {
        match self.host.open_path(&self.root()) {
            Ok(()) => json!({ "success": true }),
            Err(e) => json!({ "success": false, "error": e }),
        }
    }

    /// Sélecteur natif, puis « déplacer / laisser / annuler ».
    pub async fn choose_dir(&self) -> Value {
        if self.state.lock().unwrap().busy() {
            return json!({ "success": false, "error": "Un téléchargement est en cours — réessaie après." });
        }
        let root = self.root();
        let Some(picked) = self.host.pick_folder("Dossier de téléchargement", &root).await else {
            return json!({ "canceled": true });
        };
        let dir = std::path::absolute(&picked).unwrap_or(picked);
        if let Some(error) = validate_root(&dir) {
            return json!({ "success": false, "error": error });
        }
        if dir == root {
            return json!({ "canceled": true });
        }

        let count = self.state.lock().unwrap().items().len();
        let mut moving = false;
        if count > 0 {
            let prompt = MovePrompt {
                title: "Changer le dossier de téléchargement",
                message: format!(
                    "Déplacer les {count} épisode(s) déjà téléchargé(s) vers le nouveau dossier ?

« Laisser sur place » retire ces épisodes de ta bibliothèque hors ligne : leurs fichiers restent sur le disque mais Nartya ne les retrouvera plus."
                ),
                move_label: "Déplacer les épisodes",
                leave_label: "Laisser sur place",
                cancel_label: "Annuler",
            };
            match self.host.ask_move_downloads(prompt).await {
                MoveChoice::Move => moving = true,
                MoveChoice::Leave => {}
                MoveChoice::Cancel => return json!({ "canceled": true }),
            }
        }

        let result = self.set_dir(&dir, moving).await;
        // Sans déplacement, les entrées pointeraient vers des dossiers absents.
        if result["success"] == json!(true) && !moving && count > 0 {
            let mut state = self.state.lock().unwrap();
            state.items().clear();
            state.dirty = true;
            drop(state);
            self.flush();
        }
        result
    }

    /// Sans `moving`, les entrées sortent de la bibliothèque. Refusé pendant un téléchargement.
    async fn set_dir(&self, target: &Path, moving: bool) -> Value {
        if self.state.lock().unwrap().busy() {
            return json!({ "success": false, "error": "Un téléchargement est en cours — réessaie après." });
        }
        let old_root = self.root();
        let ids: Vec<String> = self.state.lock().unwrap().items().keys().cloned().collect();
        let mut moved = 0;
        if moving {
            for id in &ids {
                let (Some(src), Some(dest)) = (item_dir(&old_root, id), item_dir(target, id)) else {
                    continue;
                };
                if !src.exists() {
                    continue;
                }
                // Un reste d'un précédent déplacement bloquerait le renommage.
                let _ = tokio::fs::remove_dir_all(&dest).await;
                if let Err(e) = move_dir(&src, &dest).await {
                    // Échec partiel : on reste sur l'ancienne racine, rien n'est perdu.
                    eprintln!("[downloads] déplacement de {id} échoué : {e}");
                    return json!({
                        "success": false,
                        "error": format!("Déplacement interrompu ({moved}/{}) : {e}", ids.len()),
                    });
                }
                moved += 1;
            }
        }
        *self.root.write().unwrap() = target.to_path_buf();
        {
            let mut state = self.state.lock().unwrap();
            state
                .doc
                .insert("root".into(), json!(target.to_string_lossy()));
            state.dirty = true;
        }
        self.flush();
        let _ = std::fs::create_dir_all(target);
        println!("[downloads] racine → {} ({moved} entrée(s) déplacée(s))", target.display());
        json!({ "success": true, "dir": target, "moved": moved })
    }
}

/// Copie puis suppression quand les volumes diffèrent.
async fn move_dir(src: &Path, dest: &Path) -> std::io::Result<()> {
    if tokio::fs::rename(src, dest).await.is_ok() {
        return Ok(());
    }
    copy_dir(src.to_path_buf(), dest.to_path_buf()).await?;
    tokio::fs::remove_dir_all(src).await
}

async fn copy_dir(src: PathBuf, dest: PathBuf) -> std::io::Result<()> {
    tokio::task::spawn_blocking(move || {
        fn walk(src: &Path, dest: &Path) -> std::io::Result<()> {
            std::fs::create_dir_all(dest)?;
            for entry in std::fs::read_dir(src)? {
                let entry = entry?;
                let to = dest.join(entry.file_name());
                if entry.file_type()?.is_dir() {
                    walk(&entry.path(), &to)?;
                } else {
                    std::fs::copy(entry.path(), to)?;
                }
            }
            Ok(())
        }
        walk(&src, &dest)
    })
    .await
    .map_err(std::io::Error::other)?
}
