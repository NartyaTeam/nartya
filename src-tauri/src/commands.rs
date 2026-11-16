use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    captcha,
    host::TauriHost,
    hub, oauth,
    session::{is_session_key, SharedSession},
    state::AppState,
    system,
    url_guard::is_http_url,
    window,
};

type Session<'a> = State<'a, std::sync::Arc<SharedSession>>;

// `async` : une commande synchrone s'exécute sur le thread de la fenêtre, et un accès disque ou
// un lancement de processus y bloquerait l'affichage et le scroll.

#[tauri::command(async)]
pub fn open_external(app: AppHandle, url: String) -> Value {
    if is_http_url(&url) && app.opener().open_url(&url, None::<&str>).is_ok() {
        return json!({ "success": true });
    }
    json!({ "success": false })
}

#[tauri::command]
pub fn app_quit(app: AppHandle) -> Value {
    app.exit(0);
    json!({ "success": true })
}

/// Session arrivée du Hub : l'app passe devant, et le Hub se réduit.
#[tauri::command(async)]
pub fn app_focus(app: AppHandle, session: Session) -> Value {
    let focused = window::force_focus_main(&app);
    if focused {
        hub::launch(&session, hub::Mode::Minimize);
    }
    json!({ "success": focused })
}

#[tauri::command]
pub fn hub_is_managed() -> bool {
    hub::is_managed()
}

#[tauri::command(async)]
pub fn hub_get_info(session: Session) -> Option<Value> {
    session.hub_info()
}

#[tauri::command(async)]
pub fn hub_open(app: AppHandle, session: Session) -> Value {
    hub::open(&TauriHost(app), &session)
}

#[tauri::command]
pub fn get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command(async)]
pub fn get_machine_id() -> String {
    system::machine_id()
}

#[tauri::command(async)]
pub fn get_anime4k_capabilities() -> Value {
    system::anime4k_capabilities()
}

#[tauri::command]
pub fn get_auth_redirect_url(app: AppHandle) -> Option<String> {
    app.state::<AppState>().auth_port().map(oauth::redirect_url)
}

#[tauri::command]
pub async fn get_captcha_token(app: AppHandle) -> Value {
    captcha::get_token(app).await
}

#[tauri::command(async)]
pub fn session_get(session: Session, key: String) -> Option<String> {
    is_session_key(&key).then(|| session.get(&key)).flatten()
}

#[tauri::command(async)]
pub fn session_set(session: Session, key: String, value: String) -> bool {
    is_session_key(&key) && session.set(&key, &value)
}

#[tauri::command(async)]
pub fn session_remove(session: Session, key: String) -> bool {
    is_session_key(&key) && session.remove(&key)
}

/// Le jeton d'accès est lu dans le fichier partagé, pas reçu de la page : une page compromise ne
/// peut pas imposer le sien ni choisir la destination.
#[tauri::command]
pub async fn resolve_stream(
    session: Session<'_>,
    stream: State<'_, crate::StreamSlot>,
    payload: Option<crate::stream::ResolveRequest>,
) -> Result<Value, String> {
    let Some(service) = stream.0.clone() else {
        return Ok(json!({ "success": false, "error": "Proxy local indisponible" }));
    };
    let access_token = session.access_token();
    Ok(service
        .resolve(payload.unwrap_or_default(), access_token)
        .await)
}

// ---- Téléchargements hors ligne

type DownloadsState<'a> = State<'a, std::sync::Arc<crate::downloads::Downloads>>;

#[tauri::command(async)]
pub fn downloads_list(downloads: DownloadsState) -> Value {
    downloads.list()
}

#[tauri::command]
pub async fn downloads_start(downloads: DownloadsState<'_>, payload: Value) -> Result<Value, ()> {
    Ok(downloads.inner().clone().start(payload).await)
}

#[tauri::command]
pub async fn downloads_cancel(downloads: DownloadsState<'_>, id: String) -> Result<Value, ()> {
    Ok(downloads.cancel(&id).await)
}

#[tauri::command]
pub async fn downloads_cancel_season(
    downloads: DownloadsState<'_>,
    payload: Value,
) -> Result<Value, ()> {
    Ok(downloads.cancel_season(payload).await)
}

#[tauri::command]
pub async fn downloads_remove(downloads: DownloadsState<'_>, id: String) -> Result<Value, ()> {
    Ok(downloads.remove(&id).await)
}

#[tauri::command(async)]
pub fn downloads_set_max_concurrent(downloads: DownloadsState, n: f64) {
    downloads.inner().set_max_concurrent(n);
}

/// `None` si le proxy local n'a pas démarré.
#[tauri::command(async)]
pub fn downloads_local_url(
    stream: State<'_, crate::StreamSlot>,
    id: String,
    rel: Option<String>,
) -> Option<String> {
    let service = stream.0.as_ref()?;
    service
        .proxy
        .local_url(&id, rel.as_deref().unwrap_or("video.mp4"))
}

#[tauri::command(async)]
pub fn downloads_get_dir(downloads: DownloadsState) -> Value {
    downloads.get_dir()
}

#[tauri::command]
pub async fn downloads_choose_dir(downloads: DownloadsState<'_>) -> Result<Value, ()> {
    Ok(downloads.choose_dir().await)
}

#[tauri::command(async)]
pub fn downloads_open_dir(downloads: DownloadsState) -> Value {
    downloads.open_dir()
}

// ---- Cast

type CastState<'a> = State<'a, std::sync::Arc<crate::cast::Cast>>;

#[tauri::command]
pub fn cast_discover(cast: CastState) -> Value {
    cast.discover()
}

#[tauri::command]
pub async fn cast_add_host(cast: CastState<'_>, ip: String) -> Result<Value, ()> {
    Ok(cast.add_host(&ip).await)
}

#[tauri::command]
pub async fn cast_diagnostics(cast: CastState<'_>) -> Result<Value, ()> {
    Ok(cast.diagnostics().await)
}

#[tauri::command]
pub async fn cast_start(cast: CastState<'_>, device_id: String, media: Value) -> Result<Value, ()> {
    Ok(cast.start(&device_id, media).await)
}

#[tauri::command]
pub async fn cast_control(
    cast: CastState<'_>,
    action: String,
    value: Option<Value>,
) -> Result<Value, ()> {
    Ok(cast.control(&action, &value.unwrap_or(Value::Null)).await)
}

#[tauri::command]
pub async fn cast_stop(cast: CastState<'_>) -> Result<Value, ()> {
    cast.end_session("stop", json!({})).await;
    Ok(json!({ "success": true }))
}

// ---- Discord Rich Presence

#[tauri::command]
pub fn discord_connect(discord: State<'_, crate::discord::Discord>, client_id: String) -> Value {
    discord.connect(&client_id);
    json!({ "success": true })
}

#[tauri::command]
pub fn discord_set_presence(discord: State<'_, crate::discord::Discord>, params: Value) -> Value {
    if !params.is_object() {
        return json!({ "success": false, "error": "Paramètres invalides" });
    }
    discord.set(params);
    json!({ "success": true })
}

#[tauri::command]
pub fn discord_clear_presence(discord: State<'_, crate::discord::Discord>) -> Value {
    discord.clear();
    json!({ "success": true })
}

// ---- Watch party

/// Synchrone : les entrées doivent arriver au moteur dans l'ordre où la page les envoie.
#[tauri::command]
pub fn party_input(
    window: tauri::WebviewWindow,
    hub: State<'_, crate::party_hub::PartyHub>,
    input: Value,
) -> Result<(), String> {
    hub.input(window.label(), input)
}

