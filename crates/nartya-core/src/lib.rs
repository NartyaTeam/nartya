//! Cœur de Nartya, partagé par toutes les coques (Tauri aujourd'hui, Android et iOS ensuite).
//!
//! Il ne connaît ni fenêtre ni webview : ce qui touche l'interface (événements vers la page,
//! ouverture d'un dossier, boîtes de dialogue) passe par [`Host`], que chaque coque implémente.
//! Les fonctions asynchrones s'exécutent dans un runtime Tokio fourni par la coque.

pub mod cast;
pub mod config;
pub mod discord;
pub mod downloads;
pub mod host;
pub mod hub;
pub mod oauth;
pub mod session;
pub mod stream;
pub mod system;
pub mod url_guard;

pub use host::{Host, MoveChoice, MovePrompt};
