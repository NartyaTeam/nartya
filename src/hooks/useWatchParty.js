import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/useAuthStore";
import { premiumTier, partyCapacityForTier } from "@/lib/premium";
import { generatePartyCode, normalizePartyCode, isValidPartyCode } from "@/utils/partyCode";
import { savePartyRoomState, getPartyRoomState, closePartyRoom } from "@/api/partyRoom";
import { resolveAvatar } from "@/api/profile";

/**
 * Supabase Realtime (Broadcast + Presence). L'URL vidéo n'est jamais partagée : chaque client
 * extrait la sienne, seul l'hôte émet l'état. Chaque événement lié à l'épisode porte un
 * `mediaId`, pour qu'un `source_ready` de l'épisode précédent ne compte pas.
 */
const CHANNEL_PREFIX = "wp:";
const MAX_CHAT = 200;
const DEDUP_MS = 250;
const DEDUP_TIME = 0.25;
// Plus lâche que le battement de lecture.
const PERSIST_THROTTLE_MS = 10000;
// Pour estimer le décalage entre machines.
const CLOCK_PING_MS = 8000;
// Au-delà, `subscribe()` rend la main plutôt qu'un spinner éternel.
const SUBSCRIBE_TIMEOUT_MS = 10000;
// Au-delà, on repart sans les participants dont l'extraction n'aboutit pas.
const WAIT_SOURCES_TIMEOUT_MS = 30000;
// Entre deux pauses provoquées par un décrochage.
const BUFFER_WAIT_COOLDOWN_MS = 20000;
// Avant de conclure qu'un code ne correspond à aucun salon.
const JOIN_PROBE_MS = 2500;

export const DEFAULT_OPTIONS = {
  waitOnSourceLoad: true, // attendre que tous aient chargé l'épisode
  waitOnJoin: true, // attendre un participant qui rejoint en cours de séance
  waitOnBuffer: true, // attendre un participant dont le flux décroche
  driftTolerance: 1.5, // secondes de dérive acceptées
};

