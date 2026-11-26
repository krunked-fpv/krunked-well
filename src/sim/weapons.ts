import {
  WELL_CONSTANTS,
  type InputFrame,
  type SimState,
  type WeaponDef,
  type WeaponLevelStats,
} from '../contracts/index.ts';
import { getWeaponDef } from '../data/weapons.ts';
import { randRange } from './prng.ts';
import {
  addShake,
  allocId,
  emitEvent,
  getTile,
  hasUpgrade,
  isBreakableTile,
  isSolidTile,
  rowToY,
  xToCol,
  yToRow,
} from './simUtils.ts';
import { damageEnemy } from './enemies.ts';
import { damageBoss } from './boss.ts';
import { breakTileAt, triggerExplosion } from './upgrades.ts';
import { rerollGunModule } from './shop.ts';

function spawnBullet(
  state: SimState,
  x: number,
  y: number,
  angleDeg: number,
  speed: number,
  damage: number,
  rangePx: number,
  weaponId: WeaponDef['id'],
  fromDrone: boolean,
  radius = 3,
): void {
  const rad = (angleDeg * Math.PI) / 180;
  state.bullets.push({
    id: allocId(state),
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(rad) * speed,
    vy: Math.sin(rad) * speed,
    damage,
    radius,
    remainingRange: rangePx,
    piercing: false,
    isLaser: false,
    laserEndY: y,
    weaponId,
    fromDrone,
    alive: true,
  });
}

function fireLaserBeam(
  state: SimState,
  originX: number,
  originY: number,
  stats: WeaponLevelStats,
  rangePx: number,
  fromDrone: boolean,
): void {
  const maxY = originY + rangePx;
  const col = xToCol(originX);
  const startRow = yToRow(originY);
  const maxRow = yToRow(maxY);

  let endY = maxY;
  for (let row = startRow; row <= maxRow; row++) {
    const tile = getTile(state.world, col, row);
    if (isBreakableTile(tile)) {
      breakTileAt(state, col, row);
      continue;
    }
    if (isSolidTile(tile, state.world)) {
      endY = Math.max(originY, rowToY(row));
      break;
    }
  }

  const beamHalfW = state.player.gunLevel === 1 ? 7 : 5;

  // Hit ALL enemies along the vertical beam
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const eTop = enemy.y - enemy.h * 0.5;
    const eBottom = enemy.y + enemy.h * 0.5;
    if (
      Math.abs(enemy.x - originX) <= enemy.w * 0.5 + beamHalfW &&
      eBottom >= originY &&
      eTop <= endY
    ) {
      damageEnemy(state, enemy, stats.damage, false);
    }
  }

  // Hit Boss if active & vulnerable
  const boss = state.boss;
  if (boss && boss.active && !boss.defeated && !boss.bulletImmune) {
    const eyeHalfW = WELL_CONSTANTS.BOSS_EYE_W * 0.5;
    const eyeHalfH = WELL_CONSTANTS.BOSS_EYE_H * 0.5;
    if (
      Math.abs(boss.x - originX) <= eyeHalfW + beamHalfW &&
      boss.y + eyeHalfH >= originY &&
      boss.y - eyeHalfH <= endY
    ) {
      damageBoss(state, stats.damage, originX, Math.min(endY, boss.y));
    }
  }

  // Reverse Engineering (upgrade 1): laser hits gun modules to reroll once
  if (hasUpgrade(state, 1)) {
    for (const pk of state.pickups) {
      if (!pk.alive || pk.kind !== 'gun_module' || pk.rerolled) continue;
      if (
        Math.abs(pk.x - originX) <= 10 + beamHalfW &&
        pk.y + 10 >= originY &&
        pk.y - 10 <= endY
      ) {
        rerollGunModule(state, pk);
      }
    }
  }

  // Rest In Pieces (upgrade 3): laser detonates corpses
  if (hasUpgrade(state, 3)) {
    for (const corpse of state.corpses) {
      if (!corpse.alive) continue;
      if (
        Math.abs(corpse.x - originX) <= 8 + beamHalfW &&
        corpse.y + 8 >= originY &&
        corpse.y - 8 <= endY
      ) {
        corpse.alive = false;
        triggerExplosion(state, corpse.x, corpse.y, 28, 25);
      }
    }
  }

  // Spawn visual beam bullet lasting 6 ticks for rendering/inspection
  state.bullets.push({
    id: allocId(state),
    x: originX,
    y: originY,
    prevX: originX,
    prevY: originY,
    vx: 0,
    vy: 0,
    damage: stats.damage,
    radius: beamHalfW,
    remainingRange: 6,
    piercing: true,
    isLaser: true,
    laserEndY: endY,
    weaponId: 2,
    fromDrone,
    alive: true,
  });
}

