//! Pages d'un chapitre, servies par notre API. Une page déjà sur disque est sautée : un
//! téléchargement interrompu reprend où il s'était arrêté.

use std::{
    path::Path,
    sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    time::Duration,
};

use serde_json::json;
use tokio::io::AsyncWriteExt;

use super::{
    mp4::Progress,
    transfer::{part_path, Ctx, DlError, DlResult, Throttle, MAX_ATTEMPTS},
};

const PAGE_CONCURRENCY: usize = 6;
const PAGE_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Chapter<'a> {
    pub image_base: &'a str,
    pub oeuvre: &'a str,
    pub folder: &'a str,
    pub pages: usize,
}

/// Sans la garde anti-SSRF : l'adresse vient de notre API (vérifiée au démarrage).
async fn page_once(ctx: &Ctx, url: &str, dest: &Path) -> DlResult<u64> {
    let request = ctx.net.client.get(url);
    let response = tokio::select! {
        _ = ctx.cancel.cancelled() => return Err(DlError::Aborted),
        r = tokio::time::timeout(PAGE_TIMEOUT, request.send()) => match r {
            Err(_) => return Err(DlError::Net(crate::stream::NetError::Timeout)),
            Ok(r) => r.map_err(|e| DlError::Net(crate::stream::NetError::Request(e)))?,
        },
    };
    if !response.status().is_success() {
        return Err(DlError::Http(response.status().as_u16()));
    }
    // Une page d'erreur servie en 200 ne doit pas être gardée comme une image : elle serait
    // marquée « téléchargée » et resterait vide à la lecture.
    let not_image = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| !ct.starts_with("image/") && !ct.starts_with("application/octet-stream"));
    if not_image {
        return Err(DlError::Other("la page reçue n'est pas une image".into()));
    }
    let tmp = part_path(dest);
    let mut out = tokio::fs::File::create(&tmp).await?;
    let mut body = response.bytes_stream();
    let mut bytes = 0u64;
    while let Some(chunk) = ctx.next_chunk(&mut body).await? {
        out.write_all(&chunk).await?;
        bytes += chunk.len() as u64;
    }
    out.flush().await?;
    drop(out);
    tokio::fs::rename(&tmp, dest).await?;
    Ok(bytes)
}

async fn page(ctx: &Ctx, url: &str, dest: &Path) -> DlResult<u64> {
    let mut last = DlError::Other("aucune tentative".into());
    for attempt in 1..=MAX_ATTEMPTS {
        ctx.check()?;
        match page_once(ctx, url, dest).await {
            Ok(n) => return Ok(n),
            Err(DlError::Aborted) => return Err(DlError::Aborted),
            Err(e) => last = e,
        }
        if attempt < MAX_ATTEMPTS {
            // Plus long que pour une vidéo : six pages en parallèle déclenchent vite un 429 en mobile.
            ctx.backoff(1500 * u64::from(attempt)).await?;
        }
    }
    Err(last)
}

pub async fn download(
    ctx: &Ctx,
    dir: &Path,
    chapter: Chapter<'_>,
    progress: Progress<'_>,
) -> DlResult<u64> {
    tokio::fs::create_dir_all(dir).await?;
    let total = chapter.pages;
    if total == 0 {
        return Err(DlError::Other("chapitre sans page".into()));
    }

    let cursor = AtomicUsize::new(0);
    let done = AtomicUsize::new(0);
    let received = AtomicU64::new(0);
    let stopped = AtomicBool::new(false);
    let throttle = Throttle::new();
    let oeuvre = urlencoding::encode(chapter.oeuvre);

    let worker = || async {
        loop {
            ctx.check()?;
            if stopped.load(Ordering::Relaxed) {
                return Ok(());
            }
            let n = cursor.fetch_add(1, Ordering::Relaxed) + 1;
            if n > total {
                return Ok(());
            }
            let dest = dir.join(format!("p{n:03}.jpg"));
            let existing = tokio::fs::metadata(&dest).await.map(|m| m.len()).unwrap_or(0);
            let bytes = if existing > 0 {
                existing
            } else {
                let url = format!(
                    "{}/{oeuvre}/{}/{n}.jpg",
                    chapter.image_base, chapter.folder
                );
                match page(ctx, &url, &dest).await {
                    Ok(b) => b,
                    Err(e) => {
                        stopped.store(true, Ordering::Relaxed);
                        return Err(e);
                    }
                }
            };
            let got = received.fetch_add(bytes, Ordering::Relaxed) + bytes;
            let finished = done.fetch_add(1, Ordering::Relaxed) + 1;
            if throttle.ready(finished == total) {
                progress(json!({
                    "percent": finished as f64 / total as f64 * 100.0,
                    "sizeBytes": got,
                }));
            }
        }
    };
    let results =
        futures_util::future::join_all((0..PAGE_CONCURRENCY.min(total)).map(|_| worker())).await;
    ctx.check()?;
    for result in results {
        result?;
    }
    Ok(received.load(Ordering::Relaxed))
}
