use serde_json::{json, Value};

use super::*;

const T0: u64 = 1_000_000;

fn me(id: &str) -> Me {
    Me {
        client_id: id.into(),
        user_id: Some(format!("u-{id}")),
        username: id.into(),
        avatar: None,
        premium: None,
    }
}

fn member(id: &str, joined: u64, claim: bool, premium: Option<&str>) -> Member {
    Member {
        client_id: id.into(),
        user_id: None,
        username: id.into(),
        avatar: None,
        premium: premium.map(String::from),
        joined_at: joined,
        is_host_claim: claim,
    }
}

fn desc(ep: u32) -> Value {
    json!({ "id": format!("a:1:{ep}:vostfr"), "slug": "a", "season": 1, "ep": ep, "lang": "vostfr", "title": "A" })
}

fn mid(ep: u32) -> Option<String> {
    Some(format!("a:1:{ep}:vostfr"))
}

fn sends(out: &Output, event: &str) -> Vec<Value> {
    out.effects
        .iter()
        .filter_map(|e| match e {
            Effect::Send { event: ev, payload } if ev == event => Some(payload.clone()),
            _ => None,
        })
        .collect()
}

/// Sans les pings d'horloge, qui rythment un participant en arrière-plan.
fn quiet(out: &Output) -> Vec<&Effect> {
    out.effects
        .iter()
        .filter(|e| !matches!(e, Effect::Send { event, .. } if event == "clock_ping"))
        .collect()
}

fn has(out: &Output, f: impl Fn(&Effect) -> bool) -> bool {
    out.effects.iter().any(f)
}

fn rpcs(out: &Output, name: &str) -> Vec<(u64, Value)> {
    out.effects
        .iter()
        .filter_map(|e| match e {
            Effect::Rpc { id, name: n, args } if n == name => Some((*id, args.clone())),
            _ => None,
        })
        .collect()
}

fn open(e: &mut Engine, now: u64, code: &str, intent: Intent, id: &str, seed: Option<Value>) -> Output {
    e.handle(now, Input::Open { code: code.into(), intent, me: me(id), seed, is_public: false })
}

fn subscribed(e: &mut Engine, now: u64) -> Output {
    e.handle(now, Input::Transport { status: TransportStatus::Subscribed })
}

fn presence(e: &mut Engine, now: u64, members: Vec<Member>) -> Output {
    e.handle(now, Input::Presence { members })
}

/// Hôte seul dans un salon avec un épisode en cours, extraction terminée.
fn host_room() -> Engine {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Create, "h", Some(desc(1)));
    subscribed(&mut e, T0 + 10);
    presence(&mut e, T0 + 20, vec![member("h", T0, true, None)]);
    e
}

/// Participant arrivé dans un salon dont `h` est l'hôte.
fn guest_room() -> Engine {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g", None);
    subscribed(&mut e, T0 + 10);
    presence(
        &mut e,
        T0 + 20,
        vec![member("h", T0 - 5000, true, None), member("g", T0, false, None)],
    );
    e
}

/// Arrivé sur un code que personne n'occupe.
fn alone_guest() -> Engine {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g", None);
    subscribed(&mut e, T0 + 10);
    e
}

fn guest_with_episode() -> Engine {
    let mut e = guest_room();
    e.handle(T0 + 30, Input::Message { event: "current".into(), payload: desc(1) });
    e.handle(
        T0 + 40,
        Input::Message { event: "source_pin".into(), payload: json!({ "mediaId": "a:1:1:vostfr", "sourceKey": "voe" }) },
    );
    e.handle(T0 + 50, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: Some("voe".into()) });
    e.handle(
        T0 + 60,
        Input::PlayerTick { media_id: mid(1), position: 0.0, duration: 1400.0, paused: true },
    );
    e
}

#[test]
fn creation_ouvre_le_canal_puis_publie_l_etat() {
    let mut e = Engine::new();
    let out = open(&mut e, T0, "AB12CD", Intent::Create, "h", Some(desc(1)));
    assert!(has(&out, |f| matches!(f, Effect::Subscribe { channel } if channel == "wp:AB12CD")));
    assert_eq!(out.state.clone().unwrap().phase, Phase::Connecting);

    let out = subscribed(&mut e, T0 + 10);
    assert!(has(&out, |f| matches!(f, Effect::Track { meta } if meta["isHostClaim"] == true)));
    assert_eq!(sends(&out, "current").len(), 1);
    assert_eq!(sends(&out, "queue")[0]["queue"].as_array().unwrap().len(), 1);
    assert_eq!(sends(&out, "options").len(), 1);
    assert_eq!(rpcs(&out, "save_state").len(), 1);
    assert_eq!(out.state.clone().unwrap().phase, Phase::InRoom);
}

#[test]
fn delai_de_souscription_depasse() {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g", None);
    assert!(e.poll(T0 + 9_000).state.is_none());
    let out = e.poll(T0 + 10_001);
    let s = out.state.clone().unwrap();
    assert_eq!(s.phase, Phase::Lost);
    assert!(s.error.is_some());
    assert!(has(&out, |f| matches!(f, Effect::Unsubscribe)));
}

