//! Emplacements sur disque, identiques à Electron : `<racine>/<id en base64url>/`.

use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

/// Un id vide désignerait la racine elle-même.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 512
}

/// L'id contient des `::` : encodé pour un nom de dossier sûr.
pub fn item_dir(root: &Path, id: &str) -> Option<PathBuf> {
    is_valid_id(id).then(|| root.join(URL_SAFE_NO_PAD.encode(id)))
}

/// Contraint au dossier de l'entrée : ni chemin absolu ni `..`.
pub fn resolve_local_file(root: &Path, id: &str, rel: &str) -> Option<PathBuf> {
    let base = item_dir(root, id)?;
    let rel = Path::new(rel);
    if rel.as_os_str().is_empty() || !rel.components().all(|c| matches!(c, Component::Normal(_))) {
        return None;
    }
    let abs = base.join(rel);
    abs.is_file().then_some(abs)
}

/// `None` si le dossier est utilisable (absolu, existant, inscriptible, pas la racine d'un
/// volume), sinon le message d'erreur.
pub fn validate_root(dir: &Path) -> Option<&'static str> {
    if !dir.is_absolute() {
        return Some("Chemin invalide");
    }
    if dir.parent().is_none() {
        return Some("Choisis un sous-dossier, pas la racine du disque");
    }
    let Ok(meta) = std::fs::metadata(dir) else {
        return Some("Ce dossier n'existe pas");
    };
    if !meta.is_dir() {
        return Some("Ce chemin n'est pas un dossier");
    }
    // `readonly` ne dit rien des ACL Windows : un essai d'écriture tranche.
    let probe = dir.join(format!(".nartya-write-test-{}", std::process::id()));
    match std::fs::write(&probe, b"") {
        Ok(()) => {
            let _ = std::fs::remove_file(probe);
            None
        }
        Err(_) => Some("Ce dossier n'est pas accessible en écriture"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dossier_en_base64url_comme_electron() {
        // Buffer.from("re-zero::saison1hs::5::vostfr").toString("base64url")
        let dir = item_dir(Path::new("/r"), "re-zero::saison1hs::5::vostfr").unwrap();
        assert_eq!(dir, Path::new("/r").join("cmUtemVybzo6c2Fpc29uMWhzOjo1Ojp2b3N0ZnI"));
        assert!(item_dir(Path::new("/r"), "").is_none());
    }

    #[test]
    fn fichier_local_contraint_au_dossier() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = item_dir(tmp.path(), "a::b").unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("video.mp4"), b"x").unwrap();
        assert!(resolve_local_file(tmp.path(), "a::b", "video.mp4").is_some());
        assert!(resolve_local_file(tmp.path(), "a::b", "absent.mp4").is_none());
        assert!(resolve_local_file(tmp.path(), "a::b", "../x").is_none());
        assert!(resolve_local_file(tmp.path(), "a::b", "").is_none());
        let abs = dir.join("video.mp4");
        assert!(resolve_local_file(tmp.path(), "a::b", abs.to_str().unwrap()).is_none());
    }

    #[test]
    fn racines_refusees() {
        assert!(validate_root(Path::new("relatif")).is_some());
        let tmp = tempfile::tempdir().unwrap();
        assert!(validate_root(tmp.path()).is_none());
        assert!(validate_root(&tmp.path().join("absent")).is_some());
    }
}