function fireWeaponFromOrigin(
  state: SimState,
  weapon: WeaponDef,
  stats: WeaponLevelStats,
  input: InputFrame,
  originX: number,
  originY: number,
  fromDrone: boolean,
): void {
  const hasLaserSight = hasUpgrade(state, 12);
  const rangePx = hasLaserSight ? Math.round(stats.rangePx * 1.5) : stats.rangePx;
  const spreadDeg = hasLaserSight ? stats.spreadDeg * 0.5 : stats.spreadDeg;
  const jitter = () => (spreadDeg > 0 ? randRange(state, -spreadDeg, spreadDeg) : 0);

  switch (stats.spType) {
    case 4: {
      // Weapon 2: Laser hitscan beam
      fireLaserBeam(state, originX, originY, stats, rangePx, fromDrone);
      break;
    }

    case 1: {
      // Weapon 3: Triple 3-way fan (-14, 0, +14 deg from straight down = 90 deg)
      const fanAngles = [-14, 0, 14] as const;
      for (const delta of fanAngles) {
        spawnBullet(
          state,
          originX,
          originY,
          90 + delta + jitter(),
          stats.speed,
          stats.damage,
          rangePx,
          weapon.id,
          fromDrone,
        );
      }
      break;
    }

    case 2: {
      // Weapon 4: Puncher 3 parallel columns (x - off, x, x + off)
      const offset = stats.parallelOffsetPx ?? (state.player.gunLevel === 1 ? 6 : 5);
      const offsets = [-offset, 0, offset] as const;
      for (const ox of offsets) {
        spawnBullet(
          state,
          originX + ox,
          originY,
          90 + jitter(),
          stats.speed,
          stats.damage,
          rangePx,
          weapon.id,
          fromDrone,
        );
      }
      break;
    }

    case 3: {
      // Weapon 5: Burst single round (follow-ups queued by caller for player shot)
      spawnBullet(
        state,
        originX,
        originY,
        90 + jitter(),
        stats.speed,
        stats.damage,
        rangePx,
        weapon.id,
        fromDrone,
      );
      break;
    }

    case 5: {
      // Weapon 6: Noppy tilts +/- 25 deg opposite horizontal input
      const tilt = stats.tiltDeg ?? 25;
      let tiltOffset = 0;
      if (input.right && !input.left) {
        // Moving right -> shoot tilted left (angle > 90 deg => cos < 0)
        tiltOffset = tilt;
      } else if (input.left && !input.right) {
        // Moving left -> shoot tilted right (angle < 90 deg => cos > 0)
        tiltOffset = -tilt;
      }
      spawnBullet(
        state,
        originX,
        originY,
        90 + tiltOffset + jitter(),
        stats.speed,
        stats.damage,
        rangePx,
        weapon.id,
        fromDrone,
      );
      break;
    }

    case 0:
    default: {
      if (weapon.id === 0) {
        // Weapon 0: Machinegun alternates bootSide +/-3px unless Laser Sight centers it
        let muzzleX = originX;
        if (!fromDrone) {
          state.player.bootSide = state.player.bootSide === 1 ? -1 : 1;
          if (!hasLaserSight) {
            muzzleX = originX + state.player.bootSide * 3;
          }
        }
        spawnBullet(
          state,
          muzzleX,
          originY,
          90 + jitter(),
          stats.speed,
          stats.damage,
          rangePx,
          weapon.id,
          fromDrone,
        );
      } else {
        // Weapon 1: Shotgun instant pellet blast (7 normal / 15 gemHigh)
        for (let i = 0; i < stats.pelletCount; i++) {
          const speedJitter = stats.speed * randRange(state, 0.9, 1.08);
          spawnBullet(
            state,
            originX + randRange(state, -2, 2),
            originY,
            90 + jitter(),
            speedJitter,
            stats.damage,
            rangePx,
            weapon.id,
            fromDrone,
            2.5,
          );
        }
      }
      break;
    }
  }
}

