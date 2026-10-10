import { useEffect, useRef, useState } from "react";

const SKIP_FADE_MS = 280;

/** Durée, son et sortie anticipée (clic, Échap, Entrée, Espace) communs aux intros. */
export function useIntroPlayback({ durationMs, playSound, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const soundRef = useRef(null);

  useEffect(() => {
    const sound = playSound();
    soundRef.current = sound;
    return () => sound.stop();
  }, [playSound]);

  useEffect(() => {
    const timer = setTimeout(() => doneRef.current?.(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

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

  return { leaving, skip: () => setLeaving(true) };
}
