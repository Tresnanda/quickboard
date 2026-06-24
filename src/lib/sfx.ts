// Tiny tactile UI sounds, synthesized with Web Audio (no assets, no dependency).
// Kept very quiet — secondary feedback, never the main event. Gated by the
// `soundEffects` setting.

import { getSettings } from "./settings";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function on(): boolean {
  return getSettings().soundEffects;
}

export const sfx = {
  move() {
    if (on()) blip(520, 0.045, 0.022, "sine");
  },
  open() {
    if (on()) blip(440, 0.06, 0.02, "sine");
  },
  paste() {
    if (!on()) return;
    blip(680, 0.07, 0.04, "sine");
    blip(960, 0.09, 0.03, "sine", 0.04);
  },
  save() {
    if (!on()) return;
    blip(523, 0.1, 0.04, "sine");
    blip(784, 0.13, 0.035, "sine", 0.07);
    blip(1047, 0.12, 0.026, "sine", 0.14);
  },
};
