import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Saisie d'un code à 4 chiffres (6 pour celui reçu par e-mail) : un seul champ (clavier, collage, clavier mobile numérique)
 * dessiné en une case par chiffre. `onComplete` part dès le dernier chiffre ; `resetKey` vide la saisie.
 */
export default function PinPad({ onComplete, busy = false, error = null, resetKey = 0, autoFocus = true, length = 4 }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setValue("");
    if (autoFocus) inputRef.current?.focus();
  }, [resetKey, autoFocus]);

  const onChange = (e) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, length);
    setValue(next);
    if (next.length === length) onComplete(next);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <label className={`relative flex cursor-text ${length > 4 ? "gap-2" : "gap-3"}`} onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          disabled={busy}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          aria-label={`Code à ${length} chiffres`}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`flex items-center justify-center rounded-lg border-2 bg-surface font-bold transition-colors ${
              length > 4 ? "h-14 w-11 text-2xl" : "h-16 w-14 text-3xl sm:h-[4.5rem] sm:w-16"
            } ${
              error ? "border-red-500/70" : i === value.length ? "border-primary" : "border-border"
            }`}
          >
            {value[i] ? (length > 4 ? value[i] : "•") : ""}
          </span>
        ))}
      </label>
      <div className="flex h-5 items-center text-sm">
        {busy ? (
          <Loader2 size={16} className="animate-spin text-muted" />
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
