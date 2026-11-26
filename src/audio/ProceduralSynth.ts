import type { BgmTrackId } from './soundManifest.ts';

// ============================================================================
// Krunked Well — Procedural Web Audio Chiptune Synthesizer (BGM + SFX)
// Zero external audio dependencies. 10 original BGM loops + 45 retro SFX.
// ============================================================================

export interface ProceduralSfxOptions {
  pitchJitter?: number;
  pan?: number;
  comboPitch?: number;
  onEnded?: () => void;
}

type VoiceWave = 'pulse25' | 'pulse12' | 'square' | 'triangle' | 'sawtooth' | 'sine';

interface TrackComposition {
  bpm: number;
  steps: number;
  swing: number;
  leadWave: VoiceWave;
  arpWave: VoiceWave;
  bassWave: VoiceWave;
  leadGain: number;
  arpGain: number;
  bassGain: number;
  drumGain: number;
  leadGate: number;
  arpGate: number;
  bassGate: number;
  leadPitchBend?: number;
  underwater?: boolean;
  lead: readonly number[];
  arp: readonly number[];
  bass: readonly number[];
  /** 0=rest, 1=kick, 2=snare, 3=closed hat, 4=kick+hat, 5=snare+hat, 6=open hat, 7=rim/sparkle */
  drums: readonly number[];
}

interface ContextAudioCache {
  whiteNoise: AudioBuffer;
  chipNoise: AudioBuffer;
  pulse25: PeriodicWave | null;
  pulse12: PeriodicWave | null;
}

const CONTEXT_CACHE = new WeakMap<AudioContext, ContextAudioCache>();

const SCHEDULER_INTERVAL_MS = 35;
const LOOKAHEAD_SEC = 0.13;
const GAIN_FLOOR = 0.0001;

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function createPulseWave(ctx: AudioContext, duty: number): PeriodicWave | null {
  if (typeof ctx.createPeriodicWave !== 'function') {
    return null;
  }
  try {
    const harmonics = 24;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      // Fourier series for rectangular pulse wave of duty cycle `duty`
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  } catch {
    return null;
  }
}

function getContextCache(ctx: AudioContext): ContextAudioCache {
  const existing = CONTEXT_CACHE.get(ctx);
  if (existing) {
    return existing;
  }

  const sampleRate = ctx.sampleRate > 0 ? ctx.sampleRate : 44100;
  const length = Math.max(1024, Math.floor(sampleRate * 1.0));

  // Smooth white noise buffer (seeded deterministic LCG)
  const whiteNoise = ctx.createBuffer(1, length, sampleRate);
  const whiteData = whiteNoise.getChannelData(0);
  let lcg = 0x13579bdf;
  for (let i = 0; i < length; i++) {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    whiteData[i] = (lcg / 0xffffffff) * 2 - 1;
  }

  // Crunchy retro LFSR chip-noise buffer (sample-and-hold stepped for classic 8-bit snare/explosions)
  const chipNoise = ctx.createBuffer(1, length, sampleRate);
  const chipData = chipNoise.getChannelData(0);
  let lfsr = 0x4000;
  let held = 0;
  const stepHold = Math.max(2, Math.floor(sampleRate / 11025));
  for (let i = 0; i < length; i++) {
    if (i % stepHold === 0) {
      const bit = ((lfsr & 1) ^ ((lfsr >> 1) & 1)) & 1;
      lfsr = ((lfsr >> 1) | (bit << 14)) & 0x7fff;
      held = (lfsr & 1) !== 0 ? 0.9 : -0.9;
    }
    chipData[i] = held;
  }

  const cache: ContextAudioCache = {
    whiteNoise,
    chipNoise,
    pulse25: createPulseWave(ctx, 0.25),
    pulse12: createPulseWave(ctx, 0.125),
  };
  CONTEXT_CACHE.set(ctx, cache);
  return cache;
}

function configureOscWave(
  osc: OscillatorNode,
  wave: VoiceWave,
  cache: ContextAudioCache,
): void {
  if (wave === 'pulse25' && cache.pulse25 && typeof osc.setPeriodicWave === 'function') {
    osc.setPeriodicWave(cache.pulse25);
    return;
  }
  if (wave === 'pulse12' && cache.pulse12 && typeof osc.setPeriodicWave === 'function') {
    osc.setPeriodicWave(cache.pulse12);
    return;
  }
  osc.type =
    wave === 'pulse25' || wave === 'pulse12' ? 'square' : wave;
}

// ============================================================================
// 10 Original 64-Step Chiptune Compositions (4 Bars of 16th Notes Each)
// ============================================================================

