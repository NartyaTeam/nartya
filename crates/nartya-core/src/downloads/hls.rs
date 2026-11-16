//! Segments, clé AES-128 et init fMP4, puis une `playlist.m3u8` locale aux URI relatives, fusionnée
//! en `video.mp4` par ffmpeg. Sans ffmpeg ou si la fusion échoue, hls.js lit la playlist locale.

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        LazyLock,
    },
    time::{Duration, Instant},
};

use regex::Regex;
use serde_json::json;
use url::Url;

use super::{
    mp4::Progress,
    transfer::{download_to_file, estimate_eta, Ctx, DlError, DlResult, Throttle},
};

// Sans déclencher la limitation de débit des CDN.
const SEGMENT_CONCURRENCY: usize = 8;
// Remux sans réencodage : la marge couvre un gros fichier sur disque lent.
const REMUX_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const KEEP: [&str; 3] = ["video.mp4", "cover.jpg", "thumb.jpg"];

static URI_ATTR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"URI="([^"]+)""#).unwrap());
static BANDWIDTH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"BANDWIDTH=(\d+)").unwrap());
static RESOLUTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)RESOLUTION=\d+x(\d+)").unwrap());
static METHOD_NONE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)METHOD=NONE").unwrap());

pub struct Options<'a> {
    /// `None` : pas de plafond (« Max »).
    pub max_height: Option<u32>,
    pub ffmpeg: Option<&'a Path>,
    pub progress: Progress<'a>,
    /// Fin de la fusion, réussie ou non.
    pub processing_done: &'a (dyn Fn() + Send + Sync),
    pub label: &'a str,
}

fn resolve(uri: &str, base: &str) -> String {
    Url::parse(base)
        .and_then(|b| b.join(uri))
        .map(|u| u.to_string())
        .unwrap_or_else(|_| uri.to_string())
}

fn segment_ext(uri: &str) -> &'static str {
    let path = uri.split('?').next().unwrap_or("").to_lowercase();
    if path.ends_with(".m4s") {
        ".m4s"
    } else if path.ends_with(".mp4") {
        ".mp4"
    } else if path.ends_with(".aac") {
        ".aac"
    } else {
        ".ts"
    }
}

/// URL finale, après redirections.
async fn fetch_playlist(ctx: &Ctx, url: &str, provider: Option<&str>) -> DlResult<(String, String)> {
    let response = ctx.fetch(url, provider, None).await?;
    if !response.status().is_success() {
        return Err(DlError::Http(response.status().as_u16()));
    }
    let base = response.url().to_string();
    let text = tokio::select! {
        _ = ctx.cancel.cancelled() => return Err(DlError::Aborted),
        t = response.text() => t.map_err(|e| DlError::Net(crate::stream::NetError::Request(e)))?,
    };
    Ok((text, base))
}

struct Variant {
    uri: String,
    bandwidth: u64,
    height: u32,
}

/// La meilleure sous le plafond, sinon la plus basse.
fn pick_variant(master: &str, base: &str, max_height: Option<u32>) -> Option<String> {
    let lines: Vec<&str> = master.lines().collect();
    let mut variants = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if !line.starts_with("#EXT-X-STREAM-INF") {
            continue;
        }
        let num = |re: &Regex| re.captures(line).and_then(|c| c[1].parse().ok());
        let uri = lines[i + 1..]
            .iter()
            .map(|l| l.trim())
            .find(|l| !l.is_empty() && !l.starts_with('#'));
        if let Some(uri) = uri {
            variants.push(Variant {
                uri: resolve(uri, base),
                bandwidth: num(&BANDWIDTH).unwrap_or(0),
                height: num(&RESOLUTION).map(|h: u64| h as u32).unwrap_or(0),
            });
        }
    }
    let by_bw = |a: &&Variant, b: &&Variant| a.bandwidth.cmp(&b.bandwidth);
    let chosen = match max_height {
        None => variants.iter().max_by(by_bw),
        Some(cap) => {
            let under: Vec<&Variant> = variants
                .iter()
                .filter(|v| v.height > 0 && v.height <= cap)
                .collect();
            if !under.is_empty() {
                under.into_iter().max_by(by_bw)
            } else if variants.iter().any(|v| v.height > 0) {
                variants
                    .iter()
                    .filter(|v| v.height > 0)
                    .min_by_key(|v| v.height)
            } else {
                variants.iter().min_by(by_bw)
            }
        }
    }?;
    println!(
        "[downloads] master : {} variante(s), cible {} → {}p/{}k",
        variants.len(),
        max_height.map_or("max".into(), |h| format!("{h}p")),
        chosen.height,
        chosen.bandwidth / 1000
    );
    Some(chosen.uri.clone())
}

struct Plan {
    segments: Vec<(String, String)>,
    key: Option<String>,
    map: Option<String>,
    local: String,
}

