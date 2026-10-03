/**
 * La vidéo doit être servie avec crossOrigin="anonymous", sinon `createMediaElementSource`
 * rend le contexte inutilisable.
 */

const DEFAULT_GAIN = 1;

const clampGain = (g) => Math.max(1, Math.min(5, Number(g) || DEFAULT_GAIN));

/** `createMediaElementSource` ne peut cibler un élément qu'une fois. Null sans Web Audio. */
export function setupAudioBoost(art, initialGain = DEFAULT_GAIN) {
  if (!art) return null;
  if (art._gainNode) return art._gainNode;
  if (clampGain(initialGain) <= DEFAULT_GAIN) return null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !art.video) return null;

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(art.video);
    const gain = ctx.createGain();
    gain.gain.value = clampGain(initialGain);
    source.connect(gain);
    gain.connect(ctx.destination);

    art._audioCtx = ctx;
    art._gainNode = gain;

    // Le contexte démarre souvent « suspended » (politique autoplay).
    const resume = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    art.on("video:play", resume);
    art.on("video:playing", resume);
    resume();

    return gain;
  } catch (_) {
    return null;
  }
}

export function setAudioBoost(art, gain) {
  const g = clampGain(gain);
  const node = art?._gainNode || (g > DEFAULT_GAIN ? setupAudioBoost(art, g) : null);
  if (!node) return;
  try {
    // Rampe courte, pour éviter un clic audible.
    node.gain.setTargetAtTime(g, node.context.currentTime, 0.02);
  } catch (_) {
    try {
      node.gain.value = g;
    } catch (_) {}
  }
}

export function teardownAudioBoost(art) {
  try {
    art?._audioCtx?.close?.();
  } catch (_) {}
  if (art) {
    art._audioCtx = null;
    art._gainNode = null;
  }
}
