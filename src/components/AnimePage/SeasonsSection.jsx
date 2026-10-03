import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, ArrowDownUp, Loader2, X, Flag as FlagIcon, Languages, EyeOff, Eye } from "lucide-react";
import { ExternalWatch } from "@/components/AnimePage/ExternalWatch";
import { getSeasonEpisodes } from "@/api/animeApi";
import {
  hasPlayableSources,
  sourceSelectOptions,
  sortSourcesForDisplay,
} from "@/utils/videoSourceUtils";
import { prewarmEpisodeSource, episodesCacheKey } from "@/utils/episodeVideoUtils";
import { downloadsAvailable, downloadId } from "@/api/downloads";
import { useCachedResource } from "@/hooks/useCachedResource";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { sortSeasonsForDisplay } from "@/utils/seasonSort";
import { Select } from "@/components/ui/Select";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";
import { EpisodeCard } from "./EpisodeCard";
import { SeasonWatchedMenu } from "./SeasonWatchedMenu";
import { SeasonsMobileToolbar, SeasonDownloadButton, MobileSelectionBar } from "./SeasonsControls";
import { platform } from "@/platform";
import { useSeasonWatched } from "@/hooks/useSeasonWatched";
import { useSeasonDownloads } from "@/hooks/useSeasonDownloads";

const CONTROL_H = "h-10";
const MOBILE_EPISODE_BATCH = 30;

