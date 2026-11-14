//! Client CASTV2 minimal : TLS (les appareils présentent un certificat auto-signé), trames de 4
//! octets de longueur suivies d'un `CastMessage` protobuf, messages JSON dans des espaces de noms.

use std::{
    collections::HashMap,
    net::Ipv4Addr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    crypto::{ring, verify_tls12_signature, verify_tls13_signature, CryptoProvider},
    pki_types::{CertificateDer, ServerName, UnixTime},
    ClientConfig, DigitallySignedStruct, SignatureScheme,
};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::{mpsc, oneshot},
    task::AbortHandle,
};
use tokio_rustls::TlsConnector;

pub const NS_CONNECTION: &str = "urn:x-cast:com.google.cast.tp.connection";
pub const NS_HEARTBEAT: &str = "urn:x-cast:com.google.cast.tp.heartbeat";
pub const NS_RECEIVER: &str = "urn:x-cast:com.google.cast.receiver";
pub const NS_MEDIA: &str = "urn:x-cast:com.google.cast.media";

pub const PLATFORM_ID: &str = "receiver-0";
const SENDER_ID: &str = "sender-0";
const HEARTBEAT_EVERY: Duration = Duration::from_secs(5);
/// Un `CastMessage` fait au plus 64 Kio.
const MAX_FRAME: usize = 1 << 17;

// ---- Protobuf (CastMessage) : champs 1 à 6, tous en longueur ou varint.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CastMessage {
    pub source: String,
    pub destination: String,
    pub namespace: String,
    pub payload: String,
}

