import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertTriangle, LogOut, Copy, Check, ListVideo,
  Search, Tv, Users, Settings2, UserPlus,
} from "lucide-react";
import { getSeasonEpisodes } from "@/api/animeApi";
import { hasPlayableSources } from "@/utils/videoSourceUtils";
import { partyCapacityForTier } from "@/lib/premium";
import { toast } from "@/lib/toast";
import { getEpisodeVideoUrl } from "@/utils/episodeVideoUtils";
import { getOrFetch } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useParty } from "@/contexts/WatchPartyProvider";
import VideoPlayer from "@/components/player/VideoPlayer";
import PartyChat from "@/components/party/PartyChat";
import PartySearchPanel from "@/components/party/PartySearchPanel";
import { DEFAULT_OPTIONS } from "@/hooks/useWatchParty";
import { SITE_URL } from "@/config/instance";
import {
  LangChangingBanner,
  OptionsPanel,
  PartyRoomNotice,
  PeopleList,
  QueueList,
  TabButton,
  WaitingBanner,
} from "@/components/party/PartyRoomPanels";

const HEARTBEAT_MS = 1500;
// Sans `timeupdate`, un participant qui se reconnecte ne pourrait pas se réaligner.
const PAUSED_BEAT_MS = 4000;
// Avant d'extraire en autonomie.
const PIN_WAIT_MS = 4000;
const PIN_POLL_MS = 150;
// Un `waiting` bref accompagne un simple seek.
const STALL_GRACE_MS = 1200;
// En dessous, le décalage n'est pas corrigé.
const MIN_DRIFT_S = 0.12;

function episodeLanguages(ep) {
  if (!ep?.lecteurs) return [];
  return Object.keys(ep.lecteurs).filter((l) =>
    hasPlayableSources(ep.lecteurs[l])
  );
}

