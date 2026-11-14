//! Épisodes téléchargés, servis par le proxy sous `/local` (Range indispensable au seek).

use std::{io::SeekFrom, path::Path};

use axum::{
    body::Body,
    http::{header, StatusCode},
    response::Response,
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::downloads::paths::resolve_local_file;

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("m3u8") => "application/vnd.apple.mpegurl",
        Some("ts") => "video/mp2t",
        Some("m4s") => "video/iso.segment",
        Some("jpg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

/// Chaque URI pointe vers `/local` : le port n'est connu qu'à l'exécution.
pub fn rewrite_playlist(content: &str, id: &str, origin: &str, token_suffix: &str) -> String {
    static URI_ATTR: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r#"URI="([^"]+)""#).unwrap());
    let base = format!("{origin}/local?id={}&path=", urlencoding::encode(id));
    let uri_attr = &*URI_ATTR;
    content
        .split('\n')
        .map(|line| {
            let t = line.trim();
            if t.is_empty() {
                return line.to_string();
            }
            if t.starts_with('#') {
                return uri_attr
                    .replace_all(line, |c: &regex::Captures| {
                        format!("URI=\"{base}{}{token_suffix}\"", urlencoding::encode(&c[1]))
                    })
                    .into_owned();
            }
            format!("{base}{}{token_suffix}", urlencoding::encode(t))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// `bytes=a-b`, `bytes=a-` ; `None` hors bornes (416).
fn parse_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    let start: u64 = if a.is_empty() { 0 } else { a.parse().ok()? };
    let end: u64 = if b.is_empty() { size.checked_sub(1)? } else { b.parse().ok()? };
    (start <= end && end < size).then_some((start, end))
}

fn cors(builder: axum::http::response::Builder) -> axum::http::response::Builder {
    builder.header("access-control-allow-origin", "*")
}

fn not_found() -> Response {
    cors(Response::builder())
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"success":false,"error":"Fichier introuvable"}"#))
        .unwrap()
}

pub async fn serve(
    root: &Path,
    id: &str,
    rel: &str,
    range: Option<&str>,
    origin: &str,
    token_suffix: &str,
) -> Response {
    let Some(abs) = resolve_local_file(root, id, rel) else {
        return not_found();
    };
    let ctype = content_type(&abs);

    if ctype == "application/vnd.apple.mpegurl" {
        let Ok(content) = tokio::fs::read_to_string(&abs).await else {
            return not_found();
        };
        let body = rewrite_playlist(&content, id, origin, token_suffix);
        return cors(Response::builder())
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, ctype)
            .header(header::CONTENT_LENGTH, body.len())
            .body(Body::from(body))
            .unwrap();
    }

    let Ok(mut file) = tokio::fs::File::open(&abs).await else {
        return not_found();
    };
    let size = file.metadata().await.map(|m| m.len()).unwrap_or(0);

    if let Some(range) = range {
        let Some((start, end)) = parse_range(range, size) else {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                .body(Body::empty())
                .unwrap();
        };
        if file.seek(SeekFrom::Start(start)).await.is_err() {
            return not_found();
        }
        let len = end - start + 1;
        return cors(Response::builder())
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, ctype)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_LENGTH, len)
            .body(Body::from_stream(ReaderStream::new(file.take(len))))
            .unwrap();
    }

    cors(Response::builder())
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::CONTENT_LENGTH, size)
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from_stream(ReaderStream::new(file)))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plages_locales() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=900-1000", 1000), None);
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=0-", 0), None);
    }

    #[test]
    fn playlist_locale_reecrite() {
        let out = rewrite_playlist(
            "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\nseg00000.ts\n",
            "a::b",
            "http://127.0.0.1:9",
            "&t=T",
        );
        assert!(out.contains("URI=\"http://127.0.0.1:9/local?id=a%3A%3Ab&path=key.bin&t=T\""));
        assert!(out.contains("\nhttp://127.0.0.1:9/local?id=a%3A%3Ab&path=seg00000.ts&t=T\n"));
    }
}
