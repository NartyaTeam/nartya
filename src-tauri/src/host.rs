//! Ce que le cœur demande à l'interface, en Tauri : événements vers la fenêtre principale,
//! dossier dans l'explorateur, sélecteur et questions natifs.

use std::path::{Path, PathBuf};

use nartya_core::{host::BoxFuture, Host, MoveChoice, MovePrompt};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tauri_plugin_opener::OpenerExt;

pub struct TauriHost(pub AppHandle);

impl Host for TauriHost {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit_to("main", event, payload);
    }

    fn open_path(&self, path: &Path) -> Result<(), String> {
        self.0
            .opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn pick_folder(&self, title: &str, start: &Path) -> BoxFuture<'static, Option<PathBuf>> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let mut picker = self.0.dialog().file().set_title(title).set_directory(start);
        if let Some(win) = self.0.get_webview_window("main") {
            picker = picker.set_parent(&win);
        }
        picker.pick_folder(move |picked| {
            let _ = tx.send(picked.and_then(|p| p.into_path().ok()));
        });
        Box::pin(async move { rx.await.ok().flatten() })
    }

    fn ask_move_downloads(&self, prompt: MovePrompt) -> BoxFuture<'static, MoveChoice> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let mut dialog = self
            .0
            .dialog()
            .message(prompt.message)
            .title(prompt.title)
            .buttons(MessageDialogButtons::YesNoCancelCustom(
                prompt.move_label.into(),
                prompt.leave_label.into(),
                prompt.cancel_label.into(),
            ));
        if let Some(win) = self.0.get_webview_window("main") {
            dialog = dialog.parent(&win);
        }
        dialog.show_with_result(move |r| {
            let _ = tx.send(r);
        });
        let (move_label, leave_label) = (prompt.move_label, prompt.leave_label);
        Box::pin(async move {
            match rx.await.unwrap_or_default() {
                MessageDialogResult::Yes => MoveChoice::Move,
                MessageDialogResult::Custom(l) if l == move_label => MoveChoice::Move,
                MessageDialogResult::No => MoveChoice::Leave,
                MessageDialogResult::Custom(l) if l == leave_label => MoveChoice::Leave,
                _ => MoveChoice::Cancel,
            }
        })
    }
}