function ejectShellCasing(state: SimState): void {
  const p = state.player;
  const side = p.weaponId === 0 ? -p.bootSide : -p.facing;
  state.casings.push({
    id: allocId(state),
    x: p.x + side * 3,
    y: p.y + 4,
    vx: side * randRange(state, 1.0, 2.2),
    vy: -randRange(state, 1.2, 2.4),
    hot: hasUpgrade(state, 8),
    ttl: 90,
    alive: true,
  });
}

function executeShot(
  state: SimState,
  weapon: WeaponDef,
  stats: WeaponLevelStats,
  input: InputFrame,
): void {
  const p = state.player;

  // Exact Velocity-Clamp Recoil (NEVER additive!)
  if (p.vy > stats.recoil) {
    p.vy = stats.recoil;
  }

  const originX = p.x;
  const originY = p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;

  p.muzzleFlashTicks = 3;
  p.animState = 'shoot';
  state.runStats.shotsFired += 1;
  state.runStats.stageShotsFired += 1;

  if (weapon.id === 1 || weapon.id === 2) {
    addShake(state, 2, 6);
  } else {
    addShake(state, 1, 3);
  }

  emitEvent(state, {
    type: 'shoot',
    weaponId: weapon.id,
    x: originX,
    y: originY,
    gemHigh: p.gunLevel === 1,
  });

  fireWeaponFromOrigin(state, weapon, stats, input, originX, originY, false);

  // Drone (upgrade 9): mirrors each shot from drone position
  if (hasUpgrade(state, 9) && p.drone.active) {
    fireWeaponFromOrigin(state, weapon, stats, input, p.drone.x, p.drone.y, true);
  }

  ejectShellCasing(state);
}

