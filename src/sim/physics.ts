import {
  WELL_CONSTANTS,
  type InputFrame,
  type SimState,
} from '../contracts/index.ts';
import { getStyleDef } from '../data/styles.ts';
import {
  checkHazardOverlap,
  detectWallContact,
  moveAndCollidePlayer,
} from './collision.ts';
import {
  addShake,
  completeCombo,
  damagePlayer,
  emitEvent,
  hasUpgrade,
  rechargeGunboots,
} from './simUtils.ts';

/**
 * Updates 60 Hz player kinematics, jumping, wall-kick, jump-shoot lock,
 * Aquifer underwater physics & oxygen, landing recharge/combo cashout,
 * and afterimage trail.
 */
export function updatePlayerPhysics(state: SimState, input: InputFrame): void {
  const p = state.player;
  if (!p.alive) {
    return;
  }

  const style = getStyleDef(state.styleId);
  const wasOnGround = p.onGround;

  p.prevX = p.x;
  p.prevY = p.y;

  // --- 1. Tick per-frame timers ---
  if (p.invulnTicks > 0) p.invulnTicks -= 1;
  if (p.muzzleFlashTicks > 0) p.muzzleFlashTicks -= 1;
  if (p.meterJiggleTicks > 0) p.meterJiggleTicks -= 1;
  if (p.wallKickTicks > 0) p.wallKickTicks -= 1;
  if (p.oxygenStunTicks > 0) p.oxygenStunTicks -= 1;

  // --- 2. Water state detection & entry clamp ---
  p.wasInWater = p.inWater;
  const waterStartRow = state.world.waterStartRow;
  const waterSurfaceY = waterStartRow >= 0 ? waterStartRow * WELL_CONSTANTS.TILE_SIZE : Infinity;
  let enteredWaterThisTick = false;

  if (waterStartRow >= 0 && !state.inSideRoom) {
    p.inWater = p.y >= waterSurfaceY;
  } else {
    p.inWater = false;
  }

  if (p.inWater && !p.wasInWater) {
    enteredWaterThisTick = true;
    if (p.vy > WELL_CONSTANTS.WATER_ENTRY_CLAMP) {
      p.vy = WELL_CONSTANTS.WATER_ENTRY_CLAMP;
    }
    emitEvent(state, { type: 'splash', x: p.x, y: p.y, entering: true });
  } else if (!p.inWater && p.wasInWater) {
    emitEvent(state, { type: 'splash', x: p.x, y: p.y, entering: false });
  }

  // --- 3. Jump-Shoot Lock release ---
  // Releasing action clears jumpShootLock so subsequent midair presses fire gunboots.
  if (input.actionReleased || !input.action) {
    p.jumpShootLock = false;
  }

  // --- 4. Coyote time & Jump buffer ---
  if (p.onGround) {
    p.coyoteTicks = WELL_CONSTANTS.COYOTE_TICKS;
  } else if (p.coyoteTicks > 0) {
    p.coyoteTicks -= 1;
  }

  if (input.actionPressed) {
    p.jumpBufferTicks = WELL_CONSTANTS.JUMP_BUFFER_TICKS;
  } else if (p.jumpBufferTicks > 0) {
    p.jumpBufferTicks -= 1;
  }

  // --- 5. Horizontal input & acceleration ---
  const moveDir: -1 | 0 | 1 = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0;

  if (p.wallKickTicks <= 0) {
    if (moveDir !== 0) {
      p.facing = moveDir;
      const maxSp = p.inWater
        ? p.onGround
          ? WELL_CONSTANTS.WATER_MAX_SP
          : WELL_CONSTANTS.WATER_AIR_MAX_SP
        : p.onGround
          ? WELL_CONSTANTS.GROUND_MAX_SP
          : WELL_CONSTANTS.AIR_MAX_SP;

      // Snappy directional reversal
      if (p.vx !== 0 && Math.sign(p.vx) !== moveDir) {
        const snap = p.onGround
          ? WELL_CONSTANTS.GROUND_REVERSE_SNAP
          : WELL_CONSTANTS.AIR_REVERSE_SNAP;
        if (Math.abs(p.vx) <= snap) {
          p.vx = 0;
        } else {
          p.vx -= Math.sign(p.vx) * snap;
        }
      }

      p.vx += moveDir * WELL_CONSTANTS.MOVE_ACCEL;
      if (p.vx > maxSp) p.vx = maxSp;
      if (p.vx < -maxSp) p.vx = -maxSp;
    } else {
      const decel = p.onGround ? WELL_CONSTANTS.GROUND_DECEL : WELL_CONSTANTS.AIR_DECEL;
      if (Math.abs(p.vx) <= decel) {
        p.vx = 0;
      } else {
        p.vx -= Math.sign(p.vx) * decel;
      }
    }
  }

  // --- 6. Jump, Wall-Kick, and Variable Jump Cut ---
  let jumpedThisTick = false;

  if (p.jumpBufferTicks > 0 && (p.onGround || p.coyoteTicks > 0)) {
    const isRocket = hasUpgrade(state, 18);
    const baseJump = p.inWater
      ? WELL_CONSTANTS.WATER_JUMP_SP
      : isRocket
        ? WELL_CONSTANTS.ROCKET_JUMP_SP
        : WELL_CONSTANTS.JUMP_SP;
    const jumpSp = baseJump * style.jumpMultiplier;

    p.vy = -jumpSp;
    p.onGround = false;
    p.onThinPlatform = false;
    p.coyoteTicks = 0;
    p.jumpBufferTicks = 0;
    p.jumpShootLock = true;
    p.spinJump = moveDir !== 0;
    jumpedThisTick = true;

    if (isRocket) {
      addShake(state, 2, 6);
    }

    emitEvent(state, {
      type: 'jump',
      x: p.x,
      y: p.y,
      rocket: isRocket,
      water: p.inWater,
    });
  } else if (!p.onGround && p.coyoteTicks === 0 && input.actionPressed) {
    const wallDir = p.onWall !== 0 ? p.onWall : detectWallContact(state.world, p.x, p.y);
    if (wallDir !== 0 && moveDir === wallDir) {
      const kickDir = (-wallDir) as -1 | 1;
      const baseKick = p.inWater
        ? Math.min(WELL_CONSTANTS.WALL_KICK_SP, WELL_CONSTANTS.WATER_JUMP_SP)
        : WELL_CONSTANTS.WALL_KICK_SP;

      p.vy = -(baseKick * style.jumpMultiplier);
      p.vx = kickDir * WELL_CONSTANTS.AIR_MAX_SP;
      p.wallKickDir = kickDir;
      p.wallKickTicks = WELL_CONSTANTS.WALL_KICK_LENGTH;
      p.facing = kickDir;
      p.spinJump = true;
      p.jumpShootLock = true;
      p.jumpBufferTicks = 0;
      jumpedThisTick = true;

      emitEvent(state, { type: 'wall_kick', x: p.x, y: p.y, dir: kickDir });
    }
  }

  // Variable jump height cut on early release
  if (!jumpedThisTick && input.actionReleased && p.vy < 0) {
    p.vy *= WELL_CONSTANTS.JUMP_CUT_MULT;
  }

  // --- 7. Gravity & Terminal Velocity ---
  let grav: number = WELL_CONSTANTS.GRAV;
  let maxgrav: number = WELL_CONSTANTS.MAX_GRAV;

  if (state.area === 4) {
    maxgrav = WELL_CONSTANTS.LIMBO_MAX_GRAV;
  }
  if (p.inWater) {
    grav = WELL_CONSTANTS.WATER_GRAV;
    maxgrav = WELL_CONSTANTS.WATER_MAX_GRAV;
  }

  // Float style (styleId === 3): grav *= 1/1.5
  grav *= style.gravMultiplier;

  // Heart Balloon active (ug 15): maxgrav -= 1.0
  if (hasUpgrade(state, 15) && p.balloon.active) {
    maxgrav += WELL_CONSTANTS.HEART_BALLOON_MAX_GRAV_DELTA;
  }

  if (enteredWaterThisTick) {
    // Hold water-surface entry brake through the splashdown tick
    if (p.vy > WELL_CONSTANTS.WATER_ENTRY_CLAMP) {
      p.vy = WELL_CONSTANTS.WATER_ENTRY_CLAMP;
    }
  } else if (p.oxygenStunTicks > 0) {
    // Brief buoyant float pause after restoring oxygen
    p.vy *= 0.45;
    p.vy += grav * 0.25;
  } else {
    p.vy += grav;
  }

  if (p.vy > maxgrav) {
    p.vy = maxgrav;
  }

  // --- 8. Swept AABB Movement & Collision ---
  const col = moveAndCollidePlayer(state);
  p.onGround = col.hitFloor;
  p.onThinPlatform = col.landedOnThin;
  p.onWall =
    col.hitWall !== 0
      ? col.hitWall
      : !p.onGround
        ? detectWallContact(state.world, p.x, p.y)
        : 0;

  // Catch crossing the water line during this tick's vertical sweep
  if (waterStartRow >= 0 && !state.inSideRoom && !p.inWater && p.y >= waterSurfaceY) {
    p.inWater = true;
    if (p.vy > WELL_CONSTANTS.WATER_ENTRY_CLAMP) {
      p.vy = WELL_CONSTANTS.WATER_ENTRY_CLAMP;
    }
    emitEvent(state, { type: 'splash', x: p.x, y: p.y, entering: true });
  }

  // --- 9. Landing Transition ---
  if (p.onGround) {
    p.spinJump = false;
    p.coyoteTicks = WELL_CONSTANTS.COYOTE_TICKS;

    if (!wasOnGround) {
      const landedCombo = state.combo;
      rechargeGunboots(state);
      completeCombo(state);
      state.runStats.stageLandings += 1;
      state.runStats.areaLandings += 1;
      emitEvent(state, { type: 'land', x: p.x, y: p.y, combo: landedCombo });
    } else if (p.ammo < p.ammoMax) {
      rechargeGunboots(state);
    }
  }

  // --- 10. Spike / Trap Hazard Overlap ---
  if (col.touchedHazard) {
    const haz = checkHazardOverlap(state);
    if (haz.hit) {
      damagePlayer(state, haz.sourceX, haz.sourceY);
    }
  }

  // --- 11. Aquifer Underwater Oxygen & Air Pockets ---
  updateAquiferOxygen(state);

  // --- 12. Depth Stat, Animation State & 8-Frame Afterimage Trail ---
  const depthMeters = Math.max(0, Math.floor(p.y / WELL_CONSTANTS.TILE_SIZE));
  if (depthMeters > state.runStats.maxDepthMeters) {
    state.runStats.maxDepthMeters = depthMeters;
  }

  updatePlayerAnimAndAfterimages(state);
}

