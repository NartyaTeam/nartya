use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

#[derive(Default)]
pub struct AppState {
    /// La page est chargée : les événements peuvent partir vers elle.
    ready: AtomicBool,
    pending_deep_link: Mutex<Option<String>>,
}

impl AppState {
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    pub fn set_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
    }

    pub fn set_pending(&self, url: String) {
        *self.pending_deep_link.lock().unwrap() = Some(url);
    }

    pub fn take_pending(&self) -> Option<String> {
        self.pending_deep_link.lock().unwrap().take()
    }
}
