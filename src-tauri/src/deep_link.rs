use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;
use crate::window;

const PREFIX: &str = "nartya://";
const MAX_LEN: usize = 2048;

#[derive(Debug, PartialEq)]
enum Link {
    AuthCallback,
    Navigate(String),
}

/// Par deep-link ou par le serveur loopback (voie par défaut).
fn is_auth_callback(url: &str) -> bool {
    if url.starts_with("nartya://auth-callback") {
        return true;
    }
    url::Url::parse(url)
        .map(|u| u.host_str() == Some("127.0.0.1") && u.path() == "/auth-callback")
        .unwrap_or(false)
}

fn first_segment(s: &str) -> &str {
    s.split(['?', '#', '/']).next().unwrap_or("")
}

/// `nartya://[open/]anime/<slug>`, `u/<handle>` ou `party/<code>` → route de l'app, sinon `None`.
fn parse_navigation(url: &str) -> Option<String> {
    let mut path = url.strip_prefix(PREFIX)?;
    if let Some(rest) = path.strip_prefix("open/") {
        path = rest;
    }
    let path: String = path
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | '"' | '\'') && !c.is_whitespace())
        .collect();

    if let Some(rest) = path.strip_prefix("anime/") {
        let slug = first_segment(rest);
        return (!slug.is_empty()).then(|| format!("/anime/{slug}"));
    }
    if let Some(rest) = path.strip_prefix("u/") {
        let handle: String = first_segment(rest)
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
            .collect();
        return (!handle.is_empty()).then(|| format!("/u/{handle}"));
    }
    if let Some(rest) = path.strip_prefix("party/") {
        let code: String = first_segment(rest)
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_uppercase();
        return (!code.is_empty()).then(|| format!("/party/{code}"));
    }
    None
}

fn classify(url: &str) -> Option<Link> {
    if is_auth_callback(url) {
        return Some(Link::AuthCallback);
    }
    parse_navigation(url).map(Link::Navigate)
}

/// Avant que la page soit chargée, le lien attend : l'app n'écoute pas encore.
pub fn handle(app: &AppHandle, url: &str) {
    if url.is_empty() || url.len() > MAX_LEN {
        return;
    }
    let state = app.state::<AppState>();
    if !state.is_ready() {
        state.set_pending(url.to_string());
        return;
    }
    dispatch(app, url);
}

fn dispatch(app: &AppHandle, url: &str) {
    match classify(url) {
        Some(Link::AuthCallback) => {
            let _ = app.emit_to("main", "auth-callback", url);
        }
        Some(Link::Navigate(route)) => {
            let _ = app.emit_to("main", "navigate-to", route);
        }
        None => {}
    }
    window::focus_main(app);
}

/// Appelé quand la page est prête : le lien reçu pendant le chargement part maintenant.
pub fn flush_pending(app: &AppHandle) {
    if let Some(url) = app.state::<AppState>().take_pending() {
        dispatch(app, &url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_anime() {
        assert_eq!(
            parse_navigation("nartya://anime/one-piece"),
            Some("/anime/one-piece".into())
        );
        assert_eq!(
            parse_navigation("nartya://open/anime/naruto?x=1"),
            Some("/anime/naruto".into())
        );
        assert_eq!(parse_navigation("nartya://anime/"), None);
    }

    #[test]
    fn route_profil_nettoie_le_pseudo() {
        assert_eq!(
            parse_navigation("nartya://u/Zeleff_01"),
            Some("/u/Zeleff_01".into())
        );
        assert_eq!(parse_navigation("nartya://u/a-b.c"), Some("/u/abc".into()));
        assert_eq!(parse_navigation("nartya://u/../x"), None);
    }

    #[test]
    fn route_party_en_majuscules() {
        assert_eq!(
            parse_navigation("nartya://party/ab12cd"),
            Some("/party/AB12CD".into())
        );
    }

    #[test]
    fn retire_les_caracteres_dangereux() {
        assert_eq!(
            parse_navigation("nartya://anime/<script>alert(1)"),
            Some("/anime/scriptalert(1)".into())
        );
    }

    #[test]
    fn schema_inconnu_ou_chemin_inconnu() {
        assert_eq!(parse_navigation("https://nartya.app/anime/x"), None);
        assert_eq!(parse_navigation("nartya://settings"), None);
    }

    #[test]
    fn callback_oauth() {
        assert!(is_auth_callback("nartya://auth-callback#access_token=x"));
        assert!(is_auth_callback(
            "http://127.0.0.1:41234/auth-callback?code=1"
        ));
        assert!(!is_auth_callback("http://localhost:41234/auth-callback"));
        assert!(!is_auth_callback("nartya://anime/x"));
    }

    #[test]
    fn classement() {
        assert_eq!(classify("nartya://auth-callback"), Some(Link::AuthCallback));
        assert_eq!(
            classify("nartya://anime/a"),
            Some(Link::Navigate("/anime/a".into()))
        );
        assert_eq!(classify("nartya://rien"), None);
    }
}
