import {
  WELL_CONSTANTS,
  type EnemyEntity,
  type EnemyKind,
  type SimState,
} from '../contracts/index.ts';
import { getEnemyDef } from '../data/enemies.ts';
import { getStyleDef } from '../data/styles.ts';
import { nextRandom, randInt, randRange } from './prng.ts';
import {
  addShake,
  allocId,
  damagePlayer,
  emitEvent,
  getTile,
  hasUpgrade,
  isSolidTile,
  isThinPlatform,
  rechargeGunboots,
  rowToY,
  xToCol,
  yToRow,
} from './simUtils.ts';
import { triggerExplosion } from './upgrades.ts';

function isSolidAtPoint(state: SimState, x: number, y: number): boolean {
  const tile = getTile(state.world, xToCol(x), yToRow(y));
  return isSolidTile(tile, state.world);
}

function isFloorAtPoint(state: SimState, x: number, y: number): boolean {
  const tile = getTile(state.world, xToCol(x), yToRow(y));
  return isSolidTile(tile, state.world) || isThinPlatform(tile);
}

function getTimeoutSlowMult(state: SimState, x: number, y: number): number {
  const tv = state.player.timeoutVoid;
  if (!tv.active) return 1.0;
  return Math.hypot(x - tv.x, y - tv.y) <= tv.radius ? 0.5 : 1.0;
}

function getTargetPos(state: SimState, ex: number, ey: number): { x: number; y: number } {
  const p = state.player;
  if (p.balloon.active && hasUpgrade(state, 15)) {
    const distBalloon = Math.hypot(ex - p.balloon.x, ey - p.balloon.y);
    const distPlayer = Math.hypot(ex - p.x, ey - p.y);
    if (distBalloon <= 96 || distBalloon < distPlayer) {
      return { x: p.balloon.x, y: p.balloon.y };
    }
  }
  return { x: p.x, y: p.y };
}

function spawnEnemyBullet(
  state: SimState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  kind: 'bone' | 'ink' | 'spore' | 'orb' | 'boss_orb',
  ttl = 180,
): void {
  if (state.enemyBullets.length >= 60) {
    return;
  }
  state.enemyBullets.push({
    id: allocId(state),
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    radius: kind === 'boss_orb' ? 4 : 3,
    ttl,
    kind,
    alive: true,
  });
}

function detectInitialWallDir(state: SimState, x: number, y: number, w: number, h: number): number {
  const hw = w * 0.5 + 3;
  const hh = h * 0.5 + 3;
  if (isSolidAtPoint(state, x, y + hh)) return 0; // floor
  if (isSolidAtPoint(state, x + hw, y)) return 1; // right wall
  if (isSolidAtPoint(state, x, y - hh)) return 2; // ceiling
  if (isSolidAtPoint(state, x - hw, y)) return 3; // left wall
  return 0;
}

