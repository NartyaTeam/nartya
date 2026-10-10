import { HalloweenFox } from "@/components/brand/NartyaMark";
import { useIntroPlayback } from "@/hooks/useIntroPlayback";
import { playHalloweenIntroSound } from "@/utils/halloweenIntroSound";
import "./HalloweenIntro.css";

// Doit rester alignée sur les keyframes de HalloweenIntro.css.
const INTRO_MS = 3200;

const LETTERS = "NARTYA".split("");

// Trajets depuis la lune : point de passage (m), sortie d'écran (d), échelle, départ, durée, battement.
const BATS = [
  { mx: "-18vmin", my: "-6vmin", dx: "-70vmax", dy: "-20vmax", s: 1.1, d: 0.38, t: 1.9, f: 0.14 },
  { mx: "10vmin", my: "-14vmin", dx: "30vmax", dy: "-50vmax", s: 0.8, d: 0.42, t: 1.8, f: 0.12 },
  { mx: "-30vmin", my: "10vmin", dx: "-80vmax", dy: "25vmax", s: 1.3, d: 0.48, t: 2.1, f: 0.17 },
  { mx: "16vmin", my: "6vmin", dx: "55vmax", dy: "10vmax", s: 0.9, d: 0.5, t: 1.7, f: 0.13 },
  { mx: "-6vmin", my: "-20vmin", dx: "-25vmax", dy: "-60vmax", s: 0.7, d: 0.55, t: 1.9, f: 0.12 },
  { mx: "-40vmin", my: "30vmin", dx: "-60vmax", dy: "70vmax", s: 1.6, d: 0.6, t: 2.0, f: 0.2 },
  { mx: "20vmin", my: "-4vmin", dx: "70vmax", dy: "-30vmax", s: 0.6, d: 0.66, t: 1.8, f: 0.11 },
  { mx: "-14vmin", my: "4vmin", dx: "-45vmax", dy: "5vmax", s: 0.5, d: 0.75, t: 2.2, f: 0.12 },
  { mx: "4vmin", my: "18vmin", dx: "20vmax", dy: "60vmax", s: 1.2, d: 0.85, t: 1.9, f: 0.16 },
  { mx: "-8vmin", my: "-3vmin", dx: "-20vmax", dy: "-35vmax", s: 0.45, d: 1.5, t: 2.0, f: 0.11 },
  { mx: "6vmin", my: "-8vmin", dx: "35vmax", dy: "-25vmax", s: 0.4, d: 1.8, t: 1.8, f: 0.1 },
];

const WING = "M50 18C42 8 28 4 6 10C12 13 14 17 12 22C18 19 22 21 24 25C28 21 33 22 36 26C40 22 45 22 50 24Z";

function Bat({ mx, my, dx, dy, s, d, t, f }) {
  return (
    <div
      className="hw-bat"
      style={{
        "--mx": mx,
        "--my": my,
        "--dx": dx,
        "--dy": dy,
        "--s": s,
        "--d": `${d}s`,
        "--t": `${t}s`,
        "--f": `${f}s`,
      }}
    >
      <svg viewBox="0 0 100 40">
        <g className="hw-bat__wings">
          <path d={WING} />
          <path d={WING} transform="matrix(-1 0 0 1 100 0)" />
        </g>
        <ellipse cx="50" cy="21" rx="5" ry="7" />
        <circle cx="50" cy="14" r="4" />
        <path d="M46.5 12L47 6L49 11ZM53.5 12L53 6L51 11Z" />
        <circle className="hw-bat__eye" cx="48.6" cy="14" r="0.9" />
        <circle className="hw-bat__eye" cx="51.4" cy="14" r="0.9" />
      </svg>
    </div>
  );
}

// Chaque segment descend : pas de retour en arrière qui casserait la ligne.
const BOLT =
  "M68 0L64 22L70 34L60 58L63 70L52 96L58 108L47 134L50 150L40 176L46 188L36 214L38 232L29 258L34 270L26 300L28 318L20 346L23 362L16 400";
const BOLT_BRANCHES = [
  "M52 96L66 118L63 130L76 156L74 168L84 188",
  "M40 176L28 196L30 208L18 232L19 246",
  "M29 258L40 280L38 292L48 312",
];

const SPIDER_LEGS = [
  "M24 30L12 22L6 30",
  "M23 34L9 32L3 40",
  "M24 38L11 42L7 52",
  "M26 41L18 50L16 58",
  "M36 30L48 22L54 30",
  "M37 34L51 32L57 40",
  "M36 38L49 42L53 52",
  "M34 41L42 50L44 58",
];

/** L'ident d'octobre : orage, lune, nuée de chauves-souris. Passable comme l'ident classique. */
export default function HalloweenIntro({ onDone }) {
  const { leaving, skip } = useIntroPlayback({
    durationMs: INTRO_MS,
    playSound: playHalloweenIntroSound,
    onDone,
  });

  return (
    <div className={`hw-intro${leaving ? " is-leaving" : ""}`} onClick={skip} role="presentation" aria-hidden="true">
      <div className="hw-intro__moon" />
      <div className="hw-intro__glow" />
      <div className="hw-intro__fog" />

      <svg className="hw-intro__bolt" viewBox="0 0 120 400">
        {BOLT_BRANCHES.map((d) => (
          <path key={d} d={d} pathLength="1" className="hw-intro__bolt-branch" />
        ))}
        <path d={BOLT} pathLength="1" className="hw-intro__bolt-main" />
        <path d={BOLT} pathLength="1" className="hw-intro__bolt-core" />
      </svg>
      <div className="hw-intro__flash" />

      <div className="hw-intro__spider">
        <span className="hw-intro__thread" />
        <svg viewBox="0 0 60 60">
          {SPIDER_LEGS.map((d) => (
            <path key={d} d={d} className="hw-intro__leg" />
          ))}
          <circle cx="30" cy="34" r="9" />
          <circle cx="30" cy="23" r="5.5" />
          <circle className="hw-intro__spider-eye" cx="28" cy="23" r="1.2" />
          <circle className="hw-intro__spider-eye" cx="32" cy="23" r="1.2" />
        </svg>
      </div>

      <div className="hw-intro__bats">
        {BATS.map((bat, i) => (
          <Bat key={i} {...bat} />
        ))}
      </div>

      <div className="hw-intro__stage">
        <div className="hw-intro__mark">
          <HalloweenFox className="hw-intro__fox">
            <path
              className="hw-intro__eye"
              d="M151 86L169 93L163 100L153 96ZM180 93L197 85L195 96L185 100Z"
            />
          </HalloweenFox>
        </div>

        <div className="hw-intro__word">
          {LETTERS.map((l, i) => (
            <span key={i} style={{ "--i": i }}>
              {l}
            </span>
          ))}
        </div>

        <div className="hw-intro__rule" />
        <p className="hw-intro__kana">ANIME</p>
      </div>
    </div>
  );
}