function updateAquiferOxygen(state: SimState): void {
  const p = state.player;
  const world = state.world;

  // Update air pocket pickups & respawns
  for (const pocket of world.airPockets) {
    if (!pocket.active) {
      if (pocket.respawnTicks > 0) {
        pocket.respawnTicks -= 1;
        if (pocket.respawnTicks <= 0) {
          pocket.active = true;
        }
      }
      continue;
    }

    if (!state.inSideRoom) {
      const dx = p.x - pocket.x;
      const dy = p.y - pocket.y;
      const touchDist = pocket.radius + WELL_CONSTANTS.PLAYER_HALF_W;
      if (dx * dx + dy * dy <= touchDist * touchDist) {
        p.oxygen = WELL_CONSTANTS.OXYGEN_MAX;
        p.oxygenTick = 0;
        p.suffocateTick = 0;
        p.oxygenStunTicks = WELL_CONSTANTS.OXYGEN_GET_STUN;
        pocket.active = false;
        pocket.respawnTicks = 300;
        emitEvent(state, {
          type: 'oxygen_restore',
          x: pocket.x,
          y: pocket.y,
          oxygen: p.oxygen,
        });
      }
    }
  }

  if (state.inSideRoom) {
    // Side rooms pause underwater oxygen depletion
    return;
  }

  if (!p.inWater) {
    p.oxygen = WELL_CONSTANTS.OXYGEN_MAX;
    p.oxygenTick = 0;
    p.suffocateTick = 0;
    return;
  }

  const depleteRate = state.hardMode
    ? WELL_CONSTANTS.OXYGEN_TICK_HARD
    : WELL_CONSTANTS.OXYGEN_TICK_NORMAL;

  p.oxygenTick += 1;
  if (p.oxygenTick >= depleteRate) {
    p.oxygenTick = 0;
    if (p.oxygen > 0) {
      p.oxygen -= 1;
      if (p.oxygen <= 25) {
        emitEvent(state, { type: 'oxygen_warn', oxygen: p.oxygen });
      }
    }
  }

  if (p.oxygen <= 0) {
    p.suffocateTick += 1;
    if (p.suffocateTick >= WELL_CONSTANTS.OXYGEN_SUFFOCATE_INTERVAL) {
      p.suffocateTick = 0;
      damagePlayer(state, p.x, p.y);
    }
  } else {
    p.suffocateTick = 0;
  }
}

