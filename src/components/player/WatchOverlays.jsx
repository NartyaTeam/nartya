import { useState } from "react";
import { AlertTriangle, ArrowLeft, FastForward, Info, Loader2, RotateCcw, X } from "lucide-react";

const LOADING_MSGS = [
  "On cuisine votre épisode…",
  "Négociation en cours avec les serveurs…",
  "Les ninjas récupèrent la source…",
  "Votre épisode arrive depuis le Japon…",
  "On débriefe l'équipe de scans…",
  "Chargement des sakura… et du reste…",
  "Quelqu'un a mis le lecteur en pause par erreur…",
  "On corrompt gentiment les algorithmes…",
  "Presque là… on attend le générique…",
  "Le streaming résiste, on insiste…",
  "Extraction en douceur, comme un bon fansub…",
  "Le lecteur fait ses étirements…",
];

/** Rendu dans l'overlay ArtPlayer : visible en plein écran. */
export function OverlayBackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      className="art-back-btn absolute left-5 top-5 z-[55] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] transition-transform hover:scale-110"
    >
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        style={{ fill: "none" }}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

/** Tant que l'overlay du lecteur n'existe pas. */
export function FallbackBackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      className="absolute left-5 top-5 z-[60] text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] transition-transform hover:scale-110"
    >
      <ArrowLeft size={32} strokeWidth={2.5} />
    </button>
  );
}

export function ContentWarning({ tags, leaving }) {
  return (
    <div
      className={`nartya-touch-ui pointer-events-none absolute left-5 top-16 z-[54] flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 font-sans text-sm font-medium text-white shadow-lg backdrop-blur-sm ${
        leaving ? "animate-slide-out-left" : "animate-slide-in-left"
      }`}
    >
      {/* Style inline : ArtPlayer force `svg{fill}`. */}
      <AlertTriangle size={16} style={{ fill: "none" }} className="shrink-0 text-white/70" />
      {tags.join(" · ")}
    </div>
  );
}

export function PostCreditNotice() {
  return (
    <div className="nartya-touch-ui pointer-events-none absolute top-6 right-6 z-[56] flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 font-sans text-sm font-medium text-white shadow-lg backdrop-blur-sm animate-fade-in">
      <Info size={16} style={{ fill: "none" }} className="shrink-0 text-white/70" />
      Une scène suit le générique
    </div>
  );
}

/** Sur un ending sans rien après, propose l'épisode suivant. */
export function SkipSegmentButton({ segment, hasNext, onSkip, onNext }) {
  const goesNext = segment.type === "outro" && !segment.hasContentAfter && hasNext;
  return (
    <button
      type="button"
      onClick={goesNext ? onNext : onSkip}
      className="nartya-touch-ui pointer-events-auto absolute bottom-24 right-6 z-[56] flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-sans text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.03] animate-fade-in"
    >
      {segment.type === "intro" ? "Passer l'intro" : goesNext ? "Épisode suivant" : "Passer l'ending"}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        className="text-black/55"
        style={{ fill: "none" }}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 4l10 8-10 8zM19 5v14" />
      </svg>
    </button>
  );
}

export function AutoSkipBadge({ kind }) {
  return (
    <div className="nartya-touch-ui pointer-events-none absolute bottom-24 right-6 z-[56] flex items-center gap-2 rounded-lg bg-black/75 px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-lg backdrop-blur-sm animate-slide-in-right">
      <FastForward size={15} className="shrink-0 animate-autoskip-bounce text-primary" />
      Autoskip ·{" "}
      {kind === "intro" ? "intro passée" : kind === "outro" ? "ending passé" : "épisode suivant"}
    </div>
  );
}

/** Le remplissage suit le décompte. */
export function NextEpisodeCountdown({ remaining, windowSeconds, onNext, onDismiss }) {
  const progress = Math.min(1, Math.max(0, (windowSeconds - remaining) / windowSeconds));
  const countdown = Math.max(1, Math.ceil(remaining));
  return (
    <div className="nartya-touch-ui pointer-events-auto absolute bottom-24 right-6 z-[56] flex items-center gap-3 animate-fade-in">
      <button
        type="button"
        onClick={onNext}
        className="relative flex items-center overflow-hidden rounded-lg bg-white px-5 py-2.5 font-sans text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.03]"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-black/20"
          style={{ width: `${progress * 100}%`, transition: "width .25s linear" }}
        />
        <span className="relative z-10 flex items-center gap-2">
          Épisode suivant
          {/* Largeur fixe : le compteur ne doit pas faire bouger le bouton. */}
          <span className="inline-block w-10 text-left tabular-nums text-black/55">· {countdown}s</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Annuler l'enchaînement"
        className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] transition-transform hover:scale-110"
      >
        <X size={30} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function WatchLoading() {
  const [message] = useState(() => LOADING_MSGS[Math.floor(Math.random() * LOADING_MSGS.length)]);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="animate-spin" size={28} />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function WatchError({ message, onRetry }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="text-primary" size={36} />
      <p className="max-w-md text-sm text-muted">{message}</p>
      <button onClick={onRetry} className="btn-shu">
        <RotateCcw size={16} /> Réessayer
      </button>
    </div>
  );
}
