//! Lecture des flux : résolution de l'hébergeur, proxy local, client HTTP.

mod extract;
mod handles;
mod hls;
mod local;
mod net;
mod provider;
mod proxy;
mod range;
mod recipe;
mod resolver;

use std::sync::Arc;

pub use handles::{Handles, Target};
pub use net::{Net, NetError};
pub use proxy::Proxy;
pub use provider::{build_provider_request, provider_headers};
pub use recipe::RecipeStore;
pub use resolver::{api_base_url, ResolveRequest, StreamService};

use crate::downloads::SharedRoot;

/// Client, recette et poignées : partagés par la lecture et les téléchargements.
pub struct Parts {
    pub net: Arc<Net>,
    pub recipe: Arc<RecipeStore>,
    pub handles: Arc<Handles>,
}

/// Démarre le proxy local (flux distants et fichiers téléchargés sous `local_root`).
pub async fn start(local_root: SharedRoot) -> (Parts, Option<Arc<StreamService>>) {
    let parts = Parts {
        net: Arc::new(Net::new()),
        recipe: Arc::new(RecipeStore::default()),
        handles: Arc::new(Handles::default()),
    };
    let proxy = proxy::Proxy::new(
        parts.net.clone(),
        parts.recipe.clone(),
        parts.handles.clone(),
        local_root,
    );
    let service = match proxy.start().await {
        Ok(port) => {
            println!("[proxy] proxy local démarré sur 127.0.0.1:{port}");
            Some(StreamService::new(proxy))
        }
        Err(e) => {
            eprintln!("[proxy] échec du démarrage : {e}");
            None
        }
    };
    (parts, service)
}
