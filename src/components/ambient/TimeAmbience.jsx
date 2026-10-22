import "./time-ambience.css";
import { TIME_PHASES } from "@/utils/timeAmbiance";

// Positions stables d'un rendu à l'autre (même hash que la météo du profil).
const seed = (index, salt) => {
  let h = (index * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 60013);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

const LANTERNS = 7;

/** Le matin, des poussières de lumière qui montent. */
function Motes() {
  return Array.from({ length: 14 }, (_, i) => (
    <i
      key={i}
      className="time-ambience__mote"
      style={{
        left: `${4 + seed(i, 1) * 92}%`,
        "--size": `${2 + seed(i, 2) * 3}px`,
        "--duration": `${18 + seed(i, 3) * 12}s`,
        "--delay": `${-seed(i, 4) * 30}s`,
      }}
    />
  ));
}

/** L'après-midi, des feuilles d'automne. */
function Leaves() {
  return Array.from({ length: 10 }, (_, i) => (
    <i
      key={i}
      className="time-ambience__leaf"
      style={{
        left: `${seed(i, 1) * 100}%`,
        "--size": `${14 + seed(i, 2) * 10}px`,
        "--duration": `${16 + seed(i, 3) * 10}s`,
        "--delay": `${-seed(i, 4) * 26}s`,
        "--drift": `${(seed(i, 5) > 0.5 ? 1 : -1) * (60 + seed(i, 6) * 90)}px`,
        "--hue": `${18 + seed(i, 7) * 28}`,
      }}
    />
  ));
}

/** La nuit, des étoiles et une guirlande de lanternes, comme une allée au Japon. */
function Night() {
  return (
    <>
      {Array.from({ length: 24 }, (_, i) => (
        <i
          key={i}
          className="time-ambience__star"
          style={{
            left: `${seed(i, 1) * 100}%`,
            top: `${seed(i, 2) * 45}%`,
            "--size": `${1 + seed(i, 3) * 2}px`,
            "--delay": `${-seed(i, 4) * 6}s`,
          }}
        />
      ))}
      <svg className="time-ambience__string" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 2 Q50 12 100 2" />
      </svg>
      {Array.from({ length: LANTERNS }, (_, i) => {
        const x = (i + 1) / (LANTERNS + 1);
        // Suit la courbe du fil : plus bas au milieu.
        const sag = 4 * x * (1 - x);
        return (
          <span
            key={i}
            className="time-ambience__lantern"
            style={{
              left: `${x * 100}%`,
              top: `calc(0.4rem + ${sag * 3.6}rem)`,
              "--delay": `${-seed(i, 1) * 5}s`,
              "--flicker": `${2.5 + seed(i, 2) * 2}s`,
            }}
          >
            <b />
          </span>
        );
      })}
    </>
  );
}

/** Fond animé de l'ambiance selon l'heure, derrière tout le contenu. */
export default function TimeAmbience({ phase }) {
  return (
    <div className={`time-ambience time-ambience--${phase}`} aria-hidden="true">
      <div className="time-ambience__wash" style={{ background: TIME_PHASES[phase] }} />
      <div className="time-ambience__field">
        {phase === "morning" && <Motes />}
        {phase === "afternoon" && <Leaves />}
        {phase === "night" && <Night />}
      </div>
    </div>
  );
}
