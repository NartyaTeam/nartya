//! Extraction de l'URL vidéo depuis la page d'embed. Volontairement générique : les motifs décrivent
//! des familles de lecteurs, les domaines et en-têtes viennent de la recette. Port fidèle de
//! `src/shared/videoExtract.js`, que l'app Electron utilise encore.

use std::sync::LazyLock;

use regex::{Regex, RegexBuilder};

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
        // Remplacements successifs comme le packer d'origine (un mot remplacé peut l'être à
        // nouveau) ; une recherche directe plutôt qu'une regex compilée par jeton.
        if let Some(next) = replace_word(&decoded, &token, replacement) {
            decoded = next;
        }
    }
    Some(decoded)
}

/// `\bword\b` au sens ASCII de JavaScript ; `None` si absent.
fn replace_word(haystack: &str, word: &str, replacement: &str) -> Option<String> {
    let is_word = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    let bytes = haystack.as_bytes();
    let mut out: Option<String> = None;
    let mut copied = 0;
    for (start, _) in haystack.match_indices(word) {
        let end = start + word.len();
        if (start > 0 && is_word(bytes[start - 1])) || (end < bytes.len() && is_word(bytes[end])) {
            continue;
        }
        let buf = out.get_or_insert_with(|| String::with_capacity(haystack.len()));
        buf.push_str(&haystack[copied..start]);
        buf.push_str(replacement);
        copied = end;
    }
    let mut buf = out?;
    buf.push_str(&haystack[copied..]);
    Some(buf)
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
    // Appliquées l'une après l'autre, comme en JavaScript : `&amp;#x26;` finit en `&`.
    static AMPERSANDS: LazyLock<[Regex; 4]> = LazyLock::new(|| {
        ["&amp;", "&#x26;", "\\u0026", "\\x26"].map(|entity| re_i(&regex::escape(entity)))
    });
    let value = AMPERSANDS
        .iter()
        .fold(value.to_string(), |acc, entity| {
            entity.replace_all(&acc, "&").into_owned()
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
    use serde_json::Value;

    /// Cas communs avec `src/shared` (test/shared-extract.test.mjs) : un comportement change
    /// dans ce fichier, les deux implémentations suivent.
    fn fixture() -> Value {
        serde_json::from_str(include_str!("../../../../test/fixtures/extract-cases.json"))
            .expect("extract-cases.json")
    }

    fn recipe(fx: &Value) -> Recipe {
        test_recipe(&fx["recipe"].to_string())
    }

    fn text<'a>(case: &'a Value, key: &str) -> Option<&'a str> {
        case.get(key).and_then(Value::as_str)
    }

    #[test]
    fn extraction_cas_communs() {
        let fx = fixture();
        let recipe = recipe(&fx);
        for case in fx["extract"].as_array().unwrap() {
            let name = text(case, "name").unwrap();
            let result = extract_from_html(
                text(case, "html").unwrap(),
                text(case, "embed").unwrap(),
                text(case, "source"),
                &recipe,
            );
            if let Some(url) = text(case, "ok") {
                assert_eq!(result.as_deref(), Ok(url), "{name}");
                continue;
            }
            let error = result.expect_err(name);
            if let Some(expected) = text(case, "error") {
                assert_eq!(error, expected, "{name}");
            }
            if let Some(part) = text(case, "errorContains") {
                assert!(error.contains(part), "{name} : {error}");
            }
        }
    }

    #[test]
    fn coherence_embed_media_cas_communs() {
        let fx = fixture();
        let recipe = recipe(&fx);
        for case in fx["consistency"].as_array().unwrap() {
            let (embed, video) = (text(case, "embed").unwrap(), text(case, "video").unwrap());
            assert_eq!(
                is_consistent_with_embed(embed, video, &recipe),
                case["expected"].as_bool().unwrap(),
                "{embed} → {video}"
            );
        }
    }

    #[test]
    fn detection_et_hotes_autorises_cas_communs() {
        let fx = fixture();
        let recipe = recipe(&fx);
        for case in fx["detect"].as_array().unwrap() {
            let url = text(case, "url").unwrap();
            assert_eq!(
                recipe.detect_source_key(url).as_deref(),
                text(case, "key"),
                "{url}"
            );
        }
        for case in fx["allowedHosts"].as_array().unwrap() {
            let host = text(case, "host").unwrap();
            assert_eq!(
                recipe.is_allowed_embed_host(host),
                case["allowed"].as_bool().unwrap(),
                "{host}"
            );
        }
    }

    #[test]
    fn depaquetage_cas_communs() {
        for case in fixture()["unpack"].as_array().unwrap() {
            assert_eq!(
                unpack_dean_edwards(text(case, "packed").unwrap()).as_deref(),
                text(case, "expected"),
                "{}",
                text(case, "name").unwrap()
            );
        }
    }

    #[test]
    fn remplacement_de_mot_aux_frontieres_ascii() {
        assert_eq!(replace_word("a ab a_ (a)", "a", "X").as_deref(), Some("X ab a_ (X)"));
        assert_eq!(replace_word("é1é", "1", "X").as_deref(), Some("éXé"));
        assert_eq!(replace_word("abc", "a", "X"), None);
    }

    #[test]
    fn depaquetage_en_cascade_comme_le_packer() {
        // `1` devient `0`, qui devient à son tour `ok` : remplacements successifs.
        let packed = "eval(function(p,a,c,k,e,d){}('1',10,2,'ok|0'.split('|')))";
        assert_eq!(unpack_dean_edwards(packed).as_deref(), Some("ok"));
    }
}
