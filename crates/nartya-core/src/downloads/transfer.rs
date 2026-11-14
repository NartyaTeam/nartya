//! Requêtes vers l'hébergeur et écriture sur disque : en-têtes de la recette, garde anti-SSRF,
//! détection des transferts figés, reprises sur incident transitoire.

use std::{
    io,
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};

use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use reqwest::{Method, Response};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

use crate::stream::{build_provider_request, provider_headers, Net, NetError, RecipeStore};

/// Un corps qui n'envoie plus rien pendant ce délai est abandonné.
pub const STALL: Duration = Duration::from_secs(20);
pub const MAX_ATTEMPTS: u32 = 3;

#[derive(Debug)]
pub enum DlError {
    Aborted,
    Stall,
    Http(u16),
    RangeIgnored(u16),
    Net(NetError),
    Io(io::Error),
    Other(String),
}

impl std::fmt::Display for DlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DlError::Aborted => write!(f, "annulé"),
            DlError::Stall => write!(f, "segment bloqué (stall)"),
            DlError::Http(s) => write!(f, "HTTP {s}"),
            DlError::RangeIgnored(s) => write!(f, "Range non honoré (HTTP {s})"),
            DlError::Net(e) => write!(f, "{e}"),
            DlError::Io(e) => write!(f, "{e}"),
            DlError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl From<io::Error> for DlError {
    fn from(e: io::Error) -> Self {
        DlError::Io(e)
    }
}

impl From<NetError> for DlError {
    fn from(e: NetError) -> Self {
        DlError::Net(e)
    }
}

// Codes Windows : disque plein (112, 39), accès refusé (5), fichier verrouillé (32, 33).
const DISK_FULL: [i32; 2] = [112, 39];

impl DlError {
    /// Erreur du disque : changer d'hébergeur n'y changerait rien.
    pub fn is_local(&self) -> bool {
        match self {
            DlError::Io(e) => {
                matches!(
                    e.kind(),
                    io::ErrorKind::PermissionDenied | io::ErrorKind::NotFound
                ) || e
                    .raw_os_error()
                    .is_some_and(|c| DISK_FULL.contains(&c) || [5, 32, 33].contains(&c))
            }
            _ => false,
        }
    }

    /// Message court pour la page ; le détail reste dans les logs.
    pub fn friendly(&self) -> String {
        match self {
            DlError::Aborted => "Téléchargement annulé".into(),
            DlError::Stall => "Connexion trop lente ou interrompue, réessaie".into(),
            DlError::RangeIgnored(_) => {
                "Hébergeur incompatible avec ce mode de téléchargement".into()
            }
            DlError::Http(status) => match status {
                401 | 403 => "Accès refusé par l'hébergeur".into(),
                404 => "Fichier introuvable sur l'hébergeur".into(),
                429 => "Trop de requêtes, réessaie dans un instant".into(),
                s if *s >= 500 => "Hébergeur indisponible".into(),
                _ => "Erreur de l'hébergeur".into(),
            },
            DlError::Net(NetError::Blocked(_)) => "Lien de téléchargement invalide".into(),
            DlError::Net(e) => e.friendly(),
            DlError::Io(e) => {
                if e.raw_os_error().is_some_and(|c| DISK_FULL.contains(&c)) {
                    "Espace disque insuffisant".into()
                } else if e.kind() == io::ErrorKind::PermissionDenied {
                    "Accès refusé au dossier de téléchargement".into()
                } else {
                    "Échec du téléchargement".into()
                }
            }
            DlError::Other(_) => "Échec du téléchargement".into(),
        }
    }
}

pub type DlResult<T> = Result<T, DlError>;

/// Ce dont un téléchargement a besoin pour joindre l'hébergeur.
#[derive(Clone)]
pub struct Ctx {
    pub net: Arc<Net>,
    pub recipe: Arc<RecipeStore>,
    pub cancel: CancellationToken,
}

impl Ctx {
    pub fn check(&self) -> DlResult<()> {
        if self.cancel.is_cancelled() {
            Err(DlError::Aborted)
        } else {
            Ok(())
        }
    }

    /// GET avec les en-têtes de la recette ; le délai borne l'arrivée des en-têtes.
    pub async fn fetch(
        &self,
        url: &str,
        provider: Option<&str>,
        range: Option<&str>,
    ) -> DlResult<Response> {
        let recipe = self.recipe.current();
        let req = build_provider_request(url, recipe.as_deref(), provider, range);
        let (_, timeout) = provider_headers(recipe.as_deref(), provider);
        tokio::select! {
            _ = self.cancel.cancelled() => Err(DlError::Aborted),
            r = self.net.fetch_checked_with_retry(Method::GET, &req.url, &req.headers, timeout) => {
                Ok(r?)
            }
        }
    }

