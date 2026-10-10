/**
 * Version Halloween de l'ident, calée sur HalloweenIntro.css :
 * 0.05s tonnerre, 0.38s envol des chauves-souris, 0.70s le renard se pose,
 * 1.00s thérémine, 1.15s boîte à musique (la–mi–do–ré♯), 2.70s fondu.
 */
import { envelope, noiseBuffer, runIntroAudio } from "./introSound";

const END_S = 3.2;

function pan(ctx, node, value) {
  if (!ctx.createStereoPanner) return node;
  const p = ctx.createStereoPanner();
  p.pan.value = value;
  return node.connect(p);
}

function thunder(ctx, out, t) {
  // Claquement sec, puis grondement qui s'éloigne.
  const crack = ctx.createBufferSource();
  crack.buffer = noiseBuffer(ctx, 0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const cg = ctx.createGain();
  envelope(cg.gain, t, 0.55, 0.003, 0.18);
  crack.connect(hp).connect(cg).connect(out);
  crack.start(t);
  crack.stop(t + 0.25);

  const rumble = ctx.createBufferSource();
  rumble.buffer = noiseBuffer(ctx, 2.4);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1100, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + 1.6);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
  rg.gain.exponentialRampToValueAtTime(0.3, t + 0.3);
  rg.gain.linearRampToValueAtTime(0.45, t + 0.55);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  rumble.connect(lp).connect(rg).connect(out);
  rumble.start(t);
  rumble.stop(t + 2.4);
}

function flutter(ctx, out, t, duration, side) {
  // Bruit coupé à ~20 Hz : le battement d'ailes.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 1.2;
  const wings = ctx.createGain();
  wings.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 17 + Math.random() * 6;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(wings.gain);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.3, t + duration * 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  const panned = pan(ctx, src.connect(bp).connect(wings).connect(env), side);
  panned.connect(out);
  src.start(t);
  src.stop(t + duration);
  lfo.start(t);
  lfo.stop(t + duration);
}

function squeak(ctx, out, t, side) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(5200, t);
  osc.frequency.exponentialRampToValueAtTime(7600, t + 0.03);
  osc.frequency.exponentialRampToValueAtTime(4800, t + 0.07);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.05, 0.005, 0.07);
  pan(ctx, osc.connect(g), side).connect(out);
  osc.start(t);
  osc.stop(t + 0.1);
}

function thud(ctx, out, t) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.7, 0.006, 0.5);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.6);
}

function theremin(ctx, out, t) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(330, t);
  osc.frequency.exponentialRampToValueAtTime(494, t + 0.7);
  osc.frequency.exponentialRampToValueAtTime(370, t + 1.6);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.5;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 9;
  vibrato.connect(vibDepth).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
  g.gain.linearRampToValueAtTime(0.07, t + 1.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 2.2);
  vibrato.start(t);
  vibrato.stop(t + 2.2);
}

function musicBox(ctx, out, t) {
  // La, mi, do puis ré♯ : le triton final fait le frisson.
  [
    [880, 0],
    [659.25, 0.15],
    [523.25, 0.3],
    [622.25, 0.5],
  ].forEach(([freq, at], i, notes) => {
    const last = i === notes.length - 1;
    [
      [1, 0.16],
      [4, 0.025],
    ].forEach(([harmonic, peak]) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * harmonic;
      osc.detune.value = harmonic === 1 ? 0 : 6;
      const g = ctx.createGain();
      envelope(g.gain, t + at, peak, 0.004, last ? 1.4 : 0.55);
      osc.connect(g).connect(out);
      osc.start(t + at);
      osc.stop(t + at + (last ? 1.5 : 0.6));
    });
  });
}

export function playHalloweenIntroSound() {
  return runIntroAudio({
    endS: END_S,
    fadeAt: 2.7,
    echo: { time: 0.22, feedback: 0.38, wet: 0.4 },
    schedule(ctx, out, t0) {
      thunder(ctx, out, t0 + 0.05);
      flutter(ctx, out, t0 + 0.38, 0.7, 0.5);
      flutter(ctx, out, t0 + 0.52, 0.8, -0.6);
      flutter(ctx, out, t0 + 0.7, 0.6, 0.2);
      squeak(ctx, out, t0 + 0.46, 0.7);
      squeak(ctx, out, t0 + 0.63, -0.5);
      squeak(ctx, out, t0 + 0.88, 0.3);
      thud(ctx, out, t0 + 0.7);
      theremin(ctx, out, t0 + 1.0);
      musicBox(ctx, out, t0 + 1.15);
    },
  });
}