#[test]
fn salon_introuvable_apres_sonde() {
    let mut e = alone_guest();
    // Seul dans le salon : la présence ne contient plus que nous.
    // Seul dans le salon : la présence ne contient plus que nous, on est promu hôte.
    let out = presence(&mut e, T0 + 100, vec![member("g", T0, false, None)]);
    let (restore, _) = rpcs(&out, "get_state").remove(0);
    // Rien en base : un code tapé de travers ne crée pas de salon.
    let out = e.handle(T0 + 150, Input::RpcResult { id: restore, ok: true, data: None });
    assert!(rpcs(&out, "save_state").is_empty());
    let out = e.poll(T0 + 10 + 2_500);
    let (id, _) = rpcs(&out, "get_state").remove(0);
    let out = e.handle(T0 + 2_600, Input::RpcResult { id, ok: true, data: None });
    assert_eq!(out.state.clone().unwrap().phase, Phase::NotFound);
    assert!(has(&out, |f| matches!(f, Effect::Unsubscribe)));
}

#[test]
fn sonde_satisfaite_par_un_etat_persiste() {
    let mut e = alone_guest();
    presence(&mut e, T0 + 100, vec![member("g", T0, false, None)]);
    let out = e.poll(T0 + 2_510);
    let (id, _) = rpcs(&out, "get_state").remove(0);
    let out = e.handle(T0 + 2_600, Input::RpcResult { id, ok: true, data: Some(json!({ "current": null })) });
    assert!(!has(&out, |f| matches!(f, Effect::Unsubscribe)));
    assert!(out.state.is_none() || out.state.clone().unwrap().phase == Phase::InRoom);
}

#[test]
fn horloge_decalage_estime_sur_le_plus_faible_aller_retour() {
    let mut e = guest_room();
    // L'hôte a 500 ms d'avance. Trois échantillons : RTT 200, 40, 120 (le meilleur gagne).
    for (i, rtt) in [200u64, 40, 120].into_iter().enumerate() {
        let t0 = T0 + 1000 * (i as u64 + 1);
        let t1 = t0 + rtt / 2 + 500;
        e.handle(
            t0 + rtt,
            Input::Message {
                event: "clock_pong".into(),
                payload: json!({ "clientId": "g", "t0": t0, "t1": t1 }),
            },
        );
    }
    // Hôte à 100 s, en lecture, envoyé à `sent_at` (heure d'hôte).
    let now = T0 + 5_000;
    e.handle(T0 + 60, Input::Message { event: "current".into(), payload: desc(1) });
    e.handle(T0 + 70, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: None });
    e.handle(T0 + 80, Input::PlayerTick { media_id: mid(1), position: 0.0, duration: 1400.0, paused: true });
    let out = e.handle(
        now,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 100.0, "isPlaying": true, "sentAt": now + 500, "seq": 1 }),
        },
    );
    // Heure d'hôte maintenant = now + 500 : aucun temps écoulé, cible = 100 s.
    let seek = out.effects.iter().find_map(|f| match f {
        Effect::PlayerSeek { position } => Some(*position),
        _ => None,
    });
    let seek = seek.expect("seek attendu");
    assert!((seek - 100.0).abs() < 0.05, "cible {seek}");
}

#[test]
fn derive_forte_saute_derive_faible_ajuste_la_vitesse() {
    let mut e = guest_with_episode();
    let t = T0 + 1_000;
    let out = e.handle(
        t,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 50.0, "isPlaying": true, "sentAt": t, "seq": 1 }),
        },
    );
    assert!(has(&out, |f| matches!(f, Effect::PlayerSeek { position } if (*position - 50.0).abs() < 0.01)));
    assert!(has(&out, |f| matches!(f, Effect::PlayerPlay)));

    // Pas de second saut immédiat tant que le lecteur n'a pas répondu.
    let out = e.handle(
        t + 400,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 50.4, "isPlaying": true, "sentAt": t + 400, "seq": 2 }),
        },
    );
    assert!(!has(&out, |f| matches!(f, Effect::PlayerSeek { .. })));

    // Le lecteur joue à 50,4 s, l'hôte est 0,6 s plus loin : on accélère sans sauter.
    e.handle(t + 400, Input::PlayerTick { media_id: mid(1), position: 50.4, duration: 1400.0, paused: false });
    let out = e.handle(
        t + 1_000,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 51.6, "isPlaying": true, "sentAt": t + 1_000, "seq": 3 }),
        },
    );
    assert!(!has(&out, |f| matches!(f, Effect::PlayerSeek { .. })));
    assert!(has(&out, |f| matches!(f, Effect::PlayerRate { rate } if *rate > 1.0)));

    // Revenu dans la tolérance : vitesse normale.
    e.handle(
        t + 1_000,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 51.6, "isPlaying": true, "sentAt": t + 1_000, "seq": 4 }),
        },
    );
    let out = e.handle(t + 1_000, Input::PlayerTick { media_id: mid(1), position: 51.5, duration: 1400.0, paused: false });
    assert!(has(&out, |f| matches!(f, Effect::PlayerRate { rate } if (*rate - 1.0).abs() < f64::EPSILON)));
}