function updatePlayerAnimAndAfterimages(state: SimState): void {
  const p = state.player;

  if (!p.alive) {
    p.animState = 'dead';
  } else if (p.muzzleFlashTicks > 0 && !p.onGround) {
    p.animState = 'shoot';
  } else if (p.jetpackActive && !p.onGround) {
    p.animState = 'jetpack';
  } else if (p.onGround) {
    p.animState = Math.abs(p.vx) > 0.1 ? 'run' : 'idle';
  } else if (p.spinJump) {
    p.animState = 'spin_jump';
  } else if (p.vy < 0) {
    p.animState = 'jump';
  } else if (p.inWater) {
    p.animState = 'swim';
  } else {
    p.animState = 'fall';
  }

  p.animTimer += 1;
  if (p.animTimer >= 6) {
    p.animTimer = 0;
    p.animFrame = (p.animFrame + 1) % 4;
  }

  // Decay existing afterimages
  const fadeStep = 1 / (WELL_CONSTANTS.AFTERIMAGE_COUNT + 1);
  const nextTrail = [];
  for (const snap of p.afterimages) {
    const nextAlpha = snap.alpha - fadeStep;
    if (nextAlpha > 0.02) {
      nextTrail.push({
        x: snap.x,
        y: snap.y,
        facing: snap.facing,
        animState: snap.animState,
        alpha: nextAlpha,
      });
    }
  }

  const shouldRecordTrail =
    p.vy >= 4.5 || state.gemHigh || (!p.onGround && state.combo > 0);

  if (shouldRecordTrail) {
    nextTrail.unshift({
      x: p.x,
      y: p.y,
      facing: p.facing,
      animState: p.animState,
      alpha: 0.85,
    });
  }

  if (nextTrail.length > WELL_CONSTANTS.AFTERIMAGE_COUNT) {
    nextTrail.length = WELL_CONSTANTS.AFTERIMAGE_COUNT;
  }
  p.afterimages = nextTrail;
}

