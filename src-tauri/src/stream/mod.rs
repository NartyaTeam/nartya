//! Lecture des flux : résolution de l'hébergeur, proxy local, client HTTP.

mod extract;
mod handles;
mod hls;
mod net;
mod provider;
mod proxy;
mod range;
mod recipe;
mod resolver;

use std::sync::Arc;

pub use resolver::{ResolveRequest, StreamService};

/// Démarre le proxy local et prépare le service de résolution.
pub async fn start() -> Option<Arc<StreamService>> {
    let net = Arc::new(net::Net::new());
    let proxy = proxy::Proxy::new(
        net,
        Arc::new(recipe::RecipeStore::default()),
        Arc::new(handles::Handles::default()),
    );
    match proxy.start().await {
        Ok(port) => println!("[proxy] proxy local démarré sur 127.0.0.1:{port}"),
        Err(e) => {
            eprintln!("[proxy] échec du démarrage : {e}");
            return None;
        }
    }
    Some(StreamService::new(proxy))
}
