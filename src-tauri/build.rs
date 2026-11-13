use std::fs;

/// Commandes exposées à la page : seules celles listées ici (et autorisées dans
/// `capabilities/main.json`) sont appelables, et seulement depuis la fenêtre principale.
const COMMANDS: &[&str] = &[
    "open_external",
    "app_quit",
    "app_focus",
    "hub_is_managed",
    "hub_get_info",
    "hub_open",
    "get_version",
    "get_machine_id",
    "get_anime4k_capabilities",
    "get_auth_redirect_url",
    "get_captcha_token",
    "session_get",
    "session_set",
    "session_remove",
];

/// `export const NOM = "valeur";` dans `src/config/instance.js` : une seule source de vérité
/// pour l'adresse du site et de l'API, côté page comme côté coque.
fn instance_const(source: &str, name: &str) -> String {
    let prefix = format!("export const {name} = \"");
    source
        .lines()
        .find_map(|line| {
            let rest = line.trim().strip_prefix(prefix.as_str())?;
            Some(rest[..rest.find('"')?].to_string())
        })
        .unwrap_or_else(|| panic!("{name} introuvable dans src/config/instance.js"))
}

fn main() {
    println!("cargo:rerun-if-changed=../src/config/instance.js");
    let source = fs::read_to_string("../src/config/instance.js")
        .expect("src/config/instance.js illisible");
    for name in ["SITE_URL", "API_URL"] {
        println!("cargo:rustc-env=NARTYA_{name}={}", instance_const(&source, name));
    }

    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("échec de tauri-build");
}
