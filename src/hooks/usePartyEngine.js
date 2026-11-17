import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { platform } from "@/platform";
import { useAuthStore } from "@/stores/useAuthStore";
import { premiumTier } from "@/lib/premium";
import { generatePartyCode, normalizePartyCode, isValidPartyCode } from "@/utils/partyCode";
import { partyRpc } from "@/api/partyRoom";
import { watchTick } from "@/api/progress";
import { resolveAvatar } from "@/api/profile";
import { getAbsoluteApiBaseUrl } from "@/config/config";

/**
 * Pont entre la page et le moteur de watch party du cœur (`nartya-core/src/party`, contrat dans
 * `docs/WATCHPARTY-CONTRACT.md`). Il ne décide de rien : il relaie les messages du serveur vers le
 * moteur, exécute ses ordres sur le lecteur et expose son instantané à l'affichage.
 */
const MAX_CHAT = 200;
const MAX_RECONNECTS = 6;

/** Refus définitifs du serveur ; le reste (coupure, serveur indisponible) se retente. */
const REFUSALS = { not_found: "not_found", full: "full", auth: "refused", forbidden: "refused" };

function partySocketUrl() {
  return `${getAbsoluteApiBaseUrl().replace(/^http/i, "ws")}/party/ws`;
}

export const DEFAULT_OPTIONS = {
  isPublic: false,
  waitOnSourceLoad: true,
  waitOnJoin: true,
  waitOnBuffer: true,
  driftTolerance: 1.5,
};

