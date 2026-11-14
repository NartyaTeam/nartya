//! Chaque URI d'une playlist devient une poignée opaque du proxy local.

use regex::{Captures, Regex};
use url::Url;

use super::handles::Target;

pub struct Rewrite<'a> {
    pub provider: Option<&'a str>,
    pub referer: &'a str,
    pub origin: &'a str,
    /// `&t=<jeton>`
    pub token_suffix: &'a str,
}

pub fn transform_playlist(
    content: &str,
    base: &str,
    proxy_base: &str,
    rewrite: &Rewrite,
    mint: &dyn Fn(Target) -> Option<String>,
) -> String {
    let base_url = Url::parse(base).ok();
    let proxify = |uri: &str| -> String {
        let Some(absolute) = base_url.as_ref().and_then(|b| b.join(uri).ok()) else {
            return uri.to_string();
        };
        if !matches!(absolute.scheme(), "http" | "https") {
            return uri.to_string();
        }
        let provider = rewrite
            .provider
            .filter(|p| *p != "unknown")
            .map(str::to_string);
        match mint(Target {
            url: absolute.to_string(),
            provider,
            referer: rewrite.referer.to_string(),
            origin: rewrite.origin.to_string(),
        }) {
            Some(handle) => format!("{proxy_base}?h={handle}{}", rewrite.token_suffix),
            None => uri.to_string(),
        }
    };

    // Pistes audio/sous-titres, clés AES et init segments passent par un attribut URI.
    static URI_ATTR: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r#"URI="([^"]+)""#).unwrap());
    let uri_attr = &*URI_ATTR;
    content
        .split('\n')
        .map(|line| {
            if line.trim().is_empty() {
                return line.to_string();
            }
            if line.starts_with('#') {
                return uri_attr
                    .replace_all(line, |caps: &Captures| {
                        format!("URI=\"{}\"", proxify(&caps[1]))
                    })
                    .into_owned();
            }
            proxify(line.trim())
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn run(content: &str, base: &str) -> (String, Vec<Target>) {
        let minted = RefCell::new(Vec::new());
        let mint = |t: Target| {
            let mut v = minted.borrow_mut();
            v.push(t);
            Some(format!("H{}", v.len()))
        };
        let rw = Rewrite {
            provider: Some("s1"),
            referer: "https://embed/e",
            origin: "https://embed",
            token_suffix: "&t=TOK",
        };
        let out = transform_playlist(content, base, "http://127.0.0.1:1/video/proxy", &rw, &mint);
        (out, minted.into_inner())
    }

    #[test]
    fn segments_relatifs_et_attributs_uri() {
        let src = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:4,\nseg1.ts\n\n/abs/seg2.ts\n#EXT-X-ENDLIST";
        let (out, minted) = run(src, "https://cdn.exemple.com/v/index.m3u8");
        assert_eq!(
            out,
            "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"http://127.0.0.1:1/video/proxy?h=H1&t=TOK\"\n#EXTINF:4,\nhttp://127.0.0.1:1/video/proxy?h=H2&t=TOK\n\nhttp://127.0.0.1:1/video/proxy?h=H3&t=TOK\n#EXT-X-ENDLIST"
        );
        assert_eq!(minted[0].url, "https://cdn.exemple.com/v/key.bin");
        assert_eq!(minted[1].url, "https://cdn.exemple.com/v/seg1.ts");
        assert_eq!(minted[2].url, "https://cdn.exemple.com/abs/seg2.ts");
        assert_eq!(minted[1].referer, "https://embed/e");
    }

    #[test]
    fn schema_non_http_laisse_tel_quel() {
        let (out, minted) = run("#EXT-X-KEY:URI=\"skd://key\"\n", "https://cdn/x.m3u8");
        assert!(out.contains("URI=\"skd://key\""));
        assert!(minted.is_empty());
    }

    #[test]
    fn fins_de_ligne_crlf() {
        let (out, _) = run("#EXTM3U\r\nseg.ts\r\n", "https://cdn/x.m3u8");
        assert_eq!(
            out,
            "#EXTM3U\r\nhttp://127.0.0.1:1/video/proxy?h=H1&t=TOK\n"
        );
    }
}