#[test]
fn message_perime_ou_d_une_ancienne_epoque_ignore() {
    let mut e = guest_with_episode();
    let t = T0 + 1_000;
    e.handle(
        t,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 10.0, "isPlaying": true, "sentAt": t, "seq": 5, "epoch": 3 }),
        },
    );
    // Numéro plus ancien : rien.
    let out = e.handle(
        t + 2_000,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 500.0, "isPlaying": true, "sentAt": t + 2_000, "seq": 4, "epoch": 3 }),
        },
    );
    assert!(quiet(&out).is_empty());
    // Ancienne époque d'hôte : rien non plus.
    let out = e.handle(
        t + 3_000,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 500.0, "isPlaying": true, "sentAt": t + 3_000, "seq": 99, "epoch": 2 }),
        },
    );
    assert!(quiet(&out).is_empty());
}

#[test]
fn participant_attend_l_hebergeur_de_l_hote_puis_repart_seul() {
    let mut e = guest_room();
    let out = e.handle(T0 + 30, Input::Message { event: "current".into(), payload: desc(1) });
    assert!(!has(&out, |f| matches!(f, Effect::PlayerLoad { .. })));
    assert_eq!(sends(&out, "source_loading").len(), 1);

    // Le pin arrive dans la fenêtre : extraction avec ce même hébergeur.
    let out = e.handle(
        T0 + 500,
        Input::Message { event: "source_pin".into(), payload: json!({ "mediaId": "a:1:1:vostfr", "sourceKey": "voe" }) },
    );
    assert!(has(&out, |f| matches!(f,
        Effect::PlayerLoad { pinned_source: Some(k), .. } if k == "voe")));

    // Sans pin, au bout de 4 s : extraction autonome.
    let mut e = guest_room();
    e.handle(T0 + 30, Input::Message { event: "current".into(), payload: desc(2) });
    assert!(!has(&e.poll(T0 + 4_020), |f| matches!(f, Effect::PlayerLoad { .. })));
    let out = e.poll(T0 + 4_031);
    assert!(has(&out, |f| matches!(f, Effect::PlayerLoad { pinned_source: None, .. })));
}

#[test]
fn le_pin_d_un_autre_episode_est_ignore() {
    let mut e = guest_room();
    e.handle(T0 + 30, Input::Message { event: "current".into(), payload: desc(2) });
    let out = e.handle(
        T0 + 40,
        Input::Message { event: "source_pin".into(), payload: json!({ "mediaId": "a:1:1:vostfr", "sourceKey": "stape" }) },
    );
    assert!(!has(&out, |f| matches!(f, Effect::PlayerLoad { .. })));
}

#[test]
fn hote_attend_un_participant_qui_charge_puis_reprend() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    e.handle(T0 + 40, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: Some("voe".into()) });
    e.handle(T0 + 45, Input::PlayerTick { media_id: mid(1), position: 0.0, duration: 1400.0, paused: true });

    // Lancement d'un nouvel épisode : tout le monde repasse en chargement.
    let out = e.handle(T0 + 100, Input::SetCurrent { descriptor: Some(desc(2)) });
    let s = out.state.clone().unwrap();
    assert!(s.waiting.active);
    assert!(has(&out, |f| matches!(f, Effect::PlayerPause)));
    assert!(has(&out, |f| matches!(f, Effect::PlayerLoad { media_id, pinned_source: None } if *media_id == mid(2))));
    assert_eq!(sends(&out, "current").len(), 1);

    // L'hôte est prêt, le participant non : toujours en attente.
    let out = e.handle(T0 + 200, Input::Source { media_id: mid(2), status: SourceStatus::Ready, source_key: None });
    assert!(!has(&out, |f| matches!(f, Effect::PlayerPlay)));
    let s = out.state.clone().unwrap();
    assert_eq!(s.waiting.for_clients, vec!["g".to_string()]);

    // Le participant est prêt : reprise annoncée.
    let out = e.handle(
        T0 + 300,
        Input::Message {
            event: "source_ready".into(),
            payload: json!({ "clientId": "g", "mediaId": "a:1:2:vostfr" }),
        },
    );
    assert!(has(&out, |f| matches!(f, Effect::PlayerPlay)));
    assert!(!out.state.clone().unwrap().waiting.active);
    let pb = sends(&out, "playback");
    assert_eq!(pb[0]["isPlaying"], true);
}

#[test]
fn statut_d_un_ancien_episode_ne_debloque_pas() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    e.handle(T0 + 100, Input::SetCurrent { descriptor: Some(desc(2)) });
    e.handle(T0 + 200, Input::Source { media_id: mid(2), status: SourceStatus::Ready, source_key: None });
    let out = e.handle(
        T0 + 300,
        Input::Message { event: "source_ready".into(), payload: json!({ "clientId": "g", "mediaId": "a:1:1:vostfr" }) },
    );
    assert!(out.state.clone().map(|s| s.waiting.active).unwrap_or(true));
    assert!(!has(&out, |f| matches!(f, Effect::PlayerPlay)));
}

