import {
  TILE_KIND,
  WELL_CONSTANTS,
  type SimEvent,
  type SimState,
  type TileKind,
  type UpgradeId,
  type WorldState,
} from '../contracts/index.ts';

export function allocId(state: SimState): number {
  const id = state.nextEntityId;
  state.nextEntityId = id + 1;
  return id;
}

export function emitEvent(state: SimState, event: SimEvent): void {
  state.events.push(event);
}

export function hasUpgrade(state: SimState, id: UpgradeId): boolean {
  return state.upgrades.includes(id);
}

export function addShake(state: SimState, magnitude: number, durationTicks: number): void {
  if (magnitude >= state.camera.shakeMag || state.camera.shakeTicks <= 0) {
    state.camera.shakeMag = Math.max(state.camera.shakeMag, magnitude);
    state.camera.shakeTicks = Math.max(state.camera.shakeTicks, durationTicks);
  }
}

export function colToX(col: number): number {
  return col * WELL_CONSTANTS.TILE_SIZE;
}

export function rowToY(row: number): number {
  return row * WELL_CONSTANTS.TILE_SIZE;
}

export function xToCol(x: number): number {
  return Math.floor(x / WELL_CONSTANTS.TILE_SIZE);
}

export function yToRow(y: number): number {
  return Math.floor(y / WELL_CONSTANTS.TILE_SIZE);
}

export function getTile(world: WorldState, col: number, row: number): TileKind {
  if (col < world.minCol || col > world.maxCol || row < 0 || row >= world.rows) {
    return TILE_KIND.SOLID;
  }
  const idx = row * world.cols + (col - world.minCol);
  return world.tiles[idx] ?? TILE_KIND.EMPTY;
}

export function setTile(world: WorldState, col: number, row: number, kind: TileKind): void {
  if (col < world.minCol || col > world.maxCol || row < 0 || row >= world.rows) {
    return;
  }
  const idx = row * world.cols + (col - world.minCol);
  world.tiles[idx] = kind;
}

export function isSolidTile(kind: TileKind, world?: WorldState): boolean {
  if (kind === TILE_KIND.SOLID || kind === TILE_KIND.BREAKABLE || kind === TILE_KIND.SHOP_FLOOR || kind === TILE_KIND.BUBBLE_BLOCK) {
    return true;
  }
  if (kind === TILE_KIND.GHOST_WALL) {
    return world ? (Math.floor(world.spikeTrapTimer / 90) % 2 === 0) : true;
  }
  return false;
}

export function isThinPlatform(kind: TileKind): boolean {
  return kind === TILE_KIND.THIN_PLATFORM;
}

export function isBreakableTile(kind: TileKind): boolean {
  return kind === TILE_KIND.BREAKABLE || kind === TILE_KIND.BUBBLE_BLOCK;
}

export function isHazardTile(kind: TileKind, world?: WorldState): boolean {
  if (
    kind === TILE_KIND.SPIKE_UP ||
    kind === TILE_KIND.SPIKE_DOWN ||
    kind === TILE_KIND.SPIKE_LEFT ||
    kind === TILE_KIND.SPIKE_RIGHT
  ) {
    return true;
  }
  if (kind === TILE_KIND.SPIKE_TRAP) {
    return world ? world.spikeTrapExtended : true;
  }
  return false;
}

export function healPlayer(state: SimState, amount: number): void {
  const p = state.player;
  for (let i = 0; i < amount; i++) {
    if (p.hp < p.hpMax) {
      p.hp += 1;
    } else {
      p.heartPieces += 1;
      if (p.heartPieces >= WELL_CONSTANTS.HEART_PIECE_MAX) {
        p.heartPieces = 0;
        p.hpMax += 1;
        p.hp = p.hpMax;
        emitEvent(state, { type: 'floating_text', x: p.x, y: p.y - 10, text: 'MAX HP UP!', channel: 'M' });
      }
    }
  }
}

export function rechargeGunboots(state: SimState): void {
  const p = state.player;
  if (p.ammo < p.ammoMax) {
    p.ammo = p.ammoMax;
    p.meterJiggleTicks = 8;
  }
  p.jetpackTicks = WELL_CONSTANTS.JETPACK_MAX_TICKS;
  p.jetpackActive = false;
}

export function damagePlayer(state: SimState, sourceX: number, sourceY: number): boolean {
  const p = state.player;
  if (!p.alive || p.invulnTicks > 0 || state.mode !== 'playing') {
    return false;
  }

  p.hp = Math.max(0, p.hp - 1);
  p.invulnTicks = hasUpgrade(state, 7)
    ? WELL_CONSTANTS.CANDLE_INVI_TICKS
    : WELL_CONSTANTS.HIT_INVI_TICKS;

  state.runStats.damageTaken += 1;
  state.runStats.stageDamageTaken += 1;
  state.runStats.areaDamageTaken += 1;

  // Knockback bounce away from hazard
  const dx = p.x - sourceX;
  p.vx = (dx >= 0 ? 1 : -1) * 2.0;
  p.vy = -3.0;
  p.onGround = false;
  p.spinJump = false;

  // Impact slowdown (40/60 for 23 ticks) + screen shake
  state.impactSlowdownTicks = WELL_CONSTANTS.IMPACT_SLOWDOWN_TICKS;
  addShake(state, 4, 14);

  // Timeout upgrade (17): spawns time-slow void centered at player
  if (hasUpgrade(state, 17)) {
    p.timeoutVoid = {
      active: true,
      x: p.x,
      y: p.y,
      timer: WELL_CONSTANTS.TIMEOUT_VOID_TICKS,
      radius: WELL_CONSTANTS.TIMEOUT_VOID_RADIUS,
    };
  }

  emitEvent(state, { type: 'player_hurt', x: p.x, y: p.y, hpRemaining: p.hp });

  if (p.hp <= 0) {
    p.alive = false;
    p.animState = 'dead';
    state.mode = 'gameover';
    emitEvent(state, { type: 'player_die', x: p.x, y: p.y });
  }
  return true;
}

export function completeCombo(state: SimState): void {
  const count = state.combo;
  if (count <= 0) return;

  if (count > state.maxCombo) {
    state.maxCombo = count;
  }
  if (count >= 100) {
    state.runStats.combo100Hit = true;
  }

  let rewardTier: 0 | 1 | 2 | 3 = 0;
  let rewardText = '';

  if (count >= WELL_CONSTANTS.COMBO_TIER_3) {
    rewardTier = 3;
    state.gems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    state.runGems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    state.player.ammoMax += 1;
    state.player.ammo = state.player.ammoMax;
    healPlayer(state, 1);
    rewardText = '+100G +1CHG +1HP';
  } else if (count >= WELL_CONSTANTS.COMBO_TIER_2) {
    rewardTier = 2;
    state.gems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    state.runGems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    state.player.ammoMax += 1;
    state.player.ammo = state.player.ammoMax;
    rewardText = '+100G +1CHG';
  } else if (count >= WELL_CONSTANTS.COMBO_TIER_1) {
    rewardTier = 1;
    state.gems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    state.runGems += WELL_CONSTANTS.COMBO_GEM_REWARD;
    rewardText = '+100G';
  }

  if (count >= 2) {
    state.comboPopup = {
      count,
      rewardText,
      timer: 90,
    };
  }

  emitEvent(state, {
    type: 'combo_done',
    count,
    rewardTier,
    x: state.player.x,
    y: state.player.y,
  });

  state.combo = 0;
}
