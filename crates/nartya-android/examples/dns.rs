//! Diagnostic réseau sous Android : DoH direct, résolveur système, puis HTTPS.
#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let c = reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build().unwrap();
    for ep in ["https://1.1.1.1/dns-query", "https://8.8.8.8/resolve", "https://dns.google/resolve"] {
        let r = c.get(ep).query(&[("name", "nartya.app"), ("type", "A")]).header("accept", "application/dns-json").send().await;
        match r {
            Ok(resp) => println!("DoH {ep} : HTTP {} {}", resp.status(), resp.text().await.unwrap_or_default().chars().take(120).collect::<String>()),
            Err(e) => println!("DoH {ep} : ERREUR {e:?}"),
        }
    }
    println!("système : {:?}", tokio::net::lookup_host(("nartya.app", 0)).await.map(|a| a.collect::<Vec<_>>()));
    match c.get("https://nartya.app/").send().await {
        Ok(r) => println!("HTTPS direct : HTTP {}", r.status()),
        Err(e) => println!("HTTPS direct : ERREUR {e:?}"),
    }
}
