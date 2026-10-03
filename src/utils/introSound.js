/**
 * Synthétisé en Web Audio, calé sur les keyframes de NartyaIntro.css :
 * 0.05s souffle du sabre, 0.32s impact grave, 1.05s cloche (mi–si–mi), 2.10s fondu.
 */

const MASTER = 0.42; // avant le volume du lecteur
const END_S = 2.6;

function playerVolume() {
  try {
    const v = JSON.parse(localStorage.getItem("artplayer_settings") || "{}").volume;
    return typeof v === "number" ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envelope(param, t, peak, attack, decay) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function whoosh(ctx, out, t) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.8);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(350, t);
  bp.frequency.exponentialRampToValueAtTime(4200, t + 0.55);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
  let node = src.connect(bp).connect(gain);
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.8, t);
    pan.pan.linearRampToValueAtTime(0.8, t + 0.6);
    node = node.connect(pan);
  }
  node.connect(out);
  src.start(t);
  src.stop(t + 0.8);
}

function impact(ctx, out, t) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.4);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.95, 0.008, 0.7);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.8);

  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.08);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const cg = ctx.createGain();
  envelope(cg.gain, t, 0.35, 0.002, 0.06);
  click.connect(hp).connect(cg).connect(out);
  click.start(t);
  click.stop(t + 0.08);
}

function bell(ctx, out, t) {
  // Légèrement désaccordés, pour le chatoiement.
  [
    [659.25, 0.22, 0],
    [987.77, 0.12, 4],
    [1318.51, 0.08, -3],
  ].forEach(([freq, peak, detune]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    envelope(g.gain, t, peak, 0.01, 1.5);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 1.6);
  });
}

export function playIntroSound() {
  const noop = { stop() {} };
  const volume = playerVolume();
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx || volume === 0) return noop;

  let ctx;
  try {
    ctx = new Ctx();
  } catch {
    return noop;
  }
  // Sans geste utilisateur : passe sous Electron, reste muet dans la WebView Android.
  ctx.resume?.().catch(() => {});

  const master = ctx.createGain();
  master.gain.value = MASTER * volume;

  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.16;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2600;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  master.connect(delay);
  delay.connect(damp).connect(feedback).connect(delay);
  damp.connect(wet);

  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  wet.connect(comp);
  comp.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.02;
  whoosh(ctx, master, t0 + 0.05);
  impact(ctx, master, t0 + 0.32);
  bell(ctx, master, t0 + 1.05);
  master.gain.setValueAtTime(MASTER * volume, t0 + 2.1);
  master.gain.linearRampToValueAtTime(0, t0 + END_S);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ctx.close?.().catch(() => {});
  };
  const autoClose = setTimeout(close, (END_S + 1) * 1000);

  return {
    stop() {
      if (closed) return;
      clearTimeout(autoClose);
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.2);
        wet.gain.setValueAtTime(wet.gain.value, now);
        wet.gain.linearRampToValueAtTime(0, now + 0.2);
      } catch {}
      setTimeout(close, 260);
    },
  };
}