/// Playlist de variante → liste des fichiers à récupérer et playlist locale aux noms relatifs.
fn plan(text: &str, base: &str) -> Plan {
    let mut segments = Vec::new();
    let mut out = Vec::new();
    let (mut key, mut map) = (None, None);
    for raw in text.split('\n') {
        let raw = raw.strip_suffix('\r').unwrap_or(raw);
        let line = raw.trim();
        let uri = URI_ATTR.captures(line).map(|c| c[1].to_string());
        if line.starts_with("#EXT-X-KEY") {
            match uri {
                Some(u) if !METHOD_NONE.is_match(line) => {
                    key = Some(resolve(&u, base));
                    out.push(URI_ATTR.replace(raw, r#"URI="key.bin""#).into_owned());
                }
                _ => out.push(raw.to_string()),
            }
            continue;
        }
        if line.starts_with("#EXT-X-MAP") {
            match uri {
                Some(u) => {
                    map = Some(resolve(&u, base));
                    out.push(URI_ATTR.replace(raw, r#"URI="init.mp4""#).into_owned());
                }
                None => out.push(raw.to_string()),
            }
            continue;
        }
        if line.is_empty() || line.starts_with('#') {
            out.push(raw.to_string());
            continue;
        }
        let name = format!("seg{:05}{}", segments.len(), segment_ext(line));
        segments.push((resolve(line, base), name.clone()));
        out.push(name);
    }
    Plan {
        segments,
        key,
        map,
        local: out.join("\n"),
    }
}

async fn run_ffmpeg(ctx: &Ctx, ffmpeg: &Path, dir: &Path, with_bsf: bool) -> DlResult<()> {
    let mut cmd = tokio::process::Command::new(ffmpeg);
    cmd.current_dir(dir)
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-allowed_extensions",
            "ALL",
            "-i",
            "playlist.m3u8",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            // ffmpeg déduit le conteneur de l'extension, et « .part » ne lui dit rien.
            "-f",
            "mp4",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    if with_bsf {
        cmd.args(["-bsf:a", "aac_adtstoasc"]);
    }
    cmd.arg("video.mp4.part");
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let child = cmd.spawn()?;
    let output = tokio::select! {
        _ = ctx.cancel.cancelled() => return Err(DlError::Aborted),
        r = tokio::time::timeout(REMUX_TIMEOUT, child.wait_with_output()) => match r {
            Err(_) => return Err(DlError::Other("fusion ffmpeg trop longue".into())),
            Ok(out) => out?,
        },
    };
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(DlError::Other(format!(
            "ffmpeg {} : {}",
            output.status,
            stderr.lines().last().unwrap_or("")
        )))
    }
}

/// ffmpeg gère le déchiffrement AES-128 et l'init fMP4. `-bsf:a aac_adtstoasc`, requis pour la
/// plupart des `.ts`, échoue sur d'autres : on retente sans.
async fn remux(ctx: &Ctx, ffmpeg: &Path, dir: &Path) -> DlResult<u64> {
    if let Err(e) = run_ffmpeg(ctx, ffmpeg, dir, true).await {
        if matches!(e, DlError::Aborted) {
            return Err(e);
        }
        run_ffmpeg(ctx, ffmpeg, dir, false).await?;
    }
    let out = dir.join("video.mp4");
    tokio::fs::rename(dir.join("video.mp4.part"), &out).await?;
    Ok(tokio::fs::metadata(&out).await?.len())
}

pub(super) async fn cleanup(dir: &Path) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name();
        if !KEEP.iter().any(|k| name == *k) {
            let _ = tokio::fs::remove_file(entry.path()).await;
        }
    }
}

pub async fn download(
    ctx: &Ctx,
    dir: &Path,
    url: &str,
    provider: Option<&str>,
    opts: Options<'_>,
) -> DlResult<(String, u64)> {
    tokio::fs::create_dir_all(dir).await?;

    let (mut text, mut base) = fetch_playlist(ctx, url, provider).await?;
    if text.to_uppercase().contains("#EXT-X-STREAM-INF") {
        if let Some(variant) = pick_variant(&text, &base, opts.max_height) {
            (text, base) = fetch_playlist(ctx, &variant, provider).await?;
        }
    }

    let plan = plan(&text, &base);
    if plan.segments.is_empty() {
        return Err(DlError::Other("playlist HLS sans segment".into()));
    }
    if let Some(key) = &plan.key {
        download_to_file(ctx, key, &dir.join("key.bin"), provider).await?;
    }
    if let Some(map) = &plan.map {
        download_to_file(ctx, map, &dir.join("init.mp4"), provider).await?;
    }

    let total = plan.segments.len();
    let cursor = AtomicUsize::new(0);
    let done = AtomicUsize::new(0);
    let received = AtomicU64::new(0);
    // Un segment en échec définitif arrête les autres.
    let stopped = AtomicBool::new(false);
    let throttle = Throttle::new();
    let started = Instant::now();

    let worker = || async {
        loop {
            ctx.check()?;
            if stopped.load(Ordering::Relaxed) {
                return Ok(());
            }
            let i = cursor.fetch_add(1, Ordering::Relaxed);
            let Some((seg_url, name)) = plan.segments.get(i) else {
                return Ok(());
            };
            let bytes = match download_to_file(ctx, seg_url, &dir.join(name), provider).await {
                Ok(b) => b,
                Err(e) => {
                    stopped.store(true, Ordering::Relaxed);
                    return Err(e);
                }
            };
            let got = received.fetch_add(bytes, Ordering::Relaxed) + bytes;
            let finished = done.fetch_add(1, Ordering::Relaxed) + 1;
            if throttle.ready(finished == total) {
                // Taille finale extrapolée : les segments ont à peu près la même durée.
                let estimated = got / finished as u64 * total as u64;
                (opts.progress)(json!({
                    "percent": finished as f64 / total as f64 * 100.0,
                    "sizeBytes": got,
                    "estimatedBytes": estimated,
                    "etaSeconds": estimate_eta(got, estimated, started),
                }));
            }
        }
    };
    let results = futures_util::future::join_all(
        (0..SEGMENT_CONCURRENCY.min(total)).map(|_| worker()),
    )
    .await;
    ctx.check()?;
    for result in results {
        result?;
    }

    tokio::fs::write(dir.join("playlist.m3u8"), &plan.local).await?;

    if let Some(ffmpeg) = opts.ffmpeg {
        (opts.progress)(json!({ "percent": 99, "processing": true }));
        let merged = remux(ctx, ffmpeg, dir).await;
        (opts.processing_done)();
        match merged {
            Ok(size) => {
                cleanup(dir).await;
                return Ok(("video.mp4".into(), size));
            }
            Err(DlError::Aborted) => return Err(DlError::Aborted),
            Err(e) => eprintln!(
                "[downloads] fusion ffmpeg échouée pour {}, repli sur playlist + segments : {e}",
                opts.label
            ),
        }
    }
    Ok(("playlist.m3u8".into(), received.load(Ordering::Relaxed)))
}

/// Livré avec l'app (à côté de l'exécutable sous Windows, `Contents/Resources` sous macOS,
/// `lib/Nartya` sous Linux) ; en dev, celui de `ffmpeg-static`.
pub fn find_ffmpeg() -> Option<PathBuf> {
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
    let beside = exe_dir.iter().flat_map(|d| {
        [
            d.join(name),
            d.join("..").join("Resources").join(name),
            d.join("..").join("lib").join("Nartya").join(name),
        ]
    });
    let dev = cfg!(debug_assertions).then(|| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("node_modules")
            .join("ffmpeg-static")
            .join(name)
    });
    beside.into_iter().chain(dev).find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MASTER: &str = "#EXTM3U\n\
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n\
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\nmid.m3u8\n\
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhigh.m3u8\n";

    #[test]
    fn choix_de_la_variante() {
        let base = "https://cdn/v/master.m3u8";
        assert_eq!(pick_variant(MASTER, base, None).unwrap(), "https://cdn/v/high.m3u8");
        assert_eq!(pick_variant(MASTER, base, Some(720)).unwrap(), "https://cdn/v/mid.m3u8");
        // Rien sous le plafond : la plus basse résolution.
        assert_eq!(pick_variant(MASTER, base, Some(240)).unwrap(), "https://cdn/v/low.m3u8");
    }

    #[test]
    fn playlist_locale_aux_noms_relatifs() {
        let text = "#EXTM3U\r\n#EXT-X-KEY:METHOD=AES-128,URI=\"https://k/key\"\r\n#EXT-X-MAP:URI=\"init.mp4\"\r\n#EXTINF:4,\r\na.ts?x=1\r\n#EXTINF:4,\r\nb.m4s\r\n#EXT-X-ENDLIST";
        let p = plan(text, "https://cdn/v/index.m3u8");
        assert_eq!(p.key.as_deref(), Some("https://k/key"));
        assert_eq!(p.map.as_deref(), Some("https://cdn/v/init.mp4"));
        assert_eq!(p.segments[0], ("https://cdn/v/a.ts?x=1".into(), "seg00000.ts".into()));
        assert_eq!(p.segments[1].1, "seg00001.m4s");
        assert!(p.local.contains("URI=\"key.bin\""));
        assert!(p.local.contains("URI=\"init.mp4\""));
        assert!(p.local.contains("\nseg00000.ts\n"));
        assert!(!p.local.contains('\r'));
    }

    #[test]
    fn cle_method_none_laissee() {
        let p = plan("#EXT-X-KEY:METHOD=NONE\nx.ts", "https://cdn/i.m3u8");
        assert!(p.key.is_none());
    }
}
