import { useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownUp,
  CheckSquare,
  ChevronDown,
  Download,
  DownloadCloud,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Square,
  X,
} from "lucide-react";
import { sourceOptionLabel, sourceSelectOptions } from "@/utils/videoSourceUtils";
import { MobileSelectSheet } from "@/components/ui/MobileSelectSheet";
import { Flag, getLanguageLabel } from "@/components/ui/Flag";

export function SeasonsMobileToolbar({
  seasons,
  selectedSeason,
  selectedLanguage,
  availableLanguages,
  countryOfOrigin,
  availableSources,
  selectedSource,
  advancedPlayerControls,
  canDownload,
  selectMode,
  spoilerMode,
  reversed,
  search,
  onSearchChange,
  onToggleSelectMode,
  onToggleSpoilerMode,
  onToggleReversed,
  onSelectSeason,
  onSelectLanguage,
  onSelectSource,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null);

  return (
    <>
      <div className="-mx-4 mb-4 md:hidden">
        <button
          type="button"
          disabled={seasons.length <= 1}
          onClick={() => setActiveSheet("season")}
          className={`flex w-full items-center gap-1.5 border-b border-border/70 px-3.5 py-3 text-left transition-opacity ${
            seasons.length > 1 ? "active:opacity-60" : "cursor-default"
          }`}
        >
          <span className="truncate font-display text-base font-semibold text-text">
            {selectedSeason?.name || "Saison"}
          </span>
          {seasons.length > 1 && <ChevronDown size={18} className="shrink-0 text-muted" />}
        </button>

        <div className="flex items-center gap-4 border-b border-border/70 px-3.5 py-2.5">
          {(availableLanguages.length ? availableLanguages : [selectedLanguage]).length > 0 && (
            <button
              type="button"
              disabled={availableLanguages.length <= 1}
              onClick={() => setActiveSheet("lang")}
              className="flex items-center gap-1.5 text-sm font-medium text-text transition-opacity active:opacity-60"
            >
              <Flag lang={selectedLanguage} countryOfOrigin={countryOfOrigin} size={16} />
              {getLanguageLabel(selectedLanguage)}
              {availableLanguages.length > 1 && <ChevronDown size={15} className="text-muted" />}
            </button>
          )}
          {availableSources.length > 0 && advancedPlayerControls && (
            <button
              type="button"
              onClick={() => setActiveSheet("source")}
              className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text transition-opacity active:opacity-60"
            >
              <span className="max-w-28 truncate">
                {selectedSource === "auto"
                  ? "Source auto"
                  : sourceOptionLabel(availableSources.find((source) => source.key === selectedSource))}
              </span>
              <ChevronDown size={15} className="shrink-0 text-muted" />
            </button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {canDownload && (
              <button
                onClick={onToggleSelectMode}
                title={selectMode ? "Annuler la sélection" : "Sélectionner plusieurs épisodes à télécharger"}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-white/[0.07] ${
                  selectMode ? "text-primary" : "text-muted"
                }`}
              >
                {selectMode ? <X size={19} /> : <Download size={19} />}
              </button>
            )}
            <button
              onClick={onToggleSpoilerMode}
              title={spoilerMode ? "Afficher les vignettes" : "Flouter les vignettes (anti-spoiler)"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-white/[0.07] ${
                spoilerMode ? "text-primary" : "text-muted"
              }`}
            >
              {spoilerMode ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
            <button
              onClick={onToggleReversed}
              title={reversed ? "Ordre décroissant" : "Ordre croissant"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-white/[0.07] ${
                reversed ? "text-primary" : "text-muted"
              }`}
            >
              <ArrowDownUp size={19} />
            </button>
            <button
              onClick={() => setSearchOpen((value) => !value)}
              title="Rechercher un épisode"
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-white/[0.07] ${
                searchOpen || search ? "text-primary" : "text-muted"
              }`}
            >
              <Search size={19} />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-b border-border/70 px-3.5 py-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-3.5 py-2.5 ring-1 ring-border/60 focus-within:ring-primary/50">
              <Search size={18} className="shrink-0 text-muted" />
              <input
                autoFocus
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="N° ou titre d'épisode…"
                className="w-full bg-transparent text-[0.95rem] outline-none placeholder:text-muted"
              />
              <button
                onClick={() => (search ? onSearchChange("") : setSearchOpen(false))}
                title={search ? "Effacer" : "Fermer"}
                className="shrink-0 text-muted active:text-text"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <MobileSelectSheet
        open={activeSheet === "season"}
        title="Saison"
        value={selectedSeason?.id || ""}
        onChange={(id) => onSelectSeason(seasons.find((season) => season.id === id))}
        onClose={() => setActiveSheet(null)}
        options={seasons.map((season) => ({ value: season.id, label: season.name }))}
      />
      <MobileSelectSheet
        open={activeSheet === "lang"}
        title="Langue"
        value={selectedLanguage}
        onChange={onSelectLanguage}
        onClose={() => setActiveSheet(null)}
        options={(availableLanguages.length ? availableLanguages : [selectedLanguage]).map((lang) => ({
          value: lang,
          label: getLanguageLabel(lang),
          icon: <Flag lang={lang} countryOfOrigin={countryOfOrigin} size={20} />,
        }))}
      />
      <MobileSelectSheet
        open={activeSheet === "source"}
        title="Source vidéo"
        value={selectedSource}
        onChange={onSelectSource}
        onClose={() => setActiveSheet(null)}
        options={sourceSelectOptions(availableSources)}
      />
    </>
  );
}

/** Devient « Annuler » dès qu'il y a quelque chose à annuler pour la saison affichée. */
export function SeasonDownloadButton({
  seasonDl,
  selectedSeason,
  seasonQueuedCount,
  downloadableEpisodes,
  onDownload,
  onCancel,
  controlH,
}) {
  return (seasonDl && seasonDl.seasonId === selectedSeason?.id) || seasonQueuedCount > 0 ? (
    <button
      onClick={onCancel}
      title="Annuler le téléchargement de cette saison (les épisodes déjà terminés sont conservés)"
      className={`group flex ${controlH} items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-red-500/20 hover:text-red-400 hover:ring-red-500/40`}
    >
      {/* Le libellé ne change pas au survol. */}
      <Loader2 size={16} className="animate-spin group-hover:hidden" />
      <X size={16} className="hidden group-hover:block" />
      <span className="hidden lg:inline">Annuler la saison</span>
      <span className="tabular-nums opacity-70">
        {seasonDl && seasonDl.seasonId === selectedSeason?.id
          ? `${seasonDl.done}/${seasonDl.total}`
          : seasonQueuedCount}
      </span>
    </button>
  ) : (
    <button
      onClick={onDownload}
      disabled={downloadableEpisodes.length === 0}
      title={
        downloadableEpisodes.length === 0
          ? "Tous les épisodes de cette saison sont déjà téléchargés"
          : "Télécharger tous les épisodes de cette saison"
      }
      className={`flex ${controlH} items-center gap-2 rounded-md bg-surface px-3.5 text-sm font-medium text-text ring-1 ring-border transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <DownloadCloud size={16} />
      <span className="hidden lg:inline">Télécharger la saison</span>
      {downloadableEpisodes.length > 0 && (
        <span className="tabular-nums opacity-70">({downloadableEpisodes.length})</span>
      )}
    </button>
  );
}

/**
 * Portée sur document.body : `<main>` a son propre contexte d'empilement et resterait sous
 * la nav mobile.
 */
export function MobileSelectionBar({ allSelected, count, onToggleAll, onDownload }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[75] flex items-center gap-2 border-t border-border bg-surface/95 px-3 py-2.5 backdrop-blur-xl shadow-[0_-12px_35px_rgba(0,0,0,0.45)] md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.625rem)" }}
    >
      <button
        type="button"
        onClick={onToggleAll}
        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors active:opacity-70 ${
          allSelected
            ? "bg-primary/15 text-primary ring-1 ring-primary/40"
            : "text-muted ring-1 ring-border"
        }`}
      >
        {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        Tout
      </button>
      <span className="flex-1 truncate text-center text-xs text-muted">
        {count > 0
          ? `${count} épisode${count > 1 ? "s" : ""}`
          : "Aucun épisode"}
      </span>
      <button
        type="button"
        onClick={onDownload}
        disabled={count === 0}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Download size={16} />
        Télécharger
      </button>
    </div>,
    document.body
  );
}
