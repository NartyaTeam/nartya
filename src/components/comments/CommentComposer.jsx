import { useEffect, useRef, useState } from "react";
import { AtSign, EyeOff, Loader2, Send, X } from "lucide-react";
import { mentionToken } from "@/lib/commentMentions";
import EpisodeMentionPicker from "./EpisodeMentionPicker";

const MAX = 1500; // même borne que côté serveur

/**
 * L'anti-abus vit côté serveur : ici, seuls le message vide ou trop long sont bloqués.
 * `onSubmit(body, { spoiler })` doit renvoyer une promesse.
 */
export default function CommentComposer({
  onSubmit,
  seasons = [],
  resolver = null,
  allowMentions = true,
  placeholder = "Partage ton avis…",
  submitLabel = "Publier",
  initialBody = "",
  initialSpoiler = false,
  autoFocus = false,
  compact = false,
  onCancel = null,
}) {
  const [body, setBody] = useState(initialBody);
  const [spoiler, setSpoiler] = useState(initialSpoiler);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const taRef = useRef(null);
  // Index du « @ » tapé, que la mention remplace. null si le popover vient du bouton.
  const typedAtRef = useRef(null);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  const tooShort = body.trim().length < 2;
  const tooLong = body.length > MAX;

  const change = (e) => {
    const next = e.target.value;
    const caret = e.target.selectionStart;
    if (allowMentions && next.length === body.length + 1 && next[caret - 1] === "@") {
      typedAtRef.current = caret - 1;
      setPicker(true);
    }
    setBody(next.slice(0, MAX + 200)); // on laisse coller, puis on signale le dépassement
  };

  const insertMention = (season, episode) => {
    const token = mentionToken(season, episode);
    const at = typedAtRef.current;
    const ta = taRef.current;
    const caret = at != null ? at : ta?.selectionStart ?? body.length;
    const end = at != null ? at + 1 : caret;
    const before = body.slice(0, caret);
    const after = body.slice(end);
    const glue = before && !/\s$/.test(before) ? " " : "";
    const trail = /^\s/.test(after) ? "" : " ";
    const next = `${before}${glue}${token}${trail}${after}`;
    setBody(next.slice(0, MAX + 200));
    setPicker(false);
    typedAtRef.current = null;
    const pos = before.length + glue.length + token.length + trail.length;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || tooShort || tooLong) return;
    setBusy(true);
    try {
      const ok = await onSubmit(body.trim(), { spoiler });
      // Un envoi refusé garde le texte.
      if (ok !== false) {
        setBody("");
        setSpoiler(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`rounded-xl bg-surface-2/80 shadow-lg shadow-black/20 ring-1 ring-border/70 transition-colors focus-within:ring-primary/50 ${
        compact ? "shadow-none" : ""
      }`}
    >
      <textarea
        ref={taRef}
        value={body}
        onChange={change}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        onKeyDown={(e) => (e.key === "Enter" && (e.ctrlKey || e.metaKey) ? submit(e) : null)}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-text outline-none placeholder:text-muted/60"
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-3 py-2">
        {allowMentions && (
          <div className="relative">
            <button
              type="button"
              title="Mentionner un épisode"
              onClick={() => {
                typedAtRef.current = null;
                setPicker((v) => !v);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 transition-colors ${
                picker
                  ? "bg-primary/15 text-primary ring-primary/30"
                  : "bg-white/[0.05] text-muted ring-white/10 hover:text-text"
              }`}
            >
              <AtSign size={14} />
            </button>
            {picker && (
              <EpisodeMentionPicker
                seasons={seasons}
                resolver={resolver}
                onPick={insertMention}
                onClose={() => {
                  setPicker(false);
                  typedAtRef.current = null;
                }}
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setSpoiler((v) => !v)}
          title="Masquer le message derrière un voile « spoiler »"
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ring-1 transition-colors ${
            spoiler
              ? "bg-primary/15 text-primary ring-primary/30"
              : "bg-white/[0.05] text-muted ring-white/10 hover:text-text"
          }`}
        >
          <EyeOff size={13} />
          Spoiler
        </button>

        <span
          className={`ml-auto text-[0.7rem] tabular-nums ${
            tooLong ? "font-semibold text-primary" : "text-muted/60"
          }`}
        >
          {body.length}/{MAX}
        </span>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
          >
            <X size={13} />
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={busy || tooShort || tooLong}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
