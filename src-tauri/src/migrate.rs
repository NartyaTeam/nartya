//! Reprise du localStorage d'Electron. L'origine passe de `file://` à `tauri.localhost` : l'ancien
//! stockage est illisible, mais Electron en tient une copie (`localstorage-export.json`, écrite
//! par `electron/utils/storage-export.js`). Un script d'initialisation la verse dans la page au
//! premier lancement ; ensuite un drapeau l'empêche de repasser, et les clés déjà présentes ne
//! sont jamais écrasées.

use std::path::Path;

use serde_json::Value;

use crate::session::is_session_key;

const EXPORT_FILE: &str = "localstorage-export.json";
const FLAG: &str = "__nartya_electron_import";
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Les clés de session passent par le pont partagé avec le Hub, pas par le localStorage.
fn importable(data: &Value) -> Vec<(&str, &str)> {
    data.as_object()
        .map(|map| {
            map.iter()
                .filter(|(k, _)| !is_session_key(k) && k.as_str() != FLAG)
                .filter_map(|(k, v)| Some((k.as_str(), v.as_str()?)))
                .collect()
        })
        .unwrap_or_default()
}

fn build_script(entries: &[(&str, &str)]) -> String {
    let payload = serde_json::to_string(
        &entries
            .iter()
            .map(|(k, v)| (*k, *v))
            .collect::<std::collections::BTreeMap<_, _>>(),
    )
    .unwrap_or_else(|_| "{}".into());
    // Double encodage : la charge utile devient un littéral de chaîne, jamais du code.
    let literal = serde_json::to_string(&payload).unwrap_or_else(|_| "\"{}\"".into());
    format!(
        "(function () {{ try {{ \
         if (localStorage.getItem('{FLAG}')) return; \
         var data = JSON.parse({literal}); \
         for (var k in data) {{ if (localStorage.getItem(k) === null) localStorage.setItem(k, data[k]); }} \
         localStorage.setItem('{FLAG}', '1'); \
         }} catch (e) {{}} }})();"
    )
}

/// `None` : pas d'export (installation neuve, ou Electron jamais lancé dans sa dernière version).
pub fn init_script(data_dir: &Path) -> Option<String> {
    let file = data_dir.join(EXPORT_FILE);
    if std::fs::metadata(&file).ok()?.len() > MAX_BYTES {
        return None;
    }
    let data: Value = serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()?;
    let entries = importable(&data);
    (!entries.is_empty()).then(|| build_script(&entries))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exclut_la_session_et_les_valeurs_non_textuelles() {
        let data = json!({
            "nartya_settings": "{\"lang\":\"fr\"}",
            "nartya-auth": "secret",
            "nartya-auth-movie": "secret",
            "nombre": 3,
            "__nartya_electron_import": "1",
        });
        assert_eq!(importable(&data), vec![("nartya_settings", "{\"lang\":\"fr\"}")]);
    }

    #[test]
    fn script_sans_injection() {
        let hostile = "');alert(1);//";
        let script = build_script(&[("k", hostile)]);
        // La valeur n'existe que dans le littéral passé à JSON.parse, guillemets doubles échappés.
        let start = script.find("JSON.parse(\"").unwrap();
        assert!(script.find("');alert(1)").unwrap() > start);
        let breaking = build_script(&[("k", "\"); alert(1); (\"")]);
        assert!(breaking.contains("\\\\\\\"); alert(1)"));
        assert!(script.contains("localStorage.getItem(k) === null"));
        assert!(script.contains(FLAG));
    }

    #[test]
    fn lecture_du_fichier() {
        let dir = tempfile::tempdir().unwrap();
        assert!(init_script(dir.path()).is_none());
        std::fs::write(dir.path().join(EXPORT_FILE), "pas du json").unwrap();
        assert!(init_script(dir.path()).is_none());
        std::fs::write(dir.path().join(EXPORT_FILE), "{}").unwrap();
        assert!(init_script(dir.path()).is_none());
        std::fs::write(dir.path().join(EXPORT_FILE), r#"{"a":"b"}"#).unwrap();
        assert!(init_script(dir.path()).unwrap().contains("localStorage"));
    }
}
