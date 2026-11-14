mod captcha;
mod cast;
mod commands;
mod config;
mod deep_link;
mod discord;
mod downloads;
mod hub;
mod oauth;
mod session;
mod state;
mod stream;
mod system;
mod url_guard;
mod window;

use std::sync::Arc;

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use session::SharedSession;

/// `None` si le proxy local n'a pas pu démarrer.
pub struct StreamSlot(pub Option<Arc<stream::StreamService>>);

/// Hors ligne sans session : on montre directement l'app (téléchargements) plutôt que d'attendre
/// une connexion dans le Hub.
fn is_online() -> bool {
    netdev::get_default_interface().is_ok()
}

pub fn run() {
    tauri::Builder::default()
        // Premier plugin : une seconde instance ne fait que passer la main à la première. Avec la
        // feature `deep-link`, le lien reçu est relayé à `on_open_url`.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::focus_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .manage(discord::Discord::start())
        .invoke_handler(tauri::generate_handler![
            commands::open_external,
            commands::app_quit,
            commands::app_focus,
            commands::hub_is_managed,
            commands::hub_get_info,
            commands::hub_open,
            commands::get_version,
            commands::get_machine_id,
            commands::get_anime4k_capabilities,
            commands::get_auth_redirect_url,
            commands::get_captcha_token,
            commands::session_get,
            commands::session_set,
            commands::session_remove,
            commands::resolve_stream,
            commands::downloads_list,
            commands::downloads_start,
            commands::downloads_cancel,
            commands::downloads_cancel_season,
            commands::downloads_remove,
            commands::downloads_set_max_concurrent,
            commands::downloads_local_url,
            commands::downloads_get_dir,
            commands::downloads_choose_dir,
            commands::downloads_open_dir,
            commands::discord_connect,
            commands::discord_set_presence,
            commands::discord_clear_presence,
            commands::cast_discover,
            commands::cast_add_host,
            commands::cast_diagnostics,
            commands::cast_start,
            commands::cast_control,
            commands::cast_stop,
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
            {
                window::reveal(webview.app_handle(), false);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // En dev, ne pas voler `nartya://` à l'app installée.
            #[cfg(any(windows, target_os = "linux"))]
            if !cfg!(debug_assertions) || std::env::var("NARTYA_REGISTER_SCHEME").is_ok() {
                let _ = app.deep_link().register_all();
            }

            // Avant la page : le stockage Supabase lit ce fichier.
            let session = Arc::new(SharedSession::init(&app.path().config_dir()?));
            app.manage(session.clone());

            // Connexion ou déconnexion depuis le Hub ou une autre app Nartya.
            let notify = handle.clone();
            session.watch(move |value| {
                let _ = notify.emit_to("main", "session:changed", value);
            });

            // Sans session, le Hub s'ouvre d'abord et la fenêtre attend la connexion, plutôt qu'un
            // écran « va dans le Hub » sous le Hub.
            let has_session = session.get("nartya-auth").is_some();
            let offline_at_boot = !has_session && !is_online();
            let mut deferred = false;
            if !hub::is_managed() && !offline_at_boot {
                if has_session {
                    let s = session.clone();
                    std::thread::spawn(move || hub::ensure_running(&s));
                } else if hub::resolve_exe(&session).is_some() {
                    deferred = true;
                    hub::launch(&session, hub::Mode::Visible);
                }
            }
            handle.state::<state::AppState>().set_defer_reveal(deferred);

            let _ = tauri::async_runtime::block_on(oauth::start(handle.clone()));
            // Même dossier de données qu'Electron (`%APPDATA%\nartya`) : les téléchargements
            // faits avec l'une ou l'autre coque restent dans la même bibliothèque.
            let data_dir = app.path().config_dir()?.join("nartya");
            let (doc, default_root, root) = downloads::open_root(&data_dir);
            let (parts, service) = tauri::async_runtime::block_on(stream::start(root.clone()));
            app.manage(cast::Cast::new(
                handle.clone(),
                service.as_ref().map(|s| s.proxy.clone()),
            ));
            app.manage(StreamSlot(service));
            app.manage(downloads::Downloads::new(
                handle.clone(),
                downloads::Init {
                    data_dir,
                    doc,
                    default_root,
                    root,
                    net: parts.net,
                    recipe: parts.recipe,
                    handles: parts.handles,
                },
            ));

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
            window::schedule_reveal_fallback(&handle, deferred);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("échec du démarrage de Nartya")
        .run(|app, event| {
            // L'index des téléchargements est écrit en différé.
            if let tauri::RunEvent::Exit = event {
                if let Some(downloads) = app.try_state::<Arc<downloads::Downloads>>() {
                    downloads.flush();
                }
                if let Some(cast) = app.try_state::<Arc<cast::Cast>>() {
                    tauri::async_runtime::block_on(cast.shutdown());
                }
            }
        });
}