export function updateWeapons(state: SimState, input: InputFrame): void {
  if (state.mode !== 'playing' || !state.player.alive) {
    return;
  }

  const p = state.player;
  if (p.fireCooldown > 0) {
    p.fireCooldown -= 1;
  }
  if (p.muzzleFlashTicks > 0) {
    p.muzzleFlashTicks -= 1;
  }
  if (p.meterJiggleTicks > 0) {
    p.meterJiggleTicks -= 1;
  }

  p.jetpackActive = false;

  if (!input.action || input.actionReleased) {
    p.semiAutoLatch = false;
    p.jumpShootLock = false;
  }

  // Gunboots fire ONLY while airborne
  if (p.onGround) {
    p.burstRemaining = 0;
    p.burstTimer = 0;
    return;
  }

  const weapon = getWeaponDef(p.weaponId);
  const stats = p.gunLevel === 1 ? weapon.gemHigh : weapon.normal;

  // Handle queued Burst follow-up rounds (Weapon 5)
  if (p.burstRemaining > 0) {
    p.burstTimer -= 1;
    if (p.burstTimer <= 0) {
      executeShot(state, weapon, stats, input);
      p.burstRemaining -= 1;
      if (p.burstRemaining > 0) {
        p.burstTimer = stats.burstRate ?? 5;
      }
    }
  }

  if (p.jumpShootLock) {
    return;
  }

  const isSemiAuto = stats.rof < 0;
  const cooldownTicks = Math.abs(stats.rof);

  // Check Safety Jetpack hover when empty and holding Action
  const outOfAmmo = p.ammo < weapon.cost || p.ammo <= 0;
  if (outOfAmmo && input.action && hasUpgrade(state, 22) && p.jetpackTicks > 0) {
    p.vy = Math.min(p.vy, -0.4);
    p.jetpackTicks -= 1;
    p.jetpackActive = true;
    p.animState = 'jetpack';
    emitEvent(state, {
      type: 'jetpack_tick',
      x: p.x,
      y: p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET,
    });
    return;
  }

  const wantsToFire = isSemiAuto
    ? (input.actionPressed || (input.action && !p.semiAutoLatch)) && p.fireCooldown <= 0
    : input.action && p.fireCooldown <= 0;

  if (!wantsToFire) {
    return;
  }

  if (outOfAmmo) {
    // Dry-Fire Empty: soft brake clamp to EMPTY_FIRE_CLAMP (3.0)
    if (p.vy > WELL_CONSTANTS.EMPTY_FIRE_CLAMP) {
      p.vy = WELL_CONSTANTS.EMPTY_FIRE_CLAMP;
    }
    p.fireCooldown = 10;
    if (isSemiAuto) {
      p.semiAutoLatch = true;
    }
    p.meterJiggleTicks = 6;
    emitEvent(state, {
      type: 'empty_click',
      x: p.x,
      y: p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET,
    });
    emitEvent(state, {
      type: 'floating_text',
      x: p.x,
      y: p.y - 10,
      text: 'EMPTY!',
      channel: 'L',
    });
    return;
  }

  // Consume ammo and fire!
  p.ammo = Math.max(0, p.ammo - weapon.cost);
  p.fireCooldown = cooldownTicks;
  if (isSemiAuto) {
    p.semiAutoLatch = true;
  }

  executeShot(state, weapon, stats, input);

  // Queue Burst follow-ups (Weapon 5)
  if (stats.spType === 3 && (stats.burstAmount ?? 0) > 0) {
    p.burstRemaining = stats.burstAmount ?? 2;
    p.burstTimer = stats.burstRate ?? 5;
  }
}

