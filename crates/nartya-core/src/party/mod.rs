//! Watch party : le moteur ([`Engine`]) décide, l'acteur ([`Party`]) le fait vivre dans Tokio et
//! parle à la page par [`Host`]. Contrat complet : `docs/WATCHPARTY-CONTRACT.md`.

mod engine;
mod types;

#[cfg(test)]
mod tests;

use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde_json::Value;
use tokio::sync::mpsc;

use crate::Host;

pub use engine::Engine;
pub use types::*;

/// Une échéance déjà passée ne doit pas faire tourner la boucle à vide.
const MIN_SLEEP: Duration = Duration::from_millis(5);
const IDLE_SLEEP: Duration = Duration::from_secs(3600);

fn wall_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Poignée vers l'acteur qui possède le moteur.
pub struct Party(mpsc::UnboundedSender<Input>);

impl Party {
    pub fn start(host: Arc<dyn Host>) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(run(host, rx));
        Self(tx)
    }

    pub fn input(&self, input: Input) {
        let _ = self.0.send(input);
    }

    /// Point d'entrée des commandes : la page envoie le JSON du contrat.
    pub fn input_json(&self, value: Value) -> Result<(), String> {
        let input: Input = serde_json::from_value(value).map_err(|e| format!("entrée invalide : {e}"))?;
        self.input(input);
        Ok(())
    }
}

fn publish(host: &dyn Host, out: Output) {
    for effect in out.effects {
        if let Ok(v) = serde_json::to_value(&effect) {
            host.emit("party:effect", v);
        }
    }
    if let Some(state) = out.state {
        if let Ok(v) = serde_json::to_value(&state) {
            host.emit("party:state", v);
        }
    }
}

async fn run(host: Arc<dyn Host>, mut rx: mpsc::UnboundedReceiver<Input>) {
    let mut engine = Engine::new();
    loop {
        let deadline = engine.next_deadline();
        let wait = match deadline {
            Some(d) => Duration::from_millis(d.saturating_sub(wall_ms())).max(MIN_SLEEP),
            None => IDLE_SLEEP,
        };
        let out = tokio::select! {
            msg = rx.recv() => match msg {
                Some(input) => engine.handle(wall_ms(), input),
                None => break,
            },
            _ = tokio::time::sleep(wait), if deadline.is_some() => engine.poll(wall_ms()),
        };
        publish(host.as_ref(), out);
    }
}