export function SeasonsSection({
  slug,
  animeImage,
  animeTitle,
  seasons = [],
  externalWatch = [],
  defaultLanguage = "vostfr",
  countryOfOrigin,
  liteMode = false,
  onReport,
  onSeasonMeta,
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuthStore((s) => s.session);
  const isGuest = !!session?.user?.is_anonymous;
  const orderedSeasons = useMemo(() => sortSeasonsForDisplay(seasons), [seasons]);

  const canDownload = downloadsAvailable() && !isGuest;
  const cancelDownloadAction = useDownloadsStore((s) => s.cancel);
  const removeDownloadAction = useDownloadsStore((s) => s.remove);

  // ?season=, sinon la première : le retour depuis le lecteur restaure la saison consultée.
  const [selectedSeason, setSelectedSeason] = useState(() => {
    const fromUrl = searchParams.get("season");
    return (
      (fromUrl && orderedSeasons.find((s) => String(s.id) === fromUrl)) ||
      orderedSeasons[0] ||
      null
    );
  });
  const [selectedLanguage, setSelectedLanguage] = useState(() => searchParams.get("lang") || defaultLanguage);
  const [selectedSource, setSelectedSource] = useState(() => searchParams.get("src") || "auto");
  // Masqué par défaut ; la bascule automatique reste active sans lui.
  const advancedPlayerControls = useSettingsStore((s) => s.advancedPlayerControls);
  const spoilerMode = useSettingsStore((s) => s.spoilerMode);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const toggleSpoilerMode = () => setSetting("spoilerMode", !spoilerMode);
  const [search, setSearch] = useState("");
  const [reversed, setReversed] = useState(false);
  const [visibleEpisodeCount, setVisibleEpisodeCount] = useState(MOBILE_EPISODE_BATCH);
  const loadMoreRef = useRef(null);
  // Mobile. `selectedNums` porte des numéros d'épisode, stables d'une langue à l'autre.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNums, setSelectedNums] = useState(() => new Set());

  useEffect(() => {
    if (!selectedSeason && orderedSeasons.length) setSelectedSeason(orderedSeasons[0]);
  }, [orderedSeasons, selectedSeason]);

  // Reflété dans l'URL (replace).
  const selectSeason = (season) => {
    if (!season) return;
    setSelectedSeason(season);
    setSearch("");
    const next = new URLSearchParams(searchParams);
    next.set("season", String(season.id));
    setSearchParams(next, { replace: true });
  };

  const selectLanguage = (lang) => {
    setSelectedLanguage(lang);
    const next = new URLSearchParams(searchParams);
    next.set("lang", lang);
    setSearchParams(next, { replace: true });
  };

  // « auto », valeur par défaut, est omise de l'URL.
  const selectSource = (src) => {
    setSelectedSource(src);
    const next = new URLSearchParams(searchParams);
    if (src && src !== "auto") next.set("src", src);
    else next.delete("src");
    setSearchParams(next, { replace: true });
  };

  const { data: epData, loading } = useCachedResource(
    // Partagée avec le lecteur, qui réutilise cette liste.
    selectedSeason ? episodesCacheKey(slug, selectedSeason.id, liteMode) : null,
    () => getSeasonEpisodes(slug, selectedSeason.id, { lite: liteMode }),
    5 * 60 * 1000
  );
  const episodes = useMemo(() => epData?.episodes || [], [epData]);
  const nextEpisode = epData?.nextEpisode || null;

  // `null` : le parent garde l'artwork et le synopsis de la fiche. Rien n'est émis pendant
  // qu'une saison charge, sinon l'affichage repasserait par la fiche de base.
  useEffect(() => {
    if (!epData && loading) return;
    onSeasonMeta?.(
      epData
        ? {
            cover: epData.seasonCover || null,
            banner: epData.seasonBanner || null,
            description: epData.seasonDescription || null,
          }
        : null
    );
  }, [epData, loading, onSeasonMeta]);

  const availableLanguages = useMemo(() => {
    const set = new Set();
    episodes.forEach((ep) => {
      if (!ep.lecteurs) return;
      Object.keys(ep.lecteurs).forEach((lang) => {
        if (hasPlayableSources(ep.lecteurs[lang])) set.add(lang);
      });
    });
    return Array.from(set);
  }, [episodes]);

  useEffect(() => {
    if (!availableLanguages.length) return;
    if (!availableLanguages.includes(selectedLanguage)) {
      // Langue par défaut absente : variante numérotée (« vf » → « vf1 »).
      const base = (defaultLanguage || "").toLowerCase();
      const variant = availableLanguages.find((l) => l.toLowerCase().replace(/\d+$/, "") === base);
      setSelectedLanguage(
        availableLanguages.includes(defaultLanguage)
          ? defaultLanguage
          : variant || availableLanguages[0]
      );
    }
  }, [availableLanguages, selectedLanguage, defaultLanguage]);

  const filteredEpisodes = useMemo(() => {
    return episodes.filter((ep) => {
      const langSrc = ep.lecteurs?.[selectedLanguage];
      if (!langSrc) return false;
      if (!hasPlayableSources(langSrc)) return false;
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      const num = String(ep.episode ?? ep.number ?? "");
      return num === term || (ep.title || "").toLowerCase().includes(term);
    });
  }, [episodes, selectedLanguage, search]);

  const displayEpisodes = useMemo(() => {
    const base = [...filteredEpisodes];
    // `nextEpisode` vaut pour toute la saison : ajouté seulement s'il suit le dernier épisode
    // disponible dans la langue courante.
    const lastAvailable = base.reduce(
      (max, ep) => Math.max(max, Number(ep.episode || ep.number) || 0),
      0
    );
    const upcomingNumber = Number(nextEpisode?.episode || nextEpisode?.number) || 0;
    if (nextEpisode && !search.trim() && upcomingNumber === lastAvailable + 1) {
      base.push(nextEpisode);
    }
    return reversed ? [...base].reverse() : base;
  }, [filteredEpisodes, nextEpisode, reversed, search]);

  // ?focus= : une seule fois, puis la surbrillance s'éteint.
  const [focusEpisode, setFocusEpisode] = useState(() => Number(searchParams.get("focus")) || null);
  useEffect(() => {
    if (!focusEpisode) return undefined;
    const index = displayEpisodes.findIndex((ep) => Number(ep.episode || ep.number) === focusEpisode);
    if (index < 0) return undefined;
    // Mobile : la liste est rendue par lots, l'épisode visé doit exister dans le DOM.
    setVisibleEpisodeCount((count) => Math.max(count, index + 1));
    const timer = setTimeout(() => setFocusEpisode(null), 4000);
    return () => clearTimeout(timer);
  }, [focusEpisode, displayEpisodes]);

  const visibleEpisodes = platform.isMobile
    ? displayEpisodes.slice(0, visibleEpisodeCount)
    : displayEpisodes;

  const firstBatchReset = useRef(true);
  useEffect(() => {
    // Ne pas écraser le lot déjà élargi pour l'épisode mis en évidence.
    if (firstBatchReset.current) {
      firstBatchReset.current = false;
      return;
    }
    setVisibleEpisodeCount(MOBILE_EPISODE_BATCH);
  }, [selectedSeason?.id, selectedLanguage, search, reversed]);

  // La sélection ne survit pas à un changement de saison ou de langue.
  useEffect(() => {
    setSelectMode(false);
    setSelectedNums(new Set());
  }, [selectedSeason?.id, selectedLanguage]);

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedNums(new Set());
  };

  const toggleEpisodeSelected = (num) => {
    setSelectedNums((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  useEffect(() => {
    if (!platform.isMobile || visibleEpisodeCount >= displayEpisodes.length) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleEpisodeCount((count) =>
            Math.min(count + MOBILE_EPISODE_BATCH, displayEpisodes.length)
          );
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayEpisodes.length, visibleEpisodeCount]);

  // Hors « à venir ».
  const watchableEpisodes = useMemo(
    () =>
      episodes.filter((ep) => {
        if (ep.__isUpcomingUnavailable) return false;
        const langSrc = ep.lecteurs?.[selectedLanguage];
        return hasPlayableSources(langSrc);
      }),
    [episodes, selectedLanguage]
  );
  const episodeCount = watchableEpisodes.length;
  const { progressMap, toggleWatched, markWatchedUpTo, unmarkSeason } = useSeasonWatched({
    slug,
    session,
    isGuest,
    selectedSeason,
    selectedLanguage,
    animeTitle,
    animeImage,
    displayEpisodes,
    watchableEpisodes,
  });
  const lastEpisode = useMemo(
    () => watchableEpisodes.reduce((m, ep) => Math.max(m, Number(ep.episode || ep.number) || 0), 0),
    [watchableEpisodes]
  );
  const watchedCount = useMemo(
    () =>
      watchableEpisodes.reduce(
        (n, ep) => n + (progressMap[`${selectedSeason?.id}:${ep.episode || ep.number}`]?.completed ? 1 : 0),
        0
      ),
    [watchableEpisodes, progressMap, selectedSeason]
  );

  const availableSources = useMemo(() => {
    const first = filteredEpisodes.find((ep) => ep.lecteurs?.[selectedLanguage]);
    if (!first) return [];
    return sortSourcesForDisplay(first.lecteurs[selectedLanguage]);
  }, [filteredEpisodes, selectedLanguage]);

  // Une source venue de l'URL peut manquer dans la langue courante.
  useEffect(() => {
    if (selectedSource === "auto" || !availableSources.length) return;
    if (!availableSources.some((s) => s.key === selectedSource)) selectSource("auto");
  }, [availableSources, selectedSource]); // eslint-disable-line react-hooks/exhaustive-deps

  // `descriptionLang` vient de l'API ; les titres, souvent en rōmaji, ne comptent pas. Une
  // traduction automatique compte comme du français.
  const frNotice = useMemo(() => {
    const avecTexte = displayEpisodes.filter((ep) => ep?.descriptionLang);
    if (!avecTexte.length) return null;
    const enAnglais = avecTexte.filter((ep) => ep.descriptionLang === "en").length;
    if (!enAnglais) return null;
    return enAnglais === avecTexte.length
      ? "Aucun synopsis n’est disponible en français pour cette saison — les textes s’affichent en anglais en attendant."
      : "Certains épisodes n’ont pas encore de synopsis en français — ceux-là s’affichent en anglais en attendant.";
  }, [displayEpisodes]);

  const playEpisode = (ep) => {
    const num = ep.episode || ep.number;
    const params = new URLSearchParams({
      season: selectedSeason.id,
      ep: String(num),
      lang: selectedLanguage,
      src: selectedSource,
    });
    navigate(`/watch/${slug}?${params.toString()}`);
  };

  const {
    downloadsById,
    resolving,
    seasonDl,
    handleDownload,
    downloadableEpisodes,
    allDownloadableSelected,
    seasonQueuedCount,
    downloadSeason,
    downloadSelectedEpisodes,
    cancelSeasonDownload,
  } = useSeasonDownloads({
    slug,
    selectedSeason,
    selectedLanguage,
    selectedSource,
    animeTitle,
    animeImage,
    canDownload,
    filteredEpisodes,
    selectedNums,
    clearSelection: () => {
      setSelectMode(false);
      setSelectedNums(new Set());
    },
  });

  // Pas de saison, mais un diffuseur officiel.
  if (!seasons.length && externalWatch.length) {
    return <ExternalWatch animeTitle={animeTitle} destinations={externalWatch} />;
  }

  if (!seasons.length) {
    return <p className="px-8 py-10 text-center text-muted">Aucune saison disponible pour cet anime.</p>;
  }

  return (
    <section className="px-4 pb-6 pt-0 md:px-8 md:py-8">
      {frNotice && (
        <p className="-mt-2 mb-3 flex items-start gap-2 text-xs leading-relaxed text-muted/70 md:-mt-5">
          <Languages size={13} className="mt-px shrink-0" />
          {frNotice}
        </p>
      )}

      <SeasonsMobileToolbar
        seasons={seasons}
        selectedSeason={selectedSeason}
        selectedLanguage={selectedLanguage}
        availableLanguages={availableLanguages}
        countryOfOrigin={countryOfOrigin}
        availableSources={availableSources}
        selectedSource={selectedSource}
        advancedPlayerControls={advancedPlayerControls}
        canDownload={canDownload}
        selectMode={selectMode}
        spoilerMode={spoilerMode}
        reversed={reversed}
        search={search}
        onSearchChange={setSearch}
        onToggleSelectMode={toggleSelectMode}
        onToggleSpoilerMode={toggleSpoilerMode}
        onToggleReversed={() => setReversed((value) => !value)}
        onSelectSeason={selectSeason}
        onSelectLanguage={selectLanguage}
        onSelectSource={selectSource}
      />

      <div className="mb-6 hidden flex-wrap items-center gap-2.5 md:flex">
        <Select
          title="Saison"
          value={selectedSeason?.id || ""}
          onValueChange={(id) => selectSeason(orderedSeasons.find((s) => s.id === id))}
          className="min-w-[9rem]"
          options={orderedSeasons.map((s) => ({ value: s.id, label: s.name }))}
        />

        {/* Le drapeau VO/VOSTFR suit le pays d'origine. */}
        {(availableLanguages.length ? availableLanguages : [selectedLanguage]).length > 0 && (
          <Select
            title="Langue"
            value={selectedLanguage}
            onValueChange={selectLanguage}
            className="min-w-[8.5rem]"
            options={(availableLanguages.length
              ? availableLanguages
              : [selectedLanguage]
            ).map((lang) => ({
              value: lang,
              label: getLanguageLabel(lang),
              icon: <Flag lang={lang} countryOfOrigin={countryOfOrigin} size={14} />,
            }))}
          />
        )}

        {/* Seulement avec les contrôles avancés. */}
        {availableSources.length > 0 && advancedPlayerControls && (
          <Select
            title="Source vidéo"
            value={selectedSource}
            onValueChange={selectSource}
            className="min-w-[9.5rem]"
            options={sourceSelectOptions(availableSources)}
          />
        )}

        {session && !isGuest && episodeCount > 0 && (
          <SeasonWatchedMenu
            episodeCount={episodeCount}
            watchedCount={watchedCount}
            lastEpisode={lastEpisode}
            onMarkUpTo={markWatchedUpTo}
            onMarkAll={() => markWatchedUpTo(lastEpisode)}
            onUnmarkAll={unmarkSeason}
            controlH={CONTROL_H}
          />
        )}

        {canDownload && (
          <SeasonDownloadButton
            seasonDl={seasonDl}
            selectedSeason={selectedSeason}
            seasonQueuedCount={seasonQueuedCount}
            downloadableEpisodes={downloadableEpisodes}
            onDownload={() => downloadSeason()}
            onCancel={cancelSeasonDownload}
            controlH={CONTROL_H}
          />
        )}

        {/* Passe sur sa propre ligne si la barre est trop étroite. */}
        <div className="ml-auto flex min-w-0 flex-1 basis-72 items-center gap-2.5 sm:max-w-sm">
          <div
            className={`flex ${CONTROL_H} min-w-0 flex-1 items-center gap-2.5 rounded-md bg-surface px-3.5 ring-1 ring-border transition-colors focus-within:ring-primary/60`}
          >
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un épisode (n° ou titre)…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                title="Effacer"
                className="shrink-0 text-muted transition-colors hover:text-text"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            onClick={() => setReversed((v) => !v)}
            title={reversed ? "Ordre décroissant" : "Ordre croissant"}
            className={`flex ${CONTROL_H} w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-border transition-colors ${
              reversed ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:text-text"
            }`}
          >
            <ArrowDownUp size={16} />
          </button>
          <button
            onClick={toggleSpoilerMode}
            title={spoilerMode ? "Afficher les vignettes" : "Flouter les vignettes (anti-spoiler)"}
            className={`flex ${CONTROL_H} w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-border transition-colors ${
              spoilerMode ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {spoilerMode ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {onReport && (
            <button
              onClick={() =>
                onReport({ kind: "episode", season: selectedSeason?.name || null, episode: null })
              }
              title="Signaler un problème sur cette saison (épisode décalé, manquant, mauvaise vidéo…)"
              className={`flex ${CONTROL_H} w-10 shrink-0 items-center justify-center rounded-md bg-surface text-muted ring-1 ring-border transition-colors hover:text-primary`}
            >
              <FlagIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {loading && !episodes.length ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted">
          <Loader2 className="animate-spin" size={18} />
          Chargement des épisodes…
        </div>
      ) : displayEpisodes.length === 0 ? (
        <p className="py-16 text-center text-muted">
          Aucun épisode disponible en {getLanguageLabel(selectedLanguage)}.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {visibleEpisodes.map((ep, idx) => {
            const num = ep.episode || ep.number;
            const dlId = downloadId(slug, selectedSeason?.id, num, selectedLanguage);
            return (
              <EpisodeCard
                key={`${ep.episode}-${ep.__isUpcomingUnavailable ? "up" : "rel"}`}
                episode={ep}
                animeImage={animeImage}
                selectedLanguage={selectedLanguage}
                countryOfOrigin={countryOfOrigin}
                spoilerMode={spoilerMode}
                focused={focusEpisode != null && num === focusEpisode}
                onPlay={() => playEpisode(ep)}
                onPrewarm={() => {
                  if (downloadsById[dlId]?.status === "done") return;
                  prewarmEpisodeSource(ep, selectedLanguage, selectedSource);
                }}
                progress={progressMap[`${selectedSeason?.id}:${num}`]}
                watched={!!progressMap[`${selectedSeason?.id}:${num}`]?.completed}
                onToggleWatched={(shiftKey) => toggleWatched(idx, shiftKey)}
                canDownload={canDownload}
                download={downloadsById[dlId]}
                downloadResolving={!!resolving[dlId]}
                onDownload={() => handleDownload(ep)}
                onCancelDownload={() => cancelDownloadAction(dlId)}
                onRemoveDownload={() => removeDownloadAction(dlId)}
                selectMode={selectMode}
                selected={selectedNums.has(num)}
                onToggleSelect={() => toggleEpisodeSelected(num)}
              />
            );
          })}
          {platform.isMobile && visibleEpisodeCount < displayEpisodes.length ? (
            <button
              ref={loadMoreRef}
              type="button"
              onClick={() =>
                setVisibleEpisodeCount((count) =>
                  Math.min(count + MOBILE_EPISODE_BATCH, displayEpisodes.length)
                )
              }
              className="mx-4 mt-3 min-h-11 rounded-lg bg-surface text-sm font-semibold text-muted ring-1 ring-border active:bg-surface-2"
            >
              Charger la suite · {visibleEpisodeCount}/{displayEpisodes.length}
            </button>
          ) : null}
        </div>
      )}

      {selectMode && (
        <MobileSelectionBar
          allSelected={allDownloadableSelected}
          count={selectedNums.size}
          onToggleAll={() =>
            setSelectedNums((prev) => {
              const allNums = downloadableEpisodes.map((ep) => ep.episode || ep.number);
              const allSelected = allNums.length > 0 && allNums.every((n) => prev.has(n));
              return allSelected ? new Set() : new Set(allNums);
            })
          }
          onDownload={downloadSelectedEpisodes}
        />
      )}
    </section>
  );
}
