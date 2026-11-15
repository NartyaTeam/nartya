//! Chaîne réelle de lecture : API (jeton de source) → embed → extraction → poignée → proxy local
//! → variante HLS → premier segment. Remplace l'ancien test Electron (`test:providers:electron`).
//!
//! `npm run test:providers`. En debug le cœur parle à `NARTYA_DEV_API` (défaut : l'API locale
//! sur le port 3000). Hors `NODE_ENV=development`, l'API exige un compte : `NARTYA_SMOKE_TOKEN`.
//! `NARTYA_SMOKE_SOURCE` choisit la source par sa clé opaque (défaut : s4).

use std::{process::exit, time::Duration};

use nartya_core::{
    downloads,
    stream::{self, ResolveRequest},
};
use serde_json::Value;

fn fail(message: impl AsRef<str>) -> ! {
    eprintln!("❌ Smoke providers : {}", message.as_ref());
    exit(1);
}

fn find_source(episodes: &[Value], wanted: &str) -> Result<(u64, String, String), Vec<String>> {
    let mut seen = Vec::new();
    for episode in episodes {
        let Some(langs) = episode.get("lecteurs").and_then(Value::as_object) else {
            continue;
        };
        for (lang, sources) in langs {
            for entry in sources.as_object().into_iter().flat_map(|s| s.values()) {
                let (Some(key), Some(id)) = (
                    entry.get("key").and_then(Value::as_str),
                    entry.get("id").and_then(Value::as_str),
                ) else {
                    continue;
                };
                if key == wanted {
                    let number = episode.get("episode").and_then(Value::as_u64).unwrap_or(0);
                    return Ok((number, lang.clone(), id.to_string()));
                }
                seen.push(key.to_string());
            }
        }
    }
    Err(seen)
}

/// Première ligne qui pointe vers le proxy local (variante, puis segment).
fn proxied_line(playlist: &str) -> Option<String> {
    playlist
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with("http://127.0.0.1:"))
        .map(str::to_string)
}

#[tokio::main]
async fn main() {
    let api = stream::api_base_url();
    let access = std::env::var("NARTYA_SMOKE_TOKEN").ok();
    let wanted = std::env::var("NARTYA_SMOKE_SOURCE").unwrap_or_else(|_| "s4".into());

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let get = |url: String| {
        let mut req = http.get(url);
        if let Some(token) = &access {
            req = req.bearer_auth(token);
        }
        req
    };

    // 1. Épisodes : contrat v2 (jetons opaques, pas d'URL claires).
    let url = format!("{api}/anime/gachiakuta/seasons/saison1/episodes?sources=v2");
    let response = get(url.clone()).send().await.unwrap_or_else(|e| fail(format!("{url} : {e}")));
    if !response.status().is_success() {
        let hint = if response.status().as_u16() == 401 {
            " (compte requis : lancer l'API en dev, ou fournir NARTYA_SMOKE_TOKEN)"
        } else {
            ""
        };
        fail(format!("API {url} → HTTP {}{hint}", response.status()));
    }
    let json: Value = response.json().await.unwrap_or_else(|e| fail(format!("réponse illisible : {e}")));
    if json["data"]["sources"] != "v2" {
        fail("l'API a répondu en URLs claires : contrat v2 non honoré (repli legacy ?)");
    }
    let episodes = json["data"]["episodes"].as_array().cloned().unwrap_or_default();
    let (episode, lang, token) = find_source(&episodes, &wanted).unwrap_or_else(|seen| {
        fail(format!("source {wanted} absente (présentes : {})", seen.join(", ")))
    });

    // 2. Résolution par le cœur : poignée, proxy local.
    let dir = std::env::temp_dir().join(format!("nartya-smoke-{}", std::process::id()));
    let (_, _, root) = downloads::open_root(&dir);
    let (_parts, service) = stream::start(root).await;
    let service = service.unwrap_or_else(|| fail("le proxy local n'a pas démarré"));
    let result = service
        .resolve(
            ResolveRequest {
                token: Some(token),
                ..Default::default()
            },
            access.clone(),
        )
        .await;
    if result["success"] != true {
        fail(format!("résolution : {}", result["error"]));
    }
    let master_url = result["url"].as_str().unwrap_or_else(|| fail("résolution sans URL")).to_string();

    // 3. Proxy : playlist maître, variante, segment.
    let text = |url: String| {
        let http = http.clone();
        async move {
            let r = http.get(&url).send().await.unwrap_or_else(|e| fail(format!("proxy {url} : {e}")));
            if !r.status().is_success() {
                fail(format!("proxy → HTTP {}", r.status()));
            }
            r.text().await.unwrap_or_else(|e| fail(format!("proxy : {e}")))
        }
    };
    let master = text(master_url).await;
    if !master.contains("RESOLUTION=1920x1080") {
        fail(format!("source {wanted} : 1080p absent de la playlist maître"));
    }
    if let Some(leak) = master.lines().map(str::trim).find(|l| l.starts_with("http") && !l.starts_with("http://127.0.0.1:")) {
        fail(format!("proxy : la playlist réécrite laisse fuiter une URL distante ({leak})"));
    }
    let variant_url = proxied_line(&master).unwrap_or_else(|| fail("proxy : variante HLS non réécrite"));
    let variant = text(variant_url).await;
    let segment_url = proxied_line(&variant).unwrap_or_else(|| fail("proxy : segment HLS non réécrit"));

    let segment = http
        .get(&segment_url)
        .header("Range", "bytes=0-1023")
        .send()
        .await
        .unwrap_or_else(|e| fail(format!("proxy segment : {e}")));
    if !segment.status().is_success() {
        fail(format!("proxy segment → HTTP {}", segment.status()));
    }
    let bytes = segment.bytes().await.unwrap_or_else(|e| fail(format!("segment : {e}")));
    if bytes.is_empty() {
        fail("proxy segment : aucun octet reçu");
    }

    let _ = std::fs::remove_dir_all(&dir);
    println!(
        "✅ Cœur Rust : Gachiakuta épisode {episode} {lang}, source {wanted} 1080p, \
         poignée + proxy et segment vidéo ({} octets)",
        bytes.len()
    );
}