fn put_varint(out: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn put_string(out: &mut Vec<u8>, tag: u8, s: &str) {
    out.push(tag);
    put_varint(out, s.len() as u64);
    out.extend_from_slice(s.as_bytes());
}

pub fn encode_message(m: &CastMessage) -> Vec<u8> {
    let mut body = vec![0x08, 0x00]; // protocol_version = CASTV2_1_0
    put_string(&mut body, 0x12, &m.source);
    put_string(&mut body, 0x1A, &m.destination);
    put_string(&mut body, 0x22, &m.namespace);
    body.extend_from_slice(&[0x28, 0x00]); // payload_type = STRING
    put_string(&mut body, 0x32, &m.payload);
    let mut frame = Vec::with_capacity(body.len() + 4);
    frame.extend_from_slice(&(body.len() as u32).to_be_bytes());
    frame.extend_from_slice(&body);
    frame
}

fn read_varint(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *buf.get(*pos)?;
        *pos += 1;
        value |= u64::from(byte & 0x7F) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}

/// `None` si le message est tronqué ou sans charge utile texte.
pub fn decode_message(buf: &[u8]) -> Option<CastMessage> {
    let (mut source, mut destination, mut namespace, mut payload) = (None, None, None, None);
    let mut pos = 0;
    while pos < buf.len() {
        let tag = read_varint(buf, &mut pos)?;
        match tag & 7 {
            0 => {
                read_varint(buf, &mut pos)?;
            }
            2 => {
                let len = read_varint(buf, &mut pos)? as usize;
                let end = pos.checked_add(len).filter(|e| *e <= buf.len())?;
                let bytes = &buf[pos..end];
                pos = end;
                let text = || String::from_utf8(bytes.to_vec()).ok();
                match tag >> 3 {
                    2 => source = text(),
                    3 => destination = text(),
                    4 => namespace = text(),
                    6 => payload = text(),
                    _ => {}
                }
            }
            _ => return None,
        }
    }
    Some(CastMessage {
        source: source?,
        destination: destination?,
        namespace: namespace?,
        payload: payload?,
    })
}

// ---- TLS

#[derive(Debug)]
struct AcceptAny(Arc<CryptoProvider>);

impl ServerCertVerifier for AcceptAny {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls12_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.0.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

fn tls_connector() -> Result<TlsConnector, String> {
    let provider = Arc::new(ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAny(provider)))
        .with_no_client_auth();
    Ok(TlsConnector::from(Arc::new(config)))
}

type Tls = tokio_rustls::client::TlsStream<TcpStream>;

async fn connect_tls(host: Ipv4Addr, port: u16, timeout: Duration) -> Result<Tls, String> {
    let attempt = async {
        let tcp = TcpStream::connect((host, port)).await.map_err(|e| e.to_string())?;
        let _ = tcp.set_nodelay(true);
        tls_connector()?
            .connect(ServerName::IpAddress(host.into()), tcp)
            .await
            .map_err(|e| e.to_string())
    };
    tokio::time::timeout(timeout, attempt)
        .await
        .map_err(|_| "timeout".to_string())?
}

/// L'appareil répond-il en TLS sur ce port ?
pub async fn probe(host: Ipv4Addr, port: u16, timeout: Duration) -> bool {
    connect_tls(host, port, timeout).await.is_ok()
}

// ---- Client

#[derive(Debug)]
pub enum Event {
    Message { namespace: String, payload: Value },
    Closed,
}

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

pub struct Client {
    out: mpsc::UnboundedSender<Vec<u8>>,
    pending: Pending,
    next_id: AtomicU64,
    tasks: Vec<AbortHandle>,
}

impl Drop for Client {
    fn drop(&mut self) {
        for t in &self.tasks {
            t.abort();
        }
    }
}

fn frame(namespace: &str, destination: &str, payload: &Value) -> Vec<u8> {
    encode_message(&CastMessage {
        source: SENDER_ID.into(),
        destination: destination.into(),
        namespace: namespace.into(),
        payload: payload.to_string(),
    })
}

impl Client {
    /// Les messages reçus et la fermeture arrivent sur `events`.
    pub async fn connect(
        host: Ipv4Addr,
        port: u16,
        timeout: Duration,
        events: mpsc::UnboundedSender<Event>,
    ) -> Result<Self, String> {
        let stream = connect_tls(host, port, timeout).await?;
        let (mut reader, mut writer) = tokio::io::split(stream);
        let (out, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let pending: Pending = Arc::default();

        let write_task = tokio::spawn(async move {
            while let Some(bytes) = out_rx.recv().await {
                if writer.write_all(&bytes).await.is_err() {
                    break;
                }
            }
            let _ = writer.shutdown().await;
        });

        let read_pending = pending.clone();
        let read_out = out.clone();
        let read_task = tokio::spawn(async move {
            loop {
                let mut len = [0u8; 4];
                if reader.read_exact(&mut len).await.is_err() {
                    break;
                }
                let len = u32::from_be_bytes(len) as usize;
                if len == 0 || len > MAX_FRAME {
                    break;
                }
                let mut buf = vec![0u8; len];
                if reader.read_exact(&mut buf).await.is_err() {
                    break;
                }
                let Some(message) = decode_message(&buf) else {
                    continue;
                };
                let Ok(payload) = serde_json::from_str::<Value>(&message.payload) else {
                    continue;
                };
                if message.namespace == NS_HEARTBEAT {
                    if payload["type"] == "PING" {
                        let _ = read_out.send(frame(
                            NS_HEARTBEAT,
                            &message.source,
                            &json!({ "type": "PONG" }),
                        ));
                    }
                    continue;
                }
                if let Some(id) = payload["requestId"].as_u64().filter(|id| *id != 0) {
                    if let Some(tx) = read_pending.lock().unwrap().remove(&id) {
                        let _ = tx.send(payload.clone());
                    }
                }
                let _ = events.send(Event::Message {
                    namespace: message.namespace,
                    payload,
                });
            }
            let _ = events.send(Event::Closed);
        });

        let beat_out = out.clone();
        let beat_task = tokio::spawn(async move {
            let mut tick = tokio::time::interval(HEARTBEAT_EVERY);
            loop {
                tick.tick().await;
                if beat_out
                    .send(frame(NS_HEARTBEAT, PLATFORM_ID, &json!({ "type": "PING" })))
                    .is_err()
                {
                    break;
                }
            }
        });

        let client = Self {
            out,
            pending,
            next_id: AtomicU64::new(1),
            tasks: vec![
                write_task.abort_handle(),
                read_task.abort_handle(),
                beat_task.abort_handle(),
            ],
        };
        client.send(NS_CONNECTION, PLATFORM_ID, &json!({ "type": "CONNECT" }));
        Ok(client)
    }

    pub fn send(&self, namespace: &str, destination: &str, payload: &Value) {
        let _ = self.out.send(frame(namespace, destination, payload));
    }

    /// Envoie `payload` avec un `requestId` et attend la réponse qui le porte.
    pub async fn request(
        &self,
        namespace: &str,
        destination: &str,
        mut payload: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        payload["requestId"] = json!(id);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.send(namespace, destination, &payload);
        let reply = tokio::time::timeout(timeout, rx).await;
        self.pending.lock().unwrap().remove(&id);
        match reply {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err("connexion fermée".into()),
            Err(_) => Err("timeout".into()),
        }
    }

    /// Ouvre un canal virtuel vers une application (`transportId`).
    pub fn open_channel(&self, destination: &str) {
        self.send(NS_CONNECTION, destination, &json!({ "type": "CONNECT" }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> CastMessage {
        CastMessage {
            source: "sender-0".into(),
            destination: "receiver-0".into(),
            namespace: NS_HEARTBEAT.into(),
            payload: r#"{"type":"PING"}"#.into(),
        }
    }

    #[test]
    fn trame_aller_retour() {
        let bytes = encode_message(&sample());
        let len = u32::from_be_bytes(bytes[..4].try_into().unwrap()) as usize;
        assert_eq!(len, bytes.len() - 4);
        assert_eq!(decode_message(&bytes[4..]), Some(sample()));
    }

    #[test]
    fn octets_connus() {
        // protocol_version=0, source="a", destination="b", namespace="c", type=0, payload="{}"
        let raw = [
            0x08, 0x00, 0x12, 1, b'a', 0x1A, 1, b'b', 0x22, 1, b'c', 0x28, 0x00, 0x32, 2, b'{',
            b'}',
        ];
        let m = decode_message(&raw).unwrap();
        assert_eq!((m.source.as_str(), m.namespace.as_str(), m.payload.as_str()), ("a", "c", "{}"));
    }

    #[test]
    fn longue_charge_utile() {
        let mut m = sample();
        m.payload = "x".repeat(300); // longueur sur deux octets de varint
        let bytes = encode_message(&m);
        assert_eq!(decode_message(&bytes[4..]), Some(m));
    }

    #[test]
    fn message_tronque_ou_incomplet() {
        let bytes = encode_message(&sample());
        assert!(decode_message(&bytes[4..bytes.len() - 3]).is_none());
        assert!(decode_message(&[0x08, 0x00]).is_none());
        assert!(decode_message(&[0x12, 0xFF]).is_none());
    }

    use rustls::pki_types::PrivateKeyDer;
    use tokio::net::TcpListener;

    async fn read_message<R: AsyncReadExt + Unpin>(r: &mut R) -> CastMessage {
        let mut len = [0u8; 4];
        r.read_exact(&mut len).await.unwrap();
        let mut buf = vec![0u8; u32::from_be_bytes(len) as usize];
        r.read_exact(&mut buf).await.unwrap();
        decode_message(&buf).unwrap()
    }

    /// Faux récepteur : certificat auto-signé, accepte CONNECT, répond à LAUNCH et à PING.
    async fn fake_receiver() -> u16 {
        let cert = rcgen::generate_simple_self_signed(vec!["cast.local".to_string()]).unwrap();
        let key = PrivateKeyDer::try_from(cert.signing_key.serialize_der()).unwrap();
        let config = rustls::ServerConfig::builder_with_provider(Arc::new(ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![cert.cert.der().clone()], key)
            .unwrap();
        let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut tls = acceptor.accept(tcp).await.unwrap();
            let reply = |ns: &str, payload: Value| {
                encode_message(&CastMessage {
                    source: "receiver-0".into(),
                    destination: "sender-0".into(),
                    namespace: ns.into(),
                    payload: payload.to_string(),
                })
            };
            // Un PING du récepteur doit recevoir un PONG.
            tls.write_all(&reply(NS_HEARTBEAT, json!({ "type": "PING" }))).await.unwrap();
            loop {
                let m = read_message(&mut tls).await;
                let p: Value = serde_json::from_str(&m.payload).unwrap();
                if p["type"] == "LAUNCH" {
                    let status = json!({
                        "type": "RECEIVER_STATUS",
                        "requestId": p["requestId"],
                        "status": { "applications": [{ "appId": "CC1AD845", "transportId": "web-7", "sessionId": "s1" }] },
                    });
                    tls.write_all(&reply(NS_RECEIVER, status)).await.unwrap();
                    // On lit jusqu'à la fermeture côté client : fermer avec des données non lues
                    // (le PONG) enverrait un RST qui peut jeter la réponse encore en vol.
                    let mut sink = [0u8; 1024];
                    while tls.read(&mut sink).await.unwrap_or(0) > 0 {}
                    return;
                }
            }
        });
        port
    }

    #[tokio::test]
    async fn dialogue_complet_avec_un_recepteur_auto_signe() {
        let port = fake_receiver().await;
        let (tx, mut rx) = mpsc::unbounded_channel();
        let client = Client::connect(Ipv4Addr::LOCALHOST, port, Duration::from_secs(5), tx)
            .await
            .unwrap();
        let reply = client
            .request(NS_RECEIVER, PLATFORM_ID, json!({ "type": "LAUNCH", "appId": "CC1AD845" }), Duration::from_secs(5))
            .await
            .unwrap();
        assert_eq!(reply["type"], "RECEIVER_STATUS");
        assert_eq!(reply["status"]["applications"][0]["transportId"], "web-7");
        // Le message est aussi relayé sur le flux d'événements.
        match rx.recv().await {
            Some(Event::Message { namespace, .. }) => assert_eq!(namespace, NS_RECEIVER),
            other => panic!("événement inattendu : {other:?}"),
        }
        drop(client);
    }

    #[tokio::test]
    async fn connexion_refusee_est_une_erreur() {
        let (tx, _rx) = mpsc::unbounded_channel();
        // Port fermé : aucun récepteur.
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(Client::connect(Ipv4Addr::LOCALHOST, port, Duration::from_secs(2), tx).await.is_err());
        assert!(!probe(Ipv4Addr::LOCALHOST, port, Duration::from_secs(2)).await);
    }

    /// Contre un vrai appareil : `NARTYA_CAST_HOST=192.168.1.20 cargo test appareil_reel -- --ignored --nocapture`
    /// Se connecte, interroge l'état du récepteur, ne lance rien.
    #[tokio::test]
    #[ignore]
    async fn appareil_reel() {
        let host: Ipv4Addr = std::env::var("NARTYA_CAST_HOST").unwrap().parse().unwrap();
        assert!(probe(host, 8009, Duration::from_secs(5)).await, "TLS refusé");
        let (tx, _rx) = mpsc::unbounded_channel();
        let client = Client::connect(host, 8009, Duration::from_secs(5), tx).await.unwrap();
        let status = client
            .request(NS_RECEIVER, PLATFORM_ID, json!({ "type": "GET_STATUS" }), Duration::from_secs(5))
            .await
            .unwrap();
        println!("{status}");
        assert_eq!(status["type"], "RECEIVER_STATUS");
    }

    #[test]
    fn champ_inconnu_ignore() {
        let mut raw = encode_message(&sample())[4..].to_vec();
        raw.extend_from_slice(&[0x3A, 2, 9, 9]); // champ 7 (payload_binary)
        assert_eq!(decode_message(&raw), Some(sample()));
    }
}
