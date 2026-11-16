use std::{
    sync::atomic::{AtomicU32, Ordering},
    time::Duration,
};

use tauri::{
    utils::config::Color, AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

use crate::{deep_link, state::AppState, url_guard::is_http_url};

const MIN_WIDTH: f64 = 1400.0;
const MIN_HEIGHT: f64 = 680.0;
/// Si la page ne signale jamais son chargement, la fenêtre ne reste pas invisible.
const REVEAL_FALLBACK: Duration = Duration::from_secs(8);
/// Sans session, le temps de se connecter dans le Hub avant que la fenêtre s'impose.
const GATE_TIMEOUT: Duration = Duration::from_secs(90);

/// Tous les webviews du process partagent un seul environnement WebView2 : ces arguments
/// doivent être identiques pour chaque fenêtre, sinon la création d'une seconde échoue
/// (0x8007139F).
#[cfg(windows)]
pub fn browser_args() -> String {
    // Le premier lot reprend les défauts de Tauri. L'overlay vidéo DirectComposition décale
    // l'image en plein écran avec une mise à l'échelle ≠ 100 %. Les trois derniers évitent que
    // la vidéo saccade quand la fenêtre perd le focus (PiP, second écran).
    #[allow(unused_mut)] // modifié en debug seulement (port CDP)
    let mut args = String::from(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,DirectCompositionVideoOverlays \
         --disable-background-timer-throttling --disable-renderer-backgrounding \
         --disable-backgrounding-occluded-windows",
    );
    #[cfg(debug_assertions)]
    if let Ok(port) = std::env::var("NARTYA_CDP_PORT") {
        args.push_str(&format!(" --remote-debugging-port={port}"));
    }
    args
}

/// Cadre de l'app seulement : ni page tierce atterrie dans la fenêtre, ni iframe.
fn is_app_url(url: &url::Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "about" | "blob" | "data" => true,
        "http" | "https" => {
            let host = url.host_str();
            if host == Some("tauri.localhost") {
                return true;
            }
            cfg!(debug_assertions) && host == Some("localhost") && url.port() == Some(5173)
        }
        _ => false,
    }
}

/// `init_script` : reprise du localStorage d'Electron (voir `migrate`).
pub fn create_main(app: &AppHandle, init_script: Option<String>) -> tauri::Result<WebviewWindow> {
    let opener = app.clone();
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Nartya")
        .inner_size(MIN_WIDTH, 880.0)
        // En dessous, la barre d'outils des épisodes passe sur deux lignes.
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .background_color(Color(11, 11, 15, 255))
        .center()
        .visible(false)
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            if is_http_url(url.as_str()) {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        });

    let builder = match init_script {
        Some(script) => builder.initialization_script(script),
        None => builder,
    };

    #[cfg(windows)]
    let builder = builder.additional_browser_args(&browser_args());

    builder.build()
}

static EXTRA_WINDOWS: AtomicU32 = AtomicU32::new(0);

/// Chemin d'une page de l'app, ou rien : jamais d'adresse libre.
fn clean_route(route: &str) -> Option<String> {
    let route = route.trim_start_matches('/');
    let ok = !route.is_empty()
        && route.len() <= 64
        && route.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_'));
    ok.then(|| route.to_string())
}

/// Fenêtre supplémentaire : même app, même session, mais ses propres états et son propre moteur.
pub fn open_extra(app: &AppHandle, route: Option<&str>) -> tauri::Result<()> {
    let n = EXTRA_WINDOWS.fetch_add(1, Ordering::SeqCst) + 1;
    let url = match route.and_then(clean_route) {
        Some(path) => WebviewUrl::App(path.into()),
        None => WebviewUrl::default(),
    };
    let opener = app.clone();
    let builder = WebviewWindowBuilder::new(app, format!("test-{n}"), url)
        .title(format!("Nartya (fenêtre {})", n + 1))
        .inner_size(1280.0, 800.0)
        .background_color(Color(11, 11, 15, 255))
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            if is_http_url(url.as_str()) {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        });
    #[cfg(windows)]
    let builder = builder.additional_browser_args(&browser_args());
    builder.build().map(|_| ())
}

/// Montre la fenêtre, puis livre le deep-link arrivé pendant le chargement. Pendant l'attente
/// du Hub, la page se charge mais la fenêtre reste cachée (`force` la montre quand même).
pub fn reveal(app: &AppHandle, force: bool) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let state = app.state::<AppState>();
    if force {
        state.set_defer_reveal(false);
    }
    if !state.defer_reveal() && !win.is_visible().unwrap_or(false) {
        let _ = win.show();
    }
    if !state.is_ready() {
        state.set_ready();
        deep_link::flush_pending(app);
    }
}

pub fn schedule_reveal_fallback(app: &AppHandle, deferred: bool) {
    let app = app.clone();
    let delay = if deferred {
        GATE_TIMEOUT
    } else {
        REVEAL_FALLBACK
    };
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        reveal(&app, true);
    });
}

pub fn focus_main(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if win.is_minimized().unwrap_or(false) {
        let _ = win.unminimize();
    }
    let _ = win.show();
    let _ = win.set_focus();
}

/// `set_always_on_top` contourne le refus de focus de Windows quand la demande vient d'une autre
/// application (le Hub).
pub fn force_focus_main(app: &AppHandle) -> bool {
    let Some(win) = app.get_webview_window("main") else {
        return false;
    };
    if win.is_minimized().unwrap_or(false) {
        let _ = win.unminimize();
    }
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    let _ = win.set_always_on_top(false);
    let _ = win.set_focus();
    app.state::<AppState>().set_defer_reveal(false);
    true
}
