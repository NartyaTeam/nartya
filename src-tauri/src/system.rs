use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::env::consts::{ARCH, OS};

/// Mêmes noms que Node (`os.platform()`, `os.arch()`) : l'identifiant doit rester celui
/// qu'Electron calculait pour la même machine, sinon un ban machine ne la reconnaît plus.
fn node_platform() -> &'static str {
    match OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn node_arch() -> &'static str {
    match ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

/// Premières MAC par ordre alphabétique, hors loopback et sans adresse nulle.
fn sorted_macs() -> Vec<String> {
    let mut macs: Vec<String> = netdev::get_interfaces()
        .into_iter()
        .filter(|i| !i.is_loopback() && (!i.ipv4.is_empty() || !i.ipv6.is_empty()))
        .filter_map(|i| i.mac_addr)
        .map(|m| m.to_string().to_lowercase())
        .filter(|m| m != "00:00:00:00:00:00")
        .collect();
    macs.sort();
    macs
}

fn hash_machine_id(hostname: &str, platform: &str, arch: &str, mac: &str) -> String {
    let joined = [hostname, platform, arch, mac].join("|");
    let digest = Sha256::digest(joined.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex[..32].to_string()
}

/// Indépendant de l'IP et du compte.
pub fn machine_id() -> String {
    let hostname = sysinfo::System::host_name().unwrap_or_default();
    let macs = sorted_macs();
    hash_machine_id(
        &hostname,
        node_platform(),
        node_arch(),
        macs.first().map(String::as_str).unwrap_or("no-mac"),
    )
}

/// Le GPU est identifié côté page par WebGPU : seuls la mémoire et les cœurs viennent d'ici.
pub fn anime4k_capabilities() -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0);
    json!({
        "platform": node_platform(),
        "arch": node_arch(),
        "memoryBytes": sys.total_memory(),
        "cpuCores": cores,
        "hardwareAccelerationDisabled": false,
        "featureStatus": {},
        "renderer": "",
        "devices": [],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empreinte_stable_de_32_caracteres() {
        let a = hash_machine_id("PC", "win32", "x64", "aa:bb:cc:dd:ee:ff");
        assert_eq!(a.len(), 32);
        assert_eq!(a, hash_machine_id("PC", "win32", "x64", "aa:bb:cc:dd:ee:ff"));
        assert_ne!(a, hash_machine_id("PC", "win32", "x64", "no-mac"));
    }

    #[test]
    fn noms_de_plateforme_comme_node() {
        assert!(["win32", "darwin", "linux"].contains(&node_platform()));
        assert!(["x64", "arm64", "ia32"].contains(&node_arch()));
    }
}
