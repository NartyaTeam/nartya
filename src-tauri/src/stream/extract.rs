//! Extraction de l'URL vidéo depuis la page d'embed. Volontairement générique : les motifs décrivent
//! des familles de lecteurs, les domaines et en-têtes viennent de la recette. Port fidèle de
//! `src/shared/videoExtract.js`, que l'app Electron utilise encore.

use std::sync::LazyLock;

use regex::{NoExpand, Regex, RegexBuilder};

use super::recipe::{recipe_regex, Recipe, Source};

pub type Extracted = Result<String, String>;

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("motif d'extraction")
}

fn re_i(pattern: &str) -> Regex {
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .build()
        .expect("motif d'extraction")
}

fn first_group(re: &Regex, html: &str) -> Option<String> {
    re.captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

const NOT_FOUND: &str = "URL vidéo non trouvée dans le HTML";

/// `sources: [{ file: … }]` (JWPlayer et dérivés).
fn parse_jw_sources(html: &str, source: &Source) -> Extracted {
    static DIRECT: LazyLock<Regex> =
        LazyLock::new(|| re(r#"sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']"#));
    static SETUP: LazyLock<Regex> = LazyLock::new(|| {
        re(r#"player\.setup\s*\([^)]*sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']"#)
    });
    static INSTANCE: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r#"playerInstance\s*=\s*player\.setup\s*\([^)]*sources:\s*\[\s*\{\s*file:\s*["']([^"']+)["']"#,
        )
    });
    static M3U8: LazyLock<Regex> = LazyLock::new(|| re(r#"https?://[^"'\s<>]+\.m3u8[^"'\s<>]*"#));

    let found = first_group(&DIRECT, html)
        .or_else(|| first_group(&SETUP, html))
        .or_else(|| first_group(&INSTANCE, html))
        .or_else(|| M3U8.find(html).map(|m| m.as_str().to_string()));
    let Some(raw) = found else {
        return Err(NOT_FOUND.into());
    };
    let raw = raw.trim().to_string();

    // Certaines pages référencent un autre hébergeur (iframe, pub) que la recette exclut.
    if let Some(reject) = source
        .reject_pattern
        .as_deref()
        .and_then(|p| recipe_regex(p, true))
    {
        if reject.is_match(&raw) {
            return Err("Lien ambigu (autre hébergeur référencé dans la page)".into());
        }
    }
    Ok(raw)
}

/// og:video, <source>, <video>.
fn parse_meta_og(html: &str, source: &Source) -> Extracted {
    static OG: LazyLock<Regex> =
        LazyLock::new(|| re_i(r#"<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']"#));
    static SOURCE: LazyLock<Regex> = LazyLock::new(|| re_i(r#"<source[^>]+src=["']([^"']+)["']"#));
    static VIDEO: LazyLock<Regex> = LazyLock::new(|| re_i(r#"<video[^>]+src=["']([^"']+)["']"#));
    static VAR: LazyLock<Regex> =
        LazyLock::new(|| re(r#"var\s+video_source\s*=\s*["']([^"']+)["']"#));
    static DATA: LazyLock<Regex> = LazyLock::new(|| {
        re_i(r#"data-video-url=["']([^"']+)["']|data-src=["']([^"']+\.mp4[^"']*)["']"#)
    });

    let mut found = first_group(&OG, html)
        .or_else(|| first_group(&SOURCE, html))
        .or_else(|| first_group(&VIDEO, html))
        .or_else(|| first_group(&VAR, html));
    if found.is_none() {
        found = source
            .media_pattern
            .as_deref()
            .and_then(|p| recipe_regex(p, true))
            .and_then(|fallback| fallback.find(html).map(|m| m.as_str().to_string()));
    }
    if found.is_none() {
        found = DATA
            .captures(html)
            .and_then(|c| c.get(1).or_else(|| c.get(2)))
            .map(|m| m.as_str().to_string());
    }
    let Some(raw) = found else {
        return Err(NOT_FOUND.into());
    };

    let mut url = raw.trim().replace('\\', "");
    if !url.starts_with("http") {
        url = format!("https:{url}");
    }
    Ok(url)
}

/// `player.src([{ src: … }])`, souvent en chemin relatif.
fn parse_player_src(html: &str, source: &Source) -> Extracted {
    static PLAYER: LazyLock<Regex> =
        LazyLock::new(|| re(r#"player\.src\s*\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']"#));
    static RELATIVE: LazyLock<Regex> = LazyLock::new(|| re(r#"src:\s*["'](/[^"']+\.mp4)["']"#));

    let Some(raw) = first_group(&PLAYER, html).or_else(|| first_group(&RELATIVE, html)) else {
        return Err(NOT_FOUND.into());
    };
    let url = raw.trim().to_string();
    if url.starts_with("http") {
        return Ok(url);
    }
    // Sans base absolue fournie par la recette, un chemin relatif est inexploitable.
    let Some(base) = source.media_base.as_deref().filter(|b| !b.is_empty()) else {
        return Err("Base média inconnue pour cette source".into());
    };
    Ok(if url.starts_with('/') {
        format!("{base}{url}")
    } else {
        format!("{base}/{url}")
    })
}

/// `"hls":"…"` dans un blob JSON.
fn parse_hls_json(html: &str) -> Extracted {
    static HLS: LazyLock<Regex> = LazyLock::new(|| re(r#""hls":"([^"]+)""#));
    first_group(&HLS, html)
        .map(|v| v.replace("\\/", "/"))
        .ok_or_else(|| "Flux HLS non trouvé (incompatible/privé)".to_string())
}

/// Lien recollé par le lecteur : `…innerHTML = "/stream" + ''+ ('xcdbideo?id=…').substring(1)…;`.
/// `ideoolink` est un leurre ; `robotlink` est le bon, `botlink` le double et sert de secours.
/// Évalué à la main, littéraux et `.substring(n)` seulement : jamais le JavaScript distant.
fn parse_split_link(html: &str) -> Extracted {
    static ROBOT: LazyLock<Regex> = LazyLock::new(|| {
        re(r#"getElementById\(\s*['"]robotlink['"]\s*\)\.innerHTML\s*=\s*([^;\n]+);"#)
    });
    static BOT: LazyLock<Regex> = LazyLock::new(|| {
        re(r#"getElementById\(\s*['"]botlink['"]\s*\)\.innerHTML\s*=\s*([^;\n]+);"#)
    });
    // JavaScript : `(['"])(.*?)\1` ; sans références arrière, une variante par guillemet.
    static PARTS: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r#"\(\s*'(.*?)'\s*\)((?:\.substring\(\s*\d+\s*\))*)|\(\s*"(.*?)"\s*\)((?:\.substring\(\s*\d+\s*\))*)|'(.*?)'|"(.*?)""#,
        )
    });
    static SUBSTRING: LazyLock<Regex> = LazyLock::new(|| re(r"\.substring\(\s*(\d+)\s*\)"));
    static REMOVED: LazyLock<Regex> = LazyLock::new(|| re_i("video not found"));

    let last = |re: &Regex| re.captures_iter(html).last().map(|c| c[1].to_string());
    let Some(expr) = last(&ROBOT).or_else(|| last(&BOT)) else {
        return Err(if REMOVED.is_match(html) {
            "Vidéo supprimée par l'hébergeur".into()
        } else {
            "Lien du lecteur introuvable".into()
        });
    };

    let mut link = String::new();
    for m in PARTS.captures_iter(&expr) {
        if let Some(literal) = m.get(5).or_else(|| m.get(6)) {
            link.push_str(literal.as_str());
            continue;
        }
        let (value, subs) = match (m.get(1), m.get(3)) {
            (Some(v), _) => (v.as_str(), m.get(2)),
            (_, Some(v)) => (v.as_str(), m.get(4)),
            _ => continue,
        };
        let mut chars: Vec<char> = value.chars().collect();
        for n in SUBSTRING.captures_iter(subs.map(|s| s.as_str()).unwrap_or("")) {
            let skip: usize = n[1].parse().unwrap_or(0);
            chars = chars.into_iter().skip(skip).collect();
        }
        link.extend(chars);
    }

    let link = link.trim_start_matches('/');
    static GET_VIDEO: LazyLock<Regex> = LazyLock::new(|| re(r"/get_video\?id="));
    if !GET_VIDEO.is_match(link) {
        return Err("Lien du lecteur illisible".into());
    }
    Ok(format!("https://{link}"))
}

/// P.A.C.K.E.R. de Dean Edwards, décompacté sans exécuter le JavaScript distant.
pub fn unpack_dean_edwards(source: &str) -> Option<String> {
    static PACKED: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r#"eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\(\s*'((?:\\.|[^'])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'])*)'\.split\('\|'\)"#,
        )
    });
    if source.len() > 2_000_000 {
        return None;
    }
    let packed = PACKED.captures(source)?;
    let radix: u32 = packed[2].parse().ok()?;
    let count: usize = packed[3].parse().ok()?;
    if !(2..=36).contains(&radix) || count > 10_000 {
        return None;
    }

    let words: Vec<&str> = packed[4].split('|').collect();
    let mut decoded = packed[1].to_string();
    for index in (0..count).rev() {
        let Some(replacement) = words.get(index).filter(|w| !w.is_empty()) else {
            continue;
        };
        let token = to_radix(index as u64, radix);
        // `\b` ASCII, comme en JavaScript.
        let pattern = format!(r"(?-u:\b){}(?-u:\b)", regex::escape(&token));
        if let Ok(word) = Regex::new(&pattern) {
            decoded = word
                .replace_all(&decoded, NoExpand(replacement))
                .into_owned();
        }
    }
    Some(decoded)
}

fn to_radix(mut n: u64, radix: u32) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut digits = Vec::new();
    while n > 0 {
        digits.push(char::from_digit((n % radix as u64) as u32, radix).unwrap());
        n /= radix as u64;
    }
    digits.iter().rev().collect()
}

fn decode_embedded_text(value: &str) -> String {
    static ESCAPED_QUOTE: LazyLock<Regex> = LazyLock::new(|| re(r#"\\(["'\\])"#));
    let value =
        ["&amp;", "&#x26;", "\\u0026", "\\x26"]
            .iter()
            .fold(value.to_string(), |acc, entity| {
                Regex::new(&format!("(?i){}", regex::escape(entity)))
                    .unwrap()
                    .replace_all(&acc, "&")
                    .into_owned()
            });
    let value = value.replace("\\/", "/");
    ESCAPED_QUOTE.replace_all(&value, "$1").into_owned()
}

fn find_embedded_media_url(source: &str) -> Option<String> {
    static FILE: LazyLock<Regex> = LazyLock::new(|| {
        re_i(r#"(?:file|src)\s*:\s*["'](https?://[^"'\\\s<>]+\.(?:m3u8|mp4)[^"'\\\s<>]*)["']"#)
    });
    static GENERIC: LazyLock<Regex> =
        LazyLock::new(|| re_i(r#"https?://[^"'\\\s<>]+\.(?:m3u8|mp4)[^"'\\\s<>]*"#));

    let text = decode_embedded_text(source);
    let raw = first_group(&FILE, &text)
        .or_else(|| GENERIC.find(&text).map(|m| m.as_str().to_string()))?;
    let parsed = url::Url::parse(&raw).ok()?;
    matches!(parsed.scheme(), "http" | "https").then(|| parsed.to_string())
}

/// JWPlayer/XFileSharing, compactés ou non.
pub fn parse_packed_jw_player(html: &str) -> Extracted {
    if let Some(direct) = find_embedded_media_url(html) {
        return Ok(direct);
    }
    if let Some(found) = unpack_dean_edwards(html).and_then(|u| find_embedded_media_url(&u)) {
        return Ok(found);
    }
    Err("Flux HLS/MP4 non trouvé dans le lecteur".into())
}

pub fn extract_from_html(
    html: &str,
    embed_url: &str,
    source_key: Option<&str>,
    recipe: &Recipe,
) -> Extracted {
    if html.is_empty() {
        return Err("HTML invalide".into());
    }
    let key = source_key
        .map(str::to_string)
        .or_else(|| recipe.detect_source_key(embed_url));
    let Some(source) = key.as_deref().and_then(|k| recipe.source(k)) else {
        return Err("Source non reconnue".into());
    };
    match source.strategy.as_str() {
        "jw-sources" => parse_jw_sources(html, source),
        "meta-og" => parse_meta_og(html, source),
        "player-src" => parse_player_src(html, source),
        "hls-json" => parse_hls_json(html),
        "packed-jw" => parse_packed_jw_player(html),
        "split-link" => parse_split_link(html),
        _ => Err("Stratégie d'extraction inconnue".into()),
    }
}

/// Un hébergeur `exclusive` ne sert jamais son média pour un autre embed : un flux qui ne
/// correspond pas signale un mauvais match.
pub fn is_consistent_with_embed(embed_url: &str, video_url: &str, recipe: &Recipe) -> bool {
    if embed_url.is_empty() || video_url.is_empty() {
        return false;
    }
    let (Some(embed_key), Some(video_key)) = (
        recipe.detect_source_key(embed_url),
        recipe.detect_source_key(video_url),
    ) else {
        return true; // CDN tiers : rien à conclure
    };
    if embed_key == video_key {
        return true;
    }
    let exclusive = |k: &str| recipe.source(k).is_some_and(|s| s.exclusive);
    !(exclusive(&video_key) || exclusive(&embed_key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stream::recipe::test_recipe;

    fn recipe() -> Recipe {
        test_recipe(
            r#"{"sources":{
              "jw":{"domains":["jw.test"],"strategy":"jw-sources","rejectPattern":"sendvid\\.com"},
              "og":{"domains":["og.test"],"strategy":"meta-og","mediaPattern":"https?://videos\\d+\\.og\\.test/[^\"'\\s<>]+\\.mp4"},
              "ps":{"domains":["ps.test"],"strategy":"player-src","mediaBase":"https://media.ps.test"},
              "hj":{"domains":["hj.test"],"strategy":"hls-json"},
              "pk":{"domains":["pk.test"],"strategy":"packed-jw","exclusive":true},
              "sl":{"domains":["sl.test"],"strategy":"split-link"}
            }}"#,
        )
    }

    fn extract(html: &str, key: &str) -> Extracted {
        extract_from_html(html, "https://x/", Some(key), &recipe())
    }

    #[test]
    fn jw_sources() {
        assert_eq!(
            extract(r#"x sources: [{file: "https://cdn/a.m3u8"}]"#, "jw").unwrap(),
            "https://cdn/a.m3u8"
        );
        assert_eq!(
            extract(r#"<a href="https://cdn/b.m3u8?t=1">"#, "jw").unwrap(),
            "https://cdn/b.m3u8?t=1"
        );
        assert!(
            extract(r#"sources: [{file: "https://sendvid.com/x.mp4"}]"#, "jw")
                .unwrap_err()
                .contains("ambigu")
        );
        assert_eq!(extract("rien", "jw").unwrap_err(), NOT_FOUND);
    }

    #[test]
    fn meta_og() {
        assert_eq!(
            extract(r#"<meta property="og:video" content="//cdn/v.mp4">"#, "og").unwrap(),
            "https://cdn/v.mp4"
        );
        assert_eq!(
            extract(r#"<video src="https://cdn/w.mp4">"#, "og").unwrap(),
            "https://cdn/w.mp4"
        );
        assert_eq!(
            extract(r#"var video_source = "https:\/\/cdn\/x.mp4""#, "og").unwrap(),
            "https://cdn/x.mp4"
        );
        assert_eq!(
            extract("blob https://videos12.og.test/a/b.mp4 fin", "og").unwrap(),
            "https://videos12.og.test/a/b.mp4"
        );
        assert_eq!(
            extract(r#"<div data-src="https://cdn/y.mp4?z=1">"#, "og").unwrap(),
            "https://cdn/y.mp4?z=1"
        );
    }

    #[test]
    fn player_src() {
        assert_eq!(
            extract(r#"player.src([{ src: "/v/1.mp4" }])"#, "ps").unwrap(),
            "https://media.ps.test/v/1.mp4"
        );
        assert_eq!(
            extract(r#"player.src([{ src: "https://c/2.mp4" }])"#, "ps").unwrap(),
            "https://c/2.mp4"
        );
        let sans_base =
            test_recipe(r#"{"sources":{"ps":{"domains":["ps.test"],"strategy":"player-src"}}}"#);
        assert!(extract_from_html(
            r#"player.src([{ src: "/v.mp4" }])"#,
            "u",
            Some("ps"),
            &sans_base
        )
        .is_err());
    }

    #[test]
    fn hls_json() {
        assert_eq!(
            extract(r#"{"hls":"https:\/\/cdn\/m.m3u8"}"#, "hj").unwrap(),
            "https://cdn/m.m3u8"
        );
        assert!(extract("{}", "hj").is_err());
    }

    #[test]
    fn packed_jw_direct_et_compacte() {
        assert_eq!(
            extract(r#"file:"https://cdn/p.m3u8?a=1&amp;b=2""#, "pk").unwrap(),
            "https://cdn/p.m3u8?a=1&b=2"
        );
        let packed = r#"eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c.toString(a)+'\\b','g'),k[c]);return p}('0:"1://2/3.m3u8"',4,4,'file|https|cdn|x'.split('|'),0,{}))"#;
        assert_eq!(extract(packed, "pk").unwrap(), "https://cdn/x.m3u8");
        assert!(extract("rien", "pk").is_err());
    }

    #[test]
    fn split_link() {
        let html = r#"<script>
            document.getElementById('ideoolink').innerHTML = "/faux";
            document.getElementById('robotlink').innerHTML = '//host.test/stream' + ''+ ('xcdbideo.test/get_video?id=42').substring(1).substring(2);
        </script>"#;
        assert_eq!(
            extract(html, "sl").unwrap(),
            "https://host.test/streambideo.test/get_video?id=42"
        );
        assert_eq!(
            extract("Video not found", "sl").unwrap_err(),
            "Vidéo supprimée par l'hébergeur"
        );
        assert_eq!(
            extract("rien", "sl").unwrap_err(),
            "Lien du lecteur introuvable"
        );
    }

    #[test]
    fn source_inconnue_et_html_vide() {
        assert_eq!(
            extract_from_html("", "u", Some("jw"), &recipe()).unwrap_err(),
            "HTML invalide"
        );
        assert_eq!(
            extract_from_html("x", "https://autre/", None, &recipe()).unwrap_err(),
            "Source non reconnue"
        );
    }

    #[test]
    fn coherence_embed_media() {
        let r = recipe();
        assert!(is_consistent_with_embed(
            "https://jw.test/e",
            "https://jw.test/v.mp4",
            &r
        ));
        assert!(is_consistent_with_embed(
            "https://jw.test/e",
            "https://cdn.tiers/v.mp4",
            &r
        ));
        assert!(!is_consistent_with_embed(
            "https://jw.test/e",
            "https://pk.test/v.mp4",
            &r
        ));
        assert!(!is_consistent_with_embed("", "x", &r));
    }
}
