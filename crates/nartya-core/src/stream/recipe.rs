//! Registre des hébergeurs, chargé depuis l'API et gardé en mémoire. Pas un secret : le client doit
//! détenir la recette pour joindre les hébergeurs.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use indexmap::IndexMap;
use regex::{Regex, RegexBuilder};
use serde::Deserialize;

// Ne change qu'aux déploiements de l'API.
const TTL: Duration = Duration::from_secs(60 * 60);
const LOAD_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Mp4Referer {
    pub pattern: String,
    pub template: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Source {
    pub label: String,
    pub dev_name: Option<String>,
    pub domains: Vec<String>,
    pub headers: HashMap<String, String>,
    pub timeout: Option<u64>,
    pub strategy: String,
    pub canonical_host: Option<String>,
    pub host_match: Option<String>,
    pub embed_query: Option<String>,
    pub referer_from_embed: bool,
    pub drop_referer_off_host: bool,
    pub reject_pattern: Option<String>,
    pub media_base: Option<String>,
    pub media_pattern: Option<String>,
    pub mp4_referer: Option<Mp4Referer>,
    pub exclusive: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Recipe {
    pub version: Option<serde_json::Value>,
    pub default_headers: HashMap<String, String>,
    /// L'ordre de la recette est l'ordre de priorité de la détection.
    pub sources: IndexMap<String, Source>,
}

#[derive(Deserialize)]
struct Envelope {
    data: Recipe,
}

impl Recipe {
    pub fn source(&self, key: &str) -> Option<&Source> {
        self.sources.get(key)
    }

    /// `None` pour une URL d'hébergeur non reconnu (CDN tiers).
    pub fn detect_source_key(&self, url: &str) -> Option<String> {
        let lower = url.to_lowercase();
        self.sources
            .iter()
            .find(|(_, s)| s.domains.iter().any(|d| lower.contains(d.as_str())))
            .map(|(k, _)| k.clone())
    }

    /// Allowlist anti-SSRF, dérivée de la recette.
    pub fn is_allowed_embed_host(&self, hostname: &str) -> bool {
        let host = hostname.to_lowercase();
        self.sources
            .values()
            .flat_map(|s| s.domains.iter())
            .any(|d| host == *d || host.ends_with(&format!(".{d}")))
    }
}

/// Un motif invalide est ignoré.
pub fn recipe_regex(pattern: &str, case_insensitive: bool) -> Option<Regex> {
    if pattern.is_empty() {
        return None;
    }
    RegexBuilder::new(pattern)
        .case_insensitive(case_insensitive)
        .size_limit(1 << 20)
        .build()
        .map_err(|_| eprintln!("[recipe] motif invalide ignoré"))
        .ok()
}

struct Loaded {
    recipe: Arc<Recipe>,
    at: Instant,
}

#[derive(Default)]
pub struct RecipeStore {
    loaded: Mutex<Option<Loaded>>,
    /// Une seule requête à la fois ; les autres attendent son résultat.
    loading: tokio::sync::Mutex<()>,
}

impl RecipeStore {
    pub fn current(&self) -> Option<Arc<Recipe>> {
        self.loaded
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.recipe.clone())
    }

    fn fresh(&self) -> Option<Arc<Recipe>> {
        self.loaded
            .lock()
            .unwrap()
            .as_ref()
            .filter(|l| l.at.elapsed() < TTL)
            .map(|l| l.recipe.clone())
    }

    /// Mieux vaut une recette un peu datée qu'une lecture morte : en cas d'échec, l'ancienne reste.
    pub async fn ensure(
        &self,
        client: &reqwest::Client,
        api_base: &str,
        access_token: Option<&str>,
    ) -> Option<Arc<Recipe>> {
        if let Some(recipe) = self.fresh() {
            return Some(recipe);
        }
        let _guard = self.loading.lock().await;
        if let Some(recipe) = self.fresh() {
            return Some(recipe);
        }

        let mut request = client.get(format!("{api_base}/v1/sources/recipe"));
        if let Some(token) = access_token {
            request = request.bearer_auth(token);
        }
        let outcome = async {
            let response = tokio::time::timeout(LOAD_TIMEOUT, request.send())
                .await
                .map_err(|_| "délai dépassé".to_string())?
                .map_err(|e| e.without_url().to_string())?;
            if !response.status().is_success() {
                return Err(format!("HTTP {}", response.status().as_u16()));
            }
            let envelope: Envelope = response
                .json()
                .await
                .map_err(|_| "recette malformée".to_string())?;
            if envelope.data.sources.is_empty() {
                return Err("recette malformée".into());
            }
            Ok(envelope.data)
        }
        .await;

        match outcome {
            Ok(recipe) => {
                let recipe = Arc::new(recipe);
                *self.loaded.lock().unwrap() = Some(Loaded {
                    recipe: recipe.clone(),
                    at: Instant::now(),
                });
                Some(recipe)
            }
            Err(e) => {
                eprintln!("[recipe] chargement impossible : {e}");
                self.current()
            }
        }
    }
}

#[cfg(test)]
pub fn test_recipe(json: &str) -> Recipe {
    serde_json::from_str(json).expect("recette de test")
}

#[cfg(test)]
mod tests {
    use super::*;

    const RECIPE: &str = r#"{
        "defaultHeaders": {"User-Agent": "x"},
        "sources": {
            "s1": {"domains": ["ansembed.net"], "strategy": "packed-jw", "exclusive": true},
            "s2": {"domains": ["voe.sx", "cdn.voe.sx"], "strategy": "hls-json", "timeout": 20000}
        }
    }"#;

    #[test]
    fn detection_dans_l_ordre_de_la_recette() {
        let r = test_recipe(RECIPE);
        assert_eq!(
            r.detect_source_key("https://ANSEMBED.net/e/1").as_deref(),
            Some("s1")
        );
        assert_eq!(
            r.detect_source_key("https://cdn.voe.sx/x.m3u8").as_deref(),
            Some("s2")
        );
        assert_eq!(r.detect_source_key("https://autre.com/"), None);
        assert_eq!(r.sources.keys().next().map(String::as_str), Some("s1"));
    }

    #[test]
    fn hotes_autorises() {
        let r = test_recipe(RECIPE);
        assert!(r.is_allowed_embed_host("ansembed.net"));
        assert!(r.is_allowed_embed_host("www.ansembed.net"));
        assert!(!r.is_allowed_embed_host("evilansembed.net"));
        assert!(!r.is_allowed_embed_host("127.0.0.1"));
    }

    #[test]
    fn motif_invalide_ignore() {
        assert!(recipe_regex("(", true).is_none());
        assert!(recipe_regex("a+b", true).is_some());
    }
}
