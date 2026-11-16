//! Un moteur de watch party par fenêtre : la page de chaque fenêtre est un participant à part.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use serde_json::Value;
use tauri::AppHandle;

use crate::{host::WindowHost, party::Party};

pub struct PartyHub {
    app: AppHandle,
    parties: Mutex<HashMap<String, Party>>,
}

impl PartyHub {
    pub fn new(app: AppHandle) -> Self {
        Self { app, parties: Mutex::new(HashMap::new()) }
    }

    /// Démarre le moteur de la fenêtre à sa première entrée.
    pub fn input(&self, label: &str, input: Value) -> Result<(), String> {
        let mut parties = self.parties.lock().map_err(|_| "verrou empoisonné".to_string())?;
        if !parties.contains_key(label) {
            let host = Arc::new(WindowHost { app: self.app.clone(), label: label.to_string() });
            // `Party::start` lance une tâche Tokio : le contexte du runtime de Tauri est requis.
            let party = tauri::async_runtime::block_on(async { Party::start(host) });
            parties.insert(label.to_string(), party);
        }
        parties[label].input_json(input)
    }

    /// Fenêtre fermée : le moteur s'arrête avec son dernier émetteur.
    pub fn remove(&self, label: &str) {
        if let Ok(mut parties) = self.parties.lock() {
            parties.remove(label);
        }
    }
}
