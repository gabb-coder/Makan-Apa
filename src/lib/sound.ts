import { soundPref } from './prefs';

// Sounds are synthesised with Web Audio, so there are no files to load.
let ctx: AudioContext | null = null;

/** Call from a tap (e.g. SPIN) so phones allow audio afterwards. */
export function unlockAudio() {
  if (soundPref.get() === 'off') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function blip(freq: number, start: number, length: number, volume: number, type: OscillatorType) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A short wooden click as the pointer passes a slice. */
export function playTick() {
  if (!ctx || soundPref.get() === 'off') return;
  const t = ctx.currentTime;
  blip(1400 + Math.random() * 200, t, 0.035, 0.12, 'triangle');
}

/** Two rising notes when the wheel lands. */
export function playChime() {
  if (!ctx || soundPref.get() === 'off') return;
  const t = ctx.currentTime;
  blip(784, t, 0.25, 0.18, 'sine');
  blip(1175, t + 0.1, 0.35, 0.16, 'sine');
}
