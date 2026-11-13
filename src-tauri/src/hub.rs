//! Le Hub tient la session partagée à jour : l'app le lance et sait le retrouver.

use std::{
    path::PathBuf,
    process::{Command, Stdio},
};

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::{config::SITE_URL, session::SharedSession};

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    /// Zone de notification.
    Hidden,
    Minimize,
    Visible,
}

/// Lancée par le Hub : pas d'onboarding « Découvre le Hub ».
pub fn is_managed() -> bool {
    std::env::args().any(|a| a == "--hub-managed") || std::env::var("NARTYA_HUB").as_deref() == Ok("1")
}

/// `nartya-hub://` n'est pas toujours enregistré par l'installeur : l'exécutable d'abord.
fn exe_candidates() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let env_dir = |var: &str| std::env::var_os(var).map(PathBuf::from);
        [
            env_dir("LOCALAPPDATA").map(|d| d.join("Programs")),
            env_dir("ProgramFiles"),
            env_dir("ProgramFiles(x86)"),
        ]
        .into_iter()
        .flatten()
        .map(|d| d.join("Nartya Hub").join("Nartya Hub.exe"))
        .collect()
    }
    #[cfg(target_os = "macos")]
    {
        vec![PathBuf::from("/Applications/Nartya Hub.app")]
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        vec![PathBuf::from("/opt/Nartya Hub/nartya-hub"), PathBuf::from("/usr/bin/nartya-hub")]
    }
}

pub fn resolve_exe(session: &SharedSession) -> Option<PathBuf> {
    let marker = session
        .hub_info()
        .and_then(|info| info.get("exePath")?.as_str().map(PathBuf::from));
    marker.into_iter().chain(exe_candidates()).find(|p| p.exists())
}

/// `None` si indéterminable.
fn is_running(exe: &std::path::Path) -> Option<bool> {
    let name = exe.file_name()?.to_string_lossy().to_lowercase();
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    Some(sys.processes().values().any(|p| p.name().to_string_lossy().to_lowercase() == name))
}

/// Le verrou d'instance du Hub évite les doublons.
pub fn launch(session: &SharedSession, mode: Mode) -> bool {
    let Some(exe) = resolve_exe(session) else {
        return false;
    };
    let mut cmd = Command::new(&exe);
    match mode {
        Mode::Hidden => cmd.arg("--hidden"),
        Mode::Minimize => cmd.arg("--minimize"),
        Mode::Visible => &mut cmd,
    };
    // Le Hub lit NODE_ENV : hérité du dev de l'app, il se croirait en dev.
    cmd.env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        cmd.creation_flags(0x0000_0008 | 0x0000_0200 | 0x0800_0000);
    }
    cmd.spawn().is_ok()
}

/// C'est lui qui rafraîchit la session.
pub fn ensure_running(session: &SharedSession) {
    let Some(exe) = resolve_exe(session) else {
        return;
    };
    if is_running(&exe) == Some(true) {
        return;
    }
    launch(session, Mode::Hidden);
}

/// Exécutable, sinon `nartya-hub://`, sinon le site. `method: "website"` : Hub non ouvert.
pub fn open(app: &AppHandle, session: &SharedSession) -> Value {
    if launch(session, Mode::Visible) {
        return json!({ "success": true, "method": "exe" });
    }
    if app.opener().open_url("nartya-hub://open", None::<&str>).is_ok() {
        return json!({ "success": true, "method": "protocol" });
    }
    if app.opener().open_url(format!("{SITE_URL}/"), None::<&str>).is_ok() {
        return json!({ "success": true, "method": "website" });
    }
    json!({ "success": false, "method": null })
}
