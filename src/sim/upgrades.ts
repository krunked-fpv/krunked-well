import {
  ALL_UPGRADE_IDS,
  TILE_KIND,
  WELL_CONSTANTS,
  type InputFrame,
  type SimState,
  type UpgradeId,
} from '../contracts/index.ts';
import { getStyleDef } from '../data/styles.ts';
import { randInt } from './prng.ts';
import {
  addShake,
  allocId,
  colToX,
  emitEvent,
  getTile,
  hasUpgrade,
  healPlayer,
  isBreakableTile,
  rowToY,
  setTile,
  xToCol,
  yToRow,
} from './simUtils.ts';
import { damageEnemy } from './enemies.ts';
import { damageBoss } from './boss.ts';

interface CursorRepeatState {
  prevDir: -1 | 0 | 1;
  holdTicks: number;
}

const cursorStates = new WeakMap<SimState, CursorRepeatState>();

function getCursorRepeatState(state: SimState): CursorRepeatState {
  let entry = cursorStates.get(state);
  if (!entry) {
    entry = { prevDir: 0, holdTicks: 0 };
    cursorStates.set(state, entry);
  }
  return entry;
}

export function rollUpgradeChoices(state: SimState): UpgradeId[] {
  const style = getStyleDef(state.styleId);
  if (style.upgradeChoices <= 0) {
    return [];
  }

  const count = style.upgradeChoices + (hasUpgrade(state, 6) ? 1 : 0);
  const pool: UpgradeId[] = [];
  for (const id of ALL_UPGRADE_IDS) {
    if (!state.upgrades.includes(id)) {
      pool.push(id);
    }
  }

  // Deterministic Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(state, 0, i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  return pool.slice(0, Math.min(count, pool.length));
}

export function applyUpgrade(state: SimState, id: UpgradeId): void {
  if (!state.upgrades.includes(id)) {
    state.upgrades.push(id);
  }
  state.runStats.upgradesTaken += 1;
  state.runStats.noUpgradeRun = false;

  const p = state.player;
  switch (id) {
    case 6: {
      // Youth: +1 upgrade choice and +1 HP
      healPlayer(state, 1);
      break;
    }
    case 9: {
      // Drone: activates orbiting shot-mirroring drone
      p.drone = {
        active: true,
        x: p.x + 16,
        y: p.y - 6,
        orbitAngle: 0,
      };
      break;
    }
    case 13: {
      // Apple: +4 HP / heart pieces via healPlayer
      healPlayer(state, 4);
      break;
    }
    case 15: {
      // Heart Balloon: slows fall speed & acts as decoy
      p.balloon = {
        active: true,
        x: p.x,
        y: p.y - 16,
        hp: 1,
      };
      break;
    }
    case 20: {
      // Gem Sick: longer Gem High timer
      if (state.gemStreakTimer > 0) {
        state.gemStreakTimer += WELL_CONSTANTS.GEM_SICK_BONUS_TIMER;
      }
      break;
    }
    case 22: {
      // Safety Jetpack: fills jetpack hover reserve
      p.jetpackTicks = WELL_CONSTANTS.JETPACK_MAX_TICKS;
      p.jetpackActive = false;
      break;
    }
    default:
      break;
  }

  emitEvent(state, { type: 'upgrade_pick', upgradeId: id });
}

export function handleUpgradeSelectInput(state: SimState, input: InputFrame): boolean {
  if (state.mode !== 'upgrade_select') {
    return false;
  }

  const count = state.upgradeChoices.length;
  if (count <= 0) {
    state.upgradeCursor = 0;
    state.mode = 'playing';
    return true;
  }

  const repeat = getCursorRepeatState(state);
  let dir: -1 | 0 | 1 = 0;
  if (input.left || input.up) {
    dir = -1;
  } else if (input.right || input.down) {
    dir = 1;
  }

  if (dir === 0) {
    repeat.prevDir = 0;
    repeat.holdTicks = 0;
  } else if (dir !== repeat.prevDir) {
    state.upgradeCursor = ((state.upgradeCursor + dir) % count + count) % count;
    repeat.prevDir = dir;
    repeat.holdTicks = 0;
  } else {
    repeat.holdTicks += 1;
    if (repeat.holdTicks >= 14 && (repeat.holdTicks - 14) % 8 === 0) {
      state.upgradeCursor = ((state.upgradeCursor + dir) % count + count) % count;
    }
  }

  if (input.actionPressed) {
    const safeIdx = ((state.upgradeCursor % count) + count) % count;
    const chosen = state.upgradeChoices[safeIdx];
    if (chosen !== undefined) {
      applyUpgrade(state, chosen);
    }
    state.upgradeChoices = [];
    state.upgradeCursor = 0;
    repeat.prevDir = 0;
    repeat.holdTicks = 0;
    state.mode = 'playing';
    return true;
  }

  return false;
}

