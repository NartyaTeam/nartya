//! Cartes réseau locales : laquelle voit l'appareil, et lesquelles sont virtuelles (WSL, VPN…).

use std::net::Ipv4Addr;

#[derive(Debug, Clone)]
pub struct LanInterface {
    pub name: String,
    pub address: Ipv4Addr,
    pub prefix: u8,
    pub virtual_adapter: bool,
}

const VIRTUAL_PREFIXES: &[&str] = &[
    "vethernet", "docker", "br-", "veth", "vmware", "virtualbox", "utun", "tun", "tap", "wsl",
    "zerotier", "tailscale", "nordlynx", "radmin", "hamachi",
];

fn is_virtual_name(name: &str) -> bool {
    let name = name.to_lowercase();
    VIRTUAL_PREFIXES.iter().any(|p| name.starts_with(p))
}

pub fn lan_interfaces() -> Vec<LanInterface> {
    let mut out = Vec::new();
    for iface in netdev::get_interfaces() {
        if iface.is_loopback() || !iface.is_up() {
            continue;
        }
        let name = iface
            .friendly_name
            .clone()
            .unwrap_or_else(|| iface.name.clone());
        for net in &iface.ipv4 {
            let address = net.addr();
            if address.is_loopback() || address.is_link_local() || address.is_unspecified() {
                continue;
            }
            out.push(LanInterface {
                virtual_adapter: is_virtual_name(&name) || is_virtual_name(&iface.name),
                name: name.clone(),
                address,
                prefix: net.prefix_len(),
            });
        }
    }
    out
}

fn mask(prefix: u8) -> u32 {
    if prefix == 0 {
        0
    } else {
        u32::MAX << (32 - u32::from(prefix.min(32)))
    }
}

fn shares_subnet(ip: Ipv4Addr, iface: &LanInterface) -> bool {
    let m = mask(iface.prefix);
    u32::from(ip) & m == u32::from(iface.address) & m
}

/// Adresse de la carte qui partage le sous-réseau de `remote`, sinon la première carte réelle.
pub fn local_address_for(remote: Ipv4Addr) -> Ipv4Addr {
    pick_address(&lan_interfaces(), remote)
}

fn pick_address(interfaces: &[LanInterface], remote: Ipv4Addr) -> Ipv4Addr {
    interfaces
        .iter()
        .find(|i| shares_subnet(remote, i))
        .or_else(|| interfaces.iter().find(|i| !i.virtual_adapter))
        .or_else(|| interfaces.first())
        .map(|i| i.address)
        .unwrap_or(Ipv4Addr::LOCALHOST)
}

/// WSL, Docker, VPN…
pub fn is_virtual_address(ip: Ipv4Addr) -> bool {
    lan_interfaces()
        .iter()
        .find(|i| shares_subnet(ip, i))
        .is_some_and(|i| i.virtual_adapter)
}

/// 10/8, 172.16/12, 192.168/16
pub fn is_private_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn iface(name: &str, ip: [u8; 4], prefix: u8, virt: bool) -> LanInterface {
        LanInterface {
            name: name.into(),
            address: Ipv4Addr::from(ip),
            prefix,
            virtual_adapter: virt,
        }
    }

    #[test]
    fn cartes_virtuelles_reconnues() {
        assert!(is_virtual_name("vEthernet (WSL)"));
        assert!(is_virtual_name("Tailscale"));
        assert!(!is_virtual_name("Wi-Fi"));
        assert!(!is_virtual_name("Ethernet"));
    }

    #[test]
    fn carte_du_meme_sous_reseau() {
        let cards = [
            iface("vEthernet", [172, 20, 0, 1], 20, true),
            iface("Wi-Fi", [192, 168, 1, 42], 24, false),
        ];
        assert_eq!(
            pick_address(&cards, Ipv4Addr::new(192, 168, 1, 20)),
            Ipv4Addr::new(192, 168, 1, 42)
        );
    }

    #[test]
    fn repli_sur_une_carte_reelle() {
        let cards = [
            iface("vEthernet", [172, 20, 0, 1], 20, true),
            iface("Wi-Fi", [192, 168, 1, 42], 24, false),
        ];
        assert_eq!(
            pick_address(&cards, Ipv4Addr::new(10, 0, 0, 5)),
            Ipv4Addr::new(192, 168, 1, 42)
        );
        assert_eq!(pick_address(&[], Ipv4Addr::new(10, 0, 0, 5)), Ipv4Addr::LOCALHOST);
    }

    #[test]
    fn masque() {
        assert_eq!(mask(24), 0xFFFF_FF00);
        assert_eq!(mask(0), 0);
        assert_eq!(mask(32), u32::MAX);
    }
}
