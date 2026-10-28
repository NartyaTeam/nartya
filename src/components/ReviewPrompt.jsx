import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Loader2, Send, Star, X } from "lucide-react";
import { isReviewPending, snoozeReview, submitReview } from "@/api/review";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import { toast } from "@/lib/toast";

// Au lancement, comme la reconnexion Discord : le temps que l'app s'affiche.
const DELAY_MS = 4_000;
// Vérification serveur en échec : nouvel essai une minute plus tard.
const RETRY_MS = 60_000;
// Au-delà, un statut Discord resté « unknown » (vérification en échec) ne bloque plus.
const DISCORD_WAIT_MS = 20_000;
const MAX_COMMENT = 1000;
// Pas en plein épisode ou en pleine lecture de scans.
const QUIET_ROUTES = ["/watch", "/scan", "/party"];

const LABELS = ["", "Décevant", "Moyen", "Correct", "Très bien", "Excellent"];

/**
 * Demande d'avis (1 à 5 étoiles, commentaire facultatif). Une seule réponse par compte pour
 * TOUTES les apps Nartya : le serveur (`app_review_pending`) fait foi, « Plus tard » la repousse de
 * 7 jours pour tout le compte (`snooze_app_review`), dans toutes les apps.
 *
 * La reconnexion Discord (DiscordReauthModal) passe avant : la demande attend que le statut
 * Discord soit tranché (« member » ou « none »). Tant qu'il est « missing », c'est la fenêtre
 * Discord qui est ouverte ; « unknown » (vérification en cours ou en échec) ne bloque que
 * `DISCORD_WAIT_MS`.
 */
export default function ReviewPrompt() {
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const isGuest = useAuthStore((s) => !!s.session?.user?.is_anonymous);
  const discordSettled = useAuthStore(
    (s) => (s.discordGuild === "member" || s.discordGuild === "none") && !s.discordReauthPending
  );
  const discordMissing = useAuthStore((s) => s.discordGuild === "missing");
  const online = useNetworkStore((s) => s.online);
  const { pathname } = useLocation();
  const [due, setDue] = useState(false);
  const [open, setOpen] = useState(false);
  const [discordWaitOver, setDiscordWaitOver] = useState(false);
  const userRef = useRef(userId);
  const retryRef = useRef(null);
  userRef.current = userId;

  useEffect(() => {
    setDue(false);
    setOpen(false);
    setDiscordWaitOver(false);
    if (!userId || isGuest) return;
    const t = setTimeout(() => setDue(true), DELAY_MS);
    const w = setTimeout(() => setDiscordWaitOver(true), DISCORD_WAIT_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(w);
      clearTimeout(retryRef.current);
    };
  }, [userId, isGuest]);

  const quiet = QUIET_ROUTES.some((r) => pathname.startsWith(r));
  // Discord tranché, ou vérification restée sans réponse : on ne bloque pas indéfiniment.
  const discordReady = !discordMissing && (discordSettled || discordWaitOver);
  useEffect(() => {
    if (!due || open || quiet || !online || !userId || !discordReady) return;
    // Pas de garde d'annulation liée à cet effet : `setDue(false)` le relance aussitôt, ce qui
    // annulait chaque réponse (la fenêtre ne s'ouvrait jamais en 1.39.0). On compare le compte.
    setDue(false);
    const asked = userId;
    isReviewPending()
      .then((pending) => pending && userRef.current === asked && setOpen(true))
      .catch(() => {
        // Jeton expiré au démarrage (le Hub le rafraîchit), réseau : on réessaie plus tard.
        retryRef.current = setTimeout(() => setDue(true), RETRY_MS);
      });
  }, [due, open, quiet, online, userId, discordReady]);

  if (!open || !userId) return null;
  return (
    <ReviewModal
      onLater={() => {
        snoozeReview().catch(() => {});
        setOpen(false);
      }}
      onDone={() => setOpen(false)}
    />
  );
}

export function ReviewModal({ onLater, onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = hover || rating;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onLater();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onLater, busy]);

  const send = async () => {
    if (!rating || busy) return;
    setBusy(true);
    try {
      await submitReview({ rating, comment: comment.trim() });
      toast.success("Merci pour ton avis !");
      onDone();
    } catch {
      setBusy(false);
      toast.error("Ton avis n'a pas pu être envoyé. Réessaie dans un instant.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !busy && onLater()} />

      <div
        role="dialog"
        aria-label="Ton avis sur Nartya"
        className="animate-fade-in-fast relative flex w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]"
      >
        <div className="h-[3px] w-full rounded-t-lg bg-gradient-to-r from-primary via-primary/70 to-transparent" />

        <div className="relative px-6 pb-2 pt-4">
          <button
            onClick={onLater}
            disabled={busy}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Ton avis</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Tu aimes Nartya ?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Note l'app de 1 à 5 étoiles. Ton avis aide l'équipe à savoir quoi améliorer.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 px-6 pt-3">
          <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                aria-pressed={rating === n}
                className="p-1 transition-transform active:scale-90"
              >
                <Star
                  size={34}
                  strokeWidth={1.8}
                  className={n <= shown ? "fill-primary text-primary" : "text-muted/60"}
                />
              </button>
            ))}
          </div>
          <p className="h-5 text-sm font-semibold text-text/90">{LABELS[shown]}</p>
        </div>

        <div className="px-6 pt-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
            rows={3}
            placeholder="Un commentaire ? (facultatif)"
            className="w-full resize-none rounded-md border border-border bg-bg/60 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-primary/60"
          />
          {comment.length > MAX_COMMENT - 100 && (
            <p className="mt-1 text-right text-xs text-muted">
              {comment.length} / {MAX_COMMENT}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-4">
          <button
            onClick={onLater}
            disabled={busy}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Plus tard
          </button>
          <button
            onClick={send}
            disabled={!rating || busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Envoyer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
