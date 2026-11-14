//! Sonde à lancer sur l'appareil ou l'émulateur (`adb push` + `adb shell`) : le cœur démarre-t-il
//! sous Android, le proxy filtre-t-il par jeton, et peut-il joindre Internet (DNS, TLS) ?

use std::{io::Read, io::Write, net::TcpStream, path::Path, time::Duration};

use nartya_core::stream::Target;

fn get(port: u16, path: &str) -> (u16, usize, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connexion au proxy");
    s.set_read_timeout(Some(Duration::from_secs(30))).ok();
    write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").unwrap();
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).ok();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status = text.get(9..12).and_then(|c| c.parse().ok()).unwrap_or(0);
    let first = text.lines().next().unwrap_or("").to_string();
    (status, raw.len(), first)
}

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "/data/local/tmp/nartya-probe".into());
    let started = std::time::Instant::now();
    let core = nartya_android::start(Path::new(&dir));
    let info = nartya_android::start_json(Path::new(&dir));
    println!("démarrage   : {:?} -> {info}", started.elapsed());
    let port = info["port"].as_u64().expect("port") as u16;
    let token = info["token"].as_str().expect("jeton").to_string();

    let t = std::time::Instant::now();
    let ips = core.runtime.block_on(core.parts.net.dns.lookup("nartya.app"));
    println!("DNS du cœur : {ips:?} en {:?}", t.elapsed());

    let (code, _, _) = get(port, "/video/proxy?h=x");
    println!("sans jeton  : HTTP {code} (attendu 403)");
    let (code, _, _) = get(port, &format!("/video/proxy?h=inconnu&t={token}"));
    println!("poignée inconnue : HTTP {code} (attendu 410)");

    let handle = core
        .parts
        .handles
        .mint(Target {
            url: "https://nartya.app/".into(),
            provider: None,
            referer: String::new(),
            origin: String::new(),
        })
        .expect("poignée");
    let t = std::time::Instant::now();
    let (code, bytes, first) = get(port, &format!("/video/proxy?h={handle}&t={token}"));
    println!("Internet via le proxy (https://nartya.app/) : HTTP {code}, {bytes} octets en {:?} ({first})", t.elapsed());

    let ifaces = core.runtime.block_on(async { nartya_core::system::machine_id() });
    println!("identifiant machine : {ifaces:?}");
}
