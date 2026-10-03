import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  X,
  ImagePlus,
  Loader2,
  Send,
  Play,
  BookOpen,
  Download,
  LibraryBig,
  UserCog,
  LayoutDashboard,
  CircleHelp,
  CheckCircle2,
  MessagesSquare,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { createReport } from "@/api/reports";
import { Select } from "@/components/ui/Select";
import { BUG_CATEGORIES, BUG_CATEGORY_MAP } from "@/utils/bugCategories";

const MAX_FILE_MB = 5;
const MAX_MSG = 4000;

// Déclarées par nom dans bugCategories.
const CAT_ICONS = { Play, BookOpen, Download, LibraryBig, UserCog, LayoutDashboard, CircleHelp };

function friendlyError(e) {
  const msg = e?.message || "";
  if (msg.startsWith("cooldown:")) {
    const s = parseInt(msg.split(":")[1], 10) || 0;
    return `Trop de signalements d'affilée — réessaie dans ${s > 60 ? `${Math.ceil(s / 60)} min` : `${s} s`}.`;
  }
  if (msg.includes("message_vide")) return "Décris le problème en quelques mots (5 caractères min).";
  if (msg.includes("message_trop_long")) return "Message trop long (4000 caractères max).";
  return "Envoi impossible. Réessaie dans un instant.";
}

function contextLabel(ctx) {
  if (!ctx) return null;
  const title = ctx.title || ctx.slug;
  if (ctx.kind === "scan") {
    const parts = [title, ctx.oeuvre].filter(Boolean);
    if (ctx.chapter != null) parts.push(`Chapitre ${ctx.chapter}`);
    return parts.join(" · ");
  }
  const parts = [title, ctx.season, ctx.episode != null ? `Épisode ${ctx.episode}` : null].filter(Boolean);
  return parts.join(" · ");
}

export default function BugReportModal({ onClose, onSubmitted, context = null, defaultCategory = null }) {
  const navigate = useNavigate();
  const [category, setCategory] = useState(defaultCategory);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Révoqué quand la pièce jointe change.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Seules les images sont acceptées.");
    if (f.size > MAX_FILE_MB * 1024 * 1024) return toast.error(`Image trop lourde (${MAX_FILE_MB} Mo max).`);
    setFile(f);
  };

  const canSubmit = !!category && message.trim().length >= 5 && !busy;

  const submit = async () => {
    if (!category) return toast.info("Choisis une catégorie.");
    if (message.trim().length < 5) return toast.info("Décris le problème en quelques mots.");
    setBusy(true);
    try {
      await createReport({ body: message.trim(), category, files: file ? [file] : [], context });
      if (onSubmitted) {
        toast.success("Merci ! Ton signalement a été envoyé, tu peux suivre son traitement dans Signalements. 🙏");
        onSubmitted();
      } else {
        setSubmitted(true);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const hint = category ? BUG_CATEGORY_MAP[category]?.hint : null;
  const ctxLabel = contextLabel(context);

  if (submitted) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

        <div className="animate-fade-in-fast relative flex w-full max-w-md flex-col items-center rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
          <button
            onClick={onClose}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary"
          >
            <X size={18} />
          </button>
          <CheckCircle2 size={40} className="text-primary" />
          <h2 className="mt-4 font-display text-xl font-bold tracking-tight">Signalement envoyé</h2>
          <p className="mt-2 text-sm text-muted">
            Merci ! Tu peux suivre son traitement dans <span className="text-text">Studio · Signalements</span>.
          </p>
          <div className="mt-6 flex w-full items-center justify-center gap-4">
            <button
              onClick={onClose}
              className="text-sm font-medium text-muted transition-colors hover:text-text"
            >
              Fermer
            </button>
            <button
              onClick={() => {
                onClose();
                navigate("/reports");
              }}
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90"
            >
              <MessagesSquare size={15} />
              Voir mes signalements
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !busy && onClose()} />

      <div className="animate-fade-in-fast relative flex w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
        <div className="h-[3px] w-full rounded-t-lg bg-gradient-to-r from-primary via-primary/70 to-transparent" />

        <div className="relative bg-gradient-to-b from-primary/[0.05] to-transparent px-6 pb-5 pt-4">
          <button
            onClick={onClose}
            disabled={busy}
            title="Fermer"
            className="absolute right-4 top-4 text-muted transition-colors hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
          <p className="eyebrow">Support · Signalement</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Signaler un bug</h2>
          <p className="mt-1 text-sm text-muted">
            Un souci dans l'app ? Décris-le ici — plus besoin de passer par le Discord.
          </p>
        </div>

        {/* Signalement depuis une fiche anime. */}
        {ctxLabel && (
          <div className="mx-6 mb-1 flex items-center gap-2 rounded-md border border-primary/25 bg-primary/[0.06] px-3 py-2 text-sm text-text/90">
            {context?.kind === "scan" ? (
              <BookOpen size={15} className="shrink-0 text-primary" />
            ) : (
              <Play size={15} className="shrink-0 text-primary" />
            )}
            <span className="min-w-0 flex-1 truncate">{ctxLabel}</span>
            <span className="shrink-0 text-[0.7rem] font-medium uppercase tracking-kana text-muted">
              joint
            </span>
          </div>
        )}

        <div className="flex flex-col gap-5 px-6 pb-2">
          <div>
            <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
              Catégorie
            </label>
            <Select
              value={category || undefined}
              onValueChange={setCategory}
              placeholder="Choisis une catégorie…"
              title="Catégorie du signalement"
              align="start"
              className="mt-2 w-full"
              options={BUG_CATEGORIES.map((c) => {
                const Icon = CAT_ICONS[c.icon] || CircleHelp;
                return {
                  value: c.value,
                  label: c.label,
                  icon: <Icon size={15} className="text-primary" />,
                };
              })}
            />
            {hint && <p className="mt-2 text-xs text-muted/80">{hint}</p>}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-[0.7rem] font-semibold uppercase tracking-kana text-muted">
                Description
              </label>
              <span className="text-[0.7rem] tabular-nums text-muted/60">
                {message.length}/{MAX_MSG}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MSG}
              rows={5}
              placeholder="Que s'est-il passé ? Sur quelle page ? Comment le reproduire ?"
              className="mt-2 w-full resize-none rounded-md border border-border bg-bg/40 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary/60"
            />
          </div>

          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {preview ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-bg/40 p-2.5">
                <img src={preview} alt="Aperçu" className="h-14 w-14 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{file?.name}</span>
                <button
                  onClick={() => setFile(null)}
                  title="Retirer"
                  className="shrink-0 text-muted transition-colors hover:text-primary"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm text-muted transition-colors hover:border-white/25 hover:text-text"
              >
                <ImagePlus size={16} />
                Ajouter une capture d'écran <span className="text-muted/60">(optionnel)</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-4 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
            Envoyer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
