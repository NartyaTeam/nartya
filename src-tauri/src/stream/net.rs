//! Client HTTP vers les hébergeurs : résolution DNS par DoH (Cloudflare, IP littérale) avec repli
//! sur le système, redirections suivies à la main (un hôte public pourrait rediriger vers
//! 127.0.0.1 ou le LAN) et refus des adresses privées.

use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use reqwest::{
    dns::{Addrs, Name, Resolve, Resolving},
    header::{HeaderMap, HeaderName, HeaderValue},
    Method, Response, Url,
};
use serde_json::Value;

const DOH_ENDPOINTS: [&str; 2] = ["https://1.1.1.1/dns-query", "https://1.0.0.1/dns-query"];
// Les TTL DNS réels sont ignorés.
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const DOH_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_REDIRECTS: usize = 5;
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub enum NetError {
    /// Adresse refusée (SSRF).
    Blocked(String),
    Timeout,
    TooManyRedirects,
    Request(reqwest::Error),
}

impl std::fmt::Display for NetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NetError::Blocked(why) => write!(f, "URL bloquée : {why}"),
            NetError::Timeout => write!(f, "Timeout : aucune réponse de l'hébergeur"),
            NetError::TooManyRedirects => write!(f, "Trop de redirections"),
            // Le message de reqwest contient l'URL complète : elle porterait des jetons signés.
            NetError::Request(e) => write!(f, "{}", redact_urls(&e.to_string())),
        }
    }
}

impl NetError {
    /// Message court pour la page ; le détail reste dans les logs.
    pub fn friendly(&self) -> String {
        match self {
            NetError::Blocked(_) => "Lien de lecture invalide".into(),
            NetError::Timeout => "Le serveur ne répond pas, réessaie plus tard".into(),
            NetError::TooManyRedirects => "Hébergeur injoignable".into(),
            NetError::Request(e) => {
                let chain = format!("{e:?}").to_lowercase();
                if e.is_timeout() {
                    "Le serveur ne répond pas, réessaie plus tard".into()
                } else if chain.contains("dns")
                    || chain.contains("resolve")
                    || chain.contains("lookup")
                {
                    "Hébergeur introuvable".into()
                } else if chain.contains("reset")
                    || chain.contains("closed")
                    || chain.contains("broken pipe")
                {
                    "Connexion interrompue, réessaie".into()
                } else if e.is_connect() {
                    "Serveur injoignable".into()
                } else {
                    "Échec de la connexion à l'hébergeur".into()
                }
            }
        }
    }

    fn is_retryable(&self) -> bool {
        match self {
            NetError::Request(e) => {
                let chain = format!("{e:?}").to_lowercase();
                e.is_connect()
                    || chain.contains("reset")
                    || chain.contains("closed")
                    || chain.contains("broken pipe")
            }
            _ => false,
        }
    }
}

/// Retire les URL d'un message : les logs sont joints aux rapports de bug.
pub fn redact_urls(message: &str) -> String {
    static URL: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r#"https?://[^\s"')]+"#).unwrap());
    URL.replace_all(message, |caps: &regex::Captures| {
        Url::parse(&caps[0])
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
            .unwrap_or_else(|| "hôte inconnu".into())
    })
    .into_owned()
}

pub fn host_of(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| "?".into())
}

fn is_private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || o[0] == 0
        || o[0] >= 240
        // 100.64.0.0/10 (CGNAT, dont le VPN Tailscale)
        || (o[0] == 100 && (64..=127).contains(&o[1]))
        // 198.18.0.0/15 (bancs de test, parfois routé vers le LAN)
        || (o[0] == 198 && (o[1] & 0xfe) == 18)
        // 192.0.0.0/24 (IETF)
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
}

fn is_private_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_private_v4(v4);
    }
    let first = ip.segments()[0];
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        // fc00::/7 et fe80::/10
        || (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
}

pub fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_private_v4(v4),
        IpAddr::V6(v6) => is_private_v6(v6),
    }
}

/// Résolveur DoH avec cache ; sert aussi de `dns_resolver` à reqwest.
pub struct Dns {
    http: reqwest::Client,
    cache: Mutex<HashMap<String, (Vec<IpAddr>, Instant)>>,
}

impl Dns {
    fn new() -> Self {
        // Les points d'accès DoH sont des IP littérales : pas de résolution pour les joindre.
        let http = reqwest::Client::builder()
            .timeout(DOH_TIMEOUT)
            .build()
            .expect("client DoH");
        Self {
            http,
            cache: Mutex::new(HashMap::new()),
        }
    }

