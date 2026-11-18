import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertTriangle, LogOut, Copy, Check, MessageCircle,
  Search, Tv, Users, Settings2, UserPlus, Globe, X, ListVideo, Radio,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getSeasonEpisodes } from "@/api/animeApi";
import { hasPlayableSources } from "@/utils/videoSourceUtils";
import { toast } from "@/lib/toast";
import { getEpisodeVideoUrl } from "@/utils/episodeVideoUtils";
import { getOrFetch } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSkipSegments } from "@/hooks/useSkipSegments";
import { AutoSkipBadge, PostCreditNotice, SkipSegmentButton } from "@/components/player/WatchOverlays";
import { useParty } from "@/contexts/WatchPartyProvider";
import VideoPlayer from "@/components/player/VideoPlayer";
import PartyChat from "@/components/party/PartyChat";
import PartySearchPanel from "@/components/party/PartySearchPanel";
import { SITE_URL } from "@/config/instance";
import {
  LangBadge,
  LangChangingBanner,
  OptionsPanel,
  PartyRoomNotice,
  PeopleList,
  QueueStrip,
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
  const [tab, setTab] = useState("chat");
  const [showOptions, setShowOptions] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setPickerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

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
  // « À suivre » : seulement ce qui vient après l'épisode en cours.
  const upcoming = useMemo(() => queue.slice(queueIndex + 1), [queue, queueIndex]);

  // Épisode suivant de la saison déjà en file, pour que « À suivre » ne soit jamais vide.
  const autoQueuedRef = useRef(null);
  useEffect(() => {
    if (!isHost || !current || !currentEpisode || queueIndex < 0) return;
    if (queueIndex < queue.length - 1 || autoQueuedRef.current === current.id) return;
    const nextEp = episodes.slice(currentIndex + 1).find((e) => episodeLanguages(e).length > 0);
    if (!nextEp) return;
    autoQueuedRef.current = current.id;
    const num = epNumber(nextEp);
    const langs = episodeLanguages(nextEp);
    const lang = langs.includes(current.lang) ? current.lang : langs.includes("vostfr") ? "vostfr" : langs[0];
    party.enqueue({
      id: `${current.slug}:${current.season}:${num}:${lang}`,
      slug: current.slug,
      season: current.season,
      ep: num,
      lang,
      title: current.title,
      cover: current.cover,
      epThumb: nextEp.thumbnail || nextEp.image || nextEp.thumb || null,
      seasonName: current.seasonName || "",
      epTitle: nextEp.title || `Épisode ${num}`,
    });
  }, [isHost, current, currentEpisode, queueIndex, queue.length, episodes, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Passer l'intro / l'ending : l'hôte seulement, son saut est répercuté chez les autres.
  const autoSkipOpEd = useSettingsStore((s) => s.autoSkipOpEd);
  const skipButtonEnabled = useSettingsStore((s) => s.skipButtonEnabled);
  const [overlayNode, setOverlayNode] = useState(null);
  const playerApiRef = useRef(null);
  const advanceFnRef = useRef(null);
  const skip = useSkipSegments({
    slug: current?.slug,
    seasonId: current?.season,
    epNumber: current?.ep,
    lang: current?.lang,
    currentEpisode,
    autoSkip: false,
    autoSkipOpEd,
    hasNext: false,
    playerApiRef,
    advanceFnRef,
  });
  const updateSkipSegments = skip.update;
  const onTimeUpdate = useCallback(
    (time, duration) => {
      party.playerTick(time, duration);
      if (isHost) updateSkipSegments(time, duration);
    },
    [party, isHost, updateSkipSegments]
  );
  const onPlayerApi = useCallback(
    (api) => {
      playerApiRef.current = api || null;
      party.attachPlayer(api);
    },
    [party]
  );

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

  const hostPerson = party.participants.find((p) => p.isHost);
  const subtitle = current
    ? [current.seasonName, current.ep ? `Épisode ${current.ep}` : null].filter(Boolean).join(" · ")
    : "";

  const playNow = (desc) => {
    party.playNow(desc);
    setPickerOpen(false);
  };

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
              onTimeUpdate={onTimeUpdate}
              onOverlayReady={setOverlayNode}
              onPlay={(t) => party.playerEvent("play", t)}
              onPause={(t) => party.playerEvent("pause", t)}
              onSeek={(t) => party.playerEvent("seek", t)}
              onEnded={() => party.playerEvent("ended", 0)}
              onStall={() => party.playerEvent("stall", 0)}
              onStallEnd={() => party.playerEvent("stall_end", 0)}
              onError={onPlayerError}
              onPlayerApi={onPlayerApi}
            />
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
              {current?.cover && (
                <img
                  src={current.cover}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
                />
              )}
              <div className="relative flex flex-col items-center gap-3">
                {loading ? (
                  <>
                    <Loader2 className="animate-spin text-primary" size={32} />
                    <p className="text-sm text-white/70">Chargement de l'épisode…</p>
                  </>
                ) : error ? (
                  <>
                    <AlertTriangle className="text-primary" size={34} />
                    <p className="max-w-md text-sm text-white/80">{error}</p>
                    {isHost && (
                      <button onClick={() => setPickerOpen(true)} className="btn-ghost mt-1">
                        Choisir un autre épisode
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                      <Tv size={34} className="text-white/40" />
                    </span>
                    <h2 className="t-impact text-3xl sm:text-4xl">
                      {isHost ? "Qu'est-ce qu'on regarde ?" : "Le salon est prêt"}
                    </h2>
                    <p className="max-w-sm text-sm text-muted">
                      {isHost
                        ? "Choisis un anime, la lecture sera synchronisée pour tout le monde."
                        : "En attente que l'hôte lance un épisode…"}
                    </p>
                    {isHost && (
                      <button onClick={() => setPickerOpen(true)} className="btn-shu mt-2">
                        <Search size={17} /> Choisir un anime
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {isHost && overlayNode &&
          createPortal(
            <>
              {skip.postCreditVisible && <PostCreditNotice />}
              {skip.skipSeg &&
                skipButtonEnabled &&
                (!autoSkipOpEd ||
                  (skip.skipSeg.type === "intro" ? skip.introManualFallback : skip.outroManualFallback)) && (
                  <SkipSegmentButton segment={skip.skipSeg} hasNext={false} onSkip={skip.skipSegment} />
                )}
              {skip.autoSkipBadge && <AutoSkipBadge kind={skip.autoSkipBadge} />}
            </>,
            overlayNode
          )}

        <div className="max-h-[38vh] shrink-0 space-y-4 overflow-y-auto border-t border-border bg-bg px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="relative shrink-0">
              <Avatar
                src={hostPerson?.avatar}
                name={hostPerson?.username || "?"}
                className="h-12 w-12 rounded-full ring-2 ring-primary"
                textClassName="text-base"
              />
              <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded bg-primary px-1 text-[9px] font-extrabold uppercase text-primary-fg">
                <Radio size={9} /> Live
              </span>
            </div>
            <div className="min-w-0 flex-1 basis-60">
              <h1 className="truncate font-display text-lg font-bold text-white">
                {current ? current.epTitle || episodeLabel : "Salon en préparation"}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {current ? (
                  <>
                    <span className="truncate text-primary">{current.title}</span>
                    {subtitle && <span className="truncate">{subtitle}</span>}
                    <LangBadge lang={current.lang} />
                  </>
                ) : (
                  <span>Salon de {hostPerson?.username || "l'hôte"}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                title="Participants"
                className="flex h-9 items-center gap-1.5 rounded-md bg-white/5 px-3 text-sm font-semibold tabular-nums text-white/80"
              >
                <Users size={15} className="text-primary" />
                {party.participants.length}/{capacityLabel}
              </span>
              {isHost && (
                <button onClick={() => setPickerOpen(true)} className="btn-shu !h-9 !px-3 !text-sm">
                  <Search size={15} /> {current ? "Changer" : "Choisir"}
                </button>
              )}
            </div>
          </div>

          {upcoming.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <ListVideo size={13} /> À suivre
                <span className="tabular-nums">({upcoming.length})</span>
              </p>
              <QueueStrip queue={upcoming} isHost={isHost} party={party} />
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
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
              className="flex items-center gap-1 text-[11px] font-semibold text-accent"
            >
              <Globe size={12} /> Public
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={copyInvite}
            title="Copier le lien d'invitation (rejoint automatiquement le salon)"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            {inviteCopied ? <Check size={14} className="text-accent" /> : <UserPlus size={14} />}
            {inviteCopied ? "Copié" : "Inviter"}
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
            title="Quitter le salon"
            className="flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/15"
          >
            <LogOut size={15} />
          </button>
        </div>

        {isHost && showOptions && <OptionsPanel options={options} setOptions={party.setOptions} />}

        <div className="flex border-b border-border">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={MessageCircle}>
            Chat
          </TabButton>
          <TabButton active={tab === "people"} onClick={() => setTab("people")} icon={Users}>
            Participants ({party.participants.length})
          </TabButton>
        </div>

        <div className="min-h-0 flex-1">
          <div className={tab === "chat" ? "h-full" : "hidden"}>
            <PartyChat
              chat={party.chat}
              onSend={party.sendChat}
              myClientId={party.me.clientId}
              subscribeReactions={party.subscribeReactions}
              onSendReaction={party.sendReaction}
              docked
              hideHeader
            />
          </div>
          {tab === "people" && <PeopleList participants={party.participants} />}
        </div>
      </aside>

      {isHost && (
        <div
          className={`fixed inset-0 z-[100] items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8 ${
            pickerOpen ? "flex" : "hidden"
          }`}
          onMouseDown={(e) => e.target === e.currentTarget && setPickerOpen(false)}
        >
          <div className="relative flex h-full max-h-[760px] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-white/10 bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="font-display text-lg font-bold text-white">Choisir quoi regarder</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <PartySearchPanel
                active={pickerOpen}
                onPlay={playNow}
                onEnqueue={party.enqueue}
                onDequeue={(desc) => party.dequeue(desc.id)}
                queue={queue}
                currentId={current?.id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
