'use client';

import type { CardRarity } from '@/lib/game/cards';

/**
 * Reveal sounds (mandatory). Web Audio synthesis — no external asset files.
 * Cinematic, impact-heavy, rarity-scaled (rare/epic/legend much more epic).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let comp: DynamicsCompressorNode | null = null;
let verb: ConvolverNode | null = null;
let verbSend: GainNode | null = null;
let muted = false;

function createImpulse(c: AudioContext, seconds = 1.6, decay = 2.4): AudioBuffer {
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.22;
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);

    // subtle convolution "space" for epic tails
    try {
      verb = ctx.createConvolver();
      verb.buffer = createImpulse(ctx, 1.8, 2.8);
      verbSend = ctx.createGain();
      verbSend.gain.value = 0.0;
      verbSend.connect(verb);
      verb.connect(comp);
    } catch {
      verb = null;
      verbSend = null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function dryBus(): GainNode | null {
  ensureCtx();
  return master;
}
function wetBus(amount = 0.18): GainNode | null {
  ensureCtx();
  if (verbSend) {
    const t = ctx?.currentTime ?? 0;
    verbSend.gain.cancelScheduledValues(t);
    verbSend.gain.setValueAtTime(Math.max(verbSend.gain.value, amount), t);
  }
  return master; // we route per-node via connect
}
function connectOut(node: AudioNode, wet = 0) {
  const m = dryBus();
  if (!m) return;
  node.connect(m);
  if (wet > 0 && verbSend) {
    const g = (ctx as AudioContext).createGain();
    g.gain.value = wet;
    node.connect(g);
    g.connect(verbSend);
  }
}
function tnow(): number {
  return ctx?.currentTime ?? 0;
}

function env(g: GainNode, start: number, a: number, peak: number, dur: number, r: number) {
  g.gain.cancelScheduledValues(start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.max(0.002, a));
  if (dur > a + 0.02) {
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.7), start + dur);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur + r);
}

function oscTone(opts: {
  type?: OscillatorType;
  freq: number;
  freqTo?: number;
  detune?: number;
  start: number;
  dur: number;
  gain: number;
  attack?: number;
  release?: number;
  pan?: number;
  wet?: number;
}) {
  const c = ensureCtx();
  if (!c || !dryBus()) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(Math.max(20, opts.freq), opts.start);
  if (opts.freqTo != null) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqTo), opts.start + opts.dur);
  }
  if (opts.detune) o.detune.value = opts.detune;
  env(g, opts.start, opts.attack ?? 0.006, opts.gain, opts.dur, opts.release ?? 0.18);
  let node: AudioNode = g;
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    g.connect(p);
    node = p;
  }
  o.connect(g);
  connectOut(node, opts.wet ?? 0);
  o.start(opts.start);
  o.stop(opts.start + opts.dur + (opts.release ?? 0.18) + 0.08);
}

function filteredNoise(opts: {
  start: number; dur: number; gain: number;
  hp?: number; lp?: number; bp?: number; q?: number;
  attack?: number; release?: number; pan?: number; wet?: number;
}) {
  const c = ensureCtx();
  if (!c || !dryBus()) return;
  const len = Math.max(1, Math.floor(c.sampleRate * (opts.dur + 0.12)));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  env(g, opts.start, opts.attack ?? 0.003, opts.gain, opts.dur, opts.release ?? 0.1);
  let chain: AudioNode = src;
  if (opts.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = opts.hp; chain.connect(f); chain = f; }
  if (opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = opts.q ?? 0.7; chain.connect(f); chain = f; }
  if (opts.bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = opts.bp; f.Q.value = opts.q ?? 1.2; chain.connect(f); chain = f; }
  chain.connect(g);
  let node: AudioNode = g;
  if (typeof c.createStereoPanner === 'function' && opts.pan != null) {
    const p = c.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); node = p;
  }
  connectOut(node, opts.wet ?? 0);
  src.start(opts.start);
  src.stop(opts.start + opts.dur + 0.12);
}

function whoosh(start: number, dur: number, gain = 0.06, up = true, wet = 0.1) {
  const c = ensureCtx();
  if (!c || !dryBus()) return;
  const len = Math.max(1, Math.floor(c.sampleRate * (dur + 0.15)));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const p = i / len;
    data[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(p * Math.PI), 1.1);
  }
  const src = c.createBufferSource(); src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(up ? 180 : 2200, start);
  bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 220, start + dur);
  src.connect(bp); bp.connect(g); connectOut(g, wet);
  src.start(start); src.stop(start + dur + 0.12);
}

function subImpact(t: number, freq: number, dur: number, gain: number, wet = 0.08) {
  oscTone({ type: 'sine', freq: freq * 2.02, freqTo: freq, start: t, dur: dur * 0.55, gain: gain, attack: 0.001, release: dur * 0.5, wet });
  oscTone({ type: 'sine', freq, freqTo: freq * 0.92, start: t, dur, gain: gain * 0.85, attack: 0.002, release: dur * 0.6, wet });
  filteredNoise({ start: t, dur: Math.min(0.12, dur), gain: gain * 0.22, hp: 40, lp: 420, attack: 0.001, release: 0.12 });
}

function shimmer(t: number, freqs: number[], gain: number, tail: number, panSpread = 0.2, wet = 0.22) {
  freqs.forEach((f, i) => {
    const st = t + i * 0.012;
    const pan = freqs.length > 1 ? (i / (freqs.length - 1) - 0.5) * 2 * panSpread : 0;
    oscTone({ type: 'sine', freq: f, freqTo: f * 1.01, start: st, dur: tail, gain: gain * (1 - i * 0.06), attack: 0.01, release: tail * 0.7, pan, wet });
    oscTone({ type: 'triangle', freq: f * 2, freqTo: f * 2.02, start: st, dur: tail * 0.6, gain: gain * 0.18, attack: 0.008, release: tail * 0.5, pan, wet: wet * 0.8 });
  });
}

export function setRevealMuted(next: boolean) {
  muted = next;
  if (master && ctx) master.gain.setValueAtTime(next ? 0 : 0.9, ctx.currentTime);
}
export function isRevealMuted(): boolean { return muted; }

export function preloadRevealSfx(_rarity?: CardRarity | null) {
  ensureCtx();
}

export function playStepTick() {
  if (muted) return;
  const t = tnow();
  oscTone({ type: 'triangle', freq: 1100, freqTo: 720, start: t, dur: 0.04, gain: 0.045, release: 0.05 });
  filteredNoise({ start: t, dur: 0.025, gain: 0.014, hp: 1400, lp: 5200 });
}

export function playRollTick(intensity = 1) {
  if (muted) return;
  const t = tnow();
  const f = 480 + Math.random() * 220 + intensity * 120;
  // premium mechanical tick + soft air
  oscTone({ type: 'sine', freq: f, freqTo: f * 0.78, start: t, dur: 0.05, gain: 0.028 + intensity * 0.012, release: 0.06 });
  oscTone({ type: 'triangle', freq: f * 0.5, freqTo: f * 0.4, start: t, dur: 0.035, gain: 0.014, release: 0.05 });
  filteredNoise({ start: t, dur: 0.016, gain: 0.01 + intensity * 0.005, hp: 900, lp: 3400 });
}

export function playRatingHit() {
  if (muted) return;
  const t = tnow();
  // heavy cinematic hit + metallic shine
  subImpact(t, 46, 0.55, 0.22, 0.12);
  oscTone({ type: 'triangle', freq: 140, freqTo: 92, start: t, dur: 0.28, gain: 0.08, release: 0.28, wet: 0.1 });
  oscTone({ type: 'sine', freq: 740, freqTo: 520, start: t + 0.012, dur: 0.42, gain: 0.05, release: 0.45, wet: 0.18 });
  oscTone({ type: 'sine', freq: 1480, freqTo: 980, start: t + 0.02, dur: 0.32, gain: 0.022, release: 0.4, wet: 0.22 });
  filteredNoise({ start: t, dur: 0.1, gain: 0.04, hp: 300, lp: 2600, wet: 0.08 });
  whoosh(t + 0.01, 0.28, 0.035, true, 0.15);
}

export function playRevealStart() {
  if (muted) return;
  const t = tnow();
  // cinematic riser swell
  whoosh(t, 1.1, 0.055, true, 0.2);
  whoosh(t + 0.15, 0.9, 0.03, true, 0.18);
  oscTone({ type: 'sine', freq: 110, freqTo: 220, start: t, dur: 0.9, gain: 0.055, release: 0.5, wet: 0.18 });
  oscTone({ type: 'triangle', freq: 220, freqTo: 440, start: t + 0.05, dur: 0.85, gain: 0.03, release: 0.5, wet: 0.22 });
  oscTone({ type: 'sine', freq: 440, freqTo: 660, start: t + 0.12, dur: 0.7, gain: 0.02, release: 0.45, wet: 0.25 });
  filteredNoise({ start: t, dur: 0.5, gain: 0.018, hp: 300, bp: 1200, q: 0.8, wet: 0.12 });
  // subtle pulse bed
  oscTone({ type: 'sine', freq: 55, freqTo: 55, start: t, dur: 1.0, gain: 0.035, attack: 0.2, release: 0.6, wet: 0.1 });
}

export function playPackTear() {
  if (muted) return;
  const t = tnow();
  // foil tear + explosive burst
  filteredNoise({ start: t, dur: 0.28, gain: 0.11, hp: 700, lp: 8000, wet: 0.1 });
  filteredNoise({ start: t + 0.03, dur: 0.2, gain: 0.06, hp: 2000, lp: 10000, wet: 0.08 });
  whoosh(t, 0.55, 0.085, true, 0.2);
  subImpact(t + 0.01, 55, 0.45, 0.16, 0.12);
  oscTone({ type: 'sawtooth', freq: 160, freqTo: 620, start: t, dur: 0.18, gain: 0.028, release: 0.14, wet: 0.12 });
  oscTone({ type: 'sine', freq: 520, freqTo: 1040, start: t + 0.05, dur: 0.28, gain: 0.035, release: 0.3, wet: 0.2 });
  oscTone({ type: 'triangle', freq: 1040, freqTo: 1560, start: t + 0.08, dur: 0.22, gain: 0.018, release: 0.28, wet: 0.22 });
}

export function playRarityReveal(rarity: CardRarity) {
  if (muted) return;
  const t = tnow();
  const profiles: Record<CardRarity, { chord: number[]; sub: number; spread: number; bright: number; tail: number; power: number; wet: number }> = {
    common: { chord: [261.63, 329.63, 392.0, 523.25], sub: 55, spread: 0.06, bright: 0.45, tail: 0.8, power: 0.9, wet: 0.14 },
    rare:   { chord: [293.66, 369.99, 440.0, 587.33, 739.99], sub: 49, spread: 0.05, bright: 0.7, tail: 1.15, power: 1.15, wet: 0.22 },
    epic:   { chord: [329.63, 392.0, 493.88, 659.25, 783.99, 987.77], sub: 46.25, spread: 0.042, bright: 0.9, tail: 1.5, power: 1.45, wet: 0.3 },
    legend: { chord: [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66, 1567.98], sub: 41.2, spread: 0.035, bright: 1.1, tail: 2.0, power: 1.85, wet: 0.4 },
  };
  const p = profiles[rarity];

  // massive sub + impact
  subImpact(t, p.sub, 0.9 * p.power, 0.2 * p.power, p.wet * 0.6);
  whoosh(t + 0.02, 0.7 + p.tail * 0.25, 0.045 * p.power, true, p.wet);

  // arpeggiated chord fanfare
  p.chord.forEach((f, i) => {
    const st = t + 0.03 + i * p.spread;
    const g = (0.085 - i * 0.005) * p.power;
    const pan = (i - (p.chord.length - 1) / 2) * (0.18 / Math.max(1, p.chord.length / 2));
    oscTone({ type: 'sine', freq: f, freqTo: f * 1.008, start: st, dur: p.tail, gain: g, attack: 0.008, release: 0.55 + i * 0.05, pan, wet: p.wet });
    oscTone({ type: 'triangle', freq: f * 2, freqTo: f * 2.02, start: st, dur: p.tail * 0.7, gain: g * 0.22 * p.bright, attack: 0.006, release: 0.4, pan, wet: p.wet * 0.9 });
    if (p.bright > 0.65) {
      oscTone({ type: 'sine', freq: f * 3, freqTo: f * 3.01, start: st + 0.01, dur: p.tail * 0.45, gain: g * 0.08 * p.bright, attack: 0.005, release: 0.35, pan, wet: p.wet });
    }
  });

  // high shimmer halo for higher rarities
  if (rarity === 'rare' || rarity === 'epic' || rarity === 'legend') {
    shimmer(t + 0.18, p.chord.slice(-4).map((f) => f * 2), 0.018 * p.power, p.tail * 0.7, 0.35, p.wet);
  }
  if (rarity === 'epic' || rarity === 'legend') {
    whoosh(t + 0.12, 0.9, 0.05 * p.power, true, p.wet);
    oscTone({ type: 'sine', freq: p.chord[p.chord.length - 1]! * 2, freqTo: p.chord[p.chord.length - 1]! * 1.4, start: t + 0.3, dur: 1.0 * p.power, gain: 0.03 * p.bright, release: 0.9, wet: p.wet });
  }
  if (rarity === 'legend') {
    // extra stabs and long tail
    [0.22, 0.36, 0.52].forEach((d, i) => {
      shimmer(t + d, [783.99, 987.77, 1174.66, 1567.98].map((f) => f * (1 + i * 0.005)), 0.012, 0.9, 0.45, 0.45);
    });
    subImpact(t + 0.18, 38, 0.8, 0.12, 0.18);
    whoosh(t + 0.35, 1.1, 0.06, true, 0.45);
  }

  filteredNoise({ start: t, dur: 0.16, gain: 0.04 * p.power, hp: 400, lp: 5200, wet: p.wet * 0.5 });
  // delayed impact accent scaled by rarity
  window.setTimeout(() => { if (!muted) playRatingHit(); }, rarity === 'legend' ? 120 : rarity === 'epic' ? 140 : 160);
}


