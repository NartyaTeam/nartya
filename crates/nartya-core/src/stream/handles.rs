//! Identifiant opaque à la place de l'URL réelle dans les URL du proxy : l'URL de l'hébergeur ne
//! quitte pas la coque. Pas un secret : le domaine reste visible à la connexion TLS.

use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;

// ~250 poignées par épisode et par variante HLS ; au-delà, les plus anciennes sont évincées.
const MAX_HANDLES: usize = 20_000;

#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub url: String,
    pub provider: Option<String>,
    pub referer: String,
    pub origin: String,
}

impl Target {
    fn content_key(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.url,
            self.provider.as_deref().unwrap_or(""),
            self.referer,
            self.origin
        )
    }
}

#[derive(Default)]
struct Inner {
    by_handle: HashMap<String, Arc<Target>>,
    order: VecDeque<String>,
    /// Rejouer ne recrée pas de poignée.
    by_content: HashMap<String, String>,
}

#[derive(Default)]
pub struct Handles(Mutex<Inner>);

pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

impl Handles {
    /// Idempotent.
    pub fn mint(&self, target: Target) -> Option<String> {
        if target.url.is_empty() {
            return None;
        }
        let key = target.content_key();
        let mut inner = self.0.lock().unwrap();
        if let Some(existing) = inner.by_content.get(&key) {
            if inner.by_handle.contains_key(existing) {
                return Some(existing.clone());
            }
        }

        let handle = random_token(9);
        inner.by_handle.insert(handle.clone(), Arc::new(target));
        inner.order.push_back(handle.clone());
        inner.by_content.insert(key, handle.clone());

        while inner.by_handle.len() > MAX_HANDLES {
            let Some(oldest) = inner.order.pop_front() else {
                break;
            };
            if let Some(victim) = inner.by_handle.remove(&oldest) {
                let victim_key = victim.content_key();
                if inner.by_content.get(&victim_key) == Some(&oldest) {
                    inner.by_content.remove(&victim_key);
                }
            }
        }
        Some(handle)
    }

    pub fn resolve(&self, handle: &str) -> Option<Arc<Target>> {
        self.0.lock().unwrap().by_handle.get(handle).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(url: &str) -> Target {
        Target {
            url: url.into(),
            provider: Some("s1".into()),
            referer: "r".into(),
            origin: "o".into(),
        }
    }

    #[test]
    fn idempotent_et_resolvable() {
        let h = Handles::default();
        let a = h.mint(target("https://x/a.ts")).unwrap();
        assert_eq!(h.mint(target("https://x/a.ts")), Some(a.clone()));
        assert_ne!(h.mint(target("https://x/b.ts")), Some(a.clone()));
        assert_eq!(h.resolve(&a).unwrap().url, "https://x/a.ts");
        assert!(h.resolve("inconnue").is_none());
        assert!(h.mint(target("")).is_none());
    }

    #[test]
    fn eviction_des_plus_anciennes() {
        let h = Handles::default();
        let first = h.mint(target("https://x/0")).unwrap();
        for i in 1..=MAX_HANDLES {
            h.mint(target(&format!("https://x/{i}")));
        }
        assert!(h.resolve(&first).is_none());
        // Une fois évincée, la même cible reçoit une nouvelle poignée.
        let again = h.mint(target("https://x/0")).unwrap();
        assert!(h.resolve(&again).is_some());
    }

    #[test]
    fn jetons_distincts() {
        assert_ne!(random_token(24), random_token(24));
        assert_eq!(random_token(9).len(), 12);
    }
}
