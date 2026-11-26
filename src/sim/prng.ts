import type { SimState } from '../contracts/index.ts';

/**
 * Pure deterministic Mulberry32 step mutating state.rngState (32-bit uint).
 * Returns float in [0, 1).
 */
export function nextRandom(state: Pick<SimState, 'rngState'>): number {
  let t = (state.rngState + 0x6d2b79f5) | 0;
  state.rngState = t >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: Pick<SimState, 'rngState'>, min: number, maxInclusive: number): number {
  if (maxInclusive <= min) return min;
  return min + Math.floor(nextRandom(state) * (maxInclusive - min + 1));
}

export function randRange(state: Pick<SimState, 'rngState'>, min: number, max: number): number {
  return min + nextRandom(state) * (max - min);
}

export function randPick<T>(state: Pick<SimState, 'rngState'>, items: readonly T[]): T {
  const idx = Math.floor(nextRandom(state) * items.length);
  return items[Math.min(items.length - 1, Math.max(0, idx))]!;
}

export function seedRng(seed: number): number {
  let s = (seed | 0) ^ 0x9e3779b9;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
  return (s ^ (s >>> 16)) >>> 0;
}
