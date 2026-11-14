//! En-têtes et adresse canonique d'une requête vers un hébergeur, d'après sa recette. Aucun
//! hébergeur n'est nommé ici : chacun est désigné par sa clé opaque.

use std::{collections::HashMap, time::Duration};

use url::Url;

use super::{
    net::DEFAULT_TIMEOUT,
    recipe::{recipe_regex, Recipe},
};

pub struct ProviderRequest {
    pub url: String,
    pub headers: HashMap<String, String>,
}

/// Sans recette ou pour un hôte inconnu : en-têtes neutres.
pub fn provider_headers(
    recipe: Option<&Recipe>,
    key: Option<&str>,
) -> (HashMap<String, String>, Duration) {
    let source = recipe.zip(key).and_then(|(r, k)| r.source(k));
    match source {
        Some(s) => (
            s.headers.clone(),
            s.timeout
                .map(Duration::from_millis)
                .unwrap_or(DEFAULT_TIMEOUT),
        ),
        None => (
            recipe
                .map(|r| r.default_headers.clone())
                .unwrap_or_default(),
            DEFAULT_TIMEOUT,
        ),
    }
}

/// Hôte canonique de l'hébergeur, d'après la recette.
pub fn canonicalize_url(url: &str, recipe: Option<&Recipe>, key: Option<&str>) -> String {
    let Some(recipe) = recipe else {
        return url.to_string();
    };
    let key = key
        .map(str::to_string)
        .or_else(|| recipe.detect_source_key(url));
    let Some(source) = key.as_deref().and_then(|k| recipe.source(k)) else {
        return url.to_string();
    };
    let (Some(canonical), Some(host_match)) = (
        source.canonical_host.as_deref(),
        source.host_match.as_deref(),
    ) else {
        return url.to_string();
    };
    let Ok(mut parsed) = Url::parse(url) else {
        return url.to_string();
    };
    let Some(host) = parsed.host_str() else {
        return url.to_string();
    };
    if host.contains(host_match)
        && !host.ends_with(canonical)
        && parsed.set_host(Some(canonical)).is_ok()
    {
        return parsed.to_string();
    }
    url.to_string()
}

/// Exigé par certains hébergeurs sur leurs MP4.
fn media_referer(media_url: &str, recipe: &Recipe, key: Option<&str>) -> Option<String> {
    let key = key
        .map(str::to_string)
        .or_else(|| recipe.detect_source_key(media_url))?;
    let rule = recipe.source(&key)?.mp4_referer.as_ref()?;
    if rule.pattern.is_empty() || rule.template.is_empty() {
        return None;
    }
    let re = recipe_regex(&rule.pattern, false)?;
    let caps = re.captures(media_url)?;
    static PLACEHOLDER: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"\{(\d+)\}").unwrap());
    Some(
        PLACEHOLDER
            .replace_all(&rule.template, |m: &regex::Captures| {
                let i: usize = m[1].parse().unwrap_or(usize::MAX);
                caps.get(i).map(|c| c.as_str()).unwrap_or("").to_string()
            })
            .into_owned(),
    )
}

pub fn build_provider_request(
    target_url: &str,
    recipe: Option<&Recipe>,
    provider: Option<&str>,
    range: Option<&str>,
) -> ProviderRequest {
    let detected = provider
        .map(str::to_string)
        .or_else(|| recipe.and_then(|r| r.detect_source_key(target_url)));
    let detected = detected.as_deref();
    let url = canonicalize_url(target_url, recipe, detected);
    let (mut headers, _) = provider_headers(recipe, detected);

    // Ajusté sur le domaine de l'hébergeur, retiré sur un CDN tiers (sinon 403).
    let source = recipe.zip(detected).and_then(|(r, k)| r.source(k));
    if let Some(s) = source.filter(|s| s.drop_referer_off_host && s.host_match.is_some()) {
        if let Ok(parsed) = Url::parse(&url) {
            let on_host = parsed
                .host_str()
                .is_some_and(|h| h.contains(s.host_match.as_deref().unwrap_or("")));
            if on_host {
                let origin = parsed.origin().ascii_serialization();
                headers.insert("Referer".into(), format!("{origin}/"));
                headers.insert("Origin".into(), origin);
            } else {
                headers.remove("Referer");
                headers.remove("Origin");
            }
        }
    }

    if let Some(referer) = recipe.and_then(|r| media_referer(&url, r, detected)) {
        headers.insert("Referer".into(), referer);
    }
    if let Some(range) = range {
        headers.insert("Range".into(), range.to_string());
    }
    ProviderRequest { url, headers }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stream::recipe::test_recipe;

    fn recipe() -> Recipe {
        test_recipe(
            r#"{"defaultHeaders":{"User-Agent":"neutre"},"sources":{
              "s1":{"domains":["host.test"],"headers":{"Referer":"https://host.test/","Origin":"https://host.test"},
                    "timeout":20000,"canonicalHost":"cdn.host.test","hostMatch":"host","dropRefererOffHost":true,
                    "mp4Referer":{"pattern":"https://([a-z0-9]+)\\.media\\.test/(\\d+)/","template":"https://{1}.page.test/v/{2}"}}
            }}"#,
        )
    }

    #[test]
    fn en_tetes_neutres_sans_recette_ou_hote_inconnu() {
        assert!(provider_headers(None, None).0.is_empty());
        let r = recipe();
        assert_eq!(provider_headers(Some(&r), None).0["User-Agent"], "neutre");
        assert_eq!(
            provider_headers(Some(&r), Some("s1")).1,
            Duration::from_millis(20000)
        );
    }

    #[test]
    fn hote_canonique() {
        let r = recipe();
        assert_eq!(
            canonicalize_url("https://x.host.test/e/1", Some(&r), None),
            "https://cdn.host.test/e/1"
        );
        assert_eq!(
            canonicalize_url("https://cdn.host.test/e/1", Some(&r), None),
            "https://cdn.host.test/e/1"
        );
        assert_eq!(
            canonicalize_url("https://autre.com/e", Some(&r), None),
            "https://autre.com/e"
        );
    }

    #[test]
    fn referer_selon_l_hote_et_range() {
        let r = recipe();
        let on = build_provider_request(
            "https://cdn.host.test/a.mp4",
            Some(&r),
            Some("s1"),
            Some("bytes=0-9"),
        );
        assert_eq!(on.headers["Referer"], "https://cdn.host.test/");
        assert_eq!(on.headers["Range"], "bytes=0-9");
        let off = build_provider_request("https://tiers.example/a.mp4", Some(&r), Some("s1"), None);
        assert!(!off.headers.contains_key("Referer") && !off.headers.contains_key("Origin"));
    }

    #[test]
    fn referer_des_mp4_depuis_un_motif() {
        let r = recipe();
        let req = build_provider_request(
            "https://abc1.media.test/42/v.mp4",
            Some(&r),
            Some("s1"),
            None,
        );
        assert_eq!(req.headers["Referer"], "https://abc1.page.test/v/42");
    }
}