export function updateBulletsAndCasings(state: SimState): void {
  if (state.mode !== 'playing') {
    return;
  }

  // 1. Update player bullets
  for (const b of state.bullets) {
    if (!b.alive) continue;

    if (b.isLaser) {
      b.remainingRange -= 1;
      if (b.remainingRange <= 0) {
        b.alive = false;
      }
      continue;
    }

    b.prevX = b.x;
    b.prevY = b.y;

    const totalDist = Math.hypot(b.vx, b.vy);
    const steps = Math.max(1, Math.ceil(totalDist / 4));
    const stepX = b.vx / steps;
    const stepY = b.vy / steps;
    const stepDist = totalDist / steps;

    for (let s = 0; s < steps && b.alive; s++) {
      b.x += stepX;
      b.y += stepY;
      b.remainingRange -= stepDist;

      if (b.remainingRange <= 0) {
        b.alive = false;
        break;
      }

      // World tiles (breakable / bubble / solid)
      const col = xToCol(b.x);
      const row = yToRow(b.y);
      const tile = getTile(state.world, col, row);
      if (isBreakableTile(tile)) {
        breakTileAt(state, col, row);
        if (!b.piercing) {
          b.alive = false;
          break;
        }
      } else if (isSolidTile(tile, state.world)) {
        b.alive = false;
        break;
      }

      // Enemies
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (
          Math.abs(b.x - e.x) <= e.w * 0.5 + b.radius &&
          Math.abs(b.y - e.y) <= e.h * 0.5 + b.radius
        ) {
          damageEnemy(state, e, b.damage, false);
          if (!b.piercing) {
            b.alive = false;
            break;
          }
        }
      }
      if (!b.alive) break;

      // Boss (respecting boss.bulletImmune)
      const boss = state.boss;
      if (boss && boss.active && !boss.defeated) {
        const eyeHalfW = WELL_CONSTANTS.BOSS_EYE_W * 0.5;
        const eyeHalfH = WELL_CONSTANTS.BOSS_EYE_H * 0.5;
        if (
          Math.abs(b.x - boss.x) <= eyeHalfW + b.radius &&
          Math.abs(b.y - boss.y) <= eyeHalfH + b.radius
        ) {
          if (!boss.bulletImmune) {
            damageBoss(state, b.damage, b.x, b.y);
          }
          if (!b.piercing) {
            b.alive = false;
            break;
          }
        }
      }

      // Gun modules with Reverse Engineering (upgrade 1)
      if (hasUpgrade(state, 1)) {
        for (const pk of state.pickups) {
          if (!pk.alive || pk.kind !== 'gun_module' || pk.rerolled) continue;
          if (
            Math.abs(b.x - pk.x) <= 10 + b.radius &&
            Math.abs(b.y - pk.y) <= 10 + b.radius
          ) {
            rerollGunModule(state, pk);
            if (!b.piercing) {
              b.alive = false;
              break;
            }
          }
        }
        if (!b.alive) break;
      }

      // Corpses with Rest In Pieces (upgrade 3)
      if (hasUpgrade(state, 3)) {
        for (const corpse of state.corpses) {
          if (!corpse.alive) continue;
          if (
            Math.abs(b.x - corpse.x) <= 8 + b.radius &&
            Math.abs(b.y - corpse.y) <= 8 + b.radius
          ) {
            corpse.alive = false;
            triggerExplosion(state, corpse.x, corpse.y, 28, 25);
            if (!b.piercing) {
              b.alive = false;
              break;
            }
          }
        }
        if (!b.alive) break;
      }
    }
  }

  // 2. Update shell casings (and Hot Casing damage = 8)
  for (const c of state.casings) {
    if (!c.alive) continue;

    c.vy = Math.min(c.vy + 0.18, 4.5);
    const nextX = c.x + c.vx;
    const nextY = c.y + c.vy;

    if (isSolidTile(getTile(state.world, xToCol(nextX), yToRow(c.y)), state.world)) {
      c.vx = -c.vx * 0.5;
    } else {
      c.x = nextX;
    }

    if (isSolidTile(getTile(state.world, xToCol(c.x), yToRow(nextY)), state.world)) {
      c.vy = -c.vy * 0.45;
      c.vx *= 0.7;
    } else {
      c.y = nextY;
    }

    if (c.hot) {
      let hit = false;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (Math.abs(c.x - e.x) <= e.w * 0.5 + 3 && Math.abs(c.y - e.y) <= e.h * 0.5 + 3) {
          damageEnemy(state, e, 8, false);
          c.alive = false;
          hit = true;
          break;
        }
      }
      if (!hit && state.boss && state.boss.active && !state.boss.defeated && !state.boss.bulletImmune) {
        const boss = state.boss;
        if (
          Math.abs(c.x - boss.x) <= WELL_CONSTANTS.BOSS_EYE_W * 0.5 + 3 &&
          Math.abs(c.y - boss.y) <= WELL_CONSTANTS.BOSS_EYE_H * 0.5 + 3
        ) {
          damageBoss(state, 8, c.x, c.y);
          c.alive = false;
        }
      }
    }

    c.ttl -= 1;
    if (c.ttl <= 0) {
      c.alive = false;
    }
  }

  state.bullets = state.bullets.filter((b) => b.alive);
  state.casings = state.casings.filter((c) => c.alive);
}
