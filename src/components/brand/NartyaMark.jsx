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

/** Le renard d'octobre : chapeau de sorcière, crocs et étincelles. `children` se dessine par-dessus. */
export function HalloweenFox({ className = "h-12 w-12", children, ...rest }) {
  return (
    <svg viewBox="30 8 204 204" className={className} aria-hidden="true" {...rest}>
      <path fill="currentColor" fillRule="evenodd" d={FOX_PATH} transform="translate(18 18)" />
      <path
        fill="#201C23"
        d="M160 106Q163 108 166 109L168 113L170 110Q177 112 184 110L186 113L188 109Q191 108 194 106Q190 119 177 119Q164 119 160 106Z"
      />
      <g className="halloween-fox__hat">
        <path
          d="M147 62L167 17Q171 11 178 16L196 29L181 27L195 65Z"
          fill="#A58AD8"
          stroke="#201C23"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M153 49L189 52L193 62L149 60Z" fill="#61477F" />
        <path d="M171 51L181 52L180 61L170 60Z" fill="#FFC66D" />
        <path d="M174 54L178 54.5L177.5 58L173.5 57.5Z" fill="#61477F" />
        <path
          d="M135 59Q170 65 207 60L213 70Q169 81 128 68Z"
          fill="#A58AD8"
          stroke="#201C23"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>
      <path className="halloween-fox__spark" d="M105 31L108 39L116 42L108 45L105 53L102 45L94 42L102 39Z" fill="#FFC66D" />
      <path className="halloween-fox__spark" d="M213 157L215 163L221 165L215 167L213 173L211 167L205 165L211 163Z" fill="#A58AD8" />
      {children}
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