/**
 * Updates vertical lead (daop = +24 in well, -32 on surface),
 * horizontal lead (xAhead = 16) clamped to shaft unless locked to side room,
 * smoothing (/5 vertical, /10 horizontal), and screen shake decay.
 */
export function updateCamera(state: SimState): void {
  const cam = state.camera;
  const p = state.player;

  cam.prevX = cam.x;
  cam.prevY = cam.y;

  if (cam.sideRoomLocked) {
    cam.targetX = cam.sideRoomX;
    cam.targetY = cam.sideRoomY;
  } else {
    const onSurface = state.area === 0 || state.mode === 'surface';
    const daop = onSurface ? WELL_CONSTANTS.CAM_DAOP_SURFACE : WELL_CONSTANTS.CAM_DAOP_WELL;

    // Shaft spans cols 0..10 inclusive => x in [0, 176]; center X clamped to [80, 96]
    const shaftMinCamX = WELL_CONSTANTS.VIEW_W * 0.5;
    const shaftMaxCamX =
      (WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL + 1) * WELL_CONSTANTS.TILE_SIZE -
      WELL_CONSTANTS.VIEW_W * 0.5;

    const rawTargetX = p.x + p.facing * WELL_CONSTANTS.CAM_X_AHEAD;
    cam.targetX = Math.max(shaftMinCamX, Math.min(shaftMaxCamX, rawTargetX));

    const rawTargetY = p.y + daop;
    if (onSurface) {
      cam.targetY = rawTargetY;
    } else {
      const worldH = state.world.rows * WELL_CONSTANTS.TILE_SIZE;
      const halfH = WELL_CONSTANTS.VIEW_H * 0.5;
      if (worldH > WELL_CONSTANTS.VIEW_H) {
        const minCamY = halfH;
        const maxCamY = worldH - halfH;
        cam.targetY = Math.max(minCamY, Math.min(maxCamY, rawTargetY));
      } else {
        cam.targetY = rawTargetY;
      }
    }
  }

  cam.x += (cam.targetX - cam.x) / WELL_CONSTANTS.CAM_X_SLOWDOWN;
  cam.y += (cam.targetY - cam.y) / WELL_CONSTANTS.CAM_Y_SLOWDOWN;

  if (cam.shakeTicks > 0) {
    cam.shakeTicks -= 1;
    if (cam.shakeTicks <= 0) {
      cam.shakeMag = 0;
    } else {
      cam.shakeMag *= 0.9;
    }
  } else {
    cam.shakeMag = 0;
  }
}