export function breakTileAt(state: SimState, col: number, row: number): boolean {
  const tile = getTile(state.world, col, row);
  if (!isBreakableTile(tile)) {
    return false;
  }

  setTile(state.world, col, row, TILE_KIND.EMPTY);
  state.runStats.blocksBroken += 1;

  const cx = colToX(col) + WELL_CONSTANTS.TILE_SIZE * 0.5;
  const cy = rowToY(row) + WELL_CONSTANTS.TILE_SIZE * 0.5;
  emitEvent(state, { type: 'block_break', x: cx, y: cy, tileKind: tile });

  if (tile === TILE_KIND.BUBBLE_BLOCK) {
    // Bubble block spawns an air bubble pickup and gives immediate partial oxygen relief underwater
    state.pickups.push({
      id: allocId(state),
      kind: 'air_bubble',
      x: cx,
      y: cy,
      alive: true,
    });
    if (state.player.inWater && state.player.oxygen < WELL_CONSTANTS.OXYGEN_MAX) {
      state.player.oxygen = Math.min(WELL_CONSTANTS.OXYGEN_MAX, state.player.oxygen + 25);
      emitEvent(state, { type: 'oxygen_restore', x: cx, y: cy, oxygen: state.player.oxygen });
    }
  }

  // Gunpowder Blocks (upgrade 5): breaking blocks fires 3 upward bullets
  if (hasUpgrade(state, 5)) {
    const anglesDeg = [-110, -90, -70];
    const speed = 6;
    for (const deg of anglesDeg) {
      const rad = (deg * Math.PI) / 180;
      state.bullets.push({
        id: allocId(state),
        x: cx,
        y: cy,
        prevX: cx,
        prevY: cy,
        vx: Math.cos(rad) * speed,
        vy: Math.sin(rad) * speed,
        damage: 8,
        radius: 3,
        remainingRange: 80,
        piercing: false,
        isLaser: false,
        laserEndY: cy,
        weaponId: state.player.weaponId,
        fromDrone: false,
        alive: true,
      });
    }
  }

  return true;
}

export function triggerExplosion(
  state: SimState,
  x: number,
  y: number,
  radius: number,
  damage: number,
): void {
  emitEvent(state, { type: 'explosion', x, y, radius });
  addShake(state, 3, 12);

  // Damage enemies in blast radius
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const clampedX = Math.max(enemy.x - enemy.w * 0.5, Math.min(x, enemy.x + enemy.w * 0.5));
    const clampedY = Math.max(enemy.y - enemy.h * 0.5, Math.min(y, enemy.y + enemy.h * 0.5));
    const dist = Math.hypot(x - clampedX, y - clampedY);
    if (dist <= radius) {
      damageEnemy(state, enemy, damage, false);
    }
  }

  // Damage boss if vulnerable and within blast radius
  const boss = state.boss;
  if (boss && boss.active && !boss.defeated && !boss.bulletImmune) {
    const bx = Math.max(
      boss.x - WELL_CONSTANTS.BOSS_EYE_W * 0.5,
      Math.min(x, boss.x + WELL_CONSTANTS.BOSS_EYE_W * 0.5),
    );
    const by = Math.max(
      boss.y - WELL_CONSTANTS.BOSS_EYE_H * 0.5,
      Math.min(y, boss.y + WELL_CONSTANTS.BOSS_EYE_H * 0.5),
    );
    if (Math.hypot(x - bx, y - by) <= radius) {
      damageBoss(state, damage, x, y);
    }
  }

  // Break breakable/bubble blocks within blast radius
  const minCol = xToCol(x - radius);
  const maxCol = xToCol(x + radius);
  const minRow = yToRow(y - radius);
  const maxRow = yToRow(y + radius);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const tile = getTile(state.world, col, row);
      if (!isBreakableTile(tile)) continue;
      const tcx = colToX(col) + WELL_CONSTANTS.TILE_SIZE * 0.5;
      const tcy = rowToY(row) + WELL_CONSTANTS.TILE_SIZE * 0.5;
      if (Math.hypot(tcx - x, tcy - y) <= radius + WELL_CONSTANTS.TILE_SIZE * 0.5) {
        breakTileAt(state, col, row);
      }
    }
  }
}

