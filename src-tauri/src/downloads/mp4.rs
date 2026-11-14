//! Plages `Range` en parallèle si l'hôte les accepte, sinon un seul flux.

use std::{
    io::SeekFrom,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};

use serde_json::{json, Value};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

use super::transfer::{estimate_eta, part_path, Ctx, DlError, DlResult, Throttle, MAX_ATTEMPTS};

// Les hébergeurs brident chaque connexion : découper en plages multiplie le débit.
const CONNECTIONS: u64 = 4;
// En dessous, le parallélisme ne vaut pas son surcoût.
const MIN_PARALLEL_BYTES: u64 = 8 * 1024 * 1024;

pub type Progress<'a> = &'a (dyn Fn(Value) + Send + Sync);

/// `Content-Range: bytes 0-1/123456` → 123456.
fn total_from_content_range(value: &str) -> Option<u64> {
    value.rsplit('/').next()?.trim().parse().ok()
}

async fn single_once(
    ctx: &Ctx,
    dir: &Path,
    url: &str,
    provider: Option<&str>,
    progress: Progress<'_>,
) -> DlResult<(String, u64)> {
    let dest = dir.join("video.mp4");
    let tmp = part_path(&dest);
    let response = ctx.fetch(url, provider, None).await?;
    if !response.status().is_success() {
        return Err(DlError::Http(response.status().as_u16()));
    }
    let total = response.content_length().unwrap_or(0);
    let mut out = tokio::fs::File::create(&tmp).await?;
    let mut body = response.bytes_stream();
    let throttle = Throttle::new();
    let started = Instant::now();
    let mut received = 0u64;
    while let Some(chunk) = ctx.next_chunk(&mut body).await? {
        out.write_all(&chunk).await?;
        received += chunk.len() as u64;
        if throttle.ready(false) {
            progress(json!({
                "percent": if total > 0 { received as f64 / total as f64 * 100.0 } else { 0.0 },
                "sizeBytes": received,
                "estimatedBytes": (total > 0).then_some(total),
                "etaSeconds": if total > 0 { estimate_eta(received, total, started) } else { None },
            }));
        }
    }
    out.flush().await?;
    drop(out);
    tokio::fs::rename(&tmp, &dest).await?;
    Ok(("video.mp4".into(), if received > 0 { received } else { total }))
}

/// Repli sans `Range`, avec reprises.
async fn single(
    ctx: &Ctx,
    dir: &Path,
    url: &str,
    provider: Option<&str>,
    progress: Progress<'_>,
) -> DlResult<(String, u64)> {
    let mut last = DlError::Other("aucune tentative".into());
    for attempt in 1..=MAX_ATTEMPTS {
        ctx.check()?;
        match single_once(ctx, dir, url, provider, progress).await {
            Ok(r) => return Ok(r),
            Err(DlError::Aborted) => return Err(DlError::Aborted),
            Err(e) => last = e,
        }
        if attempt < MAX_ATTEMPTS {
            ctx.backoff(800 * u64::from(attempt)).await?;
        }
    }
    Err(last)
}

struct Shared {
    total: u64,
    parts: Vec<AtomicU64>,
    /// Une plage en échec définitif fait taire les autres.
    stopped: AtomicBool,
    throttle: Throttle,
    started: Instant,
}

impl Shared {
    fn received(&self) -> u64 {
        self.parts.iter().map(|p| p.load(Ordering::Relaxed)).sum()
    }
}

async fn part_once(
    ctx: &Ctx,
    tmp: &Path,
    url: &str,
    provider: Option<&str>,
    (index, start, end): (usize, u64, u64),
    shared: &Shared,
    progress: Progress<'_>,
) -> DlResult<()> {
    // Sur une reprise, la plage repart de zéro au lieu de dépasser 100 %.
    shared.parts[index].store(0, Ordering::Relaxed);
    let range = format!("bytes={start}-{end}");
    let response = ctx.fetch(url, provider, Some(&range)).await?;
    if response.status().as_u16() != 206 {
        return Err(DlError::RangeIgnored(response.status().as_u16()));
    }
    let mut file = tokio::fs::OpenOptions::new().write(true).open(tmp).await?;
    file.seek(SeekFrom::Start(start)).await?;
    let mut body = response.bytes_stream();
    while let Some(chunk) = ctx.next_chunk(&mut body).await? {
        if shared.stopped.load(Ordering::Relaxed) {
            return Err(DlError::Aborted);
        }
        file.write_all(&chunk).await?;
        shared.parts[index].fetch_add(chunk.len() as u64, Ordering::Relaxed);
        if shared.throttle.ready(false) {
            let received = shared.received();
            progress(json!({
                "percent": received as f64 / shared.total as f64 * 100.0,
                "sizeBytes": received,
                "estimatedBytes": shared.total,
                "etaSeconds": estimate_eta(received, shared.total, shared.started),
            }));
        }
    }
    file.flush().await?;
    Ok(())
}

