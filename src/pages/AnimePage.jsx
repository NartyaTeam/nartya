import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Heart, Star, ChevronDown, ExternalLink, Megaphone, Play, Languages, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { clipTitle, titleSizeClass } from "@/utils/displayTitle";
import { getAnimePage, resolveAnilistToSlug, getAnimeScans } from "@/api/animeApi";
import { getMediaById } from "@/api/anilist";
import { fetchAniZipData } from "@/api/anizip";
import { getLastWatched } from "@/api/progress";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useDiscordPresence } from "@/hooks/useDiscordPresence";
import { useFavorite } from "@/hooks/useFavorite";
import { useAuthStore } from "@/stores/useAuthStore";
import { useListsStore } from "@/stores/useListsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { SeasonsSection } from "@/components/AnimePage/SeasonsSection";
import { ScansSection } from "@/components/AnimePage/ScansSection";
import { RecommendationsSection } from "@/components/AnimePage/RecommendationsSection";
import { MusicSection } from "@/components/AnimePage/MusicSection";
import { GallerySection } from "@/components/AnimePage/GallerySection";
import AnimeRatingButton from "@/components/AnimePage/AnimeRatingButton";
import BugReportModal from "@/components/BugReportModal";
import PlayerControlsNotice from "@/components/AnimePage/PlayerControlsNotice";
import NotifyBell from "@/components/NotifyBell";
import AnimeLogo, { isClearLogoUrl } from "@/components/anime/AnimeLogo";
import CommentsSection from "@/components/comments/CommentsSection";
import { animeTarget } from "@/api/comments";
import { animeMentionResolver } from "@/lib/commentMentions";
import { Select } from "@/components/ui/Select";
import PageLoader from "@/components/ui/PageLoader";
import { browseGenreFor } from "@/utils/genres";
import { LIST_STATUSES } from "@/utils/lists";
import { asset } from "@/lib/asset";
import { GUEST_FEATURE_MSG } from "@/lib/guest";
import { platform } from "@/platform";
import { getAnimeRatingSummary } from "@/api/ratings";

/** Anime absent du catalogue : fiche AniList seule, sans épisodes. */
async function loadAnime(slug, { lite = false } = {}) {
  const isAnilistId = /^\d+$/.test(slug);
  const realSlug = isAnilistId ? await resolveAnilistToSlug(slug) : slug;

  if (realSlug) {
    const page = await getAnimePage(realSlug, { lite });
    return { streamingSlug: realSlug, ...page };
  }
  if (isAnilistId) {
    const [media, az] = await Promise.all([
      getMediaById(slug).catch(() => null),
      fetchAniZipData(slug).catch(() => null),
    ]);
    if (!media) throw new Error("not found");
    return {
      streamingSlug: null,
      anime: null,
      anilist: media,
      images: az
        ? { fanart: az.fanart, banner: az.banner, poster: az.poster, clearLogo: az.clearLogo }
        : null,
      seasons: [],
    };
  }
  throw new Error("not found");
}

