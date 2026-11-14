use std::fs;

/// `export const NOM = "valeur";` dans `src/config/instance.js` : une seule source de vérité
/// pour l'adresse du site et de l'API, côté page comme côté cœur.
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
    let path = "../../src/config/instance.js";
    println!("cargo:rerun-if-changed={path}");
    let source = fs::read_to_string(path).expect("src/config/instance.js illisible");
    for name in ["SITE_URL", "API_URL"] {
        println!("cargo:rustc-env=NARTYA_{name}={}", instance_const(&source, name));
    }
}
