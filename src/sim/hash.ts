import type { SimState } from '../contracts/index.ts';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixUint32(hash: number, value: number): number {
  let h = hash;
  const v = value >>> 0;
  h ^= v & 0xff;
  h = Math.imul(h, FNV_PRIME);
  h ^= (v >>> 8) & 0xff;
  h = Math.imul(h, FNV_PRIME);
  h ^= (v >>> 16) & 0xff;
  h = Math.imul(h, FNV_PRIME);
  h ^= (v >>> 24) & 0xff;
  h = Math.imul(h, FNV_PRIME);
  return h >>> 0;
}

function mixFloat(hash: number, value: number): number {
  const q = Number.isFinite(value) ? Math.round(value * 1000) | 0 : 0x7fffffff;
  return mixUint32(hash, q);
}

function mixString(hash: number, str: string): number {
  let h = hash;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Pure deterministic FNV-1a 32-bit state hash for replay verification.
 */
export function hashSimState(state: SimState): string {
  let h = FNV_OFFSET;
  h = mixUint32(h, state.tick);
  h = mixUint32(h, state.seed);
  h = mixUint32(h, state.rngState);
  h = mixString(h, state.mode);
  h = mixUint32(h, state.area);
  h = mixUint32(h, state.level);
  h = mixUint32(h, state.hardMode ? 1 : 0);
  h = mixUint32(h, state.styleId);

  const p = state.player;
  h = mixFloat(h, p.x);
  h = mixFloat(h, p.y);
  h = mixFloat(h, p.vx);
  h = mixFloat(h, p.vy);
  h = mixUint32(h, p.hp);
  h = mixUint32(h, p.hpMax);
  h = mixUint32(h, p.heartPieces);
  h = mixUint32(h, p.ammo);
  h = mixUint32(h, p.ammoMax);
  h = mixUint32(h, p.weaponId);
  h = mixUint32(h, p.gunLevel);
  h = mixUint32(h, p.onGround ? 1 : 0);
  h = mixUint32(h, p.inWater ? 1 : 0);
  h = mixUint32(h, p.invulnTicks);
  h = mixUint32(h, p.oxygen);
  h = mixUint32(h, p.jetpackTicks);
  h = mixUint32(h, p.alive ? 1 : 0);

  h = mixUint32(h, state.gems);
  h = mixUint32(h, state.gemStreak);
  h = mixUint32(h, state.gemStreakTimer);
  h = mixUint32(h, state.gemHigh ? 1 : 0);
  h = mixUint32(h, state.combo);
  h = mixUint32(h, state.maxCombo);
  h = mixUint32(h, state.impactSlowdownTicks);
  h = mixUint32(h, state.upgrades.length);
  for (const ug of state.upgrades) {
    h = mixUint32(h, ug);
  }

  h = mixUint32(h, state.enemies.length);
  for (const e of state.enemies) {
    h = mixUint32(h, e.id);
    h = mixString(h, e.kind);
    h = mixFloat(h, e.x);
    h = mixFloat(h, e.y);
    h = mixUint32(h, e.hp);
  }

  h = mixUint32(h, state.bullets.length);
  for (const b of state.bullets) {
    h = mixUint32(h, b.id);
    h = mixFloat(h, b.x);
    h = mixFloat(h, b.y);
  }

  h = mixUint32(h, state.gemsEntities.length);
  h = mixUint32(h, state.pickups.length);
  if (state.boss) {
    h = mixUint32(h, state.boss.hp);
    h = mixUint32(h, state.boss.phase);
    h = mixUint32(h, state.boss.state);
    h = mixFloat(h, state.boss.y);
  }

  return (h >>> 0).toString(16).padStart(8, '0');
}
