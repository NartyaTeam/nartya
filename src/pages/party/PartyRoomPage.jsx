import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertTriangle, LogOut, Copy, Check, ListVideo,
  Search, Tv, Users, Settings2, UserPlus, Globe,
} from "lucide-react";
import { getSeasonEpisodes } from "@/api/animeApi";
import { hasPlayableSources } from "@/utils/videoSourceUtils";
import { toast } from "@/lib/toast";
import { getEpisodeVideoUrl } from "@/utils/episodeVideoUtils";
import { getOrFetch } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useParty } from "@/contexts/WatchPartyProvider";
import VideoPlayer from "@/components/player/VideoPlayer";
import PartyChat from "@/components/party/PartyChat";
import PartySearchPanel from "@/components/party/PartySearchPanel";
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

function episodeLanguages(ep) {
  if (!ep?.lecteurs) return [];
  return Object.keys(ep.lecteurs).filter((l) => hasPlayableSources(ep.lecteurs[l]));
}

const epNumber = (e) => Number(e.episode ?? e.number);

/**
 * Affichage seulement : la synchro (hôte, horloge, dérive, attentes) vit dans le moteur du cœur.
 * La page extrait la vidéo quand le moteur le demande et relaie ce que fait le lecteur.
 */
export default function PartyRoomPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const party = useParty();
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const { isHost, current, queue, inRoom, connecting, options, roomFull, roomNotFound, loadRequest } = party;
  const capacityLabel = party.capacity == null ? "∞" : party.capacity;

  // La liste porte la clé de son épisode : celle d'un autre anime ne doit jamais servir.
  const [epData, setEpData] = useState({ key: null, list: [] });
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

  // Différé : en StrictMode (dev), React démonte puis remonte aussitôt la page, et quitter
  // tout de suite effacerait le salon qu'on vient de créer.
  const leaveTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(leaveTimerRef.current);
    return () => {
      leaveTimerRef.current = setTimeout(() => party.leaveRoom(), 0);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const episodesKey = current?.slug && current?.season != null ? `${current.slug}:${current.season}` : null;
  useEffect(() => {
    if (!episodesKey) return undefined;
    let alive = true;
    getOrFetch(
      `episodes:${episodesKey}`,
      () => getSeasonEpisodes(current.slug, current.season),
      5 * 60 * 1000
    )
      .then((d) => alive && setEpData({ key: episodesKey, list: d?.episodes || [] }))
      .catch(() => alive && setEpData({ key: episodesKey, list: [] }));
    return () => { alive = false; };
  }, [episodesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const episodesReady = epData.key === episodesKey;
  const episodes = useMemo(() => (episodesReady ? epData.list : []), [episodesReady, epData.list]);

  useEffect(() => { party.setSeasonTotal(episodes.length); }, [episodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentIndex = useMemo(
    () => episodes.findIndex((e) => epNumber(e) === Number(current?.ep)),
    [episodes, current?.ep]
  );
  const currentEpisode = currentIndex >= 0 ? episodes[currentIndex] : null;
  const languages = useMemo(() => episodeLanguages(currentEpisode), [currentEpisode]);
  const queueIndex = useMemo(() => queue.findIndex((x) => x.id === current?.id), [queue, current?.id]);
  const hasPrev = queueIndex > 0;
  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;

  useEffect(() => {
    if (!current) {
      setVideoUrl(null);
      setLoading(false);
      setError(null);
    }
  }, [current]);

  // Extraction à la demande du moteur : une fois par ordre, dès que l'épisode est connu.
  const startedRef = useRef(0);
  const failedRef = useRef(0);
  useEffect(() => {
    if (!loadRequest || !current || loadRequest.mediaId !== current.id) return;
    const { nonce, mediaId, pinnedSource } = loadRequest;
    if (!currentEpisode) {
      if (episodesReady && failedRef.current !== nonce) {
        failedRef.current = nonce;
        party.reportSource({ mediaId, status: "error" });
      }
      return;
    }
    if (startedRef.current === nonce) return;
    startedRef.current = nonce;
    setLoading(true);
    setError(null);
    setVideoUrl(null);
    const extract = (selectedSource) =>
      getEpisodeVideoUrl(current.slug, current.season, currentIndex, current.lang, {
        episode: currentEpisode,
        episodes,
        selectedSource,
      });
    (async () => {
      let res = await extract(pinnedSource || "auto");
      // Mieux vaut une séance moins bien synchronisée que pas de vidéo.
      if (!res.success && pinnedSource) res = await extract("auto");
      if (startedRef.current !== nonce) return;
      if (res.success) {
        setVideoUrl(res.videoUrl);
        party.reportSource({ mediaId, status: "ready", sourceKey: res.usedSource });
      } else {
        setError(res.error || "Source indisponible pour cet épisode.");
        party.reportSource({ mediaId, status: "error" });
      }
      setLoading(false);
    })();
  }, [loadRequest, current, currentEpisode, currentIndex, episodes, episodesReady]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onPlayerError = useCallback(() => {
    setError("La lecture a échoué.");
    party.playerEvent("error", 0);
  }, [party]);

  const roomCode = party.code || codeParam;
  const episodeLabel = current ? `${current.title}${current.ep ? ` — Ép. ${current.ep}` : ""}` : "";

  if (!party.available) {
    return (
      <PartyRoomNotice kind="unavailable" code={codeParam} onBack={() => navigate("/party")} />
    );
  }

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
        {isHost && party.waitingForSources && party.waitingFor.length > 0 && (
          <WaitingBanner
            names={party.waitingFor.map((p) => p.username)}
            onSkip={() => party.setOptions({ waitOnSourceLoad: false, waitOnJoin: false })}
          />
        )}
        {!isHost && party.langChanging && <LangChangingBanner info={party.langChanging} />}

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
              onPrev={party.prev}
              onNext={party.next}
              onLanguageChange={isHost ? party.changeLang : undefined}
              onTimeUpdate={party.playerTick}
              onPlay={(t) => party.playerEvent("play", t)}
              onPause={(t) => party.playerEvent("pause", t)}
              onSeek={(t) => party.playerEvent("seek", t)}
              onEnded={() => party.playerEvent("ended", 0)}
              onStall={() => party.playerEvent("stall", 0)}
              onStallEnd={() => party.playerEvent("stall_end", 0)}
              onError={onPlayerError}
              onPlayerApi={party.attachPlayer}
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
                  onPlay={party.playNow}
                  onEnqueue={party.enqueue}
                  onDequeue={(desc) => party.dequeue(desc.id)}
                  queue={queue}
                />
              </div>
            )}
            {tab === "queue" && <QueueList queue={queue} current={current} isHost={isHost} party={party} />}
            {tab === "people" && <PeopleList participants={party.participants} />}
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
          {options.isPublic && (
            <span
              title="Salon public : visible sur la page Watch Party"
              className="ml-2 mr-auto flex items-center gap-1 text-[11px] font-semibold text-accent"
            >
              <Globe size={12} /> Public
            </span>
          )}
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
