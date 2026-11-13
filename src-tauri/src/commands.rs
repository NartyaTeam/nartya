use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    captcha, hub, oauth,
    session::{is_session_key, SharedSession},
    system,
    url_guard::is_http_url,
    window,
};

type Session<'a> = State<'a, std::sync::Arc<SharedSession>>;

#[tauri::command]
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
#[tauri::command]
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

#[tauri::command]
pub fn hub_get_info(session: Session) -> Option<Value> {
    session.hub_info()
}

#[tauri::command]
pub fn hub_open(app: AppHandle, session: Session) -> Value {
    hub::open(&app, &session)
}

#[tauri::command]
pub fn get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_machine_id() -> String {
    system::machine_id()
}

#[tauri::command]
pub fn get_anime4k_capabilities() -> Value {
    system::anime4k_capabilities()
}

#[tauri::command]
pub fn get_auth_redirect_url(app: AppHandle) -> Option<String> {
    oauth::redirect_url(&app)
}

#[tauri::command]
pub async fn get_captcha_token(app: AppHandle) -> Value {
    captcha::get_token(app).await
}

#[tauri::command]
pub fn session_get(session: Session, key: String) -> Option<String> {
    is_session_key(&key).then(|| session.get(&key)).flatten()
}

#[tauri::command]
pub fn session_set(session: Session, key: String, value: String) -> bool {
    is_session_key(&key) && session.set(&key, &value)
}

#[tauri::command]
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
