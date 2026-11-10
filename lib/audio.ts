'use client';

/**
 * Звук без аудиофайлов: короткие синтезированные сигналы на WebAudio.
 *
 * Почему так: на старте нет лицензированных сэмплов, а тишина хуже.
 * Когда появятся .webm из docs/03 §11 — подменяется здесь же, интерфейс
 * и вызовы `play()` не меняются.
 */

type SoundName =
  | 'click'
  | 'roll'
  | 'land'
  | 'step'
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'reward'
  | 'whistle'
  | 'var';

const STORAGE_KEY = 'fg.muted';

let context: AudioContext | null = null;
let master: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientStarted = false;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * Звук по умолчанию выключен: пока игрок сам не включит его, сайт
 * молчит. Это осознанное требование, а не забытый флаг.
 */
export function isMuted(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === '0') return false;
  if (stored === '1') return true;
  return true;
}

export function setMuted(value: boolean) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  }
  if (master && context) {
    master.gain.setTargetAtTime(value ? 0 : 0.55, context.currentTime, 0.05);
  }
  if (ambientGain && context) {
    ambientGain.gain.setTargetAtTime(value ? 0 : 0.05, context.currentTime, 0.2);
  }
}

function tone(
  ctx: AudioContext,
  opts: {
    freq: number;
    to?: number;
    type?: OscillatorType;
    duration?: number;
    gain?: number;
    delay?: number;
    curve?: 'exp' | 'linear';
  },
) {
  const { freq, to, type = 'sine', duration = 0.18, gain = 0.12, delay = 0 } = opts;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) {
    if (opts.curve === 'linear') osc.frequency.linearRampToValueAtTime(to, start + duration);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
  }
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(master!);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function noise(ctx: AudioContext, duration = 0.16, gain = 0.08, filterFreq = 1600) {
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const env = ctx.createGain();
  env.gain.value = gain;
  source.connect(filter).connect(env).connect(master!);
  source.start();
}

export function play(name: SoundName) {
  if (isMuted()) return;
  const ctx = ensure();
  if (!ctx) return;

  switch (name) {
    case 'click':
      tone(ctx, { freq: 520, to: 420, type: 'triangle', duration: 0.06, gain: 0.05 });
      break;
    case 'roll':
      noise(ctx, 0.28, 0.05, 900);
      tone(ctx, { freq: 180, to: 90, type: 'square', duration: 0.22, gain: 0.05 });
      break;
    case 'land':
      tone(ctx, { freq: 220, to: 120, type: 'triangle', duration: 0.14, gain: 0.09 });
      noise(ctx, 0.1, 0.05, 500);
      break;
    case 'step':
      tone(ctx, { freq: 130, to: 100, type: 'sine', duration: 0.06, gain: 0.04 });
      break;
    case 'positive':
      [523.25, 659.25, 783.99].forEach((freq, i) =>
        tone(ctx, { freq, type: 'triangle', duration: 0.16, gain: 0.09, delay: i * 0.07 }),
      );
      break;
    case 'negative':
      [392, 311, 233].forEach((freq, i) =>
        tone(ctx, { freq, type: 'sawtooth', duration: 0.18, gain: 0.06, delay: i * 0.08 }),
      );
      break;
    case 'neutral':
      tone(ctx, { freq: 440, to: 494, type: 'sine', duration: 0.14, gain: 0.07 });
      break;
    case 'reward':
      [784, 1046, 1318].forEach((freq, i) =>
        tone(ctx, { freq, type: 'sine', duration: 0.22, gain: 0.07, delay: i * 0.08 }),
      );
      break;
    case 'whistle':
      tone(ctx, { freq: 2100, to: 2400, type: 'sine', duration: 0.22, gain: 0.06, curve: 'linear' });
      break;
    case 'var':
      tone(ctx, { freq: 310, to: 280, type: 'square', duration: 0.5, gain: 0.05 });
      break;
  }
}

/**
 * Фоновый гул стадиона: тихий фильтрованный шум + низкий дрон.
 * Стартует только после первого действия пользователя — политика браузеров.
 */
export function startAmbient() {
  if (ambientStarted || isMuted()) return;
  const ctx = ensure();
  if (!ctx || !master) return;
  ambientStarted = true;

  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.05;
  ambientGain.connect(master);

  const frames = Math.floor(ctx.sampleRate * 4);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
    data[i] = last;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  source.connect(filter).connect(ambientGain);
  source.start();

  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 58;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.03;
  drone.connect(droneGain).connect(ambientGain);
  drone.start();
}
