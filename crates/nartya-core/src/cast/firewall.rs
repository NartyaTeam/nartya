//! Pare-feu Windows : un blocage en entrée ou un réseau « Public » empêche la TV de venir chercher
//! la vidéo. `None` hors Windows ou si PowerShell ne répond pas.

use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use serde_json::Value;

const CACHE: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FirewallStatus {
    pub blocked: bool,
    pub public_network: bool,
    pub allowed_on_network: bool,
}

impl FirewallStatus {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "blocked": self.blocked,
            "publicNetwork": self.public_network,
            "allowedOnNetwork": self.allowed_on_network,
        })
    }

    /// La TV n'a sans doute pas pu nous joindre à cause du pare-feu.
    pub fn explains_unreachable(&self) -> bool {
        self.blocked || (self.public_network && !self.allowed_on_network)
    }
}

static CACHED: Mutex<Option<(Instant, Option<FirewallStatus>)>> = Mutex::new(None);

fn as_list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|i| i.as_str().map(str::to_string))
            .collect(),
        Some(Value::String(s)) => vec![s.clone()],
        _ => Vec::new(),
    }
}

/// Une règle `Profile` peut valoir « Any » ou lister plusieurs profils séparés par des virgules.
fn covers(rules: &[String], category: &str) -> bool {
    rules
        .iter()
        .flat_map(|r| r.split(','))
        .map(str::trim)
        .any(|p| p == category || p == "Any")
}

fn parse(stdout: &str) -> Option<FirewallStatus> {
    let data: Value = serde_json::from_str(stdout.trim()).ok()?;
    let networks = as_list(data.get("networks"));
    let block = as_list(data.get("block"));
    let allow = as_list(data.get("allow"));
    Some(FirewallStatus {
        blocked: networks.iter().any(|n| covers(&block, n)),
        public_network: networks.iter().any(|n| n == "Public"),
        allowed_on_network: networks.iter().any(|n| covers(&allow, n)),
    })
}

#[cfg(windows)]
pub async fn status() -> Option<FirewallStatus> {
    if let Some((at, value)) = CACHED.lock().unwrap().as_ref() {
        if at.elapsed() < CACHE {
            return value.clone();
        }
    }
    let value = query().await;
    *CACHED.lock().unwrap() = Some((Instant::now(), value.clone()));
    value
}

#[cfg(not(windows))]
pub async fn status() -> Option<FirewallStatus> {
    let _ = (&CACHED, CACHE);
    None
}

#[cfg(windows)]
async fn query() -> Option<FirewallStatus> {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let exe = std::env::current_exe().ok()?;
    let exe = exe.to_string_lossy().replace('\'', "''");
    let script = [
        format!("$rules = Get-NetFirewallApplicationFilter -Program '{exe}' -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object {{ $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' }}"),
        "$profiles = (Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object { $_.NetworkCategory.ToString() })".to_string(),
        "[pscustomobject]@{ block = @($rules | Where-Object { $_.Action -eq 'Block' } | ForEach-Object { $_.Profile.ToString() }); allow = @($rules | Where-Object { $_.Action -eq 'Allow' } | ForEach-Object { $_.Profile.ToString() }); networks = @($profiles) } | ConvertTo-Json -Compress".to_string(),
    ]
    .join("; ");

    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(8), cmd.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reseau_public_sans_regle() {
        let s = parse(r#"{"block":[],"allow":[],"networks":["Public"]}"#).unwrap();
        assert!(s.public_network && !s.blocked && !s.allowed_on_network);
        assert!(s.explains_unreachable());
    }

    #[test]
    fn regle_autorisant_tous_les_profils() {
        let s = parse(r#"{"block":[],"allow":["Any"],"networks":["Public","Private"]}"#).unwrap();
        assert!(s.allowed_on_network && !s.blocked);
        assert!(!s.explains_unreachable());
    }

    #[test]
    fn profils_en_liste_et_valeur_unique() {
        let s = parse(r#"{"block":"Public, Domain","allow":["Private"],"networks":"Public"}"#).unwrap();
        assert!(s.blocked && s.explains_unreachable());
    }

    #[test]
    fn sortie_invalide() {
        assert!(parse("pas du json").is_none());
    }
}