export default function AnimePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const defaultLanguage = useSettingsStore((s) => s.defaultLanguage);
  const liteMode = useSettingsStore((s) => s.liteMode);
  const setSetting = useSettingsStore((s) => s.setSetting);
  // Une seule fois sur cet appareil.
  const [playerControlsNoticeOpen, setPlayerControlsNoticeOpen] = useState(
    () => !useSettingsStore.getState().playerUpdateNoticeSeen
  );

  const { data, loading, error } = useCachedResource(
    `anime:${slug}:${liteMode ? "lite" : "full"}`,
    () => loadAnime(slug, { lite: liteMode }),
    10 * 60 * 1000
  );

  const anime = data?.anime;
  const anilist = data?.anilist;
  const images = data?.images;
  const streamingSlug = data?.streamingSlug || null;

  const title = anime?.title?.trim() || anilist?.title || "Sans titre";
  // Sur une franchise regroupée sous une fiche, l'artwork de base reste figé sur la première
  // saison : celui de la saison sélectionnée prime.
  const [seasonMeta, setSeasonMeta] = useState(null);
  const handleSeasonMeta = useCallback((meta) => setSeasonMeta(meta), []);
  // Le composant ne démonte pas entre deux fiches.
  useEffect(() => {
    setSeasonMeta(null);
  }, [slug]);
  useEffect(() => {
    setSynopsisOpen(false);
  }, [slug]);
  const cover = seasonMeta?.cover || images?.poster || anime?.image || anilist?.cover;
  const banner = seasonMeta?.banner || images?.fanart || images?.banner || anilist?.banner;
  const clearLogo = isClearLogoUrl(images?.clearLogo) ? images.clearLogo : null;
  const synopsis = seasonMeta?.description || anime?.synopsis || anilist?.description || "";
  // Seule la troisième source peut être en anglais ; sans `descriptionLang`, rien.
  const synopsisEnAnglais =
    !seasonMeta?.description &&
    !anime?.synopsis &&
    Boolean(anilist?.description) &&
    anilist?.descriptionLang === "en";
  const genres = anilist?.genres || [];
  const altTitle = anime?.alternativeTitles?.[0] || anilist?.titleNative;
  const countryOfOrigin = anilist?.countryOfOrigin || null;
  const ratingSlug = data ? streamingSlug || slug : null;
  const [ratingSummary, setRatingSummary] = useState(null);

  // Indépendante de la note AniList. Un échec reste silencieux.
  useEffect(() => {
    let cancelled = false;
    setRatingSummary(null);
    if (!ratingSlug) return () => { cancelled = true; };
    getAnimeRatingSummary(ratingSlug)
      .then((summary) => !cancelled && setRatingSummary(summary))
      .catch((e) => console.warn("[ratings] résumé indisponible :", e?.message || e));
    return () => { cancelled = true; };
  }, [ratingSlug]);

  // Statut du catalogue d'abord, sinon AniList (RELEASING).
  const statusLabel = anime?.status || null;
  const airing = statusLabel ? /en\s*cours/i.test(statusLabel) : anilist?.status === "RELEASING";
  const news = anime?.news || null;

  // À part, pour ne pas retarder les épisodes. Onglet par défaut pour un pur manga.
  const { data: scansData } = useCachedResource(
    streamingSlug ? `scans:${streamingSlug}` : null,
    () => getAnimeScans(streamingSlug),
    10 * 60 * 1000
  );
  const scans = scansData || [];
  const hasScans = scans.length > 0;
  const hasEpisodes = (data?.seasons?.length || 0) > 0;
  // Œuvre diffusée ailleurs : l'onglet existe pour renvoyer vers le diffuseur officiel.
  const externalWatch = anime?.externalWatch || [];
  const showEpisodesTab = hasEpisodes || externalWatch.length > 0;
  // Recommandations et Musiques exigent un slug résolu côté serveur.
  const tabs = [
    ...(showEpisodesTab ? [{ id: "episodes", label: "Épisodes" }] : []),
    ...(hasScans ? [{ id: "scans", label: "Scans" }] : []),
    ...(streamingSlug
      ? [
          { id: "recommandations", label: "Recommandations" },
          { id: "musiques", label: "Musiques" },
          { id: "galerie", label: "Galerie" },
        ]
      : []),
    { id: "commentaires", label: "Commentaires" },
  ];
  // ?tab=, restauré au retour arrière.
  const urlTab = searchParams.get("tab");
  const [contentTab, setContentTab] = useState(
    tabs.some((t) => t.id === urlTab) ? urlTab : "episodes"
  );
  // Sans ce reset, un onglet de la fiche précédente resterait affiché.
  useEffect(() => {
    setContentTab("episodes");
  }, [slug]);
  useEffect(() => {
    // Les scans arrivent après le premier rendu.
    if (urlTab && tabs.some((tab) => tab.id === urlTab)) {
      setContentTab(urlTab);
      return;
    }
    if (!urlTab && data && !(data.seasons?.length) && scans.length) {
      setContentTab("scans");
      return;
    }
    if (!urlTab && data && !showEpisodesTab && !scans.length) setContentTab("commentaires");
  }, [data, scans.length, urlTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // En quittant les scans, les params de lecture sont retirés.
  const selectTab = (t) => {
    setContentTab(t);
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    if (t !== "scans") {
      next.delete("oeuvre");
      next.delete("chapter");
    }
    setSearchParams(next, { replace: true });
  };

  const { fav, toggle } = useFavorite(streamingSlug || slug, { title, cover, genre: genres[0] });

  const listSlug = streamingSlug || slug;
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? null;
  const isGuest = !!session?.user?.is_anonymous;
  const ensureLists = useListsStore((s) => s.ensureLoaded);
  const listStatus = useListsStore((s) => s.statuses.get(listSlug) || null);
  const setListStatus = useListsStore((s) => s.setStatus);
  const removeListStatus = useListsStore((s) => s.remove);
  useEffect(() => {
    ensureLists();
  }, [ensureLists]);

  const [lastWatched, setLastWatched] = useState(null);
  useEffect(() => {
    if (!userId || isGuest || !streamingSlug) {
      setLastWatched(null);
      return;
    }
    let alive = true;
    getLastWatched(streamingSlug, userId)
      .then((value) => alive && setLastWatched(value))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isGuest, streamingSlug, userId]);

  const onListChange = (value) => {
    if (!session || isGuest) {
      toast.info(session ? GUEST_FEATURE_MSG : "Connecte-toi pour gérer tes listes");
      return;
    }
    if (value === "__remove__") removeListStatus(listSlug);
    else setListStatus(listSlug, value, { title, cover });
  };

  useDiscordPresence(
    { type: "anime", animeTitle: title, animeSlug: streamingSlug || slug },
    [title, streamingSlug, slug]
  );

  // Signalement contextuel : chaque section fournit son contexte. Réservé aux membres connectés.
  const [report, setReport] = useState(null);
  const openReport = (ctx = {}) => {
    if (!session || isGuest) {
      toast.info(session ? GUEST_FEATURE_MSG : "Connecte-toi pour signaler un problème");
      return;
    }
    setReport({
      context: { slug: listSlug, title, ...ctx },
      category: ctx.kind === "scan" ? "scans" : "catalog",
    });
  };

  const synopsisNotice = synopsisEnAnglais ? (
    <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted/70">
      <Languages size={13} className="mt-px shrink-0" />
      Ce synopsis n’est pas encore disponible en français — il s’affiche en anglais en
      attendant.
    </p>
  ) : null;

  const shouldTruncate = synopsis.length > 420;
  const displaySynopsis = shouldTruncate && !synopsisOpen ? synopsis.slice(0, 420) + "…" : synopsis;

  const seasons = data?.seasons || [];
  let resume = null;
  if (streamingSlug) {
    if (lastWatched) {
      // Extrait du nom, pas de la position : la liste contient aussi des panneaux bonus (Director's
      // Cut, Films…).
      const season = seasons.find((s) => String(s.id) === String(lastWatched.seasonId));
      const seasonNum = (season?.name || "").match(/\d+/)?.[0];
      resume = {
        label: lastWatched.completed ? "Revoir" : "Reprendre",
        sub: `${seasonNum ? `S${seasonNum} · ` : ""}E${lastWatched.episodeNumber}`,
        season: lastWatched.seasonId,
        episode: lastWatched.episodeNumber,
        language: lastWatched.language,
      };
    } else if (seasons[0]) {
      resume = {
        label: "Commencer",
        sub: null,
        season: seasons[0].id,
        episode: 1,
        language: defaultLanguage,
      };
    }
  }

  const toggleFavorite = () => {
    platform.haptic?.("light");
    toggle();
  };
  const startWatching = () => {
    if (!resume) return;
    platform.haptic?.("medium");
    const params = new URLSearchParams({
      season: String(resume.season),
      ep: String(resume.episode),
      lang: resume.language || defaultLanguage,
    });
    navigate(`/watch/${streamingSlug}?${params.toString()}`);
  };

  // Pour ne pas reconstruire ses caches à chaque rendu.
  const mentionResolver = useMemo(
    () => animeMentionResolver(streamingSlug || slug, data?.seasons || []),
    [streamingSlug, slug, data?.seasons]
  );

  if (loading && !data) {
    return <PageLoader />;
  }

  if (error || (!anime && !anilist)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-display text-2xl">Anime introuvable</p>
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={18} /> Retour
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-16">
      <div className="relative h-[300px] w-full overflow-hidden md:h-[380px]">
        {banner ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${banner})` }} />
        ) : (
          <div className="absolute inset-0 bg-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/70 to-transparent" />
      </div>

      <div className="relative z-10 -mt-28 flex flex-col items-center px-4 text-center md:hidden">
        {clearLogo ? (
          <AnimeLogo
            src={clearLogo}
            alt={title}
            className="h-24 w-[80%]"
            imageClassName="object-center"
          />
        ) : (
          <h1 className={`block max-w-full break-words leading-[1.05] t-impact [filter:drop-shadow(0_2px_14px_rgb(0_0_0/0.75))] ${titleSizeClass(title, "page")}`}>
            {clipTitle(title, 90)}
          </h1>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted">
          {anilist?.score != null && (
            <span className="flex items-center gap-1 font-semibold text-accent">
              <Star size={14} className="fill-accent" />
              {anilist.score.toFixed(1)}
            </span>
          )}
          {anilist?.year && <span>{anilist.year}</span>}
          {anilist?.format && <span className="uppercase">{anilist.format}</span>}
          {anilist?.episodes && <span>{anilist.episodes} ép.</span>}
          {statusLabel && <span className={airing ? "font-medium text-primary" : ""}>{statusLabel}</span>}
        </div>

        {genres.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-muted">
            {genres.map((genre, index) => {
              const browse = browseGenreFor(genre);
              return (
                <span key={genre}>
                  {index > 0 && ", "}
                  {browse ? (
                    <Link to={`/genre/${encodeURIComponent(browse)}`} className="active:text-primary">
                      {genre}
                    </Link>
                  ) : (
                    genre
                  )}
                </span>
              );
            })}
          </p>
        )}

        {news && (
          <div className="mt-4 flex w-full max-w-2xl items-start gap-2.5 rounded-md bg-primary/[0.08] px-3.5 py-2.5 text-left text-sm text-text/90 ring-1 ring-primary/20">
            <Megaphone size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>{news}</span>
          </div>
        )}

        {synopsis && (
          <div className="mt-4 w-full max-w-2xl text-left">
            <p className={`whitespace-pre-line text-sm leading-relaxed text-text/85 ${synopsisOpen ? "" : "line-clamp-3"}`}>
              {synopsis}
            </p>
            {synopsis.length > 160 && (
              <button
                onClick={() => setSynopsisOpen((value) => !value)}
                className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary"
              >
                {synopsisOpen ? "Voir moins" : "Voir plus"}
                <ChevronDown size={15} className={synopsisOpen ? "rotate-180" : ""} />
              </button>
            )}
            {synopsisNotice}
          </div>
        )}

        {resume && (
          <button onClick={startWatching} className="btn-shu mt-5 w-full transition-transform active:scale-[0.98]">
            <Play size={18} className="shrink-0 fill-current" />
            <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              {resume.label}
              {resume.sub && <span className="text-xs font-normal opacity-80">{resume.sub}</span>}
            </span>
          </button>
        )}

        <div className="mt-5 flex w-full items-center justify-center gap-10">
          <button
            onClick={toggleFavorite}
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            className={`transition-all duration-200 active:scale-90 ${fav ? "text-primary" : "text-muted"}`}
          >
            <Heart size={24} className={fav ? "fill-current" : ""} />
          </button>
          {airing && (
            <NotifyBell
              slug={streamingSlug || slug}
              title={title}
              variant="icon"
              iconSize={24}
              subtle
              className="!p-0 !ring-0"
            />
          )}
          {anime?.url && (
            <a
              href={anime.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Voir sur Anime-Sama"
              title="Voir sur Anime-Sama"
              className="text-muted transition-all duration-200 active:scale-90"
            >
              <img src={asset("anime-sama.png")} alt="" className="h-6 w-6 rounded-sm object-cover opacity-60" />
            </a>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-44 hidden px-4 md:block md:px-14">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="shrink-0">
            <div className="relative w-44 -rotate-2 overflow-hidden rounded-md ring-2 ring-text/25 shadow-[6px_6px_0_rgb(var(--primary))] transition-transform duration-200 hover:rotate-0 md:w-52">
              {cover ? (
                <img src={cover} alt={title} className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="aspect-[2/3] w-full bg-surface-2" />
              )}
            </div>
            {resume && (
              <button onClick={startWatching} className="btn-shu mt-3 w-44 px-4 md:w-52">
                <Play size={18} className="shrink-0 fill-current" />
                <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                  {resume.label}
                  {resume.sub && <span className="text-xs font-normal opacity-80">{resume.sub}</span>}
                </span>
              </button>
            )}
            <button
              onClick={toggleFavorite}
              className={`mt-3 flex w-44 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-colors md:w-52 ${
                fav ? "bg-primary text-primary-fg" : "bg-surface text-text ring-2 ring-border hover:bg-surface-2"
              }`}
            >
              <Heart size={16} className={fav ? "fill-current" : ""} />
              {fav ? "Dans mes favoris" : "Ajouter aux favoris"}
            </button>

            {airing && (
              <NotifyBell slug={streamingSlug || slug} title={title} variant="button" className="mt-2" />
            )}

            <Select
              title="Ma liste"
              placeholder="Ajouter à ma liste"
              value={listStatus || undefined}
              onValueChange={onListChange}
              className="mt-2 w-44 md:w-52"
              options={[
                ...LIST_STATUSES.map((s) => ({ value: s.key, label: s.label })),
                ...(listStatus ? [{ value: "__remove__", label: "Retirer de ma liste" }] : []),
              ]}
            />
          </div>

          <div className="flex-1 pt-2 md:pt-28">
            {/* Sinon le titre en toutes lettres ; le titre reste porté par l'`alt`. */}
            {clearLogo ? (
              <AnimeLogo
                src={clearLogo}
                alt={title}
                className="h-28 w-[80%] md:h-32"
                imageClassName="origin-left object-left"
              />
            ) : (
              <h1 className={`block max-w-full break-words leading-[1.05] t-impact [filter:drop-shadow(0_2px_14px_rgb(0_0_0/0.75))] ${titleSizeClass(title, "page")}`}>
                {clipTitle(title, 90)}
              </h1>
            )}
            {altTitle && altTitle !== title && <p className="mt-1.5 text-muted">{altTitle}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              {anilist?.score != null && (
                <span className="flex items-center gap-1 font-semibold text-accent">
                  <Star size={14} className="fill-accent" />
                  AniList {anilist.score.toFixed(1)}/10
                </span>
              )}
              {ratingSummary && (
                <span
                  className={`flex items-center gap-1 font-semibold ${
                    ratingSummary.average == null ? "text-muted" : "text-primary"
                  }`}
                  title={
                    ratingSummary.count > 0
                      ? `${ratingSummary.count} note${ratingSummary.count > 1 ? "s" : ""} Nartya`
                      : "Aucune note Nartya pour le moment"
                  }
                >
                  <Star
                    size={14}
                    className={ratingSummary.average == null ? "text-muted" : "fill-primary text-primary"}
                  />
                  Nartya {ratingSummary.average == null ? "—" : `${ratingSummary.average.toFixed(1)}/5`}
                  {ratingSummary.count > 0 && (
                    <span className="font-normal text-muted">({ratingSummary.count})</span>
                  )}
                </span>
              )}
              {anilist?.year && <span>{anilist.year}</span>}
              {anilist?.format && <span className="uppercase">{anilist.format}</span>}
              {anilist?.episodes && <span>{anilist.episodes} ép.</span>}
              {statusLabel && (
                <span className={`flex items-center gap-1.5 ${airing ? "font-medium text-primary" : ""}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${airing ? "bg-primary" : "bg-muted"}`} />
                  {statusLabel}
                </span>
              )}
            </div>

            {news && (
              <div className="mt-4 flex w-fit max-w-3xl items-start gap-2.5 rounded-md bg-primary/[0.08] px-3.5 py-2.5 text-sm text-text/90 ring-1 ring-primary/20">
                <Megaphone size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold text-primary">Actualité : </span>
                  {news}
                </span>
              </div>
            )}

            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {genres.map((g) => {
                  // Genre présent dans le catalogue : tag cliquable vers le browse.
                  const browse = browseGenreFor(g);
                  return browse ? (
                    <Link
                      key={g}
                      to={`/genre/${encodeURIComponent(browse)}`}
                      className="rounded border-2 border-border bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary"
                    >
                      {g}
                    </Link>
                  ) : (
                    <span key={g} className="rounded border-2 border-border bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-text">
                      {g}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {anime?.url && (
                <a
                  href={anime.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 rounded-md bg-surface/70 px-3 py-2 text-sm font-bold text-text ring-2 ring-border transition-colors hover:bg-white/[0.1] hover:text-primary"
                >
                  <img src={asset("anime-sama.png")} alt="" className="h-4 w-4 rounded-[3px] object-cover" />
                  Voir sur Anime-Sama
                  <ExternalLink size={13} className="text-muted transition-colors group-hover:text-primary" />
                </a>
              )}
              <AnimeRatingButton
                slug={ratingSlug}
                title={title}
                summary={ratingSummary}
                onSummaryChange={setRatingSummary}
              />
            </div>

            {synopsis && (
              <div className="mt-5 max-w-3xl">
                <p className="whitespace-pre-line font-display text-[15px] font-medium leading-7 text-text/80">
                  {displaySynopsis}
                </p>
                {shouldTruncate && (
                  <button
                    onClick={() => setSynopsisOpen((v) => !v)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary"
                  >
                    {synopsisOpen ? "Voir moins" : "Voir plus"}
                    <ChevronDown size={15} className={synopsisOpen ? "rotate-180" : ""} />
                  </button>
                )}
                {synopsisNotice}
              </div>
            )}
          </div>
        </div>
      </div>

      {liteMode && (
        <div className="relative z-10 mx-4 mt-6 flex flex-col gap-3 rounded-md border border-primary/25 bg-primary/[0.07] px-4 py-3.5 sm:mx-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Zap size={17} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-text">Mode no beauty actif</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Seul l’essentiel est chargé : certains visuels, synopsis enrichis et
                vignettes d’épisodes sont volontairement masqués.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSetting("liteMode", false)}
            className="shrink-0 self-start rounded-md bg-primary px-3.5 py-2 text-xs font-bold text-primary-fg transition-colors hover:bg-primary/90 sm:self-auto"
          >
            Afficher la fiche complète
          </button>
        </div>
      )}

      <div className="mt-6">
        {streamingSlug ? (
          <>
            <div className="border-b border-border px-4 sm:px-8">
              <div className="no-scrollbar flex gap-1 overflow-x-auto">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTab(t.id)}
                    className={`-mb-px border-b-4 px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors ${
                      contentTab === t.id
                        ? "border-primary text-text"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {contentTab === "commentaires" ? (
              <CommentsSection
                target={animeTarget(streamingSlug)}
                resolveMention={mentionResolver}
                // Index de la liste, à partir de 1.
                seasons={(data?.seasons || []).map((s, i) => ({ number: i + 1, label: s.name }))}
                showHeader={false}
                className="px-4 sm:px-8"
                myRating={ratingSummary?.mine}
              />
            ) : hasScans && contentTab === "scans" ? (
              <ScansSection
                slug={streamingSlug}
                scans={scans}
                animeTitle={title}
                animeCover={cover}
                onReport={openReport}
              />
            ) : contentTab === "recommandations" ? (
              <RecommendationsSection slug={streamingSlug} />
            ) : contentTab === "musiques" ? (
              <MusicSection slug={streamingSlug} />
            ) : contentTab === "galerie" ? (
              <GallerySection slug={streamingSlug} animeTitle={title} />
            ) : showEpisodesTab ? (
              <SeasonsSection
                slug={streamingSlug}
                animeImage={cover}
                animeTitle={title}
                mapping={anime?.mapping}
                seasons={data?.seasons || []}
                externalWatch={externalWatch}
                defaultLanguage={defaultLanguage}
                countryOfOrigin={countryOfOrigin}
                liteMode={liteMode}
                onReport={openReport}
                onSeasonMeta={handleSeasonMeta}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="border-b border-border px-4 sm:px-8">
              <div className="no-scrollbar flex gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
                    className={`-mb-px border-b-4 px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors ${
                      contentTab === tab.id
                        ? "border-primary text-text"
                        : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="px-4 py-10 text-center text-muted sm:px-8">
              Cet anime n'est pas encore disponible en streaming sur Nartya.
            </p>
            <CommentsSection
              target={animeTarget(slug)}
              resolveMention={mentionResolver}
              seasons={[]}
              showHeader={false}
              className="px-4 sm:px-8"
              myRating={ratingSummary?.mine}
            />
          </>
        )}
      </div>

      {report && (
        <BugReportModal
          onClose={() => setReport(null)}
          context={report.context}
          defaultCategory={report.category}
        />
      )}

      {playerControlsNoticeOpen && (
        <PlayerControlsNotice
          onClose={() => {
            setPlayerControlsNoticeOpen(false);
            setSetting("playerUpdateNoticeSeen", true);
          }}
        />
      )}
    </div>
  );
}
