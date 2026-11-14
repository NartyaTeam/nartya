//! Pont JNI vers le cœur. Les fonctions natives sont appelées depuis un fil Java : elles
//! bloquent le temps de l'opération, l'appelant ne doit pas être le fil principal.
//!
//! Classe Java correspondante : `com.nartya.app.core.NartyaCore`.

use std::{
    path::Path,
    sync::{Arc, OnceLock},
};

use jni::{
    objects::{JClass, JString},
    sys::jstring,
    JNIEnv,
};
use nartya_core::stream::{self, Parts, ResolveRequest, StreamService};
use serde_json::{json, Value};

pub struct Core {
    pub runtime: tokio::runtime::Runtime,
    pub parts: Parts,
    pub service: Option<Arc<StreamService>>,
}

static CORE: OnceLock<Core> = OnceLock::new();

/// Démarre le cœur une seule fois (proxy local sur le loopback) et renvoie son adresse.
pub fn start(data_dir: &Path) -> &'static Core {
    CORE.get_or_init(|| {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("runtime Tokio");
        let root = std::sync::Arc::new(std::sync::RwLock::new(data_dir.join("downloads")));
        let (parts, service) = runtime.block_on(stream::start(root));
        Core {
            runtime,
            parts,
            service,
        }
    })
}

pub fn start_json(data_dir: &Path) -> Value {
    let core = start(data_dir);
    match &core.service {
        Some(s) => json!({ "success": true, "port": s.proxy.port(), "token": s.proxy.token() }),
        None => json!({ "success": false, "error": "Proxy local indisponible" }),
    }
}

pub fn resolve_json(request: &str, access_token: Option<String>) -> Value {
    let Some(core) = CORE.get() else {
        return json!({ "success": false, "error": "Cœur non démarré" });
    };
    let Some(service) = core.service.clone() else {
        return json!({ "success": false, "error": "Proxy local indisponible" });
    };
    let request: ResolveRequest = serde_json::from_str(request).unwrap_or_default();
    core.runtime
        .block_on(async move { service.resolve(request, access_token).await })
}

fn read(env: &mut JNIEnv, s: &JString) -> Option<String> {
    env.get_string(s).ok().map(Into::into)
}

fn reply(env: &mut JNIEnv, value: Value) -> jstring {
    env.new_string(value.to_string())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[no_mangle]
pub extern "system" fn Java_com_nartya_app_core_NartyaCore_nativeStart(
    mut env: JNIEnv,
    _class: JClass,
    data_dir: JString,
) -> jstring {
    let value = match read(&mut env, &data_dir) {
        Some(dir) => start_json(Path::new(&dir)),
        None => json!({ "success": false, "error": "Dossier de données invalide" }),
    };
    reply(&mut env, value)
}

#[no_mangle]
pub extern "system" fn Java_com_nartya_app_core_NartyaCore_nativeResolve(
    mut env: JNIEnv,
    _class: JClass,
    request: JString,
    access_token: JString,
) -> jstring {
    let request = read(&mut env, &request).unwrap_or_default();
    let token = read(&mut env, &access_token).filter(|t| !t.is_empty());
    let value = resolve_json(&request, token);
    reply(&mut env, value)
}