export function useWatchParty() {
  const profile = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;

  const [inRoom, setInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [code, setCode] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [chat, setChat] = useState([]);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [current, applyCurrent] = useState(null);
  const [queue, applyQueue] = useState([]);
  const [remoteState, setRemoteState] = useState(null);
  const [options, applyOptions] = useState(DEFAULT_OPTIONS);
  // Par clientId : 'loading' | 'ready' | 'error'.
  const [sourceStatus, setSourceStatus] = useState({});
  const [waitingForSources, setWaitingForSources] = useState(false);
  const [langChanging, setLangChanging] = useState(null);
  const [roomFull, setRoomFull] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  // À ajouter à l'heure locale pour obtenir celle de l'hôte.
  const [clockOffsetMs, setClockOffsetMs] = useState(null);
  // Réutilisé par les participants : durées et pubs varient d'un hébergeur à l'autre.
  const [sourcePin, setSourcePin] = useState(null);

  const channelRef = useRef(null);
  const isHostRef = useRef(false);
  const joinedAtRef = useRef(0);
  const clientIdRef = useRef(
    globalThis.crypto?.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const currentRef = useRef(null);
  const queueRef = useRef([]);
  const playbackRef = useRef({ currentTime: 0, isPlaying: false });
  const lastSentRef = useRef({ at: 0, t: 0, playing: null });
  const reactionListenersRef = useRef(new Set());
  const optionsRef = useRef(DEFAULT_OPTIONS);
  const sourceStatusRef = useRef({});
  const waitingForSourcesRef = useRef(false);
  const teardownRef = useRef(null); // syncPresence peut évincer avant la définition de teardown
  const lastPersistAtRef = useRef(0);
  const clockOffsetRef = useRef(null);
  const clockPingTimerRef = useRef(null);
  const roomCodeRef = useRef(null);
  const waitTimerRef = useRef(null);
  const lastBufferWaitAtRef = useRef(0);
  const sourcePinRef = useRef(null);
  // Fait repartir un hôte fraîchement élu.
  const localPlaybackRef = useRef(null);
  const subscribedOnceRef = useRef(false);

  const me = {
    clientId: clientIdRef.current,
    userId,
    username: profile?.username || "Invité",
    avatar: resolveAvatar(profile),
    premium: premiumTier(profile),
  };
  const meRef = useRef(me);
  meRef.current = me;

  const emitReactionToListeners = useCallback((reaction) => {
    reactionListenersRef.current.forEach((cb) => {
      try { cb(reaction); } catch (_) {}
    });
  }, []);

  const subscribeReactions = useCallback((cb) => {
    reactionListenersRef.current.add(cb);
    return () => reactionListenersRef.current.delete(cb);
  }, []);

  /** Local, non diffusé. */
  const pushSystemMsg = useCallback((text) => {
    setChat((prev) => [
      ...prev.slice(-(MAX_CHAT - 1)),
      { type: "system", text, ts: Date.now() },
    ]);
  }, []);

  /** Sans statut connu, c'est un présent hors séance, pas un retardataire. */
  const checkAllReady = useCallback((channel) => {
    if (!waitingForSourcesRef.current) return false;
    const state = channel?.presenceState?.() || {};
    const list = Object.values(state).map((metas) => metas[0]).filter(Boolean);
    if (!list.length) return false;
    return list.every((p) => {
      const s = sourceStatusRef.current[p.clientId];
      return s !== "loading" && s !== "buffering";
    });
  }, []);

  const releaseWait = useCallback(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    waitingForSourcesRef.current = false;
    setWaitingForSources(false);
  }, []);

  const armWait = useCallback(() => {
    waitingForSourcesRef.current = true;
    setWaitingForSources(true);
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    waitTimerRef.current = setTimeout(() => {
      waitTimerRef.current = null;
      if (!waitingForSourcesRef.current) return;
      waitingForSourcesRef.current = false;
      setWaitingForSources(false);
      pushSystemMsg("Reprise sans les participants qui n'ont pas chargé à temps.");
    }, WAIT_SOURCES_TIMEOUT_MS);
  }, [pushSystemMsg]);

  /** À chaque changement d'épisode. */
  const resetSourceStatus = useCallback((channel) => {
    const state = channel?.presenceState?.() || {};
    const list = Object.values(state).map((metas) => metas[0]).filter(Boolean);
    const next = {};
    list.forEach((p) => { next[p.clientId] = "loading"; });
    sourceStatusRef.current = next;
    setSourceStatus({ ...next });
  }, []);

  /** Throttlé, sauf `force` sur les changements structurels. */
  const persistState = useCallback((force = false) => {
    const code = roomCodeRef.current;
    if (!code || !isHostRef.current) return;
    const now = Date.now();
    if (!force && now - lastPersistAtRef.current < PERSIST_THROTTLE_MS) return;
    lastPersistAtRef.current = now;
    savePartyRoomState(code, {
      hostClientId: meRef.current.clientId,
      current: currentRef.current,
      queue: queueRef.current,
      playback: playbackRef.current,
      options: optionsRef.current,
    });
  }, []);

  const restoreFromPersistedState = useCallback(async (channel) => {
    const code = roomCodeRef.current;
    if (!code) return;
    const state = await getPartyRoomState(code);
    if (!state || !isHostRef.current || channelRef.current !== channel) return; // périmé entre-temps
    currentRef.current = state.current;
    queueRef.current = state.queue;
    // Notre lecteur est plus frais que l'état persisté.
    const local = localPlaybackRef.current;
    playbackRef.current =
      local && state.current?.id && local.mediaId === state.current.id
        ? { currentTime: local.currentTime, isPlaying: local.isPlaying }
        : { currentTime: state.playback?.currentTime || 0, isPlaying: !!state.playback?.isPlaying };
    optionsRef.current = { ...DEFAULT_OPTIONS, ...state.options };
    applyCurrent(currentRef.current);
    applyQueue(queueRef.current);
    applyOptions(optionsRef.current);
    // Rediffusion pour faire converger les participants.
    channel.send({ type: "broadcast", event: "current", payload: currentRef.current });
    channel.send({ type: "broadcast", event: "queue", payload: { queue: queueRef.current } });
    channel.send({ type: "broadcast", event: "options", payload: optionsRef.current });
    if (sourcePinRef.current?.mediaId === currentRef.current?.id) {
      channel.send({ type: "broadcast", event: "source_pin", payload: sourcePinRef.current });
    }
    channel.send({
      type: "broadcast",
      event: "playback",
      payload: { ...playbackRef.current, sentAt: Date.now() },
    });
  }, []);

  const syncPresence = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const state = channel.presenceState();
    const list = Object.values(state).map((metas) => metas[0]).filter(Boolean);

    const claimers = list.filter((p) => p.isHostClaim).sort((a, b) => a.joinedAt - b.joinedAt);
    const ordered = [...list].sort((a, b) => a.joinedAt - b.joinedAt);
    const effectiveHost = claimers[0] || ordered[0] || null;
    const amHost = !!effectiveHost && effectiveHost.clientId === meRef.current.clientId;

    if (amHost && !isHostRef.current) {
      isHostRef.current = true;
      channel.track({ ...meRef.current, joinedAt: joinedAtRef.current, isHostClaim: true });
      restoreFromPersistedState(channel);
    }
    isHostRef.current = amHost;
    setIsHost(amHost);

    // Au-delà de la capacité de l'hôte, le dernier arrivé s'auto-évince.
    const cap = partyCapacityForTier(effectiveHost?.premium);
    if (!amHost && cap !== Infinity) {
      const myIdx = ordered.findIndex((p) => p.clientId === meRef.current.clientId);
      if (myIdx >= cap) {
        setRoomFull(true);
        teardownRef.current?.();
        return;
      }
    }

    setParticipants(
      ordered.map((p) => ({
        clientId: p.clientId,
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        premium: p.premium || null,
        isHost: effectiveHost ? p.clientId === effectiveHost.clientId : false,
        sourceStatus: sourceStatusRef.current[p.clientId] || "loading",
      }))
    );
  }, [restoreFromPersistedState]);

  /** Un statut daté d'un autre `mediaId` est écarté. */
  const noteSourceStatus = useCallback((clientId, status, mediaId) => {
    if (!clientId) return;
    const epoch = currentRef.current?.id;
    if (mediaId && epoch && mediaId !== epoch) return; // concerne l'épisode d'avant
    sourceStatusRef.current = { ...sourceStatusRef.current, [clientId]: status };
    setSourceStatus({ ...sourceStatusRef.current });
    syncPresence();
    if (!isHostRef.current) return;
    // Décrochage en lecture : l'hôte décide d'attendre ou pas.
    if (status === "buffering") {
      if (!optionsRef.current.waitOnBuffer || !playbackRef.current.isPlaying || waitingForSourcesRef.current) return;
      if (Date.now() - lastBufferWaitAtRef.current < BUFFER_WAIT_COOLDOWN_MS) return;
      lastBufferWaitAtRef.current = Date.now();
      armWait();
      return;
    }
    if (status === "loading") return; // l'attente est armée par setCurrent ou l'arrivée en séance
    if (waitingForSourcesRef.current && checkAllReady(channelRef.current)) releaseWait();
  }, [syncPresence, armWait, releaseWait, checkAllReady]);

  const openChannel = useCallback(
    (roomCode, asHost) =>
      new Promise((resolve) => {
        roomCodeRef.current = roomCode;
        const channel = supabase.channel(CHANNEL_PREFIX + roomCode, {
          config: { broadcast: { self: false }, presence: { key: meRef.current.clientId } },
        });
        channelRef.current = channel;
        isHostRef.current = asHost;
        joinedAtRef.current = Date.now();
        subscribedOnceRef.current = false;
        const subscribeTimer = setTimeout(
          () => resolve({ success: false, error: "Le salon ne répond pas. Vérifie ta connexion." }),
          SUBSCRIBE_TIMEOUT_MS
        );

        channel
          // Lecture
          .on("broadcast", { event: "playback" }, ({ payload }) => {
            if (isHostRef.current) return;
            setRemoteState({
              currentTime: Number(payload?.currentTime) || 0,
              isPlaying: !!payload?.isPlaying,
              sentAt: payload?.sentAt || Date.now(),
              recvAt: Date.now(),
            });
          })
          // Épisode courant
          .on("broadcast", { event: "current" }, ({ payload }) => {
            if (isHostRef.current) return;
            currentRef.current = payload || null;
            applyCurrent(payload || null);
            setRemoteState({ currentTime: 0, isPlaying: false, sentAt: Date.now(), recvAt: Date.now() });
            setLangChanging(null);
          })
          // File d'attente
          .on("broadcast", { event: "queue" }, ({ payload }) => {
            if (isHostRef.current) return;
            const q = Array.isArray(payload?.queue) ? payload.queue : [];
            queueRef.current = q;
            applyQueue(q);
          })
          // Options du salon
          .on("broadcast", { event: "options" }, ({ payload }) => {
            if (isHostRef.current) return;
            const raw = payload || {};
            const opts = {
              ...DEFAULT_OPTIONS,
              ...raw,
              // Borné, pour qu'un hôte malveillant ne puisse pas casser la synchro.
              driftTolerance: Math.min(10, Math.max(0.1, Number(raw.driftTolerance) || DEFAULT_OPTIONS.driftTolerance)),
            };
            optionsRef.current = opts;
            applyOptions(opts);
          })
          // Arrivée en cours de séance
          .on("broadcast", { event: "request_sync" }, () => {
            if (!isHostRef.current) return;
            channel.send({ type: "broadcast", event: "current", payload: currentRef.current });
            channel.send({ type: "broadcast", event: "queue", payload: { queue: queueRef.current } });
            channel.send({ type: "broadcast", event: "options", payload: optionsRef.current });
            if (sourcePinRef.current?.mediaId === currentRef.current?.id) {
              channel.send({ type: "broadcast", event: "source_pin", payload: sourcePinRef.current });
            }
            const p = playbackRef.current;
            channel.send({
              type: "broadcast",
              event: "playback",
              payload: { currentTime: p.currentTime, isPlaying: p.isPlaying, sentAt: Date.now() },
            });
          })
          // Horloge (ping-pong participant → hôte)
          .on("broadcast", { event: "clock_ping" }, ({ payload }) => {
            if (!isHostRef.current || !payload?.clientId) return;
            channel.send({
              type: "broadcast",
              event: "clock_pong",
              payload: { clientId: payload.clientId, t0: payload.t0, t1: Date.now() },
            });
          })
          .on("broadcast", { event: "clock_pong" }, ({ payload }) => {
            if (isHostRef.current || payload?.clientId !== meRef.current.clientId) return;
            const t2 = Date.now();
            const rtt = t2 - Number(payload.t0);
            if (!Number.isFinite(rtt) || rtt < 0 || rtt > 5000) return; // échantillon aberrant
            const sample = Number(payload.t1) - (Number(payload.t0) + rtt / 2);
            // Moyenne mobile exponentielle : un pic de latence ne fait pas sauter la correction.
            clockOffsetRef.current = clockOffsetRef.current == null ? sample : clockOffsetRef.current * 0.7 + sample * 0.3;
            setClockOffsetMs(clockOffsetRef.current);
          })
          // Statuts source (extraction, erreur, décrochage)
          .on("broadcast", { event: "source_loading" }, ({ payload }) => {
            noteSourceStatus(payload?.clientId, "loading", payload?.mediaId);
          })
          .on("broadcast", { event: "source_ready" }, ({ payload }) => {
            noteSourceStatus(payload?.clientId, "ready", payload?.mediaId);
          })
          .on("broadcast", { event: "source_error" }, ({ payload }) => {
            noteSourceStatus(payload?.clientId, "error", payload?.mediaId);
          })
          .on("broadcast", { event: "source_stall" }, ({ payload }) => {
            noteSourceStatus(payload?.clientId, "buffering", payload?.mediaId);
          })
          // Hébergeur retenu par l'hôte
          .on("broadcast", { event: "source_pin" }, ({ payload }) => {
            if (isHostRef.current || !payload?.sourceKey) return;
            sourcePinRef.current = payload;
            setSourcePin(payload);
          })
          // Changement de langue (bannière des participants)
          .on("broadcast", { event: "lang_changing" }, ({ payload }) => {
            if (isHostRef.current) return;
            setLangChanging({ username: payload?.username, toLang: payload?.toLang });
          })
          // Chat et réactions
          .on("broadcast", { event: "chat" }, ({ payload }) => {
            setChat((prev) => [...prev.slice(-(MAX_CHAT - 1)), payload]);
          })
          .on("broadcast", { event: "reaction" }, ({ payload }) => {
            emitReactionToListeners(payload);
          })
          // Présence
          .on("presence", { event: "sync" }, syncPresence)
          .on("presence", { event: "join" }, ({ newPresences }) => {
            syncPresence();
            newPresences?.forEach((p) => {
              if (p.clientId === meRef.current.clientId) return;
              pushSystemMsg(`${p.username || "Quelqu'un"} a rejoint le salon`);
              // Option waitOnJoin et lecture en cours : mise en attente.
              if (
                isHostRef.current &&
                optionsRef.current.waitOnJoin &&
                optionsRef.current.waitOnSourceLoad &&
                playbackRef.current.isPlaying
              ) {
                sourceStatusRef.current = { ...sourceStatusRef.current, [p.clientId]: "loading" };
                setSourceStatus({ ...sourceStatusRef.current });
                armWait();
              }
            });
          })
          .on("presence", { event: "leave" }, ({ leftPresences }) => {
            syncPresence();
            leftPresences?.forEach((p) => {
              if (p.clientId === meRef.current.clientId) return;
              pushSystemMsg(`${p.username || "Quelqu'un"} a quitté le salon`);
              // Sinon il bloquerait indéfiniment.
              const next = { ...sourceStatusRef.current };
              delete next[p.clientId];
              sourceStatusRef.current = next;
              setSourceStatus({ ...next });
              if (isHostRef.current && waitingForSourcesRef.current && checkAllReady(channel)) {
                releaseWait();
              }
            });
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              // Rejoué à chaque re-souscription : la suite doit être idempotente.
              clearTimeout(subscribeTimer);
              await channel.track({
                ...meRef.current,
                joinedAt: joinedAtRef.current,
                isHostClaim: isHostRef.current || asHost,
              });
              setInRoom(true);
              setCode(roomCode);
              setIsHost(isHostRef.current || asHost);
              if (subscribedOnceRef.current) pushSystemMsg("Connexion au salon rétablie.");
              subscribedOnceRef.current = true;
              if (clockPingTimerRef.current) {
                clearInterval(clockPingTimerRef.current);
                clockPingTimerRef.current = null;
              }
              if (!isHostRef.current) {
                // Après une coupure, l'épisode ou la file ont pu changer.
                channel.send({ type: "broadcast", event: "request_sync", payload: {} });
                // Sans effet si ce client devient hôte.
                const sendPing = () => {
                  if (isHostRef.current) return;
                  channel.send({
                    type: "broadcast",
                    event: "clock_ping",
                    payload: { clientId: meRef.current.clientId, t0: Date.now() },
                  });
                };
                sendPing();
                clockPingTimerRef.current = setInterval(sendPing, CLOCK_PING_MS);
              } else {
                // Les participants n'ont rien reçu pendant notre coupure.
                channel.send({ type: "broadcast", event: "current", payload: currentRef.current });
                channel.send({ type: "broadcast", event: "queue", payload: { queue: queueRef.current } });
                channel.send({ type: "broadcast", event: "options", payload: optionsRef.current });
              }
              resolve({ success: true });
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              // `CLOSED` arrive aussi sur un teardown volontaire.
              clearTimeout(subscribeTimer);
              resolve({ success: false, error: "Connexion au salon impossible." });
            }
          });
      }),
    [syncPresence, emitReactionToListeners, pushSystemMsg, noteSourceStatus, armWait, releaseWait, checkAllReady]
  );

  const teardown = useCallback(() => {
    const channel = channelRef.current;
    const participantCount = Object.keys(channel?.presenceState?.() || {}).length;
    if (channel) {
      try { channel.untrack(); } catch (_) {}
      supabase.removeChannel(channel);
    }
    if (clockPingTimerRef.current) {
      clearInterval(clockPingTimerRef.current);
      clockPingTimerRef.current = null;
    }
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    // Dernier présent à partir : on efface l'état persisté.
    if (isHostRef.current && roomCodeRef.current && participantCount <= 1) {
      closePartyRoom(roomCodeRef.current);
    }
    channelRef.current = null;
    roomCodeRef.current = null;
    isHostRef.current = false;
    currentRef.current = null;
    queueRef.current = [];
    playbackRef.current = { currentTime: 0, isPlaying: false };
    lastSentRef.current = { at: 0, t: 0, playing: null };
    lastPersistAtRef.current = 0;
    lastBufferWaitAtRef.current = 0;
    clockOffsetRef.current = null;
    sourcePinRef.current = null;
    localPlaybackRef.current = null;
    subscribedOnceRef.current = false;
    optionsRef.current = DEFAULT_OPTIONS;
    sourceStatusRef.current = {};
    waitingForSourcesRef.current = false;
    setInRoom(false);
    setIsHost(false);
    setCode(null);
    setParticipants([]);
    setChat([]);
    setRemoteState(null);
    applyCurrent(null);
    applyQueue([]);
    applyOptions(DEFAULT_OPTIONS);
    setSourceStatus({});
    setWaitingForSources(false);
    setLangChanging(null);
    setClockOffsetMs(null);
    setSourcePin(null);
  }, []);
  teardownRef.current = teardown;

  /**
   * Un code inexistant ne produit aucune erreur : Realtime ouvre un canal vide. On vérifie
   * après coup qu'il y a quelqu'un ou un état persisté.
   */
  const probeRoomExists = useCallback(
    (roomCode) => {
      setTimeout(async () => {
        const channel = channelRef.current;
        if (!channel || roomCodeRef.current !== roomCode || currentRef.current) return;
        const others = Object.keys(channel.presenceState() || {}).filter(
          (k) => k !== meRef.current.clientId
        );
        if (others.length) return;
        const persisted = await getPartyRoomState(roomCode);
        if (persisted || roomCodeRef.current !== roomCode || currentRef.current) return;
        setRoomNotFound(true);
        teardownRef.current?.();
      }, JOIN_PROBE_MS);
    },
    []
  );

  const createRoom = useCallback(
    async ({ seed = null } = {}) => {
      if (!userId) return { success: false, error: "Connexion requise." };
      setError(null);
      setRoomFull(false);
      setRoomNotFound(false);
      setConnecting(true);
      const roomCode = generatePartyCode();
      const initialQueue = seed ? [seed] : [];
      currentRef.current = seed;
      queueRef.current = initialQueue;
      playbackRef.current = { currentTime: 0, isPlaying: false };
      applyCurrent(seed);
      applyQueue(initialQueue);
      const res = await openChannel(roomCode, true);
      setConnecting(false);
      if (!res.success) {
        setError(res.error);
        teardown();
        return res;
      }
      persistState(true);
      return { success: true, code: roomCode };
    },
    [userId, openChannel, teardown, persistState]
  );

  const joinRoom = useCallback(
    async (rawCode) => {
      if (!userId) return { success: false, error: "Connexion requise." };
      const roomCode = normalizePartyCode(rawCode);
      if (!isValidPartyCode(roomCode)) return { success: false, error: "Code invalide (6 caractères alphanumériques)." };
      setError(null);
      setRoomFull(false);
      setRoomNotFound(false);
      setConnecting(true);
      const res = await openChannel(roomCode, false);
      setConnecting(false);
      if (!res.success) {
        setError(res.error);
        teardown();
        return res;
      }
      probeRoomExists(roomCode);
      return { success: true, code: roomCode };
    },
    [userId, openChannel, teardown, probeRoomExists]
  );

  const leaveRoom = useCallback(() => {
    setRoomFull(false);
    setRoomNotFound(false);
    teardown();
  }, [teardown]);

  /** Hôte, avec anti-doublon. */
  const emitPlayback = useCallback(({ currentTime, isPlaying, force = false } = {}) => {
    const channel = channelRef.current;
    if (!channel || !isHostRef.current) return;
    const t = Number(currentTime) || 0;
    const playing = !!isPlaying;
    playbackRef.current = { currentTime: t, isPlaying: playing };

    const last = lastSentRef.current;
    const now = Date.now();
    if (!force && now - last.at < DEDUP_MS && last.playing === playing && Math.abs(t - last.t) < DEDUP_TIME) return;
    lastSentRef.current = { at: now, t, playing };
    channel.send({ type: "broadcast", event: "playback", payload: { currentTime: t, isPlaying: playing, sentAt: now } });
    persistState();
  }, [persistState]);

  /** Hôte. Réinitialise le suivi des sources. */
  const setCurrent = useCallback((descriptor) => {
    if (!isHostRef.current) return;
    currentRef.current = descriptor || null;
    playbackRef.current = { currentTime: 0, isPlaying: false };
    lastSentRef.current = { at: 0, t: 0, playing: null };
    // L'ancien pin ne vaut rien pour le nouvel épisode.
    sourcePinRef.current = null;
    setSourcePin(null);
    applyCurrent(descriptor || null);
    channelRef.current?.send({ type: "broadcast", event: "current", payload: descriptor || null });
    if (descriptor && optionsRef.current.waitOnSourceLoad) {
      resetSourceStatus(channelRef.current);
      armWait();
    }
    persistState(true); // changement structurel : sans throttle
  }, [resetSourceStatus, persistState, armWait]);

  const setQueue = useCallback((arrOrFn) => {
    if (!isHostRef.current) return;
    const next = typeof arrOrFn === "function" ? arrOrFn(queueRef.current) : arrOrFn;
    const list = Array.isArray(next) ? next : [];
    queueRef.current = list;
    applyQueue(list);
    channelRef.current?.send({ type: "broadcast", event: "queue", payload: { queue: list } });
    persistState(true);
  }, [persistState]);

  /** Hôte : position à jour pour les arrivées en cours de séance. */
  const updateHostState = useCallback(({ currentTime, isPlaying } = {}) => {
    playbackRef.current = {
      currentTime: Number.isFinite(currentTime) ? currentTime : playbackRef.current.currentTime,
      isPlaying: typeof isPlaying === "boolean" ? isPlaying : playbackRef.current.isPlaying,
    };
  }, []);

  const setOptions = useCallback((updater) => {
    if (!isHostRef.current) return;
    const next = typeof updater === "function" ? updater(optionsRef.current) : { ...optionsRef.current, ...updater };
    optionsRef.current = next;
    applyOptions(next);
    channelRef.current?.send({ type: "broadcast", event: "options", payload: next });
    // Attente désactivée en plein blocage : on lève la pause.
    if (!next.waitOnSourceLoad && waitingForSourcesRef.current) releaseWait();
    persistState(true);
  }, [persistState, releaseWait]);

  /** 'loading' | 'ready' | 'error' */
  const reportSourceStatus = useCallback((status) => {
    const cid = meRef.current.clientId;
    const mediaId = currentRef.current?.id || null;
    const event =
      status === "ready" ? "source_ready"
      : status === "error" ? "source_error"
      : status === "buffering" ? "source_stall"
      : "source_loading";
    channelRef.current?.send({
      type: "broadcast",
      event,
      payload: { clientId: cid, username: meRef.current.username, mediaId },
    });
    noteSourceStatus(cid, status, mediaId);
  }, [noteSourceStatus]);

  /** Tous les rôles le mémorisent, au cas où ils seraient élus hôte. */
  const pinSource = useCallback((sourceKey) => {
    if (!sourceKey) return;
    const pin = { mediaId: currentRef.current?.id || null, sourceKey };
    sourcePinRef.current = pin;
    if (!isHostRef.current) return;
    setSourcePin(pin);
    channelRef.current?.send({ type: "broadcast", event: "source_pin", payload: pin });
  }, []);

  /** Remontée par tous les rôles. */
  const reportLocalPlayback = useCallback(({ currentTime, isPlaying }) => {
    localPlaybackRef.current = {
      mediaId: currentRef.current?.id || null,
      currentTime: Number(currentTime) || 0,
      isPlaying: !!isPlaying,
    };
  }, []);

  /** Juste avant `setCurrent`. */
  const emitLangChanging = useCallback((toLang) => {
    if (!isHostRef.current) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "lang_changing",
      payload: { username: meRef.current.username, toLang },
    });
  }, []);

  const sendChat = useCallback((text) => {
    const channel = channelRef.current;
    const clean = String(text || "").trim().slice(0, 500);
    if (!channel || !clean) return;
    const msg = {
      clientId: meRef.current.clientId,
      userId: meRef.current.userId,
      username: meRef.current.username,
      avatar: meRef.current.avatar,
      text: clean,
      ts: Date.now(),
    };
    channel.send({ type: "broadcast", event: "chat", payload: msg });
    setChat((prev) => [...prev.slice(-(MAX_CHAT - 1)), msg]);
  }, []);

  const sendReaction = useCallback(
    (emoji) => {
      const channel = channelRef.current;
      const clean = String(emoji || "").trim().slice(0, 8);
      if (!channel || !clean) return;
      const reaction = { userId: meRef.current.userId, username: meRef.current.username, emoji: clean, ts: Date.now() };
      channel.send({ type: "broadcast", event: "reaction", payload: reaction });
      emitReactionToListeners(reaction);
    },
    [emitReactionToListeners]
  );

  useEffect(() => () => teardown(), [teardown]);

  return {
    inRoom, isHost, code, participants, chat, error, connecting,
    current, queue, remoteState, roomFull, roomNotFound, clockOffsetMs,
    options, sourceStatus, waitingForSources, langChanging, sourcePin,
    me,
    createRoom, joinRoom, leaveRoom,
    emitPlayback, setCurrent, setQueue, updateHostState,
    setOptions, reportSourceStatus, emitLangChanging,
    pinSource, reportLocalPlayback,
    sendChat, sendReaction, subscribeReactions,
  };
}
