//! Fichier commun avec le Hub et les autres apps : `<config>/Nartya/shared/session.json`
//! (%APPDATA% sous Windows, comme Electron). Écriture atomique : le Hub et l'app peuvent
//! rafraîchir en parallèle. Le refresh token est en clair : réservé au compte courant.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    thread,
    time::Duration,
};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::{Map, Value};

const SESSION_FILE: &str = "session.json";
const HUB_FILE: &str = "hub.json";
const DEBOUNCE: Duration = Duration::from_millis(150);
#[allow(dead_code)]
const MAX_TOKEN_LEN: usize = 16_384;

pub struct SharedSession {
    dir: PathBuf,
    file: PathBuf,
    write_lock: Mutex<()>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

/// `nartya-auth`, ou `nartya-auth-<suffixe>` : rien d'autre ne passe par ce pont.
pub fn is_session_key(key: &str) -> bool {
    match key.strip_prefix("nartya-auth") {
        Some("") => true,
        Some(rest) => {
            rest.len() > 1
                && rest.starts_with('-')
                && rest[1..].chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        }
        None => false,
    }
}

fn restrict_permissions(dir: &Path, file: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
        if file.exists() {
            let _ = fs::set_permissions(file, fs::Permissions::from_mode(0o600));
        }
    }
    #[cfg(not(unix))]
    let _ = (dir, file);
}

impl SharedSession {
    /// `base` : parent commun des dossiers de données de chaque app.
    pub fn init(base: &Path) -> Self {
        let dir = base.join("Nartya").join("shared");
        let _ = fs::create_dir_all(&dir);
        let file = dir.join(SESSION_FILE);
        restrict_permissions(&dir, &file);
        Self { dir, file, write_lock: Mutex::new(()), watcher: Mutex::new(None) }
    }

    fn read_all(&self) -> Map<String, Value> {
        let Ok(raw) = fs::read_to_string(&self.file) else {
            return Map::new();
        };
        match serde_json::from_str::<Value>(&raw) {
            // Un ancien fichier chiffré est ignoré : il sera réécrit en clair.
            Ok(Value::Object(map)) if !map.contains_key("__enc") => map,
            _ => Map::new(),
        }
    }

    fn write_all(&self, map: &Map<String, Value>) -> std::io::Result<()> {
        let tmp = self.dir.join(format!("{SESSION_FILE}.{}.tmp", std::process::id()));
        let body = serde_json::to_vec(map)?;
        let result = fs::write(&tmp, body).and_then(|_| {
            restrict_permissions(&self.dir, &tmp);
            fs::rename(&tmp, &self.file)
        });
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result
    }

    pub fn get(&self, key: &str) -> Option<String> {
        value_to_string(self.read_all().get(key)?)
    }

    pub fn set(&self, key: &str, value: &str) -> bool {
        let _guard = self.write_lock.lock().unwrap();
        let mut all = self.read_all();
        all.insert(key.to_string(), Value::String(value.to_string()));
        self.write_all(&all).is_ok()
    }

    pub fn remove(&self, key: &str) -> bool {
        let _guard = self.write_lock.lock().unwrap();
        let mut all = self.read_all();
        if all.remove(key).is_some() {
            return self.write_all(&all).is_ok();
        }
        true
    }

    /// Lu dans le fichier partagé, pas reçu de la page : une page compromise ne peut pas en
    /// imposer un autre.
    #[allow(dead_code)]
    pub fn access_token(&self) -> Option<String> {
        parse_access_token(&self.get("nartya-auth")?)
    }

    /// Écrit par le Hub : `{version, lastSeen, exePath}`, `None` s'il n'a jamais tourné ici.
    pub fn hub_info(&self) -> Option<Value> {
        let raw = fs::read_to_string(self.dir.join(HUB_FILE)).ok()?;
        serde_json::from_str::<Value>(&raw).ok().filter(Value::is_object)
    }

