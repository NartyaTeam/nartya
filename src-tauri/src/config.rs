//! Adresses de l'instance, lues dans `src/config/instance.js` à la compilation (voir `build.rs`).

pub const SITE_URL: &str = env!("NARTYA_SITE_URL");
#[allow(dead_code)]
pub const API_URL: &str = env!("NARTYA_API_URL");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adresses_lues_dans_instance_js() {
        assert!(SITE_URL.starts_with("https://"));
        assert!(API_URL.starts_with("https://"));
        assert!(!SITE_URL.ends_with('/'));
    }
}