export function spawnEnemy(state: SimState, kind: EnemyKind, x: number, y: number): EnemyEntity {
  const def = getEnemyDef(kind);
  const wallDir = def.behavior === 'crawl_wall' ? detectInitialWallDir(state, x, y, def.width, def.height) : 0;
  const enemy: EnemyEntity = {
    id: allocId(state),
    kind,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: 0,
    vy: 0,
    w: def.width,
    h: def.height,
    hp: def.hp,
    maxHp: def.hp,
    gems: def.gems,
    stompable: def.stompable,
    facing: nextRandom(state) < 0.5 ? -1 : 1,
    state: 0,
    timer: randInt(state, 0, 30),
    hitFlashTicks: 0,
    wallDir,
    anchorX: x,
    anchorY: y,
    alive: true,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function spawnGems(state: SimState, x: number, y: number, totalValue: number): void {
  let remaining = Math.floor(totalValue);
  if (remaining <= 0) return;

  state.runStats.stageGemsSpawned += remaining;
  const denominations = [10, 5, 2, 1] as const;

  while (remaining > 0) {
    let val = 1;
    for (const d of denominations) {
      if (remaining >= d) {
        val = d;
        break;
      }
    }
    remaining -= val;

    state.gemsEntities.push({
      id: allocId(state),
      x: x + randRange(state, -3, 3),
      y: y + randRange(state, -2, 2),
      vx: randRange(state, -1.6, 1.6),
      vy: -randRange(state, 1.2, 2.6),
      value: val,
      ttl: 480,
      alive: true,
    });
  }
}

export function damageEnemy(
  state: SimState,
  enemy: EnemyEntity,
  damage: number,
  stomped: boolean,
): boolean {
  if (!enemy.alive || damage <= 0) {
    return false;
  }

  enemy.hp -= damage;
  enemy.hitFlashTicks = 4;
  emitEvent(state, {
    type: 'enemy_hit',
    x: enemy.x,
    y: enemy.y,
    enemyKind: enemy.kind,
  });

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;

    state.runStats.kills += 1;
    state.runStats.stageKills += 1;

    if (!stomped && !state.player.onGround) {
      state.combo += 1;
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      if (state.combo >= 100) {
        state.runStats.combo100Hit = true;
      }
    }

    spawnGems(state, enemy.x, enemy.y, enemy.gems);

    state.corpses.push({
      id: allocId(state),
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      vx: randRange(state, -1.2, 1.2),
      vy: -randRange(state, 1.0, 2.0),
      onGround: false,
      ttl: 360,
      alive: true,
    });

    emitEvent(state, {
      type: 'enemy_kill',
      x: enemy.x,
      y: enemy.y,
      enemyKind: enemy.kind,
      stomped,
    });
    return true;
  }

  return false;
}

function moveEnemyWithWalls(state: SimState, e: EnemyEntity, dx: number, dy: number): { hitX: boolean; hitY: boolean } {
  const hw = e.w * 0.5;
  const hh = e.h * 0.5;
  let hitX = false;
  let hitY = false;

  const nextX = e.x + dx;
  const checkX = dx >= 0 ? nextX + hw : nextX - hw;
  if (
    isSolidAtPoint(state, checkX, e.y - hh + 2) ||
    isSolidAtPoint(state, checkX, e.y + hh - 2)
  ) {
    hitX = true;
  } else {
    e.x = nextX;
  }

  const nextY = e.y + dy;
  const checkY = dy >= 0 ? nextY + hh : nextY - hh;
  if (
    isSolidAtPoint(state, e.x - hw + 2, checkY) ||
    isSolidAtPoint(state, e.x + hw - 2, checkY)
  ) {
    hitY = true;
    if (dy > 0) {
      const row = yToRow(checkY);
      e.y = rowToY(row) - hh;
    } else if (dy < 0) {
      const row = yToRow(checkY);
      e.y = rowToY(row + 1) + hh;
    }
  } else if (
    dy > 0 &&
    (isThinPlatform(getTile(state.world, xToCol(e.x - hw + 2), yToRow(checkY))) ||
      isThinPlatform(getTile(state.world, xToCol(e.x + hw - 2), yToRow(checkY))))
  ) {
    const platRow = yToRow(checkY);
    const platTop = rowToY(platRow);
    if (e.y + hh <= platTop + 2) {
      hitY = true;
      e.y = platTop - hh;
    } else {
      e.y = nextY;
    }
  } else {
    e.y = nextY;
  }

  return { hitX, hitY };
}

function stepEnemyBehavior(state: SimState, e: EnemyEntity, slow: number): void {
  const def = getEnemyDef(e.kind);
  const target = getTargetPos(state, e.x, e.y);
  const dxToTarget = target.x - e.x;
  const dyToTarget = target.y - e.y;
  const distToTarget = Math.hypot(dxToTarget, dyToTarget);

  e.timer += 1;

  switch (def.behavior) {
    case 'fly_bat': {
      const speed = e.kind === 'bat' ? 1.15 : 1.4;
      if (e.state === 0) {
        if (Math.abs(dyToTarget) < 120 && distToTarget < 150) {
          e.state = 1;
        }
      }
      if (e.state === 1 && distToTarget > 1) {
        const desiredVx = (dxToTarget / distToTarget) * speed;
        const desiredVy = (dyToTarget / distToTarget) * speed;
        e.vx += (desiredVx - e.vx) * 0.1;
        e.vy += (desiredVy - e.vy) * 0.1;
        e.facing = e.vx >= 0 ? 1 : -1;
        const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitX) e.vx = -e.vx * 0.5;
        if (hitY) e.vy = -e.vy * 0.5;
      }
      break;
    }

    case 'patrol_floor': {
      const speed = e.kind === 'rat' || e.kind === 'mohawkmon' ? 1.05 : 0.7;
      e.vy = Math.min(e.vy + 0.18 * slow, 4.5);
      e.vx = e.facing * speed;
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitY) e.vy = 0;
      if (hitX) {
        e.facing = e.facing === 1 ? -1 : 1;
      } else if (hitY) {
        // Turn around at ledge edges so floor patrollers stay on platforms
        const aheadX = e.x + e.facing * (e.w * 0.5 + 3);
        const belowY = e.y + e.h * 0.5 + 3;
        if (!isFloorAtPoint(state, aheadX, belowY)) {
          e.facing = e.facing === 1 ? -1 : 1;
        }
      }
      break;
    }

    case 'hop_frog': {
      const hopInterval = e.kind === 'frog' ? 75 : 55;
      e.vy = Math.min(e.vy + 0.2 * slow, 5.0);
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitX) e.vx = -e.vx * 0.5;
      if (hitY && e.vy >= 0) {
        e.vy = 0;
        e.vx *= 0.6;
        if (e.timer % hopInterval === 0) {
          e.facing = dxToTarget >= 0 ? 1 : -1;
          e.vx = e.facing * 1.15;
          e.vy = e.kind === 'frog' ? -3.4 : -3.0;
        }
      }
      break;
    }

    case 'crawl_wall': {
      const speed = (e.kind === 'snail' ? 0.5 : 0.72) * slow;
      // Tangent vectors clockwise for wallDir 0=floor, 1=right wall, 2=ceiling, 3=left wall
      const txArr = [1, 0, -1, 0] as const;
      const tyArr = [0, -1, 0, 1] as const;
      // Normal into attached surface
      const nxArr = [0, 1, 0, -1] as const;
      const nyArr = [1, 0, -1, 0] as const;

      const wd = ((e.wallDir % 4) + 4) % 4;
      const tx = txArr[wd]! * e.facing;
      const ty = tyArr[wd]! * e.facing;
      const nx = nxArr[wd]!;
      const ny = nyArr[wd]!;
      const probeDist = Math.max(e.w, e.h) * 0.5 + 3;

      const hasAttachedWall = isSolidAtPoint(state, e.x + nx * probeDist, e.y + ny * probeDist);
      if (!hasAttachedWall) {
        // Check if corner wrapped; otherwise fall until attaching to a floor
        const backProbeX = e.x - tx * 5 + nx * probeDist;
        const backProbeY = e.y - ty * 5 + ny * probeDist;
        if (isSolidAtPoint(state, backProbeX, backProbeY)) {
          e.wallDir = (wd + (e.facing === 1 ? 3 : 1)) % 4;
          e.x += nx * speed * 2;
          e.y += ny * speed * 2;
        } else {
          e.vy = Math.min(e.vy + 0.18 * slow, 4.0);
          const { hitY } = moveEnemyWithWalls(state, e, 0, e.vy * slow);
          if (hitY) {
            e.vy = 0;
            e.wallDir = 0;
          }
        }
        break;
      }

      const aheadBlocked = isSolidAtPoint(
        state,
        e.x + tx * (probeDist - 1),
        e.y + ty * (probeDist - 1),
      );
      if (aheadBlocked) {
        // Climb onto perpendicular wall
        e.wallDir = (wd + (e.facing === 1 ? 1 : 3)) % 4;
      } else {
        e.x += tx * speed;
        e.y += ty * speed;
      }
      break;
    }

    case 'float_jelly': {
      e.vx = Math.cos(e.timer * 0.04) * 0.45;
      e.vy = Math.sin(e.timer * 0.06) * 0.55;
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitX) e.vx = -e.vx;
      if (hitY) e.vy = -e.vy;
      break;
    }

    case 'hover_hazard': {
      if (e.kind === 'wander_skull' || e.kind === 'angry_face') {
        if (distToTarget < 110 && distToTarget > 1) {
          e.vx += ((dxToTarget / distToTarget) * 0.65 - e.vx) * 0.06;
          e.vy += ((dyToTarget / distToTarget) * 0.65 - e.vy) * 0.06;
        } else {
          e.vx *= 0.95;
          e.vy = Math.sin(e.timer * 0.08) * 0.25;
        }
        const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitX) e.vx = -e.vx;
        if (hitY) e.vy = -e.vy;
      } else {
        // Stationary pulsing hazard (red_ball, unichan)
        e.vx = 0;
        e.vy = Math.sin(e.timer * 0.08) * 0.2;
        moveEnemyWithWalls(state, e, 0, e.vy * slow);
      }
      break;
    }

    case 'throw_skeleton': {
      e.vy = Math.min(e.vy + 0.18 * slow, 4.5);
      e.vx = e.facing * 0.6;
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitY) e.vy = 0;
      if (hitX) {
        e.facing = e.facing === 1 ? -1 : 1;
      } else if (hitY && !isFloorAtPoint(state, e.x + e.facing * (e.w * 0.5 + 3), e.y + e.h * 0.5 + 3)) {
        e.facing = e.facing === 1 ? -1 : 1;
      }
      if (e.timer % 100 === 0 && distToTarget < 130) {
        const throwDir = dxToTarget >= 0 ? 1 : -1;
        e.facing = throwDir;
        spawnEnemyBullet(state, e.x, e.y - 4, throwDir * 1.35, -2.2, 'bone', 150);
      }
      break;
    }

    case 'phase_ghost': {
      // Passes right through solid tiles while gently homing toward player/decoy
      const speed = e.kind === 'obake' ? 0.65 : 0.85;
      if (distToTarget < 160 && distToTarget > 1) {
        e.vx = (dxToTarget / distToTarget) * speed;
        e.vy = (dyToTarget / distToTarget) * speed;
        e.facing = e.vx >= 0 ? 1 : -1;
      } else {
        e.vx = Math.cos(e.timer * 0.04) * 0.35;
        e.vy = Math.sin(e.timer * 0.04) * 0.35;
      }
      e.x += e.vx * slow;
      e.y += e.vy * slow;
      break;
    }

    case 'gas_float': {
      if (e.kind === 'gas_ascend') {
        e.vx = Math.sin(e.timer * 0.05) * 0.3;
        e.vy = -0.55;
        const { hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitY) e.y = e.anchorY;
      } else if (e.kind === 'gas_descend') {
        e.vx = Math.sin(e.timer * 0.05) * 0.3;
        e.vy = 0.55;
        const { hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitY) e.y = e.anchorY;
      } else if (e.kind === 'gas_bounce') {
        if (e.vx === 0 && e.vy === 0) {
          e.vx = e.facing * 0.9;
          e.vy = 0.9;
        }
        const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitX) e.vx = -e.vx;
        if (hitY) e.vy = -e.vy;
      } else if (e.kind === 'gas_spin') {
        const angle = e.timer * 0.06 * slow;
        e.x = e.anchorX + Math.cos(angle) * 18;
        e.y = e.anchorY + Math.sin(angle) * 18;
      } else {
        e.vx = Math.cos(e.timer * 0.045) * 0.5;
        e.vy = Math.sin(e.timer * 0.035) * 0.4;
        moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      }
      break;
    }

    case 'swim_fish': {
      const speed = e.kind === 'red_fish' || e.kind === 'tadpole' ? 1.15 : 0.85;
      e.vx = e.facing * speed;
      e.vy = Math.sin(e.timer * 0.08) * 0.35;
      const { hitX } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitX) {
        e.facing = e.facing === 1 ? -1 : 1;
      }
      break;
    }

    case 'jet_squid': {
      if (e.timer % 80 === 0 && distToTarget < 160) {
        const dirX = dxToTarget >= 0 ? 1 : -1;
        e.facing = dirX;
        e.vx = dirX * 1.4;
        e.vy = -1.9;
        spawnEnemyBullet(state, e.x, e.y + 6, 0, 1.3, 'ink', 120);
      }
      e.vx *= 0.95;
      e.vy = e.vy * 0.95 + 0.04 * slow;
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitX) e.vx = -e.vx * 0.5;
      if (hitY) e.vy = -e.vy * 0.3;
      break;
    }

    case 'dodge_bot': {
      // Detects incoming player bullets from above and dashes sideways
      let threatened = false;
      for (const b of state.bullets) {
        if (!b.alive) continue;
        if (Math.abs(b.x - e.x) < 16 && b.y < e.y && e.y - b.y < 52) {
          threatened = true;
          e.facing = b.x <= e.x ? 1 : -1;
          e.vx = e.facing * 2.4;
          break;
        }
      }
      if (!threatened) {
        e.vx = e.vx * 0.88 + e.facing * 0.1;
      }
      e.vy = Math.sin(e.timer * 0.07) * 0.3;
      const { hitX } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitX) {
        e.facing = e.facing === 1 ? -1 : 1;
        e.vx = e.facing * 0.8;
      }
      break;
    }

    case 'ring_poofer': {
      e.vy = Math.sin(e.timer * 0.06) * 0.25;
      moveEnemyWithWalls(state, e, 0, e.vy * slow);
      if (e.timer % 110 === 0 && distToTarget < 140) {
        if (e.kind === 'upshoot') {
          spawnEnemyBullet(state, e.x, e.y - 6, 0, -2.2, 'orb', 140);
        } else {
          const spd = 1.35;
          spawnEnemyBullet(state, e.x, e.y, spd, 0, 'orb', 120);
          spawnEnemyBullet(state, e.x, e.y, -spd, 0, 'orb', 120);
          spawnEnemyBullet(state, e.x, e.y, 0, spd, 'orb', 120);
          spawnEnemyBullet(state, e.x, e.y, 0, -spd, 'orb', 120);
        }
      }
      break;
    }

    case 'spawner': {
      if (e.timer % 130 === 0 && distToTarget < 150 && distToTarget > 1) {
        const spd = 1.0;
        spawnEnemyBullet(
          state,
          e.x,
          e.y,
          (dxToTarget / distToTarget) * spd,
          (dyToTarget / distToTarget) * spd,
          'spore',
          180,
        );
      }
      break;
    }

    case 'lunger': {
      if (e.state === 0) {
        // Idle until player aligns horizontally or vertically within range
        e.vx *= 0.85;
        e.vy *= 0.85;
        if (distToTarget < 115 && (Math.abs(dyToTarget) < 22 || Math.abs(dxToTarget) < 18)) {
          e.state = 1;
          e.timer = 0;
          const spd = 2.6;
          if (Math.abs(dxToTarget) >= Math.abs(dyToTarget)) {
            e.vx = (dxToTarget >= 0 ? 1 : -1) * spd;
            e.vy = 0;
            e.facing = dxToTarget >= 0 ? 1 : -1;
          } else {
            e.vx = 0;
            e.vy = (dyToTarget >= 0 ? 1 : -1) * spd;
          }
        }
      } else if (e.state === 1) {
        const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
        if (hitX || hitY || e.timer >= 32) {
          e.state = 2;
          e.timer = 0;
          e.vx = 0;
          e.vy = 0;
        }
      } else {
        // Cooldown pause
        if (e.timer >= 45) {
          e.state = 0;
          e.timer = 0;
        }
      }
      break;
    }

    case 'turret_guntle': {
      e.vy = Math.min(e.vy + 0.18 * slow, 4.5);
      e.vx = e.facing * 0.45;
      const { hitX, hitY } = moveEnemyWithWalls(state, e, e.vx * slow, e.vy * slow);
      if (hitY) e.vy = 0;
      if (hitX) e.facing = e.facing === 1 ? -1 : 1;
      if (e.timer % 95 === 0 && distToTarget < 145 && distToTarget > 1) {
        const spd = 1.65;
        spawnEnemyBullet(
          state,
          e.x,
          e.y - 2,
          (dxToTarget / distToTarget) * spd,
          (dyToTarget / distToTarget) * spd,
          'orb',
          150,
        );
      }
      break;
    }
  }
}