    async fn query(&self, host: &str, rr_type: &str) -> Vec<IpAddr> {
        let wanted: u64 = if rr_type == "AAAA" { 28 } else { 1 };
        for endpoint in DOH_ENDPOINTS {
            let request = self
                .http
                .get(endpoint)
                .query(&[("name", host), ("type", rr_type)])
                .header("accept", "application/dns-json");
            let Ok(response) = request.send().await else {
                continue;
            };
            if !response.status().is_success() {
                continue;
            }
            let Ok(body) = response.json::<Value>().await else {
                continue;
            };
            let ips: Vec<IpAddr> = body["Answer"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|a| a["type"].as_u64() == Some(wanted))
                .filter_map(|a| a["data"].as_str()?.parse::<IpAddr>().ok())
                .filter(|ip| ip.is_ipv6() == (wanted == 28))
                .collect();
            if !ips.is_empty() {
                return ips;
            }
        }
        Vec::new()
    }

    /// DoH d'abord (A, puis AAAA), repli sur le résolveur système si Cloudflare reste muet.
    pub async fn lookup(&self, host: &str) -> Vec<IpAddr> {
        if let Ok(ip) = host.parse::<IpAddr>() {
            return vec![ip];
        }
        if let Some((ips, at)) = self.cache.lock().unwrap().get(host) {
            if at.elapsed() < CACHE_TTL {
                return ips.clone();
            }
        }
        let mut ips = self.query(host, "A").await;
        if ips.is_empty() {
            ips = self.query(host, "AAAA").await;
        }
        if ips.is_empty() {
            if let Ok(found) = tokio::net::lookup_host((host, 0)).await {
                // IPv4 d'abord : c'était le comportement d'Electron (`family: 4`).
                let mut all: Vec<IpAddr> = found.map(|s| s.ip()).collect();
                all.sort_by_key(|ip| ip.is_ipv6());
                ips = all;
            }
        }
        if !ips.is_empty() {
            self.cache
                .lock()
                .unwrap()
                .insert(host.to_string(), (ips.clone(), Instant::now()));
        }
        ips
    }
}

struct DnsResolver {
    dns: Arc<Dns>,
    /// L'API (en dev, souvent `localhost`) : seul hôte autorisé à résoudre vers une adresse privée.
    api_host: Option<String>,
}

impl Resolve for DnsResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let dns = self.dns.clone();
        let trusted = self.api_host.as_deref() == Some(name.as_str());
        Box::pin(async move {
            // Revalidé ici aussi : le cache a pu expirer depuis `validate_external_url`, et une
            // nouvelle réponse DNS pourrait pointer vers le réseau local.
            let ips: Vec<IpAddr> = dns
                .lookup(name.as_str())
                .await
                .into_iter()
                .filter(|ip| trusted || !is_private_ip(*ip))
                .collect();
            if ips.is_empty() {
                let err: Box<dyn std::error::Error + Send + Sync> =
                    format!("dns error: {} introuvable", name.as_str()).into();
                return Err(err);
            }
            let addrs: Addrs = Box::new(ips.into_iter().map(|ip| SocketAddr::new(ip, 0)));
            Ok(addrs)
        })
    }
}

pub struct Net {
    pub client: reqwest::Client,
    pub dns: Arc<Dns>,
}

pub fn build_headers(map: &HashMap<String, String>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (k, v) in map {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            headers.insert(name, value);
        }
    }
    headers
}

impl Net {
    pub fn new() -> Self {
        let dns = Arc::new(Dns::new());
        let client = reqwest::Client::builder()
            .dns_resolver(Arc::new(DnsResolver {
                dns: dns.clone(),
                api_host: Url::parse(&super::resolver::api_base_url())
                    .ok()
                    .and_then(|u| u.host_str().map(str::to_lowercase)),
            }))
            .redirect(reqwest::redirect::Policy::none())
            // Même comportement qu'Electron : HTTP/1.1, keep-alive court.
            .http1_only()
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(16)
            .build()
            .expect("client HTTP");
        Self { client, dns }
    }