async fn part(
    ctx: &Ctx,
    tmp: &Path,
    url: &str,
    provider: Option<&str>,
    span: (usize, u64, u64),
    shared: &Shared,
    progress: Progress<'_>,
) -> DlResult<()> {
    let mut last = DlError::Other("aucune tentative".into());
    for attempt in 1..=MAX_ATTEMPTS {
        ctx.check()?;
        if shared.stopped.load(Ordering::Relaxed) {
            return Ok(());
        }
        match part_once(ctx, tmp, url, provider, span, shared, progress).await {
            Ok(()) => return Ok(()),
            Err(DlError::Aborted) if ctx.cancel.is_cancelled() => return Err(DlError::Aborted),
            Err(e) => last = e,
        }
        if attempt < MAX_ATTEMPTS {
            ctx.backoff(500 * u64::from(attempt)).await?;
        }
    }
    shared.stopped.store(true, Ordering::Relaxed);
    Err(last)
}

/// Plages écrites à leur position dans un fichier pré-alloué.
async fn parallel(
    ctx: &Ctx,
    dir: &Path,
    url: &str,
    provider: Option<&str>,
    total: u64,
    progress: Progress<'_>,
) -> DlResult<(String, u64)> {
    let dest = dir.join("video.mp4");
    let tmp = part_path(&dest);
    tokio::fs::File::create(&tmp).await?.set_len(total).await?;

    let count = CONNECTIONS.min(total.div_ceil(MIN_PARALLEL_BYTES)).max(1);
    let chunk = total.div_ceil(count);
    let shared = Arc::new(Shared {
        total,
        parts: (0..count).map(|_| AtomicU64::new(0)).collect(),
        stopped: AtomicBool::new(false),
        throttle: Throttle::new(),
        started: Instant::now(),
    });

    let spans: Vec<(usize, u64, u64)> = (0..count)
        .map(|i| (i, i * chunk, ((i + 1) * chunk).min(total) - 1))
        .filter(|(_, start, _)| *start < total)
        .map(|(i, s, e)| (i as usize, s, e))
        .collect();
    let results = futures_util::future::join_all(
        spans
            .into_iter()
            .map(|span| part(ctx, &tmp, url, provider, span, &shared, progress)),
    )
    .await;
    ctx.check()?;
    for result in results {
        result?;
    }
    if shared.stopped.load(Ordering::Relaxed) {
        return Err(DlError::Other("téléchargement parallèle interrompu".into()));
    }
    tokio::fs::rename(&tmp, &dest).await?;
    Ok(("video.mp4".into(), total))
}

pub async fn download(
    ctx: &Ctx,
    dir: &Path,
    url: &str,
    provider: Option<&str>,
    progress: Progress<'_>,
) -> DlResult<(String, u64)> {
    tokio::fs::create_dir_all(dir).await?;

    let mut total = 0;
    match ctx.fetch(url, provider, Some("bytes=0-1")).await {
        Ok(probe) if probe.status().as_u16() == 206 => {
            total = probe
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(total_from_content_range)
                .unwrap_or(0);
        }
        Ok(_) => {}
        Err(DlError::Aborted) => return Err(DlError::Aborted),
        // Sonde en échec : un seul flux.
        Err(_) => {}
    }

    if total > MIN_PARALLEL_BYTES {
        match parallel(ctx, dir, url, provider, total, progress).await {
            Ok(r) => return Ok(r),
            Err(DlError::Aborted) => return Err(DlError::Aborted),
            Err(e) => eprintln!("[downloads] plages parallèles en échec ({e}), repli sur un seul flux"),
        }
    }
    single(ctx, dir, url, provider, progress).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taille_depuis_content_range() {
        assert_eq!(total_from_content_range("bytes 0-1/123456"), Some(123456));
        assert_eq!(total_from_content_range("bytes 0-1/*"), None);
    }
}