    /// Prochain morceau du corps, ou `None` à la fin ; figé trop longtemps → `Stall`.
    pub async fn next_chunk<S>(&self, body: &mut S) -> DlResult<Option<Bytes>>
    where
        S: Stream<Item = reqwest::Result<Bytes>> + Unpin,
    {
        tokio::select! {
            _ = self.cancel.cancelled() => Err(DlError::Aborted),
            next = tokio::time::timeout(STALL, body.next()) => match next {
                Err(_) => Err(DlError::Stall),
                Ok(None) => Ok(None),
                Ok(Some(Ok(chunk))) => Ok(Some(chunk)),
                Ok(Some(Err(e))) => Err(DlError::Net(NetError::Request(e))),
            },
        }
    }

    /// Pause entre deux tentatives, interrompue par une annulation.
    pub async fn backoff(&self, ms: u64) -> DlResult<()> {
        tokio::select! {
            _ = self.cancel.cancelled() => Err(DlError::Aborted),
            _ = tokio::time::sleep(Duration::from_millis(ms)) => Ok(()),
        }
    }
}

/// `tmp` puis renommé : jamais de fichier tronqué sous son vrai nom.
async fn download_to_file_once(
    ctx: &Ctx,
    url: &str,
    dest: &Path,
    provider: Option<&str>,
) -> DlResult<u64> {
    let response = ctx.fetch(url, provider, None).await?;
    if !response.status().is_success() {
        return Err(DlError::Http(response.status().as_u16()));
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

/// Avec reprises sur erreur transitoire. Renvoie le nombre d'octets.
pub async fn download_to_file(
    ctx: &Ctx,
    url: &str,
    dest: &Path,
    provider: Option<&str>,
) -> DlResult<u64> {
    let mut last = DlError::Other("aucune tentative".into());
    for attempt in 1..=MAX_ATTEMPTS {
        ctx.check()?;
        match download_to_file_once(ctx, url, dest, provider).await {
            Ok(n) => return Ok(n),
            Err(DlError::Aborted) => return Err(DlError::Aborted),
            Err(e) => last = e,
        }
        if attempt < MAX_ATTEMPTS {
            ctx.backoff(500 * u64::from(attempt)).await?;
        }
    }
    Err(last)
}

pub fn part_path(dest: &Path) -> std::path::PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    dest.with_file_name(name)
}

/// Secondes restantes au débit moyen, `None` tant qu'il est trop tôt pour le dire.
pub fn estimate_eta(received: u64, estimated: u64, started: Instant) -> Option<u64> {
    let elapsed = started.elapsed().as_secs_f64();
    if elapsed < 3.0 || received == 0 || estimated == 0 {
        return None;
    }
    let rate = received as f64 / elapsed;
    Some((estimated.saturating_sub(received) as f64 / rate).round() as u64)
}

/// Limite les événements de progression à un toutes les 400 ms.
pub struct Throttle(std::sync::Mutex<Option<Instant>>);

impl Throttle {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(None))
    }

    pub fn ready(&self, force: bool) -> bool {
        let mut last = self.0.lock().unwrap();
        let due = match *last {
            None => true,
            Some(t) => t.elapsed() >= Duration::from_millis(400),
        };
        if force || due {
            *last = Some(Instant::now());
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_lisibles() {
        assert_eq!(DlError::Http(404).friendly(), "Fichier introuvable sur l'hébergeur");
        assert_eq!(DlError::Http(503).friendly(), "Hébergeur indisponible");
        assert_eq!(DlError::Stall.friendly(), "Connexion trop lente ou interrompue, réessaie");
        let full = DlError::Io(io::Error::from_raw_os_error(112));
        assert_eq!(full.friendly(), "Espace disque insuffisant");
        assert!(full.is_local());
        assert!(!DlError::Http(500).is_local());
    }

    #[test]
    fn fichier_temporaire() {
        assert_eq!(
            part_path(Path::new("/d/video.mp4")),
            Path::new("/d/video.mp4.part")
        );
    }

    #[test]
    fn eta_trop_tot() {
        assert_eq!(estimate_eta(10, 100, Instant::now()), None);
    }
}
