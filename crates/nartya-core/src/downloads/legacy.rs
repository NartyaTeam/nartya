//! Reprise de la bibliothèque hors ligne de l'ancien code Java d'Android : mêmes dossiers
//! (`<données>/downloads/<id en base64url>/`), mais l'index était `downloads/index.json`
//! (id → entrée) et non `downloads.json`. Les fichiers vidéo ne bougent pas, et l'ancien
//! index reste en place comme sauvegarde.

use std::path::Path;

use serde_json::{json, Map, Value};

use super::STORE_FILE;

fn read_object(path: &Path) -> Option<Map<String, Value>> {
    match serde_json::from_str::<Value>(&std::fs::read_to_string(path).ok()?).ok()? {
        Value::Object(map) => Some(map),
        _ => None,
    }
}

/// Crée `downloads.json` depuis l'index Java s'il n'existe pas encore. Renvoie le nombre
/// d'entrées reprises (0 si rien à faire).
pub fn import_android_index(data_dir: &Path) -> usize {
    if data_dir.join(STORE_FILE).exists() {
        return 0;
    }
    let root = data_dir.join("downloads");
    let mut items = read_object(&root.join("index.json")).unwrap_or_default();

    // L'index Java a pu être perdu : chaque dossier garde une copie de son entrée.
    if let Ok(entries) = std::fs::read_dir(&root) {
        for dir in entries.flatten().filter(|e| e.path().is_dir()) {
            let Some(item) = read_object(&dir.path().join("item.json")) else {
                continue;
            };
            if let Some(id) = item.get("id").and_then(Value::as_str) {
                if !items.contains_key(id) {
                    items.insert(id.to_string(), Value::Object(item.clone()));
                }
            }
        }
    }
    if items.is_empty() {
        return 0;
    }

    for item in items.values_mut().filter_map(Value::as_object_mut) {
        if item.get("status").and_then(Value::as_str) == Some("interrupted") {
            item.insert("status".into(), json!("error"));
            item.insert("error".into(), json!("Interrompu"));
        }
    }
    let count = items.len();
    let doc = json!({ "items": items });
    let tmp = data_dir.join("downloads.json.tmp");
    let written = serde_json::to_vec_pretty(&doc)
        .map_err(std::io::Error::other)
        .and_then(|body| std::fs::write(&tmp, body))
        .and_then(|_| std::fs::rename(&tmp, data_dir.join(STORE_FILE)));
    match written {
        Ok(()) => count,
        Err(e) => {
            eprintln!("[downloads] reprise de l'index Android impossible : {e}");
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reprend_l_index_java_et_les_copies_item_json() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("downloads");
        std::fs::create_dir_all(root.join("aaa")).unwrap();
        std::fs::create_dir_all(root.join("bbb")).unwrap();
        std::fs::write(
            root.join("index.json"),
            r#"{"ep1":{"id":"ep1","slug":"s","status":"interrupted"},"ep2":{"id":"ep2","slug":"s","status":"done"}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("bbb").join("item.json"),
            r#"{"id":"ep3","slug":"s","status":"done"}"#,
        )
        .unwrap();

        assert_eq!(import_android_index(dir.path()), 3);
        let doc: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.path().join("downloads.json")).unwrap())
                .unwrap();
        assert_eq!(doc["items"]["ep1"]["status"], "error");
        assert_eq!(doc["items"]["ep2"]["status"], "done");
        assert_eq!(doc["items"]["ep3"]["slug"], "s");
        // L'ancien index n'est pas touché.
        assert!(root.join("index.json").exists());
    }

    #[test]
    fn ne_remplace_jamais_un_index_existant() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("downloads.json"), "{}").unwrap();
        std::fs::create_dir_all(dir.path().join("downloads")).unwrap();
        std::fs::write(dir.path().join("downloads").join("index.json"), r#"{"a":{"slug":"s"}}"#).unwrap();
        assert_eq!(import_android_index(dir.path()), 0);
        assert_eq!(std::fs::read_to_string(dir.path().join("downloads.json")).unwrap(), "{}");
    }
}
