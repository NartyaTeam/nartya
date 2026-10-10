import { Fox } from "@/components/brand/NartyaMark";
import { useIntroPlayback } from "@/hooks/useIntroPlayback";
import { playIntroSound } from "@/utils/introSound";
import "./NartyaIntro.css";

// Doit rester alignée sur les keyframes de NartyaIntro.css.
const INTRO_MS = 2600;

const LETTERS = "NARTYA".split("");

/** Visuel en CSS, son synthétisé, teinté par l'accent. Passable par clic, Échap, Entrée, Espace. */
export default function NartyaIntro({ onDone }) {
  const { leaving, skip } = useIntroPlayback({ durationMs: INTRO_MS, playSound: playIntroSound, onDone });

  return (
    <div
      className={`nartya-intro${leaving ? " is-leaving" : ""}`}
      onClick={skip}
      role="presentation"
      aria-hidden="true"
    >
      <Fox className="nartya-intro__seal" />
      <div className="nartya-intro__glow" />
      <div className="nartya-intro__trail" />
      <div className="nartya-intro__slash" />

      <div className="nartya-intro__stage">
        <div className="nartya-intro__mark">
          <Fox />
        </div>

        <div className="nartya-intro__word">
          {LETTERS.map((l, i) => (
            <span key={i} style={{ "--i": i }}>
              {l}
            </span>
          ))}
        </div>

        <div className="nartya-intro__rule" />
        <p className="nartya-intro__kana">ANIME</p>
      </div>
    </div>
  );
}
