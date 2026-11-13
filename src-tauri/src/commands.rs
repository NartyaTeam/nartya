use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::{system, url_guard::is_http_url, window};

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

#[tauri::command]
pub fn app_focus(app: AppHandle) -> Value {
    json!({ "success": window::force_focus_main(&app) })
}

/// Lancée par le Hub : pas d'onboarding « Découvre le Hub ».
#[tauri::command]
pub fn hub_is_managed() -> bool {
    std::env::args().any(|a| a == "--hub-managed") || std::env::var("NARTYA_HUB").as_deref() == Ok("1")
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

/// Le serveur loopback d'authentification arrive avec le cœur lecture.
#[tauri::command]
pub fn get_auth_redirect_url() -> Option<String> {
    None
}
