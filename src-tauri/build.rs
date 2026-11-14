/// Commandes exposées à la page : seules celles listées ici (et autorisées dans
/// `capabilities/main.json`) sont appelables, et seulement depuis la fenêtre principale.
const COMMANDS: &[&str] = &[
    "open_external",
    "app_quit",
    "app_focus",
    "hub_is_managed",
    "hub_get_info",
    "hub_open",
    "get_version",
    "get_machine_id",
    "get_anime4k_capabilities",
    "get_auth_redirect_url",
    "get_captcha_token",
    "session_get",
    "session_set",
    "session_remove",
    "resolve_stream",
    "downloads_list",
    "downloads_start",
    "downloads_cancel",
    "downloads_cancel_season",
    "downloads_remove",
    "downloads_set_max_concurrent",
    "downloads_local_url",
    "downloads_get_dir",
    "downloads_choose_dir",
    "downloads_open_dir",
    "discord_connect",
    "discord_set_presence",
    "discord_clear_presence",
    "cast_discover",
    "cast_add_host",
    "cast_diagnostics",
    "cast_start",
    "cast_control",
    "cast_stop",
];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("échec de tauri-build");
}
