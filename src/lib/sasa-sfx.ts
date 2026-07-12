/**
 * Cyberpunk SFX + synthwave ambient pad, all synthesized via Web Audio API
 * so we don't ship audio assets. Lazy-instantiates the AudioContext on first
 * user interaction (browser autoplay rules).
 */

let ctx: AudioContext | null = null;
let masterSfx: GainNode | null = null;
let ambientNodes: { stop: () => void } | null = null;
let sfxMuted = false;
let ambientOn = false;

const LS_SFX = "sasa:sfx:muted";
const LS_AMBIENT = "sasa:ambient:on";

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      masterSfx = ctx.createGain();
      // Louder overall — user asked for more prominent typing / click SFX.
      masterSfx.gain.value = 0.42;
      masterSfx.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function initSfx() {
  if (typeof window === "undefined") return;
  sfxMuted = localStorage.getItem(LS_SFX) === "1";
  ambientOn = localStorage.getItem(LS_AMBIENT) === "1";
}

export function isSfxMuted() { return sfxMuted; }
export function isAmbientOn() { return ambientOn; }

export function setSfxMuted(v: boolean) {
  sfxMuted = v;
  try { localStorage.setItem(LS_SFX, v ? "1" : "0"); } catch { /* ignore */ }
}

/** Tight cyberpunk UI click. */
export function sfxClick() {
  if (sfxMuted) return;
  const c = ensureCtx(); if (!c || !masterSfx) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(g).connect(masterSfx);
  osc.start(t); osc.stop(t + 0.1);
}

/** Soft keypress blip used during deliberate typing. */
export function sfxKey() {
  if (sfxMuted) return;
  const c = ensureCtx(); if (!c || !masterSfx) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "triangle";
  const f = 520 + Math.random() * 220;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.04);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(g).connect(masterSfx);
  osc.start(t); osc.stop(t + 0.07);
}

/** Mechanical keyboard-ish tap for SASA typing. Slightly meatier than sfxKey. */
export function sfxType() {
  if (sfxMuted) return;
  const c = ensureCtx(); if (!c || !masterSfx) return;
  const t = c.currentTime;
  // Noise burst
  const bufSize = Math.floor(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800 + Math.random() * 600;
  bp.Q.value = 3;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  noise.connect(bp).connect(ng).connect(masterSfx);
  noise.start(t); noise.stop(t + 0.04);
  // Body thunk
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(180 + Math.random() * 40, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(masterSfx);
  osc.start(t); osc.stop(t + 0.06);
}

/** Looping synthwave pad. Two detuned saws into a slow LFO-filtered chain. */
export function startAmbient() {
  ambientOn = true;
  try { localStorage.setItem(LS_AMBIENT, "1"); } catch { /* ignore */ }
  const c = ensureCtx(); if (!c) return;
  if (ambientNodes) return;
  const out = c.createGain();
  out.gain.value = 0.04;
  out.connect(c.destination);

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  filter.Q.value = 4;
  filter.connect(out);

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 350;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  // A minor 7: A2, C3, E3, G3
  const freqs = [110, 130.81, 164.81, 196];
  const oscs = freqs.flatMap((f) => {
    const a = c.createOscillator();
    const b = c.createOscillator();
    a.type = "sawtooth"; b.type = "sawtooth";
    a.frequency.value = f; b.frequency.value = f * 1.005;
    const g = c.createGain();
    g.gain.value = 0.22;
    a.connect(g); b.connect(g);
    g.connect(filter);
    a.start(); b.start();
    return [a, b];
  });

  ambientNodes = {
    stop: () => {
      try {
        oscs.forEach((o) => o.stop());
        lfo.stop();
        out.disconnect();
      } catch { /* ignore */ }
    },
  };
}

export function stopAmbient() {
  ambientOn = false;
  try { localStorage.setItem(LS_AMBIENT, "0"); } catch { /* ignore */ }
  ambientNodes?.stop();
  ambientNodes = null;
}

export function toggleAmbient() {
  if (ambientOn) stopAmbient(); else startAmbient();
  return ambientOn;
}