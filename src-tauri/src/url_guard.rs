use url::Url;

/// `starts_with("http")` laisserait passer `httpxyz:`.
pub fn is_http_url(raw: &str) -> bool {
    Url::parse(raw)
        .map(|u| matches!(u.scheme(), "http" | "https"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepte_http_et_https() {
        assert!(is_http_url("https://nartya.app/"));
        assert!(is_http_url("http://127.0.0.1:8080/x"));
    }

    #[test]
    fn refuse_les_autres_schemas() {
        assert!(!is_http_url("httpxyz://exemple.com"));
        assert!(!is_http_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_http_url("javascript:alert(1)"));
        assert!(!is_http_url("nartya://anime/x"));
        assert!(!is_http_url("pas une url"));
    }
}