const BGM_COMPOSITIONS: Readonly<Record<BgmTrackId, TrackComposition>> = {
  // 1. Breezy minimal surface melody (C Major / A Minor, 112 BPM)
  bgmOverworld: {
    bpm: 112,
    steps: 64,
    swing: 0.04,
    leadWave: 'pulse25',
    arpWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.13,
    arpGain: 0.07,
    bassGain: 0.17,
    drumGain: 0.08,
    leadGate: 0.78,
    arpGate: 0.45,
    bassGate: 0.85,
    lead: [
      76, 0, 79, 0, 84, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
      74, 0, 76, 0, 79, 0, 81, 0, 79, 0, 0, 0, 0, 0, 76, 0,
      81, 0, 84, 0, 83, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0,
      76, 0, 74, 0, 72, 0, 71, 0, 72, 0, 0, 0, 0, 0, 0, 0,
    ],
    arp: [
      60, 0, 64, 0, 67, 0, 64, 0, 60, 0, 64, 0, 67, 0, 72, 0,
      59, 0, 62, 0, 67, 0, 62, 0, 59, 0, 62, 0, 67, 0, 71, 0,
      57, 0, 60, 0, 64, 0, 60, 0, 57, 0, 60, 0, 64, 0, 69, 0,
      53, 0, 57, 0, 60, 0, 64, 0, 55, 0, 59, 0, 62, 0, 67, 0,
    ],
    bass: [
      48, 0, 0, 0, 0, 0, 48, 0, 55, 0, 0, 0, 48, 0, 0, 0,
      43, 0, 0, 0, 0, 0, 43, 0, 50, 0, 0, 0, 43, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 45, 0, 52, 0, 0, 0, 45, 0, 0, 0,
      41, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 47, 0, 0, 0,
    ],
    drums: [
      1, 0, 3, 0, 0, 0, 3, 0, 7, 0, 3, 0, 0, 0, 3, 0,
      1, 0, 3, 0, 0, 0, 3, 0, 7, 0, 3, 0, 0, 0, 3, 0,
      1, 0, 3, 0, 0, 0, 3, 0, 7, 0, 3, 0, 0, 0, 3, 0,
      1, 0, 3, 0, 7, 0, 3, 0, 1, 0, 3, 0, 7, 0, 0, 0,
    ],
  },

  // 2. Punchy Cavern driving descent chiptune (E Minor, 146 BPM)
  bgmArea1: {
    bpm: 146,
    steps: 64,
    swing: 0,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.15,
    arpGain: 0.08,
    bassGain: 0.21,
    drumGain: 0.16,
    leadGate: 0.72,
    arpGate: 0.42,
    bassGate: 0.78,
    lead: [
      76, 0, 79, 0, 83, 0, 79, 76, 74, 0, 76, 0, 79, 0, 0, 0,
      83, 0, 86, 0, 83, 0, 79, 76, 74, 0, 71, 0, 74, 0, 76, 0,
      72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 74, 0,
      71, 0, 74, 0, 78, 0, 83, 0, 81, 79, 78, 76, 74, 0, 71, 0,
    ],
    arp: [
      64, 67, 71, 67, 64, 67, 71, 67, 64, 67, 71, 67, 64, 67, 71, 76,
      62, 66, 69, 66, 62, 66, 69, 66, 62, 66, 69, 66, 62, 66, 69, 74,
      60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 72,
      59, 63, 66, 63, 59, 63, 66, 63, 59, 63, 66, 71, 66, 63, 59, 0,
    ],
    bass: [
      40, 0, 40, 52, 40, 0, 47, 0, 40, 0, 40, 52, 43, 0, 47, 0,
      38, 0, 38, 50, 38, 0, 45, 0, 38, 0, 38, 50, 42, 0, 45, 0,
      36, 0, 36, 48, 36, 0, 43, 0, 36, 0, 36, 48, 40, 0, 43, 0,
      35, 0, 35, 47, 35, 0, 42, 0, 35, 0, 42, 0, 47, 0, 42, 0,
    ],
    drums: [
      4, 0, 3, 0, 5, 0, 3, 1, 4, 0, 3, 0, 5, 0, 3, 0,
      4, 0, 3, 1, 5, 0, 3, 0, 4, 0, 6, 0, 5, 0, 2, 2,
      4, 0, 3, 0, 5, 0, 3, 1, 4, 0, 3, 0, 5, 0, 3, 0,
      4, 0, 3, 1, 5, 0, 3, 1, 4, 1, 5, 0, 2, 1, 2, 6,
    ],
  },

  // 3. Spooky Catacomb minor-key arpeggio (D Harmonic Minor, 132 BPM)
  bgmArea2: {
    bpm: 132,
    steps: 64,
    swing: 0,
    leadWave: 'square',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.12,
    arpGain: 0.1,
    bassGain: 0.2,
    drumGain: 0.13,
    leadGate: 0.82,
    arpGate: 0.48,
    bassGate: 0.85,
    lead: [
      74, 0, 0, 77, 81, 0, 80, 0, 77, 0, 76, 0, 74, 0, 73, 0,
      74, 0, 0, 0, 77, 0, 81, 0, 82, 0, 81, 0, 77, 0, 76, 0,
      79, 0, 0, 77, 76, 0, 74, 0, 73, 0, 76, 0, 81, 0, 0, 0,
      82, 0, 81, 0, 77, 0, 76, 0, 73, 0, 76, 0, 74, 0, 0, 0,
    ],
    arp: [
      62, 65, 69, 74, 69, 65, 62, 65, 62, 65, 69, 74, 69, 65, 61, 64,
      58, 62, 65, 70, 65, 62, 58, 62, 58, 62, 65, 70, 65, 62, 57, 61,
      55, 58, 62, 67, 62, 58, 55, 58, 57, 61, 64, 69, 64, 61, 57, 61,
      58, 62, 65, 70, 69, 65, 61, 64, 57, 61, 64, 69, 64, 61, 62, 0,
    ],
    bass: [
      38, 0, 0, 0, 45, 0, 38, 0, 38, 0, 0, 0, 41, 0, 37, 0,
      34, 0, 0, 0, 41, 0, 34, 0, 34, 0, 0, 0, 38, 0, 33, 0,
      43, 0, 0, 0, 38, 0, 43, 0, 45, 0, 0, 0, 37, 0, 45, 0,
      46, 0, 0, 0, 45, 0, 41, 0, 33, 0, 37, 0, 38, 0, 0, 0,
    ],
    drums: [
      1, 0, 7, 0, 2, 0, 7, 0, 1, 0, 3, 7, 2, 0, 3, 0,
      1, 0, 7, 0, 2, 0, 7, 1, 1, 0, 3, 0, 2, 7, 7, 0,
      1, 0, 7, 0, 2, 0, 7, 0, 1, 0, 3, 7, 2, 0, 3, 0,
      1, 0, 7, 1, 2, 0, 7, 0, 1, 7, 2, 0, 7, 7, 2, 0,
    ],
  },

  // 4. Bubbly Aquifer aquatic synth groove (D Dorian / F Lydian, 122 BPM)
  bgmArea3: {
    bpm: 122,
    steps: 64,
    swing: 0.06,
    leadWave: 'sine',
    arpWave: 'pulse25',
    bassWave: 'triangle',
    leadGain: 0.18,
    arpGain: 0.06,
    bassGain: 0.21,
    drumGain: 0.11,
    leadGate: 0.85,
    arpGate: 0.35,
    bassGate: 0.75,
    leadPitchBend: 1.035,
    underwater: true,
    lead: [
      74, 0, 77, 0, 81, 0, 79, 0, 77, 0, 74, 0, 72, 0, 74, 0,
      0, 0, 77, 0, 81, 0, 84, 0, 81, 0, 79, 0, 77, 0, 0, 0,
      79, 0, 81, 0, 86, 0, 84, 0, 81, 0, 79, 0, 77, 0, 74, 0,
      76, 0, 77, 0, 79, 0, 76, 0, 74, 0, 0, 0, 72, 0, 0, 0,
    ],
    arp: [
      74, 0, 81, 86, 0, 77, 84, 0, 74, 0, 81, 86, 0, 79, 84, 0,
      77, 0, 84, 89, 0, 81, 88, 0, 77, 0, 84, 89, 0, 81, 84, 0,
      79, 0, 86, 91, 0, 83, 88, 0, 79, 0, 86, 91, 0, 83, 86, 0,
      76, 0, 83, 88, 0, 79, 84, 0, 74, 0, 81, 86, 0, 77, 81, 0,
    ],
    bass: [
      38, 0, 0, 45, 0, 0, 38, 0, 41, 0, 0, 45, 0, 43, 41, 0,
      41, 0, 0, 48, 0, 0, 41, 0, 45, 0, 0, 48, 0, 45, 43, 0,
      43, 0, 0, 50, 0, 0, 43, 0, 47, 0, 0, 50, 0, 47, 45, 0,
      40, 0, 0, 47, 0, 0, 43, 0, 38, 0, 0, 45, 0, 43, 40, 0,
    ],
    drums: [
      1, 0, 7, 0, 0, 0, 7, 1, 0, 0, 7, 0, 2, 0, 7, 0,
      1, 0, 7, 0, 0, 1, 7, 0, 0, 0, 7, 0, 2, 0, 7, 7,
      1, 0, 7, 0, 0, 0, 7, 1, 0, 0, 7, 0, 2, 0, 7, 0,
      1, 0, 7, 0, 2, 0, 7, 1, 0, 0, 7, 0, 2, 7, 0, 0,
    ],
  },

  // 5. Eerie syncopated Limbo pulse (F# Phrygian / weird 5+3+5+3 accents, 138 BPM)
  bgmLimbo: {
    bpm: 138,
    steps: 64,
    swing: 0,
    leadWave: 'pulse12',
    arpWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.13,
    arpGain: 0.09,
    bassGain: 0.2,
    drumGain: 0.13,
    leadGate: 0.6,
    arpGate: 0.35,
    bassGate: 0.65,
    lead: [
      78, 0, 0, 79, 0, 78, 0, 0, 73, 0, 0, 75, 0, 73, 0, 0,
      81, 0, 0, 79, 0, 78, 0, 0, 72, 0, 0, 73, 0, 0, 0, 0,
      78, 0, 0, 85, 0, 84, 0, 0, 81, 0, 0, 79, 0, 78, 0, 0,
      79, 0, 78, 0, 73, 0, 72, 0, 73, 0, 0, 78, 0, 0, 0, 0,
    ],
    arp: [
      66, 0, 67, 0, 0, 66, 0, 61, 66, 0, 67, 0, 0, 73, 0, 67,
      66, 0, 67, 0, 0, 69, 0, 66, 61, 0, 66, 0, 0, 67, 0, 61,
      66, 0, 73, 0, 0, 72, 0, 69, 66, 0, 67, 0, 0, 66, 0, 61,
      67, 0, 66, 0, 0, 61, 0, 60, 61, 0, 66, 0, 0, 67, 0, 0,
    ],
    bass: [
      42, 0, 0, 42, 0, 43, 0, 0, 42, 0, 0, 37, 0, 42, 0, 0,
      42, 0, 0, 42, 0, 45, 0, 0, 43, 0, 0, 42, 0, 37, 0, 0,
      42, 0, 0, 49, 0, 48, 0, 0, 45, 0, 0, 43, 0, 42, 0, 0,
      43, 0, 0, 42, 0, 37, 0, 0, 36, 0, 0, 37, 0, 42, 0, 0,
    ],
    drums: [
      1, 0, 3, 0, 0, 1, 7, 0, 2, 0, 3, 0, 0, 7, 3, 0,
      1, 0, 3, 0, 0, 1, 7, 0, 2, 0, 0, 3, 7, 0, 2, 0,
      1, 0, 3, 0, 0, 1, 7, 0, 2, 0, 3, 0, 0, 7, 3, 1,
      1, 7, 3, 0, 2, 0, 7, 1, 2, 0, 7, 3, 2, 7, 0, 0,
    ],
  },

  // 6. Intense fast Abyssal Leviathan boss theme (C Phrygian Dominant / Minor, 172 BPM)
  bgmBoss: {
    bpm: 172,
    steps: 64,
    swing: 0,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.16,
    arpGain: 0.09,
    bassGain: 0.22,
    drumGain: 0.19,
    leadGate: 0.7,
    arpGate: 0.45,
    bassGate: 0.72,
    lead: [
      72, 0, 75, 0, 79, 0, 78, 79, 80, 0, 79, 0, 75, 0, 74, 0,
      72, 0, 73, 0, 75, 0, 79, 0, 84, 0, 83, 0, 79, 0, 75, 0,
      80, 0, 84, 0, 87, 0, 84, 80, 79, 0, 83, 0, 86, 0, 83, 79,
      84, 83, 80, 79, 78, 75, 74, 72, 71, 0, 74, 0, 79, 0, 83, 0,
    ],
    arp: [
      60, 63, 67, 72, 60, 63, 67, 72, 60, 64, 68, 72, 60, 64, 68, 72,
      60, 61, 67, 72, 60, 63, 67, 72, 59, 62, 67, 71, 59, 62, 67, 71,
      56, 60, 63, 68, 56, 60, 63, 68, 55, 59, 62, 67, 55, 59, 62, 67,
      54, 57, 60, 66, 54, 57, 60, 66, 55, 59, 62, 67, 71, 67, 62, 59,
    ],
    bass: [
      36, 36, 48, 36, 36, 48, 39, 43, 36, 36, 48, 36, 36, 48, 44, 43,
      36, 36, 48, 37, 36, 48, 39, 43, 35, 35, 47, 35, 35, 47, 43, 38,
      44, 44, 56, 44, 44, 56, 48, 44, 43, 43, 55, 43, 43, 55, 47, 43,
      42, 42, 54, 42, 42, 54, 48, 42, 43, 43, 55, 43, 47, 50, 55, 43,
    ],
    drums: [
      4, 1, 3, 1, 5, 0, 3, 1, 4, 1, 3, 1, 5, 0, 6, 1,
      4, 1, 3, 1, 5, 0, 3, 1, 4, 1, 5, 1, 2, 2, 5, 6,
      4, 1, 3, 1, 5, 0, 3, 1, 4, 1, 3, 1, 5, 0, 6, 1,
      4, 1, 5, 1, 4, 1, 5, 1, 2, 1, 2, 1, 2, 2, 5, 6,
    ],
  },

  // 7. Triumphant chiptune victory loop (G Major, 128 BPM)
  bgmCredits: {
    bpm: 128,
    steps: 64,
    swing: 0,
    leadWave: 'pulse25',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.15,
    arpGain: 0.08,
    bassGain: 0.19,
    drumGain: 0.14,
    leadGate: 0.84,
    arpGate: 0.45,
    bassGate: 0.8,
    lead: [
      79, 0, 83, 0, 86, 0, 0, 83, 81, 0, 83, 0, 79, 0, 0, 0,
      76, 0, 79, 0, 83, 0, 81, 0, 79, 0, 78, 0, 79, 0, 81, 0,
      83, 0, 86, 0, 91, 0, 0, 88, 86, 0, 83, 0, 81, 0, 79, 0,
      84, 0, 83, 0, 81, 0, 78, 0, 79, 0, 0, 0, 0, 0, 74, 0,
    ],
    arp: [
      67, 71, 74, 79, 67, 71, 74, 79, 62, 66, 69, 74, 62, 66, 69, 74,
      64, 67, 71, 76, 64, 67, 71, 76, 60, 64, 67, 72, 62, 66, 69, 74,
      67, 71, 74, 79, 67, 71, 74, 79, 64, 67, 71, 76, 64, 67, 71, 76,
      60, 64, 67, 72, 62, 66, 69, 74, 67, 71, 74, 79, 74, 71, 67, 0,
    ],
    bass: [
      43, 0, 50, 0, 43, 0, 47, 0, 38, 0, 45, 0, 38, 0, 42, 0,
      40, 0, 47, 0, 40, 0, 43, 0, 36, 0, 43, 0, 38, 0, 45, 0,
      43, 0, 50, 0, 47, 0, 43, 0, 40, 0, 47, 0, 43, 0, 40, 0,
      36, 0, 43, 0, 38, 0, 45, 0, 43, 0, 47, 0, 50, 0, 43, 0,
    ],
    drums: [
      4, 0, 3, 0, 5, 0, 3, 0, 4, 0, 3, 1, 5, 0, 3, 0,
      4, 0, 3, 0, 5, 0, 3, 0, 4, 0, 6, 0, 5, 0, 2, 0,
      4, 0, 3, 0, 5, 0, 3, 0, 4, 0, 3, 1, 5, 0, 3, 0,
      4, 0, 3, 1, 5, 0, 3, 1, 4, 0, 5, 0, 2, 2, 6, 0,
    ],
  },

  // 8. Chill funky shop groove (Bb Major 7 / G Minor 9, 108 BPM)
  bgmShopCave: {
    bpm: 108,
    steps: 64,
    swing: 0.1,
    leadWave: 'square',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.11,
    arpGain: 0.07,
    bassGain: 0.21,
    drumGain: 0.13,
    leadGate: 0.55,
    arpGate: 0.3,
    bassGate: 0.72,
    lead: [
      70, 0, 0, 74, 77, 0, 74, 0, 0, 72, 70, 0, 69, 0, 0, 0,
      67, 0, 0, 70, 74, 0, 77, 0, 0, 74, 72, 0, 70, 0, 0, 0,
      72, 0, 0, 75, 79, 0, 77, 0, 0, 75, 74, 0, 72, 0, 0, 0,
      77, 0, 74, 0, 72, 0, 69, 0, 70, 0, 0, 0, 0, 0, 65, 0,
    ],
    arp: [
      0, 0, 62, 0, 0, 0, 65, 0, 0, 0, 69, 0, 0, 65, 0, 0,
      0, 0, 58, 0, 0, 0, 62, 0, 0, 0, 65, 0, 0, 62, 0, 0,
      0, 0, 63, 0, 0, 0, 67, 0, 0, 0, 70, 0, 0, 67, 0, 0,
      0, 0, 65, 0, 0, 0, 69, 0, 0, 0, 62, 0, 0, 65, 0, 0,
    ],
    bass: [
      46, 0, 0, 46, 0, 53, 0, 50, 46, 0, 0, 0, 45, 0, 43, 0,
      43, 0, 0, 43, 0, 50, 0, 46, 43, 0, 0, 0, 45, 0, 46, 0,
      48, 0, 0, 48, 0, 55, 0, 51, 48, 0, 0, 0, 46, 0, 45, 0,
      41, 0, 0, 45, 0, 48, 0, 53, 46, 0, 0, 50, 46, 0, 41, 0,
    ],
    drums: [
      4, 0, 3, 0, 7, 0, 3, 1, 0, 0, 3, 0, 7, 0, 3, 0,
      4, 0, 3, 0, 7, 0, 3, 0, 1, 0, 3, 1, 7, 0, 6, 0,
      4, 0, 3, 0, 7, 0, 3, 1, 0, 0, 3, 0, 7, 0, 3, 0,
      4, 0, 3, 1, 7, 0, 3, 0, 1, 0, 7, 0, 2, 0, 3, 0,
    ],
  },

  // 9. Underwater mellow shop loop (Eb Major 7 / C Minor 9, 96 BPM)
  bgmShopAqua: {
    bpm: 96,
    steps: 64,
    swing: 0.08,
    leadWave: 'sine',
    arpWave: 'triangle',
    bassWave: 'triangle',
    leadGain: 0.16,
    arpGain: 0.08,
    bassGain: 0.19,
    drumGain: 0.08,
    leadGate: 0.9,
    arpGate: 0.55,
    bassGate: 0.88,
    leadPitchBend: 1.02,
    underwater: true,
    lead: [
      75, 0, 0, 0, 79, 0, 82, 0, 80, 0, 79, 0, 75, 0, 0, 0,
      72, 0, 0, 0, 75, 0, 79, 0, 77, 0, 75, 0, 74, 0, 0, 0,
      77, 0, 0, 0, 80, 0, 84, 0, 82, 0, 79, 0, 77, 0, 0, 0,
      79, 0, 77, 0, 75, 0, 74, 0, 75, 0, 0, 0, 0, 0, 0, 0,
    ],
    arp: [
      67, 0, 70, 0, 74, 0, 70, 0, 67, 0, 70, 0, 75, 0, 70, 0,
      63, 0, 67, 0, 70, 0, 67, 0, 63, 0, 67, 0, 72, 0, 67, 0,
      65, 0, 68, 0, 72, 0, 68, 0, 65, 0, 68, 0, 74, 0, 68, 0,
      67, 0, 70, 0, 74, 0, 70, 0, 67, 0, 70, 0, 75, 0, 0, 0,
    ],
    bass: [
      39, 0, 0, 0, 0, 0, 46, 0, 39, 0, 0, 0, 43, 0, 0, 0,
      36, 0, 0, 0, 0, 0, 43, 0, 36, 0, 0, 0, 41, 0, 0, 0,
      41, 0, 0, 0, 0, 0, 48, 0, 41, 0, 0, 0, 46, 0, 0, 0,
      46, 0, 0, 0, 43, 0, 0, 0, 39, 0, 0, 0, 0, 0, 0, 0,
    ],
    drums: [
      1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 7, 0, 0, 0, 7, 0,
      1, 0, 0, 0, 7, 0, 0, 1, 0, 0, 7, 0, 0, 0, 7, 0,
      1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 7, 0, 0, 0, 7, 0,
      1, 0, 0, 0, 7, 0, 0, 0, 1, 0, 7, 0, 0, 0, 0, 0,
    ],
  },

  // 10. Mysterious sparkle arpeggio (A Lydian / Whole-Tone Shimmer, 118 BPM)
  bgmSecret: {
    bpm: 118,
    steps: 64,
    swing: 0,
    leadWave: 'sine',
    arpWave: 'pulse12',
    bassWave: 'triangle',
    leadGain: 0.12,
    arpGain: 0.08,
    bassGain: 0.14,
    drumGain: 0.06,
    leadGate: 0.9,
    arpGate: 0.42,
    bassGate: 0.92,
    lead: [
      81, 0, 0, 85, 0, 0, 87, 0, 88, 0, 0, 0, 85, 0, 0, 0,
      83, 0, 0, 87, 0, 0, 90, 0, 88, 0, 0, 0, 0, 0, 0, 0,
      81, 0, 0, 85, 0, 0, 88, 0, 92, 0, 0, 90, 88, 0, 85, 0,
      87, 0, 0, 85, 0, 0, 83, 0, 81, 0, 0, 0, 0, 0, 0, 0,
    ],
    arp: [
      69, 73, 76, 81, 85, 81, 76, 73, 69, 75, 76, 81, 87, 81, 76, 75,
      71, 75, 78, 83, 87, 83, 78, 75, 71, 76, 78, 83, 88, 83, 78, 76,
      69, 73, 76, 80, 85, 80, 76, 73, 69, 75, 78, 81, 87, 81, 78, 75,
      68, 73, 76, 80, 85, 80, 76, 73, 69, 73, 76, 81, 76, 73, 69, 0,
    ],
    bass: [
      45, 0, 0, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 0, 0,
      47, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 0, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 0, 0, 51, 0, 0, 0, 0, 0, 0, 0,
      44, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0,
    ],
    drums: [
      7, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 7, 0, 0, 0,
      7, 0, 0, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 0, 0,
      7, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 7, 0, 0, 0,
      7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
};

export class ProceduralSynth {
  private bgmCtx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private bgmTrack: TrackComposition | null = null;
  private bgmTrackId: string | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private readonly activeBgmNodes = new Set<AudioScheduledSourceNode>();

  public getCurrentTrackId(): string | null {
    return this.bgmTrackId;
  }

  public isBgmRunning(): boolean {
    return this.schedulerTimer !== null && this.bgmTrack !== null;
  }

  public startBgm(trackId: string, ctx: AudioContext, dest: AudioNode): void {
    this.stopBgm();

    const comp =
      BGM_COMPOSITIONS[trackId as BgmTrackId] ?? BGM_COMPOSITIONS.bgmArea1;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(1.0, ctx.currentTime);
    bus.connect(dest);

    this.bgmCtx = ctx;
    this.bgmBus = bus;
    this.bgmTrack = comp;
    this.bgmTrackId = trackId;
    this.stepIndex = 0;
    this.nextStepTime = ctx.currentTime + 0.03;

    this.scheduleAhead();
    this.schedulerTimer = globalThis.setInterval(() => {
      this.scheduleAhead();
    }, SCHEDULER_INTERVAL_MS);
  }

  public stopBgm(): void {
    if (this.schedulerTimer !== null) {
      globalThis.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    for (const node of this.activeBgmNodes) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeBgmNodes.clear();

    if (this.bgmBus) {
      try {
        this.bgmBus.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.bgmBus = null;
    }

    this.bgmCtx = null;
    this.bgmTrack = null;
    this.bgmTrackId = null;
    this.stepIndex = 0;
  }

  private scheduleAhead(): void {
    const ctx = this.bgmCtx;
    const bus = this.bgmBus;
    const track = this.bgmTrack;
    if (!ctx || !bus || !track) {
      return;
    }
    if (ctx.state === 'closed') {
      this.stopBgm();
      return;
    }
    if (ctx.state === 'suspended') {
      return;
    }

    const now = ctx.currentTime;
    // Recover gracefully after tab sleep so notes never pile up in one burst
    if (this.nextStepTime < now - 0.35) {
      this.nextStepTime = now + 0.03;
    }

    const stepDur = 60 / track.bpm / 4; // 16th-note duration
    const cache = getContextCache(ctx);

    while (this.nextStepTime < now + LOOKAHEAD_SEC) {
      const idx = this.stepIndex % track.steps;
      const swingOffset = idx % 2 === 1 ? stepDur * track.swing : 0;
      const t = this.nextStepTime + swingOffset;

      const leadNote = track.lead[idx] ?? 0;
      if (leadNote > 0) {
        this.scheduleBgmTone(
          ctx,
          bus,
          cache,
          track.leadWave,
          midiToHz(leadNote),
          t,
          stepDur * track.leadGate,
          track.leadGain,
          track.leadPitchBend,
        );
      }

      const arpNote = track.arp[idx] ?? 0;
      if (arpNote > 0) {
        this.scheduleBgmTone(
          ctx,
          bus,
          cache,
          track.arpWave,
          midiToHz(arpNote),
          t,
          stepDur * track.arpGate,
          track.arpGain,
        );
      }

      const bassNote = track.bass[idx] ?? 0;
      if (bassNote > 0) {
        this.scheduleBgmTone(
          ctx,
          bus,
          cache,
          track.bassWave,
          midiToHz(bassNote),
          t,
          stepDur * track.bassGate,
          track.bassGain,
        );
      }

      const drum = track.drums[idx] ?? 0;
      if (drum > 0) {
        this.scheduleBgmDrum(ctx, bus, cache, drum, t, track.drumGain, Boolean(track.underwater));
      }

      this.nextStepTime += stepDur;
      this.stepIndex = (this.stepIndex + 1) % track.steps;
    }
  }

  private trackBgmNode(node: AudioScheduledSourceNode): void {
    this.activeBgmNodes.add(node);
    node.onended = () => {
      this.activeBgmNodes.delete(node);
      try {
        node.disconnect();
      } catch {
        // Ignore disconnect error
      }
    };
  }

  private scheduleBgmTone(
    ctx: AudioContext,
    dest: AudioNode,
    cache: ContextAudioCache,
    wave: VoiceWave,
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
    pitchBend?: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    configureOscWave(osc, wave, cache);

    if (pitchBend && pitchBend !== 1) {
      osc.frequency.setValueAtTime(freq / pitchBend, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq, startTime + Math.min(0.045, duration * 0.4));
    } else {
      osc.frequency.setValueAtTime(freq, startTime);
    }

    const attack = Math.min(0.008, duration * 0.2);
    const releaseStart = startTime + Math.max(attack + 0.005, duration * 0.72);
    const endTime = startTime + duration + 0.015;

    gain.gain.setValueAtTime(GAIN_FLOOR, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    gain.gain.setValueAtTime(peakGain * 0.85, releaseStart);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, endTime);

    osc.connect(gain);
    gain.connect(dest);

    this.trackBgmNode(osc);
    osc.start(startTime);
    osc.stop(endTime + 0.01);
  }

  private scheduleBgmDrum(
    ctx: AudioContext,
    dest: AudioNode,
    cache: ContextAudioCache,
    drumCode: number,
    startTime: number,
    drumGain: number,
    underwater: boolean,
  ): void {
    // Kick (1 or 4)
    if (drumCode === 1 || drumCode === 4) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(underwater ? 110 : 145, startTime);
      osc.frequency.exponentialRampToValueAtTime(42, startTime + 0.075);

      gain.gain.setValueAtTime(drumGain * 1.1, startTime);
      gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, startTime + 0.09);

      osc.connect(gain);
      gain.connect(dest);
      this.trackBgmNode(osc);
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    }

    // Snare (2 or 5)
    if (drumCode === 2 || drumCode === 5) {
      const src = ctx.createBufferSource();
      src.buffer = cache.chipNoise;
      const filter = ctx.createBiquadFilter();
      filter.type = underwater ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(underwater ? 900 : 1900, startTime);
      filter.Q.setValueAtTime(1.1, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(drumGain * 0.8, startTime);
      gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, startTime + 0.085);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      this.trackBgmNode(src);
      src.start(startTime);
      src.stop(startTime + 0.095);
    }

    // Closed hi-hat (3, 4, 5) or Open hi-hat (6)
    if (drumCode === 3 || drumCode === 4 || drumCode === 5 || drumCode === 6) {
      const src = ctx.createBufferSource();
      src.buffer = cache.whiteNoise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(underwater ? 2600 : 5800, startTime);

      const dur = drumCode === 6 ? 0.095 : 0.032;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(drumGain * (drumCode === 6 ? 0.45 : 0.34), startTime);
      gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, startTime + dur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      this.trackBgmNode(src);
      src.start(startTime);
      src.stop(startTime + dur + 0.01);
    }

    // Rim / sparkle / water tick (7)
    if (drumCode === 7) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = underwater ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(underwater ? 680 : 1150, startTime);
      osc.frequency.exponentialRampToValueAtTime(underwater ? 1050 : 420, startTime + 0.035);

      gain.gain.setValueAtTime(drumGain * 0.45, startTime);
      gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, startTime + 0.042);

      osc.connect(gain);
      gain.connect(dest);
      this.trackBgmNode(osc);
      osc.start(startTime);
      osc.stop(startTime + 0.05);
    }
  }

  // ==========================================================================
  // Retro Procedural SFX Synthesis (45 Distinct Sounds)
  // ==========================================================================

  public playSfx(
    sfxId: string,
    ctx: AudioContext,
    dest: AudioNode,
    opts?: ProceduralSfxOptions,
  ): void {
    if (ctx.state === 'closed') {
      opts?.onEnded?.();
      return;
    }

    const cache = getContextCache(ctx);
    const now = ctx.currentTime;
    const jitter =
      opts?.pitchJitter && Number.isFinite(opts.pitchJitter) && opts.pitchJitter > 0
        ? clamp(opts.pitchJitter, 0.5, 2.0)
        : 1.0;
    const comboMult =
      opts?.comboPitch && Number.isFinite(opts.comboPitch) && opts.comboPitch > 0
        ? clamp(opts.comboPitch, 0.5, 2.5)
        : 1.0;

    // Optional stereo panning wrapper
    let target: AudioNode = dest;
    let panner: StereoPannerNode | null = null;
    const panVal = opts?.pan && Number.isFinite(opts.pan) ? clamp(opts.pan, -0.85, 0.85) : 0;
    if (panVal !== 0 && typeof ctx.createStereoPanner === 'function') {
      try {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(panVal, now);
        panner.connect(dest);
        target = panner;
      } catch {
        panner = null;
        target = dest;
      }
    }

    let maxEndTime = now + 0.05;
    let longestNode: AudioScheduledSourceNode | null = null;

    const noteTone = (
      wave: VoiceWave,
      startHz: number,
      endHz: number,
      delaySec: number,
      durSec: number,
      peakGain: number,
      useCombo = false,
    ): void => {
      const t0 = now + delaySec;
      const t1 = t0 + durSec;
      const mult = jitter * (useCombo ? comboMult : 1.0);
      const f0 = clamp(startHz * mult, 28, 12000);
      const f1 = clamp(endHz * mult, 28, 12000);

      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      configureOscWave(osc, wave, cache);

      osc.frequency.setValueAtTime(f0, t0);
      if (Math.abs(f1 - f0) > 0.5) {
        osc.frequency.exponentialRampToValueAtTime(f1, t1);
      }

      const atk = Math.min(0.005, durSec * 0.2);
      g.gain.setValueAtTime(GAIN_FLOOR, t0);
      g.gain.linearRampToValueAtTime(peakGain, t0 + atk);
      g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, t1);

      osc.connect(g);
      g.connect(target);
      osc.start(t0);
      const stopAt = t1 + 0.012;
      osc.stop(stopAt);
      if (stopAt >= maxEndTime) {
        maxEndTime = stopAt;
        longestNode = osc;
      }
    };

    const noteNoise = (
      chip: boolean,
      filterType: BiquadFilterType,
      startFreq: number,
      endFreq: number,
      delaySec: number,
      durSec: number,
      peakGain: number,
      q = 1.0,
    ): void => {
      const t0 = now + delaySec;
      const t1 = t0 + durSec;
      const src = ctx.createBufferSource();
      src.buffer = chip ? cache.chipNoise : cache.whiteNoise;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(q, t0);
      filter.frequency.setValueAtTime(clamp(startFreq * jitter, 60, 14000), t0);
      if (Math.abs(endFreq - startFreq) > 1) {
        filter.frequency.exponentialRampToValueAtTime(clamp(endFreq * jitter, 60, 14000), t1);
      }

      const g = ctx.createGain();
      g.gain.setValueAtTime(GAIN_FLOOR, t0);
      g.gain.linearRampToValueAtTime(peakGain, t0 + Math.min(0.004, durSec * 0.2));
      g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, t1);

      src.connect(filter);
      filter.connect(g);
      g.connect(target);
      src.start(t0);
      const stopAt = t1 + 0.012;
      src.stop(stopAt);
      if (stopAt >= maxEndTime) {
        maxEndTime = stopAt;
        longestNode = src;
      }
    };

    switch (sfxId) {
      // --- Gunboot Shots ---
      case 'sfxGunM':
        noteTone('pulse25', 600, 140, 0, 0.068, 0.26);
        noteNoise(true, 'bandpass', 2400, 900, 0, 0.04, 0.2, 1.2);
        break;
      case 'sfxGunMB':
        noteTone('pulse25', 760, 135, 0, 0.082, 0.28);
        noteTone('pulse12', 1140, 260, 0, 0.07, 0.16);
        noteNoise(true, 'bandpass', 3000, 950, 0, 0.052, 0.24, 1.1);
        break;
      case 'sfxGunS':
        noteTone('triangle', 220, 48, 0, 0.13, 0.34);
        noteTone('square', 360, 82, 0, 0.09, 0.2);
        noteNoise(true, 'lowpass', 3600, 420, 0, 0.14, 0.32, 0.8);
        break;
      case 'sfxGunSB':
        noteTone('triangle', 260, 40, 0, 0.16, 0.38);
        noteTone('sawtooth', 440, 68, 0, 0.12, 0.24);
        noteNoise(true, 'lowpass', 4800, 360, 0, 0.18, 0.36, 0.7);
        break;
      case 'sfxGunL':
        noteTone('sawtooth', 1650, 240, 0, 0.15, 0.22);
        noteTone('pulse12', 2450, 520, 0, 0.13, 0.16);
        noteNoise(false, 'highpass', 3200, 1400, 0, 0.09, 0.12);
        break;
      case 'sfxGunLB':
        noteTone('sawtooth', 2200, 190, 0, 0.21, 0.26);
        noteTone('pulse12', 3100, 360, 0, 0.19, 0.18);
        noteTone('triangle', 210, 55, 0, 0.14, 0.24);
        noteNoise(false, 'highpass', 3600, 1200, 0, 0.13, 0.15);
        break;
      case 'sfxGun3':
        noteTone('pulse25', 700, 220, 0, 0.055, 0.22);
        noteTone('pulse25', 820, 250, 0.015, 0.055, 0.18);
        noteTone('pulse25', 620, 190, 0.03, 0.055, 0.18);
        noteNoise(true, 'bandpass', 2600, 1100, 0, 0.05, 0.16);
        break;
      case 'sfxGun3B':
        noteTone('pulse25', 860, 240, 0, 0.068, 0.24);
        noteTone('pulse12', 1020, 300, 0.015, 0.068, 0.2);
        noteTone('pulse25', 740, 200, 0.03, 0.068, 0.2);
        noteNoise(true, 'bandpass', 3200, 1100, 0, 0.065, 0.2);
        break;
      case 'sfxGunP':
        noteTone('square', 340, 82, 0, 0.095, 0.28);
        noteTone('triangle', 175, 56, 0, 0.09, 0.28);
        noteNoise(true, 'bandpass', 1500, 480, 0, 0.075, 0.22);
        break;
      case 'sfxGunPB':
        noteTone('square', 430, 72, 0, 0.12, 0.3);
        noteTone('pulse25', 640, 140, 0, 0.1, 0.2);
        noteTone('triangle', 200, 46, 0, 0.12, 0.32);
        noteNoise(true, 'bandpass', 2000, 420, 0, 0.095, 0.26);
        break;
      case 'sfxGunB':
        noteTone('pulse12', 820, 210, 0, 0.056, 0.25);
        noteNoise(true, 'highpass', 2600, 1300, 0, 0.036, 0.18);
        break;
      case 'sfxGunBB':
        noteTone('pulse12', 1040, 200, 0, 0.072, 0.27);
        noteTone('pulse25', 1480, 420, 0, 0.06, 0.16);
        noteNoise(true, 'highpass', 3200, 1200, 0, 0.048, 0.22);
        break;
      case 'sfxGunN':
        noteTone('pulse25', 490, 840, 0, 0.028, 0.22);
        noteTone('triangle', 840, 240, 0.025, 0.048, 0.22);
        noteNoise(true, 'bandpass', 2200, 1200, 0, 0.03, 0.12);
        break;
      case 'sfxGunNB':
        noteTone('pulse25', 620, 1120, 0, 0.032, 0.24);
        noteTone('pulse12', 1120, 280, 0.028, 0.058, 0.22);
        noteNoise(true, 'bandpass', 2800, 1300, 0, 0.04, 0.16);
        break;

      // --- Movement & Combat ---
      case 'sfxJump':
        noteTone('pulse25', 220, 560, 0, 0.095, 0.2);
        break;
      case 'sfxWallKick':
        noteTone('pulse25', 310, 760, 0, 0.085, 0.22);
        noteNoise(true, 'highpass', 2800, 1600, 0, 0.028, 0.12);
        break;
      case 'sfxLand':
        noteTone('triangle', 145, 58, 0, 0.052, 0.18);
        noteNoise(false, 'lowpass', 700, 260, 0, 0.032, 0.1);
        break;
      case 'sfxStomp':
        noteTone('square', 340, 115, 0, 0.045, 0.26, true);
        noteTone('pulse25', 220, 660, 0.032, 0.085, 0.24, true);
        noteNoise(true, 'bandpass', 1400, 600, 0, 0.045, 0.18);
        break;
      case 'sfxEnemyHit':
        noteTone('square', 460, 165, 0, 0.058, 0.22);
        noteNoise(true, 'bandpass', 2100, 850, 0, 0.04, 0.16);
        break;
      case 'sfxEnemyKill':
        noteTone('pulse25', 350, 72, 0, 0.095, 0.26);
        noteTone('pulse12', 880, 1320, 0.02, 0.055, 0.13);
        noteNoise(true, 'lowpass', 2800, 420, 0, 0.105, 0.24);
        break;
      case 'sfxBlockBreak':
        noteTone('square', 210, 74, 0, 0.075, 0.22);
        noteNoise(true, 'bandpass', 1600, 520, 0, 0.07, 0.24);
        noteNoise(true, 'bandpass', 1200, 380, 0.04, 0.075, 0.18);
        break;
      case 'sfxGem':
        noteTone('pulse12', 1175, 1185, 0, 0.045, 0.17, true);
        noteTone('sine', 1760, 1780, 0.036, 0.075, 0.19, true);
        break;
      case 'sfxGemHighStart': {
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5];
        for (let i = 0; i < notes.length; i++) {
          const f = notes[i] ?? 1046.5;
          noteTone('pulse25', f, f * 1.01, i * 0.045, 0.09, 0.2);
        }
        break;
      }
      case 'sfxGemHighEnd':
        noteTone('triangle', 784, 740, 0, 0.08, 0.2);
        noteTone('triangle', 659, 622, 0.075, 0.085, 0.18);
        noteTone('triangle', 523, 440, 0.15, 0.12, 0.18);
        break;
      case 'sfxCombo':
        noteTone('pulse25', 523.25, 528, 0, 0.075, 0.2, true);
        noteTone('pulse12', 659.25, 665, 0.045, 0.085, 0.2, true);
        noteTone('pulse25', 783.99, 792, 0.09, 0.14, 0.22, true);
        break;
      case 'sfxEmpty':
        noteTone('square', 920, 480, 0, 0.022, 0.14);
        noteNoise(false, 'highpass', 3800, 2400, 0, 0.026, 0.14);
        break;
      case 'sfxHurt':
        noteTone('sawtooth', 260, 62, 0, 0.21, 0.34);
        noteTone('square', 195, 54, 0.025, 0.19, 0.26);
        noteNoise(true, 'lowpass', 2400, 320, 0, 0.18, 0.3);
        break;
      case 'sfxDie':
        noteTone('sawtooth', 440, 310, 0, 0.11, 0.26);
        noteTone('sawtooth', 330, 220, 0.1, 0.12, 0.26);
        noteTone('square', 220, 110, 0.21, 0.15, 0.26);
        noteTone('triangle', 120, 42, 0.34, 0.22, 0.32);
        noteNoise(true, 'lowpass', 1800, 220, 0.26, 0.28, 0.24);
        break;
      case 'sfxSplash':
        noteNoise(false, 'bandpass', 1400, 380, 0, 0.14, 0.22, 1.4);
        noteTone('sine', 340, 740, 0.02, 0.075, 0.15);
        noteTone('sine', 460, 960, 0.075, 0.085, 0.14);
        break;
      case 'sfxOxygen':
        noteTone('sine', 340, 720, 0, 0.075, 0.22);
        noteTone('sine', 520, 1080, 0.065, 0.095, 0.22);
        break;
      case 'sfxOxygenWarn':
        noteTone('triangle', 880, 860, 0, 0.065, 0.2);
        noteTone('triangle', 660, 640, 0.09, 0.085, 0.2);
        break;
      case 'sfxPickupGun':
        noteTone('pulse25', 587.33, 590, 0, 0.06, 0.22);
        noteTone('pulse25', 739.99, 742, 0.055, 0.06, 0.22);
        noteTone('pulse25', 880, 884, 0.11, 0.065, 0.22);
        noteTone('pulse12', 1174.66, 1180, 0.165, 0.13, 0.24);
        break;
      case 'sfxShopBuy':
        noteTone('pulse25', 987.77, 990, 0, 0.065, 0.2);
        noteTone('pulse25', 1318.51, 1322, 0.06, 0.075, 0.22);
        noteTone('sine', 1567.98, 1575, 0.12, 0.12, 0.2);
        break;
      case 'sfxShopDeny':
        noteTone('square', 175, 160, 0, 0.07, 0.22);
        noteTone('square', 135, 115, 0.075, 0.1, 0.24);
        break;
      case 'sfxUpgrade':
        noteTone('pulse25', 523.25, 526, 0, 0.07, 0.22);
        noteTone('pulse25', 659.25, 662, 0.065, 0.07, 0.22);
        noteTone('pulse25', 783.99, 788, 0.13, 0.075, 0.22);
        noteTone('pulse12', 1046.5, 1052, 0.195, 0.17, 0.25);
        break;
      case 'sfxStageClear':
        noteTone('pulse25', 523.25, 525, 0, 0.075, 0.22);
        noteTone('pulse25', 783.99, 786, 0.07, 0.075, 0.22);
        noteTone('pulse25', 659.25, 662, 0.14, 0.075, 0.22);
        noteTone('pulse25', 1046.5, 1054, 0.21, 0.19, 0.26);
        break;
      case 'sfxExplosion':
        noteTone('triangle', 120, 28, 0, 0.28, 0.38);
        noteTone('sawtooth', 160, 38, 0, 0.22, 0.22);
        noteNoise(true, 'lowpass', 2400, 210, 0, 0.34, 0.36, 0.7);
        break;
      case 'sfxBossHit':
        noteTone('sawtooth', 210, 58, 0, 0.14, 0.3);
        noteTone('square', 640, 280, 0, 0.08, 0.18);
        noteNoise(true, 'bandpass', 1800, 420, 0, 0.12, 0.28);
        break;
      case 'sfxBossStun':
        noteTone('square', 440, 92, 0, 0.26, 0.28);
        noteTone('triangle', 180, 48, 0.04, 0.24, 0.3);
        noteNoise(true, 'lowpass', 1600, 240, 0.02, 0.22, 0.24);
        break;
      case 'sfxBossPhase':
        noteTone('sawtooth', 110, 340, 0, 0.2, 0.28);
        noteTone('sawtooth', 340, 88, 0.18, 0.26, 0.32);
        noteTone('pulse12', 220, 660, 0.05, 0.22, 0.16);
        noteNoise(true, 'lowpass', 2200, 300, 0, 0.42, 0.26);
        break;
      case 'sfxBossLaser':
        noteTone('sawtooth', 980, 170, 0, 0.34, 0.3);
        noteTone('pulse12', 1480, 260, 0, 0.32, 0.2);
        noteNoise(true, 'bandpass', 2600, 620, 0, 0.35, 0.24, 1.5);
        break;
      case 'sfxBossDie':
        noteTone('triangle', 150, 32, 0, 0.3, 0.36);
        noteNoise(true, 'lowpass', 2600, 260, 0, 0.28, 0.34);
        noteNoise(true, 'lowpass', 2200, 200, 0.18, 0.32, 0.34);
        noteTone('sawtooth', 240, 34, 0.32, 0.42, 0.3);
        noteNoise(true, 'lowpass', 3000, 160, 0.34, 0.44, 0.38);
        break;
      case 'sfxTrophy':
        noteTone('pulse12', 783.99, 788, 0, 0.07, 0.2);
        noteTone('pulse12', 987.77, 992, 0.06, 0.07, 0.2);
        noteTone('pulse12', 1174.66, 1180, 0.12, 0.075, 0.2);
        noteTone('pulse25', 1479.98, 1488, 0.18, 0.08, 0.22);
        noteTone('sine', 1567.98, 1576, 0.24, 0.18, 0.24);
        break;
      case 'sfxJetpack':
        noteNoise(false, 'bandpass', 950, 1550, 0, 0.075, 0.16, 1.3);
        noteTone('triangle', 115, 85, 0, 0.07, 0.14);
        break;
      case 'sfxCorpseEat':
        noteTone('square', 250, 115, 0, 0.045, 0.22, true);
        noteTone('pulse25', 165, 340, 0.045, 0.065, 0.22, true);
        break;
      default:
        // Fallback crisp retro blip for any custom/unknown SFX ID
        noteTone('pulse25', 520, 260, 0, 0.075, 0.2, true);
        break;
    }

    let ended = false;
    const finish = (): void => {
      if (ended) return;
      ended = true;
      if (panner) {
        try {
          panner.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      opts?.onEnded?.();
    };

    const durationMs = Math.max(30, Math.ceil((maxEndTime - now) * 1000) + 40);
    const safetyTimer = globalThis.setTimeout(finish, durationMs);

    const last = longestNode as AudioScheduledSourceNode | null;
    if (last) {
      last.onended = () => {
        globalThis.clearTimeout(safetyTimer);
        finish();
      };
    }
  }
}