export function updateEnemies(state: SimState): void {
  if (state.mode !== 'playing' || state.inSideRoom) {
    return;
  }

  const p = state.player;
  const style = getStyleDef(state.styleId);

  for (const e of state.enemies) {
    if (!e.alive) continue;

    e.prevX = e.x;
    e.prevY = e.y;
    if (e.hitFlashTicks > 0) {
      e.hitFlashTicks -= 1;
    }

    const slow = getTimeoutSlowMult(state, e.x, e.y);
    stepEnemyBehavior(state, e, slow);

    // Heart Balloon decoy intercept
    if (p.balloon.active && hasUpgrade(state, 15)) {
      if (Math.hypot(e.x - p.balloon.x, e.y - p.balloon.y) <= (e.w + 10) * 0.5) {
        p.balloon.active = false;
        p.balloon.hp = 0;
        e.vx = -e.vx;
        emitEvent(state, {
          type: 'floating_text',
          x: p.balloon.x,
          y: p.balloon.y,
          text: 'POP!',
          channel: 'M',
        });
      }
    }

    // Player <-> Enemy Stomp vs Hurt collision
    if (!p.alive || !e.alive) continue;

    const pLeft = p.x - WELL_CONSTANTS.PLAYER_HALF_W;
    const pRight = p.x + WELL_CONSTANTS.PLAYER_HALF_W;
    const pTop = p.y + WELL_CONSTANTS.PLAYER_TOP_OFFSET;
    const pBottom = p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;

    const eLeft = e.x - e.w * 0.5;
    const eRight = e.x + e.w * 0.5;
    const eTop = e.y - e.h * 0.5;
    const eBottom = e.y + e.h * 0.5;

    if (pRight > eLeft && pLeft < eRight && pBottom > eTop && pTop < eBottom) {
      const prevBottom = p.prevY + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
      const isStompApproach = p.vy >= 0 && (pBottom <= e.y + 2 || prevBottom <= e.y);

      if (isStompApproach && e.stompable) {
        state.combo += 1;
        if (state.combo > state.maxCombo) {
          state.maxCombo = state.combo;
        }
        if (state.combo >= 100) {
          state.runStats.combo100Hit = true;
        }
        state.runStats.stomps += 1;

        p.vy = -style.stompBounce;
        p.onGround = false;
        p.spinJump = false;
        rechargeGunboots(state);
        addShake(state, 2, 10);

        emitEvent(state, {
          type: 'stomp',
          x: e.x,
          y: e.y,
          combo: state.combo,
          enemyKind: e.kind,
        });

        damageEnemy(state, e, WELL_CONSTANTS.STOMP_DAMAGE, true);

        // Blast Module (upgrade 0): stomping enemies triggers an explosion
        if (hasUpgrade(state, 0)) {
          triggerExplosion(state, e.x, e.y, 32, 25);
        }
      } else {
        // Non-stompable enemy or side/below collision hurts player
        damagePlayer(state, e.x, e.y);
      }
    }
  }

  // Update enemy projectiles (also paused during side rooms)
  for (const eb of state.enemyBullets) {
    if (!eb.alive) continue;
    const slow = getTimeoutSlowMult(state, eb.x, eb.y);
    eb.prevX = eb.x;
    eb.prevY = eb.y;
    if (eb.kind === 'bone') {
      eb.vy += 0.12 * slow;
    }
    eb.x += eb.vx * slow;
    eb.y += eb.vy * slow;
    eb.ttl -= 1;

    if (eb.ttl <= 0) {
      eb.alive = false;
      continue;
    }

    if (isSolidAtPoint(state, eb.x, eb.y)) {
      eb.alive = false;
      continue;
    }

    // Heart Balloon decoy intercept
    if (p.balloon.active && hasUpgrade(state, 15)) {
      if (Math.hypot(eb.x - p.balloon.x, eb.y - p.balloon.y) <= eb.radius + 6) {
        p.balloon.active = false;
        p.balloon.hp = 0;
        eb.alive = false;
        emitEvent(state, {
          type: 'floating_text',
          x: p.balloon.x,
          y: p.balloon.y,
          text: 'POP!',
          channel: 'M',
        });
        continue;
      }
    }

    if (p.alive) {
      const pLeft = p.x - WELL_CONSTANTS.PLAYER_HALF_W;
      const pRight = p.x + WELL_CONSTANTS.PLAYER_HALF_W;
      const pTop = p.y + WELL_CONSTANTS.PLAYER_TOP_OFFSET;
      const pBottom = p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
      const cx = Math.max(pLeft, Math.min(eb.x, pRight));
      const cy = Math.max(pTop, Math.min(eb.y, pBottom));
      if (Math.hypot(eb.x - cx, eb.y - cy) <= eb.radius) {
        eb.alive = false;
        damagePlayer(state, eb.x, eb.y);
      }
    }
  }

  state.enemies = state.enemies.filter((e) => e.alive);
  state.enemyBullets = state.enemyBullets.filter((eb) => eb.alive);
}