    /// Valider et requêter doivent voir la même adresse : le cache DNS est partagé.
    pub async fn validate_external_url(&self, url: &Url) -> Result<(), String> {
        if !matches!(url.scheme(), "http" | "https") {
            return Err("Protocole non autorisé".into());
        }
        match url.host() {
            Some(url::Host::Ipv4(ip)) if is_private_ip(IpAddr::V4(ip)) => {
                Err("IP privée/réservée interdite".into())
            }
            Some(url::Host::Ipv6(ip)) if is_private_ip(IpAddr::V6(ip)) => {
                Err("IP privée/réservée interdite".into())
            }
            Some(url::Host::Domain(host)) => {
                let ips = self.dns.lookup(host).await;
                if ips.is_empty() {
                    return Err("Hôte introuvable".into());
                }
                match ips.iter().find(|ip| is_private_ip(**ip)) {
                    Some(ip) => Err(format!(
                        "Le hostname {host} résout vers une IP privée ({ip})"
                    )),
                    None => Ok(()),
                }
            }
            Some(_) => Ok(()),
            None => Err("URL sans hôte".into()),
        }
    }

    /// Redirections suivies à la main ; `timeout` borne l'arrivée des en-têtes, pas le corps.
    pub async fn fetch_checked(
        &self,
        method: Method,
        url: &str,
        headers: &HashMap<String, String>,
        timeout: Duration,
    ) -> Result<Response, NetError> {
        let mut current = Url::parse(url).map_err(|e| NetError::Blocked(e.to_string()))?;
        for _ in 0..=MAX_REDIRECTS {
            self.validate_external_url(&current)
                .await
                .map_err(NetError::Blocked)?;
            let request = self
                .client
                .request(method.clone(), current.clone())
                .headers(build_headers(headers));
            let response = tokio::time::timeout(timeout, request.send())
                .await
                .map_err(|_| NetError::Timeout)?
                .map_err(NetError::Request)?;
            let location = response
                .status()
                .is_redirection()
                .then(|| response.headers().get(reqwest::header::LOCATION))
                .flatten()
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let Some(location) = location else {
                return Ok(response);
            };
            current = current
                .join(&location)
                .map_err(|e| NetError::Blocked(e.to_string()))?;
        }
        Err(NetError::TooManyRedirects)
    }

    /// Le CDN ferme parfois un keep-alive réutilisé : une seconde tentative ouvre une connexion neuve.
    pub async fn fetch_checked_with_retry(
        &self,
        method: Method,
        url: &str,
        headers: &HashMap<String, String>,
        timeout: Duration,
    ) -> Result<Response, NetError> {
        match self
            .fetch_checked(method.clone(), url, headers, timeout)
            .await
        {
            Err(e) if e.is_retryable() => self.fetch_checked(method, url, headers, timeout).await,
            other => other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adresses_privees() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.255.1",
            "192.168.1.1",
            "169.254.1.1",
            "0.0.0.0",
            "100.64.0.1",
            "100.127.1.1",
            "198.18.0.1",
            "198.19.255.1",
            "224.0.0.1",
            "255.255.255.255",
            "::1",
            "ff02::1",
            "fd00::1",
            "fe80::1",
            "::ffff:192.168.0.1",
        ] {
            assert!(
                is_private_ip(ip.parse().unwrap()),
                "{ip} devrait être privée"
            );
        }
        for ip in [
            "8.8.8.8",
            "1.1.1.1",
            "172.32.0.1",
            "100.128.0.1",
            "198.20.0.1",
            "2606:4700::1111",
        ] {
            assert!(
                !is_private_ip(ip.parse().unwrap()),
                "{ip} devrait être publique"
            );
        }
    }

    #[tokio::test]
    async fn refuse_le_loopback_et_les_schemas_exotiques() {
        let net = Net::new();
        assert!(net
            .validate_external_url(&Url::parse("http://127.0.0.1:8080/x").unwrap())
            .await
            .is_err());
        assert!(net
            .validate_external_url(&Url::parse("http://[::1]/").unwrap())
            .await
            .is_err());
        assert!(net
            .validate_external_url(&Url::parse("file:///C:/x").unwrap())
            .await
            .is_err());
        assert!(net
            .validate_external_url(&Url::parse("http://8.8.8.8/").unwrap())
            .await
            .is_ok());
    }

    #[test]
    fn les_urls_sont_retirees_des_messages() {
        let out = redact_urls(
            "error sending request for url (https://cdn.exemple.com/seg.ts?token=SECRET)",
        );
        assert!(!out.contains("SECRET"));
        assert!(out.contains("cdn.exemple.com"));
    }
}