    /// On surveille le dossier : le fichier est remplacé, pas modifié.
    /// `on_change` reçoit la nouvelle valeur brute de `nartya-auth`, `None` = déconnexion.
    pub fn watch(self: &std::sync::Arc<Self>, on_change: impl Fn(Option<String>) + Send + 'static) {
        let (tx, rx) = mpsc::channel::<()>();
        let session_file = SESSION_FILE;
        let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            let Ok(event) = event else { return };
            let touches_session = event.paths.is_empty()
                || event.paths.iter().any(|p| p.file_name().is_some_and(|n| n == session_file));
            if touches_session {
                let _ = tx.send(());
            }
        });
        let Ok(mut watcher) = watcher else { return };
        if watcher.watch(&self.dir, RecursiveMode::NonRecursive).is_err() {
            return;
        }
        *self.watcher.lock().unwrap() = Some(watcher);

        let this = self.clone();
        thread::spawn(move || {
            let mut last = this.get("nartya-auth");
            while rx.recv().is_ok() {
                // Un rename déclenche plusieurs événements.
                while rx.recv_timeout(DEBOUNCE).is_ok() {}
                let now = this.get("nartya-auth");
                if now != last {
                    last = now.clone();
                    on_change(now);
                }
            }
        });
    }
}

fn value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

#[allow(dead_code)]
fn parse_access_token(raw: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(raw).ok()?;
    let session = parsed.get("currentSession").unwrap_or(&parsed);
    let token = session.get("access_token")?.as_str()?;
    (!token.is_empty() && token.len() <= MAX_TOKEN_LEN).then(|| token.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn session() -> (tempfile::TempDir, Arc<SharedSession>) {
        let tmp = tempfile::tempdir().unwrap();
        let s = Arc::new(SharedSession::init(tmp.path()));
        (tmp, s)
    }

    #[test]
    fn cles_autorisees() {
        assert!(is_session_key("nartya-auth"));
        assert!(is_session_key("nartya-auth-movie"));
        assert!(is_session_key("nartya-auth-a_b-1"));
        assert!(!is_session_key("nartya-auth-"));
        assert!(!is_session_key("nartya-authx"));
        assert!(!is_session_key("autre"));
        assert!(!is_session_key("nartya-auth-../x"));
    }

    #[test]
    fn lecture_ecriture_suppression() {
        let (_tmp, s) = session();
        assert_eq!(s.get("nartya-auth"), None);
        assert!(s.set("nartya-auth", r#"{"access_token":"x"}"#));
        assert_eq!(s.get("nartya-auth").as_deref(), Some(r#"{"access_token":"x"}"#));
        assert!(s.set("nartya-auth-movie", "m"));
        assert!(s.remove("nartya-auth"));
        assert_eq!(s.get("nartya-auth"), None);
        assert_eq!(s.get("nartya-auth-movie").as_deref(), Some("m"));
        assert!(s.remove("absent"));
    }

    #[test]
    fn fichier_chiffre_ou_corrompu_ignore() {
        let (_tmp, s) = session();
        fs::write(&s.file, r#"{"__enc":true,"nartya-auth":"x"}"#).unwrap();
        assert_eq!(s.get("nartya-auth"), None);
        fs::write(&s.file, "pas du json").unwrap();
        assert_eq!(s.get("nartya-auth"), None);
        assert!(s.set("nartya-auth", "ok"));
        assert_eq!(s.get("nartya-auth").as_deref(), Some("ok"));
    }

    #[test]
    fn jeton_d_acces() {
        assert_eq!(parse_access_token(r#"{"access_token":"abc"}"#).as_deref(), Some("abc"));
        assert_eq!(
            parse_access_token(r#"{"currentSession":{"access_token":"def"}}"#).as_deref(),
            Some("def")
        );
        assert_eq!(parse_access_token(r#"{"access_token":""}"#), None);
        assert_eq!(parse_access_token("nope"), None);
        let long = format!(r#"{{"access_token":"{}"}}"#, "a".repeat(MAX_TOKEN_LEN + 1));
        assert_eq!(parse_access_token(&long), None);
    }

    #[test]
    fn info_du_hub() {
        let (_tmp, s) = session();
        assert!(s.hub_info().is_none());
        fs::write(s.dir.join(HUB_FILE), r#"{"version":"1.2.3"}"#).unwrap();
        assert_eq!(s.hub_info().unwrap()["version"], "1.2.3");
    }

    #[test]
    fn surveillance_d_un_changement_externe() {
        let (_tmp, s) = session();
        let (tx, rx) = mpsc::channel();
        s.watch(move |v| {
            let _ = tx.send(v);
        });
        thread::sleep(Duration::from_millis(300));
        // Comme le Hub : un autre processus écrit le fichier.
        fs::write(&s.file, r#"{"nartya-auth":"nouvelle"}"#).unwrap();
        let got = rx.recv_timeout(Duration::from_secs(5)).expect("changement non détecté");
        assert_eq!(got.as_deref(), Some("nouvelle"));
        fs::write(&s.file, "{}").unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(5)).unwrap(), None);
    }
}
