import { useEffect, useRef, useState } from "react";
import { asset } from "@/lib/asset";
import { playIntroSound } from "@/utils/introSound";
import "./NartyaIntro.css";

// Doit rester alignée sur les keyframes de NartyaIntro.css.
const INTRO_MS = 2600;
const SKIP_FADE_MS = 280;

const LETTERS = "NARTYA".split("");

/** Visuel en CSS, son synthétisé, teinté par l'accent. Passable par clic, Échap, Entrée, Espace. */
export default function NartyaIntro({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const soundRef = useRef(null);

  useEffect(() => {
    const sound = playIntroSound();
    soundRef.current = sound;
    return () => sound.stop();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doneRef.current?.(), INTRO_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    soundRef.current?.stop();
    const timer = setTimeout(() => doneRef.current?.(), SKIP_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        setLeaving(true);
      }
    };
    // Capture : avant les raccourcis de l'app.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className={`nartya-intro${leaving ? " is-leaving" : ""}`}
      onClick={() => setLeaving(true)}
      role="presentation"
      aria-hidden="true"
    >
      <span className="nartya-intro__seal">朱</span>
      <div className="nartya-intro__glow" />
      <div className="nartya-intro__trail" />
      <div className="nartya-intro__slash" />

      <div className="nartya-intro__stage">
        <div className="nartya-intro__mark">
          <img src={asset("icon.png")} alt="" draggable={false} />
        </div>

        <div className="nartya-intro__word">
          {LETTERS.map((l, i) => (
            <span key={i} style={{ "--i": i }}>
              {l}
            </span>
          ))}
        </div>

        <div className="nartya-intro__rule" />
        <p className="nartya-intro__kana">アニメ</p>
      </div>
    </div>
  );
}