export function triggerRocketJumpBlast(state: SimState, x: number, y: number): void {
  triggerExplosion(state, x, y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET + 4, 22, 15);
}

export function updateUpgradesTick(state: SimState): void {
  if (state.mode !== 'playing' || !state.player.alive) {
    return;
  }

  const p = state.player;

  // 1. Drone (upgrade 9): smooth orbit around player
  if (hasUpgrade(state, 9)) {
    if (!p.drone.active) {
      p.drone.active = true;
      p.drone.x = p.x + 16;
      p.drone.y = p.y - 6;
    }
    p.drone.orbitAngle = (p.drone.orbitAngle + 0.08) % (Math.PI * 2);
    const targetX = p.x + Math.cos(p.drone.orbitAngle) * 18;
    const targetY = p.y - 6 + Math.sin(p.drone.orbitAngle) * 10;
    if (p.drone.x === 0 && p.drone.y === 0) {
      p.drone.x = targetX;
      p.drone.y = targetY;
    } else {
      p.drone.x += (targetX - p.drone.x) * 0.2;
      p.drone.y += (targetY - p.drone.y) * 0.2;
    }
  }

  // 2. Heart Balloon (upgrade 15): bob/follow above player while active
  if (hasUpgrade(state, 15) && p.balloon.active) {
    const targetX = p.x - p.facing * 10;
    const targetY = p.y - 16 + Math.sin(state.tick * 0.1) * 3;
    if (p.balloon.x === 0 && p.balloon.y === 0) {
      p.balloon.x = targetX;
      p.balloon.y = targetY;
    } else {
      p.balloon.x += (targetX - p.balloon.x) * 0.15;
      p.balloon.y += (targetY - p.balloon.y) * 0.15;
    }
  }

  // 3. Gem Attractor (upgrade 10): pull gems within 56px toward player
  if (hasUpgrade(state, 10)) {
    const pullRadius = 56;
    for (const gem of state.gemsEntities) {
      if (!gem.alive) continue;
      const dx = p.x - gem.x;
      const dy = p.y - gem.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001 && dist <= pullRadius) {
        const nx = dx / dist;
        const ny = dy / dist;
        gem.vx = gem.vx * 0.78 + nx * 1.1;
        gem.vy = gem.vy * 0.78 + ny * 1.1;
      }
    }
  }

  // 4. Timeout Void (upgrade 17): decay active time-slow bubble
  if (p.timeoutVoid.active) {
    p.timeoutVoid.timer -= 1;
    if (p.timeoutVoid.timer <= 0) {
      p.timeoutVoid.timer = 0;
      p.timeoutVoid.active = false;
    }
  }

  // 5. Knife & Fork (upgrade 11): consume touched corpses -> every 10 corpses heal 1 HP + "OMNOMNOM"
  if (hasUpgrade(state, 11)) {
    const pLeft = p.x - WELL_CONSTANTS.PLAYER_HALF_W - 3;
    const pRight = p.x + WELL_CONSTANTS.PLAYER_HALF_W + 3;
    const pTop = p.y + WELL_CONSTANTS.PLAYER_TOP_OFFSET - 2;
    const pBottom = p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET + 3;

    for (const corpse of state.corpses) {
      if (!corpse.alive) continue;
      if (
        corpse.x + 6 >= pLeft &&
        corpse.x - 6 <= pRight &&
        corpse.y + 6 >= pTop &&
        corpse.y - 6 <= pBottom
      ) {
        corpse.alive = false;
        p.corpseCount += 1;
        let healed = false;
        if (p.corpseCount >= WELL_CONSTANTS.KNIFE_FORK_CORPSES_PER_HP) {
          p.corpseCount -= WELL_CONSTANTS.KNIFE_FORK_CORPSES_PER_HP;
          healPlayer(state, 1);
          healed = true;
          emitEvent(state, {
            type: 'floating_text',
            x: p.x,
            y: p.y - 12,
            text: 'OMNOMNOM',
            channel: 'L',
          });
        }
        emitEvent(state, {
          type: 'corpse_eat',
          x: corpse.x,
          y: corpse.y,
          healed,
        });
      }
    }
  }

  // 6. Rocket Jump (upgrade 18): trigger downward blast whenever a rocket jump event fired this tick
  if (hasUpgrade(state, 18)) {
    const currentEventCount = state.events.length;
    for (let i = 0; i < currentEventCount; i++) {
      const ev = state.events[i]!;
      if (ev.type === 'jump' && ev.rocket) {
        triggerRocketJumpBlast(state, ev.x, ev.y);
      }
    }
  }
}