#[test]
fn attente_levee_au_delai_avec_message() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    e.handle(T0 + 100, Input::SetCurrent { descriptor: Some(desc(2)) });
    e.handle(T0 + 200, Input::Source { media_id: mid(2), status: SourceStatus::Ready, source_key: None });
    assert!(e.poll(T0 + 29_000).state.is_none());
    let out = e.poll(T0 + 30_101);
    assert!(has(&out, |f| matches!(f, Effect::PlayerPlay)));
    assert!(has(&out, |f| matches!(f, Effect::Chat { message } if message["type"] == "system")));
}

#[test]
fn participant_qui_part_ne_bloque_plus() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    e.handle(T0 + 100, Input::SetCurrent { descriptor: Some(desc(2)) });
    e.handle(T0 + 200, Input::Source { media_id: mid(2), status: SourceStatus::Ready, source_key: None });
    let out = presence(&mut e, T0 + 400, vec![member("h", T0, true, None)]);
    assert!(has(&out, |f| matches!(f, Effect::PlayerPlay)));
}

#[test]
fn decrochage_bref_ignore_long_signale_et_hote_attend() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    e.handle(T0 + 40, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: None });
    e.handle(T0 + 41, Input::Message { event: "source_ready".into(), payload: json!({ "clientId": "g", "mediaId": "a:1:1:vostfr" }) });
    e.handle(T0 + 45, Input::PlayerTick { media_id: mid(1), position: 10.0, duration: 1400.0, paused: false });

    // Bref : arrêt du tampon avant le délai de grâce.
    e.handle(T0 + 1_000, Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Stall, position: 10.0 });
    let out = e.handle(T0 + 1_500, Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::StallEnd, position: 10.0 });
    assert!(sends(&out, "source_stall").is_empty());

    // Un participant décroche : l'hôte met en pause.
    let out = e.handle(
        T0 + 3_000,
        Input::Message { event: "source_stall".into(), payload: json!({ "clientId": "g", "mediaId": "a:1:1:vostfr" }) },
    );
    assert!(has(&out, |f| matches!(f, Effect::PlayerPause)));
    assert!(out.state.clone().unwrap().waiting.active);

    // Un second décrochage dans le refroidissement ne relance pas d'attente.
    e.handle(T0 + 3_100, Input::Message { event: "source_ready".into(), payload: json!({ "clientId": "g", "mediaId": "a:1:1:vostfr" }) });
    e.handle(T0 + 3_200, Input::PlayerTick { media_id: mid(1), position: 10.0, duration: 1400.0, paused: false });
    let out = e.handle(
        T0 + 5_000,
        Input::Message { event: "source_stall".into(), payload: json!({ "clientId": "g", "mediaId": "a:1:1:vostfr" }) },
    );
    assert!(!has(&out, |f| matches!(f, Effect::PlayerPause)));
}

#[test]
fn decrochage_long_local_est_diffuse() {
    let mut e = guest_with_episode();
    e.handle(T0 + 100, Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Stall, position: 1.0 });
    let out = e.poll(T0 + 100 + 1_200);
    assert_eq!(sends(&out, "source_stall").len(), 1);
    let out = e.handle(T0 + 3_000, Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::StallEnd, position: 1.0 });
    assert_eq!(sends(&out, "source_ready").len(), 1);
}

#[test]
fn arrivee_en_cours_de_lecture_met_en_attente() {
    let mut e = host_room();
    e.handle(T0 + 40, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: None });
    e.handle(T0 + 45, Input::PlayerTick { media_id: mid(1), position: 30.0, duration: 1400.0, paused: false });
    let out = presence(&mut e, T0 + 100, vec![member("h", T0, true, None), member("g", T0 + 90, false, None)]);
    assert!(has(&out, |f| matches!(f, Effect::PlayerPause)));
    assert!(has(&out, |f| matches!(f, Effect::Chat { message } if message["text"].as_str().unwrap().contains("rejoint"))));
}

#[test]
fn election_du_plus_ancien_et_releve_sans_retour_en_arriere() {
    let mut e = guest_with_episode();
    // Un état a été reçu de l'hôte : le participant le détient déjà.
    e.handle(T0 + 100, Input::Message { event: "queue".into(), payload: json!({ "queue": [desc(1), desc(2)] }) });
    e.handle(
        T0 + 1_000,
        Input::Message {
            event: "playback".into(),
            payload: json!({ "currentTime": 120.0, "isPlaying": true, "sentAt": T0 + 1_000, "seq": 9, "epoch": 1 }),
        },
    );
    e.handle(T0 + 1_001, Input::PlayerTick { media_id: mid(1), position: 120.0, duration: 1400.0, paused: false });

    // L'hôte part : le participant devient hôte sans relire la base.
    let out = presence(&mut e, T0 + 3_000, vec![member("g", T0, false, None)]);
    let s = out.state.clone().unwrap();
    assert_eq!(s.role, "host");
    assert!(rpcs(&out, "get_state").is_empty());
    assert!(has(&out, |f| matches!(f, Effect::Track { meta } if meta["isHostClaim"] == true)));
    let cur = sends(&out, "current");
    assert_eq!(cur[0]["epoch"], 2);
    assert_eq!(sends(&out, "queue")[0]["queue"].as_array().unwrap().len(), 2);
    let pb = sends(&out, "playback");
    assert!(pb[0]["currentTime"].as_f64().unwrap() >= 120.0);
}

