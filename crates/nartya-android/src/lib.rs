//! Pont JNI vers le cœur. Les fonctions natives sont appelées depuis un fil Java : elles
//! bloquent le temps de l'opération, l'appelant ne doit pas être le fil principal.
//!
//! Classe Java correspondante : `android/app/src/main/java/com/nartya/app/core/NartyaCore.java`.

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

use jni::{
    objects::{GlobalRef, JClass, JObject, JString, JValue},
    sys::jstring,
    JNIEnv, JavaVM,
};
use nartya_core::{
    downloads::{self, Downloads},
    host::{BoxFuture, MoveChoice, MovePrompt},
    party::Party,
    stream::{self, Parts, ResolveRequest, StreamService},
    Host,
};
use serde_json::{json, Value};

pub struct Core {
    pub runtime: tokio::runtime::Runtime,
    pub parts: Parts,
    pub service: Option<Arc<StreamService>>,
    pub downloads: Arc<Downloads>,
    pub host: Arc<dyn Host>,
    /// Moteur de watch party, démarré à la première entrée de la page.
    pub party: Mutex<Option<Party>>,
}

static CORE: OnceLock<Core> = OnceLock::new();

/// Hôte sans page ni fenêtre : sondes et tests.
pub struct NoopHost;

impl Host for NoopHost {
    fn emit(&self, _event: &str, _payload: Value) {}
    fn open_path(&self, _path: &Path) -> Result<(), String> {
        Err("Indisponible sur Android".into())
    }
    fn pick_folder(&self, _title: &str, _start: &Path) -> BoxFuture<'static, Option<PathBuf>> {
        Box::pin(async { None })
    }
    fn ask_move_downloads(&self, _prompt: MovePrompt) -> BoxFuture<'static, MoveChoice> {
        Box::pin(async { MoveChoice::Cancel })
    }
}

/// Événements du cœur remontés à Java (`NartyaCore.Listener.onEvent`).
struct JniHost {
    vm: JavaVM,
    listener: GlobalRef,
}

impl Host for JniHost {
    fn emit(&self, event: &str, payload: Value) {
        // Les fils Tokio restent rattachés à la JVM une fois pour toutes.
        let Ok(mut env) = self.vm.attach_current_thread_permanently() else {
            return;
        };
        let (Ok(event), Ok(payload)) = (env.new_string(event), env.new_string(payload.to_string()))
        else {
            return;
        };
        let result = env.call_method(
            &self.listener,
            "onEvent",
            "(Ljava/lang/String;Ljava/lang/String;)V",
            &[JValue::Object(&event), JValue::Object(&payload)],
        );
        if result.is_err() {
            let _ = env.exception_clear();
        }
    }
    fn open_path(&self, _path: &Path) -> Result<(), String> {
        Err("Indisponible sur Android".into())
    }
    fn pick_folder(&self, _title: &str, _start: &Path) -> BoxFuture<'static, Option<PathBuf>> {
        Box::pin(async { None })
    }
    fn ask_move_downloads(&self, _prompt: MovePrompt) -> BoxFuture<'static, MoveChoice> {
        Box::pin(async { MoveChoice::Cancel })
    }
}

pub fn start(data_dir: &Path) -> &'static Core {
    start_with_host(data_dir, Arc::new(NoopHost))
}

/// Démarre le cœur une seule fois : proxy local sur le loopback et téléchargements.
pub fn start_with_host(data_dir: &Path, host: Arc<dyn Host>) -> &'static Core {
    CORE.get_or_init(|| {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("runtime Tokio");
        let imported = downloads::legacy::import_android_index(data_dir);
        if imported > 0 {
            println!("[downloads] {imported} entrée(s) reprise(s) de l'ancien index Android");
        }
        let (doc, default_root, root) = downloads::open_root(data_dir);
        let (parts, service) = runtime.block_on(stream::start(root.clone()));
        let downloads = runtime.block_on(async {
            Downloads::new(
                host.clone(),
                downloads::Init {
                    data_dir: data_dir.to_path_buf(),
                    doc,
                    default_root,
                    root,
                    net: parts.net.clone(),
                    recipe: parts.recipe.clone(),
                    handles: parts.handles.clone(),
                },
            )
        });
        Core {
            runtime,
            parts,
            service,
            downloads,
            host,
            party: Mutex::new(None),
        }
    })
}

pub fn start_json(data_dir: &Path) -> Value {
    start_info(start(data_dir))
}

fn start_info(core: &Core) -> Value {
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

/// Commandes de téléchargement, mêmes noms et mêmes arguments que les commandes Tauri.
pub fn call(command: &str, args: &str) -> Value {
    let Some(core) = CORE.get() else {
        return json!({ "success": false, "error": "Cœur non démarré" });
    };
    let args: Value = serde_json::from_str(args).unwrap_or(Value::Null);
    let id = args["id"].as_str().unwrap_or("").to_string();
    let downloads = core.downloads.clone();
    match command {
        "downloads_list" => downloads.list(),
        "downloads_start" => core.runtime.block_on(downloads.start(args)),
        "downloads_cancel" => core
            .runtime
            .block_on(async move { downloads.cancel(&id).await }),
        "downloads_cancel_season" => core.runtime.block_on(downloads.cancel_season(args)),
        "downloads_remove" => core
            .runtime
            .block_on(async move { downloads.remove(&id).await }),
        "downloads_set_max_concurrent" => {
            let _guard = core.runtime.enter();
            downloads.set_max_concurrent(args["n"].as_f64().unwrap_or(1.0));
            json!({ "success": true })
        }
        "downloads_remux_target" => downloads.remux_target(&id),
        "downloads_remux_done" => core
            .runtime
            .block_on(async move { downloads.finish_remux(&id).await }),
        "downloads_local_url" => {
            let rel = args["rel"].as_str().unwrap_or("video.mp4");
            let url = core
                .service
                .as_ref()
                .and_then(|s| s.proxy.local_url(&id, rel));
            json!({ "url": url })
        }
        "party_input" => {
            let Ok(mut party) = core.party.lock() else {
                return json!({ "success": false, "error": "Moteur indisponible" });
            };
            let party = party.get_or_insert_with(|| {
                let _guard = core.runtime.enter();
                Party::start(core.host.clone())
            });
            match party.input_json(args) {
                Ok(()) => json!({ "success": true }),
                Err(error) => json!({ "success": false, "error": error }),
            }
        }
        _ => json!({ "success": false, "error": "Commande inconnue" }),
    }
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
    listener: JObject,
) -> jstring {
    let value = match read(&mut env, &data_dir) {
        Some(dir) => {
            let host: Arc<dyn Host> = match (env.get_java_vm(), env.new_global_ref(&listener)) {
                (Ok(vm), Ok(listener)) => Arc::new(JniHost { vm, listener }),
                _ => Arc::new(NoopHost),
            };
            start_info(start_with_host(Path::new(&dir), host))
        }
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

#[no_mangle]
pub extern "system" fn Java_com_nartya_app_core_NartyaCore_nativeCall(
    mut env: JNIEnv,
    _class: JClass,
    command: JString,
    args: JString,
) -> jstring {
    let command = read(&mut env, &command).unwrap_or_default();
    let args = read(&mut env, &args).unwrap_or_default();
    let value = call(&command, &args);
    reply(&mut env, value)
}
