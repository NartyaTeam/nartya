//! Ce que le cœur demande à la coque qui l'embarque.

use std::path::{Path, PathBuf};

pub use futures_util::future::BoxFuture;
use serde_json::Value;

/// Réponse à « déplacer les épisodes déjà téléchargés vers le nouveau dossier ? ».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveChoice {
    Move,
    Leave,
    Cancel,
}

/// Texte de la question : écrit une fois ici, la coque ne fait que l'afficher.
#[derive(Debug, Clone)]
pub struct MovePrompt {
    pub title: &'static str,
    pub message: String,
    pub move_label: &'static str,
    pub leave_label: &'static str,
    pub cancel_label: &'static str,
}

pub trait Host: Send + Sync + 'static {
    /// Événement poussé à la page (`downloads:progress`, `cast:devices`, `cast:status`).
    fn emit(&self, event: &str, payload: Value);

    /// Ouvre un dossier dans l'explorateur de fichiers.
    fn open_path(&self, path: &Path) -> Result<(), String>;

    /// Sélecteur de dossier natif ; `None` si annulé ou indisponible.
    fn pick_folder(&self, title: &str, start: &Path) -> BoxFuture<'static, Option<PathBuf>>;

    fn ask_move_downloads(&self, prompt: MovePrompt) -> BoxFuture<'static, MoveChoice>;
}