#[test]
fn releve_sans_etat_relit_la_base() {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g", None);
    subscribed(&mut e, T0 + 10);
    let out = presence(&mut e, T0 + 20, vec![member("g", T0, false, None)]);
    let (id, _) = rpcs(&out, "get_state").remove(0);
    let row = json!({
        "current": desc(3), "queue": [desc(3)], "playback": { "currentTime": 42.0, "isPlaying": false },
        "options": { "waitOnJoin": false }
    });
    let out = e.handle(T0 + 100, Input::RpcResult { id, ok: true, data: Some(row) });
    let s = out.state.clone().unwrap();
    assert_eq!(s.current.unwrap()["ep"], 3);
    assert!(!s.options.wait_on_join);
    assert_eq!(sends(&out, "playback")[0]["currentTime"], 42.0);
}

#[test]
fn capacite_gratuite_evince_le_sixieme() {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g6", None);
    subscribed(&mut e, T0 + 10);
    let mut members = vec![member("h", T0 - 9_000, true, None)];
    for i in 1..=5 {
        members.push(member(&format!("g{i}"), T0 - 1000 + i, false, None));
    }
    members.push(member("g6", T0, false, None));
    let out = presence(&mut e, T0 + 20, members);
    assert_eq!(out.state.clone().unwrap().phase, Phase::Full);
    assert!(has(&out, |f| matches!(f, Effect::Unsubscribe)));
}

#[test]
fn capacite_ultimate_illimitee() {
    let mut e = Engine::new();
    open(&mut e, T0, "AB12CD", Intent::Join, "g20", None);
    subscribed(&mut e, T0 + 10);
    let mut members = vec![member("h", T0 - 9_000, true, Some("ultimate"))];
    for i in 1..=19 {
        members.push(member(&format!("g{i}"), T0 - 1000 + i, false, None));
    }
    members.push(member("g20", T0, false, None));
    let out = presence(&mut e, T0 + 20, members);
    let s = out.state.clone().unwrap();
    assert_eq!(s.phase, Phase::InRoom);
    assert_eq!(s.capacity, None);
}

#[test]
fn un_participant_ne_peut_pas_piloter() {
    let mut e = guest_with_episode();
    let out = e.handle(T0 + 100, Input::SetCurrent { descriptor: Some(desc(9)) });
    assert!(quiet(&out).is_empty());
    let out = e.handle(T0 + 110, Input::SetOptions { patch: json!({ "isPublic": true }) });
    assert!(quiet(&out).is_empty());
    let out = e.handle(T0 + 120, Input::SetQueue { op: QueueOp::Add, item: Some(desc(5)), items: None });
    assert!(quiet(&out).is_empty());
}

#[test]
fn file_ajout_retrait_et_navigation() {
    let mut e = host_room();
    let out = e.handle(T0 + 100, Input::SetQueue { op: QueueOp::Add, item: Some(desc(2)), items: None });
    assert_eq!(sends(&out, "queue")[0]["queue"].as_array().unwrap().len(), 2);
    // Doublon ignoré.
    let out = e.handle(T0 + 110, Input::SetQueue { op: QueueOp::Add, item: Some(desc(2)), items: None });
    assert_eq!(sends(&out, "queue")[0]["queue"].as_array().unwrap().len(), 2);

    let out = e.handle(T0 + 200, Input::Next);
    assert_eq!(out.state.clone().unwrap().current.unwrap()["ep"], 2);
    // En bout de file : rien.
    let out = e.handle(T0 + 300, Input::Next);
    assert!(out.effects.is_empty());
    let out = e.handle(T0 + 400, Input::Prev);
    assert_eq!(out.state.clone().unwrap().current.unwrap()["ep"], 1);

    let out = e.handle(T0 + 500, Input::SetQueue { op: QueueOp::Remove, item: Some(desc(2)), items: None });
    assert_eq!(out.state.clone().unwrap().queue.len(), 1);
}

#[test]
fn fin_d_episode_enchaine_le_suivant() {
    let mut e = host_room();
    e.handle(T0 + 100, Input::SetQueue { op: QueueOp::Add, item: Some(desc(2)), items: None });
    let out = e.handle(T0 + 200, Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Ended, position: 1400.0 });
    assert_eq!(out.state.clone().unwrap().current.unwrap()["ep"], 2);
}

#[test]
fn changement_de_langue_previent_puis_change_l_identifiant() {
    let mut e = host_room();
    let out = e.handle(T0 + 100, Input::ChangeLang { lang: "vf".into() });
    assert_eq!(sends(&out, "lang_changing")[0]["toLang"], "vf");
    let cur = out.state.clone().unwrap().current.unwrap();
    assert_eq!(cur["id"], "a:1:1:vf");
    // Même langue : rien.
    let out = e.handle(T0 + 200, Input::ChangeLang { lang: "vf".into() });
    assert!(out.effects.is_empty());
}

