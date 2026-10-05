const FOX_PATH =
  "M28 179C46 169 51 150 48 128C45 105 24 93 24 69C24 49 36 34 55 26C46 45 64 51 80 69L144 140V104C128 96 119 83 120 67L117 28L146 46Q157 42 168 45L195 24L190 69C191 85 185 96 175 103V165Q175 187 154 187H138L77 120V148C77 174 58 191 35 191ZM133 68L151 75L145 82L135 78ZM162 75L179 67L177 78L167 82Z";

/** Le renard-N, en aplat `currentColor`. */
export function Fox({ className = "h-12 w-12", ...rest }) {
  return (
    <svg viewBox="18 18 190 190" className={className} fill="currentColor" aria-hidden="true" {...rest}>
      <path fillRule="evenodd" d={FOX_PATH} />
    </svg>
  );
}

/** Renard + « NARTYA » + mot de l'app en titre incliné. */
export function NartyaLockup({ word = "Anime", className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-4 ${className}`} role="img" aria-label={`Nartya ${word}`}>
      <Fox className="h-16 w-16 shrink-0 text-primary" />
      <div className="text-left">
        <p className="text-sm font-medium uppercase tracking-[0.42em] text-primary">Nartya</p>
        <p className="t-impact mt-1 text-5xl text-text">{word}</p>
      </div>
    </div>
  );
}
