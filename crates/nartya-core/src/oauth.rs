//! Retour OAuth en loopback (RFC 8252) : `nartya://` est peu fiable sur Linux et ChromeOS. Les
//! ports candidats doivent être autorisés côté Supabase (Redirect URLs).

use std::{collections::HashMap, net::Ipv4Addr, sync::Arc};

use axum::{
    extract::{OriginalUri, Query, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use tokio::net::TcpListener;

// À autoriser dans Supabase : http://127.0.0.1:<port>/auth-callback
const CANDIDATE_PORTS: [u16; 3] = [8351, 8352, 8353];
const CALLBACK_PATH: &str = "/auth-callback";

const PAGE_STYLE: &str = "html,body{height:100%;margin:0}body{display:flex;align-items:center;\
justify-content:center;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,\
sans-serif;background:#0b0b0f;color:#f5f5f7}.card{max-width:460px;padding:40px 28px}\
h1{font-size:20px;margin:0 0 10px}p{font-size:14px;color:#a1a1aa;margin:0;line-height:1.6}\
.mark{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;\
justify-content:center;margin:0 auto 24px;font-size:30px;color:#fff}";

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#039;")
}

fn page(title: &str, message: &str, mark: &str, mark_bg: &str, script: &str) -> String {
    let (title, message) = (escape_html(title), escape_html(message));
    format!(
        "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\" />\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\
<title>Nartya — {title}</title><style>{PAGE_STYLE}</style></head><body><main class=\"card\">\
<div class=\"mark\" style=\"background:{mark_bg}\">{mark}</div><h1>{title}</h1><p>{message}</p>\
</main>{script}</body></html>"
    )
}

fn success_page() -> String {
    page(
        "Connexion réussie",
        "Vous pouvez fermer cet onglet et revenir à l'application Nartya.",
        "✓",
        "#5865F2",
        "<script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 800);</script>",
    )
}

fn error_copy(params: &HashMap<String, String>) -> (&'static str, &'static str) {
    let raw = ["error_description", "error_code", "error"]
        .iter()
        .find_map(|k| params.get(*k).filter(|v| !v.is_empty()))
        .map(|v| v.replace('+', " ").to_lowercase())
        .unwrap_or_default();
    if raw.contains("identity is already linked to another user")
        || raw.contains("identity_already_exists")
    {
        return (
            "Ce compte Discord est déjà utilisé",
            "Il est déjà lié à un autre compte Nartya. Connectez-vous à ce compte ou choisissez un autre compte Discord.",
        );
    }
    if raw.contains("access_denied") {
        return (
            "Autorisation annulée",
            "Aucune modification n'a été apportée à votre compte Nartya.",
        );
    }
    (
        "Échec de la connexion",
        "Refermez cet onglet et réessayez depuis l'application Nartya.",
    )
}

fn error_page(params: &HashMap<String, String>) -> String {
    let (title, message) = error_copy(params);
    page(title, message, "!", "#ff4a2d55", "")
}

/// Reçoit l'adresse complète du retour (`http://127.0.0.1:<port>/auth-callback?code=…`).
pub type OnCallback = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Clone)]
struct Ctx {
    on_callback: OnCallback,
    port: u16,
}

async fn callback(
    State(ctx): State<Ctx>,
    Query(params): Query<HashMap<String, String>>,
    OriginalUri(uri): OriginalUri,
) -> Response {
    let full_url = format!(
        "http://127.0.0.1:{}{}",
        ctx.port,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(CALLBACK_PATH)
    );
    (ctx.on_callback)(&full_url);

    let body = if params.contains_key("code") {
        success_page()
    } else {
        error_page(&params)
    };
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        Html(body),
    )
        .into_response()
}

fn router(ctx: Ctx) -> Router {
    Router::new()
        .route(CALLBACK_PATH, get(callback))
        .fallback(|| async { (StatusCode::NOT_FOUND, "Not Found") })
        .with_state(ctx)
}

/// Démarre le serveur sur le premier port libre ; `None` si aucun ne l'est. À appeler depuis le
/// runtime Tokio de la coque.
pub async fn start(on_callback: OnCallback) -> Option<u16> {
    for port in CANDIDATE_PORTS {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await {
            Ok(listener) => {
                let app_router = router(Ctx { on_callback, port });
                tokio::spawn(async move {
                    let _ = axum::serve(listener, app_router).await;
                });
                return Some(port);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(_) => return None,
        }
    }
    None
}

/// Adresse de retour à donner au fournisseur, une fois le serveur démarré sur `port`.
pub fn redirect_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}{CALLBACK_PATH}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn messages_d_erreur() {
        assert_eq!(
            error_copy(&params(&[("error", "access_denied")])).0,
            "Autorisation annulée"
        );
        assert_eq!(
            error_copy(&params(&[(
                "error_description",
                "Identity+is+already+linked+to+another+user"
            )]))
            .0,
            "Ce compte Discord est déjà utilisé"
        );
        assert_eq!(error_copy(&params(&[])).0, "Échec de la connexion");
    }

    #[test]
    fn adresse_de_retour() {
        assert_eq!(redirect_url(8351), "http://127.0.0.1:8351/auth-callback");
    }

    #[test]
    fn le_html_est_echappe() {
        assert!(!page("<b>x</b>", "a&b", "!", "#000", "").contains("<b>x</b>"));
    }
}