#[test]
fn options_bornees_et_cles_inconnues_conservees() {
    let mut e = host_room();
    let out = e.handle(T0 + 100, Input::SetOptions { patch: json!({ "driftTolerance": 999, "app": "movie" }) });
    let s = out.state.clone().unwrap();
    assert_eq!(s.options.drift_tolerance, 10.0);
    assert_eq!(s.options.extra.get("app"), Some(&json!("movie")));
    let saved = &rpcs(&out, "save_state")[0].1;
    assert_eq!(saved["options"]["app"], "movie");

    let out = e.handle(T0 + 200, Input::SetOptions { patch: json!({ "driftTolerance": -4 }) });
    assert_eq!(out.state.clone().unwrap().options.drift_tolerance, 1.5);
}

#[test]
fn salon_public_publie_apres_la_premiere_sauvegarde() {
    let mut e = Engine::new();
    e.handle(
        T0,
        Input::Open { code: "AB12CD".into(), intent: Intent::Create, me: me("h"), seed: Some(desc(1)), is_public: true },
    );
    let out = subscribed(&mut e, T0 + 10);
    let (save_id, _) = rpcs(&out, "save_state").remove(0);
    let out = presence(&mut e, T0 + 20, vec![member("h", T0, true, None)]);
    assert!(rpcs(&out, "publish").is_empty());

    let out = e.handle(T0 + 100, Input::RpcResult { id: save_id, ok: true, data: None });
    let publish = rpcs(&out, "publish");
    assert_eq!(publish.len(), 1);
    assert_eq!(publish[0].1["public"], true);

    // Un nouvel arrivant fait remonter le compteur sans attendre le prochain battement.
    let out = presence(&mut e, T0 + 200, vec![member("h", T0, true, None), member("g", T0 + 150, false, None)]);
    assert_eq!(rpcs(&out, "publish")[0].1["participants"], 2);

    // Retour en privé : retrait de la liste, une seule fois.
    let out = e.handle(T0 + 300, Input::SetOptions { patch: json!({ "isPublic": false }) });
    assert_eq!(rpcs(&out, "publish")[0].1["public"], false);
    let out = e.poll(T0 + 400);
    assert!(rpcs(&out, "publish").is_empty());
}

#[test]
fn sauvegarde_limitee_sauf_changement_structurel() {
    let mut e = host_room();
    e.handle(T0 + 40, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: None });
    e.handle(T0 + 45, Input::PlayerTick { media_id: mid(1), position: 5.0, duration: 1400.0, paused: false });
    // Premier battement : pas de nouvelle sauvegarde si la précédente est récente.
    let out = e.poll(T0 + 2_000);
    assert!(rpcs(&out, "save_state").is_empty());
    assert_eq!(sends(&out, "playback").len(), 1);
    // Au-delà de la période : sauvegarde.
    let out = e.poll(T0 + 12_000);
    assert_eq!(rpcs(&out, "save_state").len(), 1);
    // Changement structurel : tout de suite.
    let out = e.handle(T0 + 12_100, Input::SetQueue { op: QueueOp::Add, item: Some(desc(2)), items: None });
    assert_eq!(rpcs(&out, "save_state").len(), 1);
}

#[test]
fn dernier_present_efface_l_etat_en_quittant() {
    let mut e = host_room();
    let out = e.handle(T0 + 100, Input::Close);
    assert_eq!(rpcs(&out, "close").len(), 1);
    assert!(has(&out, |f| matches!(f, Effect::Unsubscribe)));
    assert_eq!(out.state.clone().unwrap().phase, Phase::Idle);
    assert!(e.next_deadline().is_none());
}

#[test]
fn quitter_a_plusieurs_ne_supprime_pas_le_salon() {
    let mut e = host_room();
    presence(&mut e, T0 + 30, vec![member("h", T0, true, None), member("g", T0 + 25, false, None)]);
    let out = e.handle(T0 + 100, Input::Close);
    assert!(rpcs(&out, "close").is_empty());
}

#[test]
fn chat_tronque_limite_et_non_vide() {
    let mut e = host_room();
    let out = e.handle(T0 + 10, Input::Chat { text: "   ".into() });
    assert!(out.effects.is_empty());
    let long = "é".repeat(900);
    let out = e.handle(T0 + 20, Input::Chat { text: long });
    let sent = sends(&out, "chat");
    assert_eq!(sent[0]["text"].as_str().unwrap().chars().count(), 500);
    assert!(has(&out, |f| matches!(f, Effect::Chat { .. })));

    // Au-delà de la rafale : refusé.
    let mut refused = false;
    for i in 0..12 {
        let out = e.handle(T0 + 30 + i, Input::Chat { text: "x".into() });
        if out.effects.is_empty() {
            refused = true;
        }
    }
    assert!(refused);
}

#[test]
fn chat_recu_tronque_et_flood_limite() {
    let mut e = guest_room();
    let out = e.handle(
        T0 + 30,
        Input::Message { event: "chat".into(), payload: json!({ "clientId": "h", "text": "a".repeat(2000), "username": "h" }) },
    );
    assert!(has(&out, |f| matches!(f, Effect::Chat { message } if message["text"].as_str().unwrap().len() == 500)));
    let mut shown = 0;
    for i in 0..30 {
        let out = e.handle(
            T0 + 40 + i,
            Input::Message { event: "chat".into(), payload: json!({ "clientId": "h", "text": "spam" }) },
        );
        if has(&out, |f| matches!(f, Effect::Chat { .. })) {
            shown += 1;
        }
    }
    assert!(shown < 30);
}

