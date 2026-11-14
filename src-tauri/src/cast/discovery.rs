//! Découverte mDNS des appareils Cast (`_googlecast._tcp`). Le démon écoute sur toutes les cartes ;
//! on le coupe après 3 minutes sans appel ni session.

use std::{
    collections::HashMap,
    net::Ipv4Addr,
    sync::{Arc, Mutex},
};

use mdns_sd::{ServiceDaemon, ServiceEvent};
use regex::Regex;
use serde_json::{json, Value};

use super::net::{is_private_ipv4, is_virtual_address};

const SERVICE: &str = "_googlecast._tcp.local.";
pub const DEFAULT_PORT: u16 = 8009;

#[derive(Debug, Clone)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub host: Ipv4Addr,
    pub port: u16,
    pub manual: bool,
}

impl Device {
    pub fn to_json(&self) -> Value {
        json!({ "id": self.id, "name": self.name, "host": self.host.to_string(), "manual": self.manual })
    }
}

pub type Devices = Arc<Mutex<HashMap<String, Device>>>;

/// « Chromecast-Ultra-3f2a…c91 » → « Chromecast Ultra » quand le TXT `fn` manque.
pub fn pretty_instance(instance: &str) -> String {
    let hash = Regex::new(r"(?i)-[0-9a-f]{16,}$").unwrap();
    let trimmed = hash.replace(instance, "");
    trimmed
        .split(['-', '_'])
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Une adresse privée ; une carte réelle l'emporte sur WSL, un VPN…
fn pick_address(candidates: impl IntoIterator<Item = Ipv4Addr>) -> Option<Ipv4Addr> {
    let mut private: Vec<Ipv4Addr> = candidates.into_iter().filter(|a| is_private_ipv4(*a)).collect();
    private.sort();
    private
        .iter()
        .copied()
        .find(|a| !is_virtual_address(*a))
        .or_else(|| private.first().copied())
}

pub struct Discovery {
    daemon: ServiceDaemon,
}

impl Discovery {
    /// `on_change` reçoit la liste publique à chaque modification.
    pub fn start(
        devices: Devices,
        on_change: impl Fn() + Send + Sync + 'static,
    ) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let receiver = daemon.browse(SERVICE).map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        if std::env::var_os("NARTYA_CAST_DEBUG").is_some() {
                            eprintln!("[cast] {:?}", info);
                        }
                        let Some(host) = pick_address(info.get_addresses_v4()) else {
                            continue;
                        };
                        let key = info.get_fullname().to_lowercase();
                        let label = info
                            .get_fullname()
                            .strip_suffix(&format!(".{SERVICE}"))
                            .unwrap_or(info.get_fullname());
                        let name = info
                            .get_property_val_str("fn")
                            .filter(|n| !n.is_empty())
                            .map(str::to_string)
                            .or_else(|| Some(pretty_instance(label)).filter(|n| !n.is_empty()))
                            .unwrap_or_else(|| host.to_string());
                        let device = Device {
                            id: key.clone(),
                            name,
                            host,
                            port: info.get_port(),
                            manual: false,
                        };
                        let changed = {
                            let mut map = devices.lock().unwrap();
                            let changed = !map.get(&key).is_some_and(|d| {
                                d.name == device.name && d.host == device.host && d.port == device.port
                            });
                            map.insert(key, device);
                            changed
                        };
                        if changed {
                            on_change();
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        let removed = {
                            let mut map = devices.lock().unwrap();
                            match map.get(&fullname.to_lowercase()) {
                                Some(d) if !d.manual => map.remove(&fullname.to_lowercase()).is_some(),
                                _ => false,
                            }
                        };
                        if removed {
                            on_change();
                        }
                    }
                    _ => {}
                }
            }
        });
        Ok(Self { daemon })
    }

    /// Redemande les appareils (un paquet multicast se perd facilement).
    pub fn rebrowse(&self) {
        let _ = self.daemon.stop_browse(SERVICE);
        let _ = self.daemon.browse(SERVICE);
    }
}

impl Drop for Discovery {
    fn drop(&mut self) {
        let _ = self.daemon.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nom_lisible_sans_txt() {
        assert_eq!(
            pretty_instance("Chromecast-Ultra-3f2a9c1d4e5b6a7f8091a2b3c4d5e6f7"),
            "Chromecast Ultra"
        );
        assert_eq!(pretty_instance("Salon_TV"), "Salon TV");
        assert_eq!(pretty_instance("Google-Home-Mini"), "Google Home Mini");
    }

    #[test]
    fn adresse_privee_uniquement() {
        let ips = [Ipv4Addr::new(8, 8, 8, 8), Ipv4Addr::new(192, 168, 1, 20)];
        assert_eq!(pick_address(ips), Some(Ipv4Addr::new(192, 168, 1, 20)));
        assert_eq!(pick_address([Ipv4Addr::new(8, 8, 8, 8)]), None);
    }

    /// À lancer à la main sur un réseau avec un appareil Cast :
    /// `cargo test decouverte_reelle -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn decouverte_reelle() {
        let devices = Devices::default();
        let _d = Discovery::start(devices.clone(), || {}).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(8));
        for d in devices.lock().unwrap().values() {
            println!("{} -> {}:{} ({})", d.id, d.host, d.port, d.name);
        }
        println!("{} appareil(s)", devices.lock().unwrap().len());
    }
}