const IDLE = {
  rev: 0,
  phase: "idle",
  code: null,
  role: "guest",
  clientId: null,
  error: null,
  participants: [],
  capacity: 5,
  current: null,
  queue: [],
  options: DEFAULT_OPTIONS,
  waiting: { active: false, for: [] },
  langChanging: null,
  sourcePin: null,
};

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function usePartyEngine() {
  const engine = platform.party;
  const profile = useAuthStore((s) => s.user);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const [snap, setSnap] = useState(IDLE);
  const [chat, setChat] = useState([]);
  const [loadRequest, setLoadRequest] = useState(null);

  const snapRef = useRef(IDLE);
  const clientIdRef = useRef(newClientId());
  const channelRef = useRef(null);
  const playerRef = useRef(null);
  const seasonTotalRef = useRef(0);
  const reactionListenersRef = useRef(new Set());
  const waitersRef = useRef([]);
  const loadNonceRef = useRef(0);

  const me = useMemo(
    () => ({
      clientId: clientIdRef.current,
      userId,
      username: profile?.username || "Invité",
      avatar: resolveAvatar(profile),
      premium: premiumTier(profile),
    }),
    [profile, userId]
  );
  const meRef = useRef(me);
  meRef.current = me;

  const input = useCallback(
    (payload) => {
      engine?.input(payload)?.catch?.((e) => console.warn("[party] entrée refusée", payload?.type, e));
    },
    [engine]
  );

  // ---------- transport : relais du serveur ----------

  const closeChannel = useCallback(() => {
    const conn = channelRef.current;
    channelRef.current = null;
    if (!conn) return;
    clearTimeout(conn.retryTimer);
    const ws = conn.ws;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "bye" }));
      ws.close(1000);
    } catch (_) {}
  }, []);

  const openChannel = useCallback(
    (name, claimHost) => {
      closeChannel();
      const conn = { code: name.replace(/^wp:/, ""), ws: null, failures: 0, retryTimer: null, done: false };
      channelRef.current = conn;
      const live = () => channelRef.current === conn;

      const connect = (asHost) => {
        if (!live()) return;
        const ws = new WebSocket(partySocketUrl());
        conn.ws = ws;
        ws.onopen = async () => {
          const { data } = await supabase.auth.getSession();
          if (!live() || conn.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(
            JSON.stringify({
              t: "hello",
              token: data?.session?.access_token || "",
              code: conn.code,
              clientId: clientIdRef.current,
              claimHost: !!asHost,
              avatar: meRef.current.avatar || null,
            })
          );
        };
        ws.onmessage = (ev) => {
          if (!live() || conn.ws !== ws) return;
          let msg;
          try {
            msg = JSON.parse(ev.data);
          } catch (_) {
            return;
          }
          if (msg.t === "welcome") {
            conn.failures = 0;
            input({ type: "transport", status: "subscribed" });
          } else if (msg.t === "presence") {
            input({ type: "presence", members: msg.members || [] });
          } else if (msg.t === "msg") {
            input({ type: "message", event: msg.event, payload: msg.payload });
          } else if (msg.t === "error") {
            const status = REFUSALS[msg.code];
            if (status) {
              conn.done = true;
              input({ type: "transport", status });
            }
          }
        };
        ws.onclose = () => {
          if (!live() || conn.ws !== ws || conn.done) return;
          conn.failures += 1;
          if (conn.failures > MAX_RECONNECTS) {
            input({ type: "transport", status: "lost" });
            return;
          }
          input({ type: "transport", status: "reconnecting" });
          const delay = Math.min(8000, 500 * 2 ** (conn.failures - 1));
          conn.retryTimer = setTimeout(() => connect(snapRef.current.role === "host"), delay);
        };
      };
      connect(claimHost);
    },
    [closeChannel, input]
  );

  // ---------- ordres du moteur ----------

  const runEffect = useCallback(
    (fx) => {
      const player = playerRef.current;
      switch (fx.type) {
        case "subscribe":
          openChannel(fx.channel, !!fx.host);
          break;
        case "unsubscribe":
          closeChannel();
          break;
        case "track":
          // La présence (identité, hôte) est tenue par le serveur.
          break;
        case "send": {
          const ws = channelRef.current?.ws;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: "send", event: fx.event, payload: fx.payload }));
          }
          break;
        }
        case "rpc":
          partyRpc(fx.name, fx.args).then((res) =>
            input({ type: "rpc_result", id: fx.id, ok: !!res.ok, data: res.data ?? null })
          );
          break;
        case "chat":
          setChat((prev) => [...prev.slice(-(MAX_CHAT - 1)), fx.message]);
          break;
        case "reaction":
          reactionListenersRef.current.forEach((cb) => {
            try { cb(fx.reaction); } catch (_) {}
          });
          break;
        case "player_load":
          loadNonceRef.current += 1;
          setLoadRequest({
            mediaId: fx.mediaId,
            pinnedSource: fx.pinnedSource || null,
            nonce: loadNonceRef.current,
          });
          break;
        case "player_seek":
          player?.seek?.(fx.position);
          break;
        case "player_play":
          player?.play?.();
          break;
        case "player_pause":
          player?.pause?.();
          break;
        case "player_rate":
          player?.setRate?.(fx.rate);
          break;
        case "player_notice":
          player?.notice?.(fx.text);
          break;
        case "progress": {
          const cur = snapRef.current.current;
          if (!cur || !userId) break;
          watchTick({
            slug: fx.slug,
            seasonId: fx.season,
            episodeNumber: Number(fx.ep),
            language: fx.lang,
            positionSeconds: fx.position,
            duration: fx.duration,
            title: cur.title,
            cover: cur.cover,
            seasonTotal: seasonTotalRef.current,
            userId,
          });
          break;
        }
        default:
          break;
      }
    },
    [openChannel, closeChannel, input, userId]
  );
  const runEffectRef = useRef(runEffect);
  runEffectRef.current = runEffect;

  useEffect(() => {
    if (!engine) return undefined;
    const offState = engine.onState((next) => {
      snapRef.current = next;
      setSnap(next);
      const settled = waitersRef.current;
      if (!settled.length || next.phase === "connecting" || next.phase === "idle") return;
      waitersRef.current = [];
      settled.forEach((resolve) => resolve(next));
    });
    const offEffect = engine.onEffect((fx) => runEffectRef.current(fx));
    return () => {
      offState?.();
      offEffect?.();
    };
  }, [engine]);

  // Quitter la page ferme le salon côté moteur et côté serveur.
  useEffect(
    () => () => {
      input({ type: "close" });
      closeChannel();
    },
    [input, closeChannel]
  );

  // ---------- actions ----------

  const settle = useCallback(
    () =>
      new Promise((resolve) => {
        waitersRef.current.push(resolve);
      }).then((s) =>
        s.phase === "in_room"
          ? { success: true, code: s.code }
          : { success: false, error: s.error || "Connexion au salon impossible." }
      ),
    []
  );

  const resetLocal = useCallback(() => {
    setChat([]);
    setLoadRequest(null);
  }, []);

  const createRoom = useCallback(
    async ({ seed = null, isPublic = false } = {}) => {
      if (!engine) return { success: false, error: "Watch party disponible dans l'app de bureau." };
      if (!userId) return { success: false, error: "Connexion requise." };
      resetLocal();
      const code = generatePartyCode();
      const result = settle();
      input({ type: "open", code, intent: "create", me: meRef.current, seed, isPublic: !!isPublic });
      return result;
    },
    [engine, userId, input, settle, resetLocal]
  );

  const joinRoom = useCallback(
    async (rawCode) => {
      if (!engine) return { success: false, error: "Watch party disponible dans l'app de bureau." };
      if (!userId) return { success: false, error: "Connexion requise." };
      const code = normalizePartyCode(rawCode);
      if (!isValidPartyCode(code)) {
        return { success: false, error: "Code invalide (6 caractères alphanumériques)." };
      }
      resetLocal();
      const result = settle();
      input({ type: "open", code, intent: "join", me: meRef.current });
      return result;
    },
    [engine, userId, input, settle, resetLocal]
  );

  const leaveRoom = useCallback(() => {
    input({ type: "close" });
    closeChannel();
    resetLocal();
  }, [input, closeChannel, resetLocal]);

  const setCurrent = useCallback((descriptor) => input({ type: "set_current", descriptor }), [input]);
  const playNow = useCallback((descriptor) => input({ type: "play_now", descriptor }), [input]);
  const enqueue = useCallback((item) => input({ type: "set_queue", op: "add", item }), [input]);
  const dequeue = useCallback((id) => input({ type: "set_queue", op: "remove", item: { id } }), [input]);
  const setOptions = useCallback((patch) => input({ type: "set_options", patch }), [input]);
  const changeLang = useCallback((lang) => input({ type: "change_lang", lang }), [input]);
  const next = useCallback(() => input({ type: "next" }), [input]);
  const prev = useCallback(() => input({ type: "prev" }), [input]);
  const sendChat = useCallback((text) => input({ type: "chat", text }), [input]);
  const sendReaction = useCallback((emoji) => input({ type: "reaction", emoji }), [input]);

  const subscribeReactions = useCallback((cb) => {
    reactionListenersRef.current.add(cb);
    return () => reactionListenersRef.current.delete(cb);
  }, []);

  // ---------- lecteur ----------

  const attachPlayer = useCallback((api) => {
    playerRef.current = api || null;
  }, []);

  const mediaId = () => snapRef.current.current?.id ?? null;

  const playerTick = useCallback(
    (position, duration) => {
      input({
        type: "player_tick",
        mediaId: mediaId(),
        position: Number(position) || 0,
        duration: Number(duration) || 0,
        paused: !!playerRef.current?.isPaused?.(),
      });
    },
    [input]
  );

  const playerEvent = useCallback(
    (kind, position) => {
      input({ type: "player_event", mediaId: mediaId(), kind, position: Number(position) || 0 });
    },
    [input]
  );

  const reportSource = useCallback(
    ({ mediaId: id, status, sourceKey = null }) => {
      input({ type: "source", mediaId: id ?? mediaId(), status, sourceKey });
    },
    [input]
  );

  const setSeasonTotal = useCallback((n) => {
    seasonTotalRef.current = Number(n) || 0;
  }, []);

  // ---------- vue pour l'affichage ----------

  const byId = useMemo(
    () => new Map(snap.participants.map((p) => [p.clientId, p])),
    [snap.participants]
  );
  const waitingFor = useMemo(
    () => snap.waiting.for.map((id) => byId.get(id)).filter(Boolean),
    [snap.waiting.for, byId]
  );

  return {
    available: !!engine,
    phase: snap.phase,
    inRoom: snap.phase === "in_room",
    connecting: snap.phase === "connecting",
    roomFull: snap.phase === "full",
    roomNotFound: snap.phase === "not_found",
    isHost: snap.role === "host",
    code: snap.code,
    error: snap.error,
    participants: snap.participants,
    capacity: snap.capacity,
    current: snap.current,
    queue: snap.queue,
    options: snap.options,
    waitingForSources: snap.waiting.active,
    waitingFor,
    langChanging: snap.langChanging,
    loadRequest,
    chat,
    me,
    createRoom, joinRoom, leaveRoom,
    setCurrent, playNow, enqueue, dequeue, setOptions, changeLang, next, prev,
    sendChat, sendReaction, subscribeReactions,
    attachPlayer, playerTick, playerEvent, reportSource, setSeasonTotal,
  };
}
