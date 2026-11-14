//! Cloudflare refuse l'origine locale de l'app : le jeton s'obtient dans une fenêtre sur la page
//! hébergée du site (`/captcha.html`, partagée avec Electron et Android). Elle signale son état
//! par `document.title` et dépose le résultat dans `window.__nartyaCaptcha`.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::config::SITE_URL;

const TIMEOUT: Duration = Duration::from_secs(90);
const LABEL: &str = "captcha";
const SCHEME: &str = "nartya-captcha";

/// Une fenêtre n'a pas de retour de script : ce script surveille le titre et signale l'état en
/// naviguant vers un schéma que la coque intercepte (`on_navigation`) sans jamais le charger.
const WATCH_SCRIPT: &str = r#"
(function () {
  var last = "";
  setInterval(function () {
    var t = document.title || "";
    if (t === last || t.indexOf("nartya-captcha:") !== 0) return;
    last = t;
    if (t.indexOf("nartya-captcha:interactive") === 0) {
      location.href = "nartya-captcha://interactive/";
    } else {
      var p = encodeURIComponent(JSON.stringify(window.__nartyaCaptcha || null));
      location.href = "nartya-captcha://done/#" + p;
    }
  }, 150);
})();
"#;

/// Deux demandes simultanées créeraient deux fenêtres du même nom : la seconde répond « busy ».
static BUSY: AtomicBool = AtomicBool::new(false);

struct Release;

impl Drop for Release {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

/// `{ token }` ou `{ error }`.
pub async fn get_token(app: AppHandle) -> Value {
    if BUSY.swap(true, Ordering::SeqCst) {
        return json!({ "error": "busy" });
    }
    let _release = Release;
    let Ok(site) = SITE_URL.parse::<url::Url>() else {
        return json!({ "error": "invalid-site-url" });
    };
    let Ok(page) = format!("{SITE_URL}/captcha.html").parse::<url::Url>() else {
        return json!({ "error": "invalid-site-url" });
    };

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let nav_app = app.clone();
    let site_origin = site.origin();

    let mut builder = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(page))
        .title("Vérification")
        .inner_size(420.0, 320.0)
        .resizable(false)
        // Montrée seulement si Cloudflare demande une interaction.
        .visible(false)
        .initialization_script(WATCH_SCRIPT)
        .on_navigation(move |url| {
            if url.scheme() == SCHEME {
                if url.host_str() == Some("interactive") {
                    if let Some(w) = nav_app.get_webview_window(LABEL) {
                        let _ = w.show();
                    }
                } else if let Some(sender) = tx.lock().unwrap().take() {
                    let payload = urlencoding::decode(url.fragment().unwrap_or(""))
                        .map(|c| c.into_owned())
                        .unwrap_or_default();
                    let _ = sender.send(payload);
                }
                return false;
            }
            // Ne quitte jamais la page du site.
            url.origin() == site_origin
        });

    // Pas de fenêtre modale : une modale invisible gèlerait l'app jusqu'au délai.
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(b) = builder.parent(&main) {
            builder = b;
        } else {
            return json!({ "error": "no-parent" });
        }
    }
    #[cfg(windows)]
    {
        builder = builder.additional_browser_args(&crate::window::browser_args());
    }

    let win = match builder.build() {
        Ok(w) => w,
        Err(e) => return json!({ "error": format!("window: {e}") }),
    };

    let outcome = tokio::time::timeout(TIMEOUT, rx).await;
    let _ = win.destroy();

    match outcome {
        Ok(Ok(raw)) => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Object(map)) if map.get("token").and_then(Value::as_str).is_some() => {
                json!({ "token": map["token"] })
            }
            Ok(Value::Object(map)) => {
                json!({ "error": map.get("error").and_then(Value::as_str).unwrap_or("unknown") })
            }
            _ => json!({ "error": "unknown" }),
        },
        // Fenêtre fermée par l'utilisateur avant le résultat.
        Ok(Err(_)) => json!({ "error": "cancelled" }),
        Err(_) => json!({ "error": "timeout" }),
    }
}
