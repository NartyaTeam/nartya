use std::sync::{
    atomic::{AtomicBool, AtomicU16, Ordering},
    Mutex,
};

#[derive(Default)]
pub struct AppState {
    /// La page est chargée : les événements peuvent partir vers elle.
    ready: AtomicBool,
    /// La fenêtre attend la connexion dans le Hub avant de se montrer.
    defer_reveal: AtomicBool,
    pending_deep_link: Mutex<Option<String>>,
    /// 0 : serveur OAuth loopback non démarré.
    auth_port: AtomicU16,
}

impl AppState {
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    pub fn set_ready(&self) {
        self.ready.store(true, Ordering::SeqCst);
    }

    pub fn defer_reveal(&self) -> bool {
        self.defer_reveal.load(Ordering::SeqCst)
    }

    pub fn set_defer_reveal(&self, value: bool) {
        self.defer_reveal.store(value, Ordering::SeqCst);
    }

    pub fn set_pending(&self, url: String) {
        *self.pending_deep_link.lock().unwrap() = Some(url);
    }

    pub fn take_pending(&self) -> Option<String> {
        self.pending_deep_link.lock().unwrap().take()
    }

    pub fn set_auth_port(&self, port: u16) {
        self.auth_port.store(port, Ordering::SeqCst);
    }

    pub fn auth_port(&self) -> Option<u16> {
        match self.auth_port.load(Ordering::SeqCst) {
            0 => None,
            port => Some(port),
        }
    }
}