export function updateGemsAndCorpses(state: SimState): void {
  if (state.mode !== 'playing') {
    return;
  }

  const p = state.player;

  // Gem Streak / Gem High timer ticks down ONLY outside side rooms
  if (!state.inSideRoom && state.gemStreakTimer > 0) {
    state.gemStreakTimer -= 1;
    if (state.gemStreakTimer <= 0) {
      state.gemStreakTimer = 0;
      state.gemStreak = 0;
      if (state.gemHigh) {
        state.gemHigh = false;
        p.gunLevel = 0;
        emitEvent(state, { type: 'gem_high_end' });
      }
    }
  }

  // Update gems & collection
  for (const g of state.gemsEntities) {
    if (!g.alive) continue;

    g.vy = Math.min(g.vy + 0.14, 3.2);
    g.vx *= 0.94;

    const nextX = g.x + g.vx;
    if (isSolidAtPoint(state, nextX, g.y)) {
      g.vx = -g.vx * 0.45;
    } else {
      g.x = nextX;
    }

    const nextY = g.y + g.vy;
    if (g.vy > 0 && isFloorAtPoint(state, g.x, nextY + 3)) {
      const row = yToRow(nextY + 3);
      g.y = rowToY(row) - 3;
      g.vy = Math.abs(g.vy) > 0.7 ? -g.vy * 0.35 : 0;
      g.vx *= 0.7;
    } else if (g.vy < 0 && isSolidAtPoint(state, g.x, nextY - 3)) {
      g.vy = 0;
    } else {
      g.y = nextY;
    }

    // Check player pickup
    if (
      p.alive &&
      Math.abs(g.x - p.x) <= 10 &&
      Math.abs(g.y - (p.y + 2)) <= 12
    ) {
      g.alive = false;
      state.gems += g.value;
      state.runGems += g.value;
      state.runStats.stageGemsCollected += g.value;
      state.gemStreak += g.value;
      state.gemStreakTimer =
        WELL_CONSTANTS.GEM_STREAK_TIMER +
        (hasUpgrade(state, 20) ? WELL_CONSTANTS.GEM_SICK_BONUS_TIMER : 0);

      emitEvent(state, {
        type: 'gem_pickup',
        x: g.x,
        y: g.y,
        value: g.value,
        streak: state.gemStreak,
      });

      if (!state.gemHigh && state.gemStreak >= WELL_CONSTANTS.GEM_HIGH_THRESHOLD) {
        state.gemHigh = true;
        p.gunLevel = 1;
        emitEvent(state, { type: 'gem_high_start', x: p.x, y: p.y });
        emitEvent(state, {
          type: 'floating_text',
          x: p.x,
          y: p.y - 12,
          text: 'GEM HIGH!',
          channel: 'M',
        });
      }

      // Gem Powered (upgrade 4): restores round(value / 2) ammo
      if (hasUpgrade(state, 4)) {
        const ammoRestore = Math.round(g.value / 2);
        if (ammoRestore > 0 && p.ammo < p.ammoMax) {
          p.ammo = Math.min(p.ammoMax, p.ammo + ammoRestore);
          p.meterJiggleTicks = 6;
        }
      }

      // Popping Gems (upgrade 16): fires an upward bullet
      if (hasUpgrade(state, 16)) {
        state.bullets.push({
          id: allocId(state),
          x: g.x,
          y: g.y,
          prevX: g.x,
          prevY: g.y,
          vx: 0,
          vy: -7,
          damage: 8,
          radius: 3,
          remainingRange: 96,
          piercing: false,
          isLaser: false,
          laserEndY: g.y,
          weaponId: p.weaponId,
          fromDrone: false,
          alive: true,
        });
      }
      continue;
    }

    g.ttl -= 1;
    if (g.ttl <= 0) {
      g.alive = false;
    }
  }

  // Update enemy corpses
  for (const c of state.corpses) {
    if (!c.alive) continue;

    if (!c.onGround) {
      c.vy = Math.min(c.vy + 0.2, 4.5);
      c.vx *= 0.92;
      const nextX = c.x + c.vx;
      if (isSolidAtPoint(state, nextX, c.y)) {
        c.vx = -c.vx * 0.4;
      } else {
        c.x = nextX;
      }

      const nextY = c.y + c.vy;
      if (c.vy > 0 && isFloorAtPoint(state, c.x, nextY + 5)) {
        const row = yToRow(nextY + 5);
        c.y = rowToY(row) - 5;
        c.vx = 0;
        c.vy = 0;
        c.onGround = true;
      } else {
        c.y = nextY;
      }
    } else if (!isFloorAtPoint(state, c.x, c.y + 6)) {
      c.onGround = false;
    }

    c.ttl -= 1;
    if (c.ttl <= 0) {
      c.alive = false;
    }
  }

  state.gemsEntities = state.gemsEntities.filter((g) => g.alive);
  state.corpses = state.corpses.filter((c) => c.alive);
}