export default function PartyRoomPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const party = useParty();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { isHost, current, queue, inRoom, connecting, options, roomFull, roomNotFound } = party;

  const capacity = useMemo(() => {
    const host = party.participants.find((p) => p.isHost);
    return partyCapacityForTier(host?.premium);
  }, [party.participants]);
  const capacityLabel = capacity === Infinity ? "∞" : capacity;

  const playerApiRef = useRef(null);
  const isPlayingRef = useRef(false);
  const lastBeatRef = useRef(0);
  const prevWaitingRef = useRef(false);
  const remoteRef = useRef(null);
  const rateRef = useRef(1);
  const stallTimerRef = useRef(null);
  const stalledRef = useRef(false);
  const sourcePinRef = useRef(null);
  remoteRef.current = party.remoteState;
  sourcePinRef.current = party.sourcePin;

  const [episodes, setEpisodes] = useState([]);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [tab, setTab] = useState("queue");
  const [showOptions, setShowOptions] = useState(false);

  // Sauf si déjà dedans ou évincé.
  useEffect(() => {
    if (!userId || inRoom || connecting || roomFull || roomNotFound) return;
    if (codeParam) party.joinRoom(codeParam);
  }, [userId, inRoom, connecting, roomFull, roomNotFound, codeParam, party]);

  useEffect(() => () => party.leaveRoom(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!current?.slug || current?.season == null) {
      setEpisodes([]);
      return;
    }
    let alive = true;
    getOrFetch(
      `episodes:${current.slug}:${current.season}`,
      () => getSeasonEpisodes(current.slug, current.season),
      5 * 60 * 1000
    )
      .then((d) => alive && setEpisodes(d?.episodes || []))
      .catch(() => alive && setEpisodes([]));
    return () => { alive = false; };
  }, [current?.slug, current?.season]);

  const currentEpisode = useMemo(
    () => episodes.find((e) => Number(e.episode ?? e.number) === Number(current?.ep)) || null,
    [episodes, current?.ep]
  );
  const currentIndex = useMemo(
    () => episodes.findIndex((e) => Number(e.episode ?? e.number) === Number(current?.ep)),
    [episodes, current?.ep]
  );
  const languages = useMemo(() => episodeLanguages(currentEpisode), [currentEpisode]);
  const queueIndex = useMemo(() => queue.findIndex((x) => x.id === current?.id), [queue, current?.id]);
  const hasPrev = queueIndex > 0;
  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;

  // Signalée à l'hôte.
  useEffect(() => {
    if (!current || currentIndex < 0 || !currentEpisode) {
      setVideoUrl(null);
      // Introuvable une fois la liste chargée.
      if (current && episodes.length > 0 && (currentIndex < 0 || !currentEpisode)) {
        party.reportSourceStatus("error");
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    party.reportSourceStatus("loading");
    const mediaId = current.id;
    const extract = (selectedSource) =>
      getEpisodeVideoUrl(current.slug, current.season, currentIndex, current.lang, {
        episode: currentEpisode,
        episodes,
        selectedSource,
      });
    (async () => {
      // Participant : le même hébergeur que l'hôte. Deux hébergeurs, ce sont deux montages :
      // désynchro irrattrapable.
      let pinned = null;
      if (!isHost) {
        const deadline = Date.now() + PIN_WAIT_MS;
        while (Date.now() < deadline) {
          if (sourcePinRef.current?.mediaId === mediaId) break;
          await new Promise((r) => setTimeout(r, PIN_POLL_MS));
          if (cancelled) return;
        }
        if (sourcePinRef.current?.mediaId === mediaId) pinned = sourcePinRef.current.sourceKey;
      }
      let res = await extract(pinned || "auto");
      if (cancelled) return;
      if (!res.success && pinned) {
        // Mieux vaut une séance moins bien synchronisée que pas de vidéo.
        res = await extract("auto");
        if (cancelled) return;
      }
      if (res.success) {
        setVideoUrl(res.videoUrl);
        // Mémorisé par tous les rôles.
        party.pinSource(res.usedSource);
        party.reportSourceStatus("ready");
      } else {
        setError(res.error || "Source indisponible pour cet épisode.");
        party.reportSourceStatus("error");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [current?.slug, current?.season, current?.ep, current?.lang, currentIndex, currentEpisode, episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hôte : pause pendant l'attente des sources.
  useEffect(() => {
    if (!isHost) return;
    if (party.waitingForSources && playerApiRef.current) {
      const t = playerApiRef.current.getCurrentTime?.() || 0;
      playerApiRef.current.pause?.();
      party.emitPlayback({ currentTime: t, isPlaying: false, force: true });
    }
  }, [party.waitingForSources, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hôte : lecture dès que tout le monde est prêt.
  useEffect(() => {
    if (isHost && prevWaitingRef.current && !party.waitingForSources && videoUrl && playerApiRef.current) {
      const t = playerApiRef.current.getCurrentTime?.() || 0;
      playerApiRef.current.play?.();
      party.emitPlayback({ currentTime: t, isPlaying: true, force: true });
    }
    prevWaitingRef.current = party.waitingForSources;
  }, [party.waitingForSources, isHost, videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Participant : `clockOffsetMs` donne l'heure de l'hôte ; sans lui, un décalage d'horloge se
  // lirait comme de la dérive.
  const setRate = useCallback((r) => {
    if (rateRef.current === r) return;
    rateRef.current = r;
    playerApiRef.current?.setRate?.(r);
  }, []);

  const applyRemote = useCallback(
    ({ notify = false } = {}) => {
      const rs = remoteRef.current;
      const api = playerApiRef.current;
      if (!rs || !api || isHost) return;
      const offset = party.clockOffsetMs || 0;
      const elapsed = rs.isPlaying ? Math.max(0, Date.now() + offset - rs.sentAt) / 1000 : 0;
      const target = rs.currentTime + elapsed;
      const dur = api.getDuration() || 0;
      const diff = target - (api.getCurrentTime() || 0); // > 0 : en retard
      const tolerance = options.driftTolerance ?? DEFAULT_OPTIONS.driftTolerance;

      if (Math.abs(diff) > tolerance && (dur === 0 || target < dur - 1)) {
        setRate(1);
        api.seek(target);
        if (notify) api.notice?.("Resynchronisé sur l'hôte");
      } else if (rs.isPlaying && Math.abs(diff) > Math.max(MIN_DRIFT_S, tolerance / 4)) {
        // Rattrapage inaudible : lecture étirée ou comprimée de 5 %, plutôt qu'un saut.
        setRate(diff > 0 ? 1.05 : 0.95);
      } else {
        setRate(1);
      }
      // Évite de rappeler play()/pause() à chaque battement.
      if (rs.isPlaying) {
        if (api.isPaused?.()) api.play();
      } else if (!api.isPaused?.()) {
        api.pause();
      }
    },
    [isHost, options.driftTolerance, party.clockOffsetMs, setRate]
  );

  useEffect(() => { applyRemote(); }, [party.remoteState, applyRemote]);

  // Hôte : émission de l'état de lecture
  const handleTimeUpdate = useCallback(
    (time) => {
      // Fait repartir un participant promu hôte.
      party.reportLocalPlayback({ currentTime: time, isPlaying: !playerApiRef.current?.isPaused?.() });
      if (!isHost || !isPlayingRef.current) return;
      party.updateHostState({ currentTime: time, isPlaying: true });
      const now = Date.now();
      if (now - lastBeatRef.current >= HEARTBEAT_MS) {
        lastBeatRef.current = now;
        party.emitPlayback({ currentTime: time, isPlaying: true, force: true });
      }
    },
    [isHost, party]
  );
  const handlePlay = useCallback(
    (t) => {
      // Participant : réalignement immédiat.
      if (!isHost) return applyRemote({ notify: true });
      isPlayingRef.current = true;
      party.emitPlayback({ currentTime: t, isPlaying: true, force: true });
    },
    [isHost, party, applyRemote]
  );
  const handlePause = useCallback(
    (t) => {
      if (!isHost) return applyRemote({ notify: true });
      isPlayingRef.current = false;
      party.emitPlayback({ currentTime: t, isPlaying: false, force: true });
    },
    [isHost, party, applyRemote]
  );
  const handleSeek = useCallback(
    (t) => {
      if (!isHost) return applyRemote({ notify: true });
      party.emitPlayback({ currentTime: t, isPlaying: isPlayingRef.current, force: true });
    },
    [isHost, party, applyRemote]
  );

  // Hôte en pause : battement lent.
  useEffect(() => {
    if (!isHost || !inRoom) return;
    const id = setInterval(() => {
      const api = playerApiRef.current;
      if (!api || isPlayingRef.current) return;
      party.emitPlayback({ currentTime: api.getCurrentTime?.() || 0, isPlaying: false, force: true });
    }, PAUSED_BEAT_MS);
    return () => clearInterval(id);
  }, [isHost, inRoom, party]);

  // Décrochage du flux : signalé seulement s'il dure.
  const handleStall = useCallback(() => {
    if (stallTimerRef.current || stalledRef.current) return;
    stallTimerRef.current = setTimeout(() => {
      stallTimerRef.current = null;
      stalledRef.current = true;
      party.reportSourceStatus("buffering");
    }, STALL_GRACE_MS);
  }, [party]);
  const handleStallEnd = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (!stalledRef.current) return;
    stalledRef.current = false;
    party.reportSourceStatus("ready");
  }, [party]);
  useEffect(() => () => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
  }, []);

  // Navigation dans la file (hôte)
  const goPrev = useCallback(() => {
    if (isHost && hasPrev) party.setCurrent(queue[queueIndex - 1]);
  }, [isHost, hasPrev, queue, queueIndex, party]);
  const goNext = useCallback(() => {
    if (isHost && hasNext) party.setCurrent(queue[queueIndex + 1]);
  }, [isHost, hasNext, queue, queueIndex, party]);
  const handleEnded = useCallback(() => {
    if (isHost && hasNext) party.setCurrent(queue[queueIndex + 1]);
  }, [isHost, hasNext, queue, queueIndex, party]);

  // Avant de changer de langue.
  const changeLang = useCallback(
    (l) => {
      if (!isHost || !current || l === current.lang) return;
      party.emitLangChanging(l);
      party.setCurrent({ ...current, lang: l, id: `${current.slug}:${current.season}:${current.ep}:${l}` });
    },
    [isHost, current, party]
  );


  // File et recherche (hôte)
  const playNow = useCallback(
    (d) => {
      party.setQueue((q) => (q.some((x) => x.id === d.id) ? q : [...q, d]));
      party.setCurrent(d);
    },
    [party]
  );
  const enqueue = useCallback(
    (d) => {
      party.setQueue((q) => (q.some((x) => x.id === d.id) ? q : [...q, d]));
      if (!current) party.setCurrent(d);
    },
    [party, current]
  );

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(party.code || codeParam || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  };
  // Une page du site rebondit vers le deep-link nartya://party/<code>.
  const copyInvite = async () => {
    const c = party.code || codeParam;
    if (!c) return;
    try {
      await navigator.clipboard.writeText(`${SITE_URL}/open/?party=${c}`);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  };
  const leave = () => {
    party.leaveRoom();
    navigate("/party");
  };

  const roomCode = party.code || codeParam;
  const episodeLabel = current
    ? `${current.title}${current.ep ? ` — Ép. ${current.ep}` : ""}`
    : "";

  const loadingParticipants = useMemo(
    () =>
      party.participants.filter(
        (p) =>
          p.clientId !== party.me.clientId &&
          (party.sourceStatus[p.clientId] === "loading" || party.sourceStatus[p.clientId] === "buffering")
      ),
    [party.participants, party.sourceStatus, party.me.clientId]
  );

  if (roomNotFound || roomFull) {
    return (
      <PartyRoomNotice
        kind={roomNotFound ? "not-found" : "full"}
        code={codeParam}
        onBack={() => navigate("/party")}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <div className="flex min-w-0 flex-1 flex-col">
        {isHost && party.waitingForSources && loadingParticipants.length > 0 && (
          <WaitingBanner
            names={loadingParticipants.map((p) => p.username)}
            onSkip={() => party.setOptions((o) => ({ ...o, waitOnSourceLoad: false, waitOnJoin: false }))}
          />
        )}
        {!isHost && party.langChanging && (
          <LangChangingBanner info={party.langChanging} />
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {videoUrl ? (
            <VideoPlayer
              videoUrl={videoUrl}
              title={current?.title || ""}
              episodeLabel={episodeLabel}
              languages={isHost ? languages : []}
              language={current?.lang || "vostfr"}
              showEpisodes={false}
              hasPrev={isHost && hasPrev}
              hasNext={isHost && hasNext}
              onPrev={goPrev}
              onNext={goNext}
              onLanguageChange={isHost ? changeLang : undefined}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onEnded={handleEnded}
              onStall={handleStall}
              onStallEnd={handleStallEnd}
              onError={() => {
                setError("La lecture a échoué.");
                // Sinon l'hôte attendrait un participant dont la source ne se lit pas.
                party.reportSourceStatus("error");
              }}
              onPlayerApi={(api) => {
                playerApiRef.current = api;
                rateRef.current = 1;
                // Mis à l'heure du salon tout de suite.
                if (api) applyRemote();
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={28} />
                  <p className="text-sm">Chargement de l'épisode…</p>
                </>
              ) : error ? (
                <>
                  <AlertTriangle className="text-primary" size={32} />
                  <p className="max-w-md text-sm">{error}</p>
                </>
              ) : (
                <>
                  <Tv size={40} className="text-white/20" />
                  <p className="max-w-sm text-sm">
                    {isHost
                      ? "Cherchez un anime pour lancer la séance."
                      : "En attente que l'hôte lance un épisode…"}
                  </p>
                  {isHost && (
                    <button onClick={() => setTab("search")} className="btn-shu mt-1">
                      <Search size={16} /> Chercher un anime
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex h-[40vh] min-h-[280px] flex-col border-t border-border bg-bg">
          <div className="flex items-center gap-1 border-b border-border px-3 pt-2">
            <TabButton active={tab === "queue"} onClick={() => setTab("queue")} icon={ListVideo}>
              File d'attente {queue.length > 0 && `(${queue.length})`}
            </TabButton>
            {isHost && (
              <TabButton active={tab === "search"} onClick={() => setTab("search")} icon={Search}>
                Rechercher
              </TabButton>
            )}
            <TabButton active={tab === "people"} onClick={() => setTab("people")} icon={Users}>
              Participants ({party.participants.length}/{capacityLabel})
            </TabButton>
          </div>

          <div className="min-h-0 flex-1 bg-surface">
            {isHost && (
              <div className={tab === "search" ? "h-full" : "hidden"}>
                <PartySearchPanel
                  onPlay={playNow}
                  onEnqueue={enqueue}
                  onDequeue={(desc) => party.setQueue((q) => q.filter((x) => x.id !== desc.id))}
                  queue={queue}
                />
              </div>
            )}
            {tab === "queue" && <QueueList queue={queue} current={current} isHost={isHost} party={party} />}
            {tab === "people" && (
              <PeopleList participants={party.participants} sourceStatus={party.sourceStatus} />
            )}
          </div>
        </div>
      </div>

      <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <button
            type="button"
            onClick={copyCode}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-sm font-bold tracking-widest text-primary transition-colors hover:bg-white/15"
            title="Copier le code du salon"
          >
            {roomCode}
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyInvite}
              title="Copier le lien d'invitation (rejoint automatiquement le salon)"
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              {inviteCopied ? <Check size={14} className="text-accent" /> : <UserPlus size={14} />}
              {inviteCopied ? "Lien copié" : "Inviter"}
            </button>
            {isHost && (
              <button
                type="button"
                onClick={() => setShowOptions((v) => !v)}
                title="Options du salon"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  showOptions ? "bg-primary/20 text-primary" : "text-muted hover:bg-white/10 hover:text-white"
                }`}
              >
                <Settings2 size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={leave}
              className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              <LogOut size={14} /> Quitter
            </button>
          </div>
        </div>

        {isHost && showOptions && <OptionsPanel options={options} setOptions={party.setOptions} />}

        <div className="min-h-0 flex-1">
          <PartyChat
            chat={party.chat}
            onSend={party.sendChat}
            myClientId={party.me.clientId}
            subscribeReactions={party.subscribeReactions}
            onSendReaction={party.sendReaction}
            docked
          />
        </div>
      </aside>
    </div>
  );
}