#[test]
fn reaction_emoji_borne() {
    let mut e = host_room();
    let out = e.handle(T0 + 10, Input::Reaction { emoji: "🔥".repeat(20) });
    let r = out.effects.iter().find_map(|f| match f {
        Effect::Reaction { reaction } => Some(reaction.clone()),
        _ => None,
    });
    assert_eq!(r.unwrap()["emoji"].as_str().unwrap().chars().count(), 8);
}

#[test]
fn statistiques_de_visionnage_une_fois_par_minute() {
    let mut e = host_room();
    e.handle(T0 + 40, Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: None });
    let tick = |e: &mut Engine, t: u64| {
        e.handle(t, Input::PlayerTick { media_id: mid(1), position: 20.0, duration: 1400.0, paused: false })
    };
    assert!(has(&tick(&mut e, T0 + 100_000), |f| matches!(f, Effect::Progress { .. })));
    assert!(!has(&tick(&mut e, T0 + 130_000), |f| matches!(f, Effect::Progress { .. })));
    assert!(has(&tick(&mut e, T0 + 161_000), |f| matches!(f, Effect::Progress { .. })));
}

#[test]
fn rafale_d_horloge_puis_cadence_lente() {
    let mut e = guest_room();
    let first = e.poll(T0 + 500);
    assert_eq!(sends(&first, "clock_ping").len(), 1);
    let next = e.next_deadline().unwrap();
    assert!(next - (T0 + 500) <= 500, "rafale attendue au début");
}

#[test]
fn le_contrat_json_se_deserialise_et_se_serialise() {
    let input: Input = serde_json::from_value(json!({
        "type": "player_tick", "mediaId": "x", "position": 1.5, "duration": 10.0, "paused": false
    }))
    .unwrap();
    assert!(matches!(input, Input::PlayerTick { .. }));

    let input: Input = serde_json::from_value(json!({
        "type": "open", "code": "AB12CD", "intent": "create",
        "me": { "clientId": "c", "username": "u" }, "isPublic": true
    }))
    .unwrap();
    assert!(matches!(input, Input::Open { is_public: true, .. }));

    let input: Input = serde_json::from_value(json!({ "type": "player_event", "mediaId": "x", "kind": "stall_end" })).unwrap();
    assert!(matches!(input, Input::PlayerEvent { kind: PlayerKind::StallEnd, .. }));

    let v = serde_json::to_value(Effect::PlayerLoad { media_id: Some("x".into()), pinned_source: None }).unwrap();
    assert_eq!(v, json!({ "type": "player_load", "mediaId": "x", "pinnedSource": null }));

    let mut e = host_room();
    let s = serde_json::to_value(e.poll(T0 + 50).state.unwrap_or_else(|| e.snapshot())).unwrap();
    assert_eq!(s["role"], "host");
    assert_eq!(s["phase"], "in_room");
    assert!(s["options"]["waitOnSourceLoad"].as_bool().unwrap());
    assert!(s.get("waiting").is_some());
}

#[test]
fn ancien_client_descripteur_nu_toujours_compris() {
    let mut e = guest_room();
    // Un hôte non migré envoie le descripteur sans enveloppe ni révision.
    let out = e.handle(T0 + 30, Input::Message { event: "current".into(), payload: desc(4) });
    assert_eq!(out.state.clone().unwrap().current.unwrap()["ep"], 4);
}

#[test]
fn trou_de_revision_demande_une_resynchronisation() {
    let mut e = guest_room();
    e.handle(T0 + 30, Input::Message { event: "queue".into(), payload: json!({ "queue": [], "rev": 3 }) });
    let out = e.handle(T0 + 40, Input::Message { event: "queue".into(), payload: json!({ "queue": [desc(1)], "rev": 6 }) });
    assert_eq!(sends(&out, "request_sync").len(), 1);
    // Une révision plus ancienne est ignorée.
    let out = e.handle(T0 + 50, Input::Message { event: "queue".into(), payload: json!({ "queue": [], "rev": 4 }) });
    assert!(out.state.is_none());
}

#[test]
fn heure_d_epoque_apres_perte_de_connexion_resynchronise() {
    let mut e = guest_room();
    let out = e.handle(T0 + 5_000, Input::Transport { status: TransportStatus::Subscribed });
    assert_eq!(sends(&out, "request_sync").len(), 1);
    assert!(has(&out, |f| matches!(f, Effect::Chat { message } if message["text"].as_str().unwrap().contains("rétablie"))));
}

#[test]
fn la_page_n_a_rien_a_faire_quand_tout_est_calme() {
    let mut e = guest_with_episode();
    assert!(quiet(&e.poll(T0 + 100)).is_empty());
}

// ---------- deux moteurs reliés par un faux transport ----------

