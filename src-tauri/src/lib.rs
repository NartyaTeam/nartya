mod commands;
mod deep_link;
mod state;
mod system;
mod url_guard;
mod window;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

pub fn run() {
    tauri::Builder::default()
        // Premier plugin : une seconde instance ne fait que passer la main à la première. Avec la
        // feature `deep-link`, le lien reçu est relayé à `on_open_url`.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::focus_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_external,
            commands::app_quit,
            commands::app_focus,
            commands::hub_is_managed,
            commands::get_version,
            commands::get_machine_id,
            commands::get_anime4k_capabilities,
            commands::get_auth_redirect_url,
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                window::reveal(webview.app_handle());
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // En dev, ne pas voler `nartya://` à l'app installée.
            #[cfg(any(windows, target_os = "linux"))]
            if !cfg!(debug_assertions) || std::env::var("NARTYA_REGISTER_SCHEME").is_ok() {
                let _ = app.deep_link().register_all();
            }

            let on_url = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    deep_link::handle(&on_url, url.as_str());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    deep_link::handle(&handle, url.as_str());
                }
            }

            window::create_main(&handle)?;
            window::schedule_reveal_fallback(&handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("échec du démarrage de Nartya");
}