struct Duo {
    host: Engine,
    guest: Engine,
    now: u64,
    host_fx: Vec<Effect>,
    guest_fx: Vec<Effect>,
}

impl Duo {
    fn new() -> Self {
        let mut d = Duo { host: Engine::new(), guest: Engine::new(), now: T0, host_fx: vec![], guest_fx: vec![] };
        let out = open(&mut d.host, T0, "AB12CD", Intent::Create, "h", Some(desc(1)));
        d.pump(true, out);
        let out = subscribed(&mut d.host, T0 + 10);
        d.pump(true, out);
        let out = open(&mut d.guest, T0 + 100, "AB12CD", Intent::Join, "g", None);
        d.pump(false, out);
        d.now = T0 + 110;
        let out = subscribed(&mut d.guest, d.now);
        d.pump(false, out);
        let members = vec![member("h", T0, true, None), member("g", T0 + 100, false, None)];
        let out = presence(&mut d.host, d.now, members.clone());
        d.pump(true, out);
        let out = presence(&mut d.guest, d.now, members);
        d.pump(false, out);
        d
    }

    /// Distribue les messages d'un moteur à l'autre ; garde les ordres pour la page.
    fn pump(&mut self, from_host: bool, out: Output) {
        let mut queue = vec![(from_host, out)];
        while let Some((is_host, out)) = queue.pop() {
            for fx in out.effects {
                if let Effect::Send { event, payload } = &fx {
                    let (to, to_host) = if is_host { (&mut self.guest, false) } else { (&mut self.host, true) };
                    let o = to.handle(self.now, Input::Message { event: event.clone(), payload: payload.clone() });
                    queue.push((to_host, o));
                }
                if is_host { self.host_fx.push(fx) } else { self.guest_fx.push(fx) }
            }
        }
    }

    fn host_in(&mut self, input: Input) {
        let out = self.host.handle(self.now, input);
        self.pump(true, out);
    }

    fn guest_in(&mut self, input: Input) {
        let out = self.guest.handle(self.now, input);
        self.pump(false, out);
    }

    fn advance(&mut self, ms: u64) {
        self.now += ms;
        let out = self.host.poll(self.now);
        self.pump(true, out);
        let out = self.guest.poll(self.now);
        self.pump(false, out);
    }

    fn take(fx: &mut Vec<Effect>) -> Vec<Effect> {
        std::mem::take(fx)
    }
}

#[test]
fn duo_les_deux_moteurs_se_synchronisent() {
    let mut d = Duo::new();

    // L'invité a reçu l'épisode ; sans hébergeur annoncé, il extrait seul au bout de 4 s.
    d.advance(4_100);
    assert!(d.guest_fx.iter().any(|f| matches!(f, Effect::PlayerLoad { .. })), "invité : pas de player_load");
    // Les deux voient deux participants et un seul hôte.
    let hs = d.host.snapshot();
    let gs = d.guest.snapshot();
    assert_eq!(hs.participants.len(), 2);
    assert_eq!(gs.participants.len(), 2);
    assert_eq!(hs.role, "host");
    assert_eq!(gs.role, "guest");

    // Extraction terminée des deux côtés : l'hôte reprend.
    d.host_in(Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: Some("voe".into()) });
    d.advance(50);
    d.guest_in(Input::Source { media_id: mid(1), status: SourceStatus::Ready, source_key: Some("voe".into()) });
    d.host_in(Input::PlayerTick { media_id: mid(1), position: 0.0, duration: 1400.0, paused: true });
    d.guest_in(Input::PlayerTick { media_id: mid(1), position: 0.0, duration: 1400.0, paused: true });
    Duo::take(&mut d.guest_fx);

    // L'hôte joue puis avance : l'invité doit jouer et se caler.
    d.host_in(Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Play, position: 0.0 });
    d.advance(1_000);
    d.host_in(Input::PlayerTick { media_id: mid(1), position: 1.0, duration: 1400.0, paused: false });
    assert!(d.guest_fx.iter().any(|f| matches!(f, Effect::PlayerPlay)), "invité : pas de play : {:?}", d.guest_fx);
    d.guest_in(Input::PlayerTick { media_id: mid(1), position: 1.0, duration: 1400.0, paused: false });
    Duo::take(&mut d.guest_fx);

    // L'hôte met en pause : l'invité aussi.
    d.advance(500);
    d.host_in(Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Pause, position: 1.5 });
    assert!(d.guest_fx.iter().any(|f| matches!(f, Effect::PlayerPause)), "invité : pas de pause : {:?}", d.guest_fx);
    Duo::take(&mut d.guest_fx);

    // L'hôte saute à 300 s : l'invité suit.
    d.guest_in(Input::PlayerTick { media_id: mid(1), position: 1.5, duration: 1400.0, paused: true });
    d.advance(2_000);
    d.host_in(Input::PlayerEvent { media_id: mid(1), kind: PlayerKind::Seek, position: 300.0 });
    assert!(
        d.guest_fx.iter().any(|f| matches!(f, Effect::PlayerSeek { position } if (*position - 300.0).abs() < 1.0)),
        "invité : pas de seek : {:?}",
        d.guest_fx
    );
}
