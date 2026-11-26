import {
  WELL_CONSTANTS,
  type AreaId,
  type InputFrame,
  type SimState,
} from '../contracts/index.ts';
import { initBoss, updateBoss } from './boss.ts';
import { buildStageIntoState } from './createState.ts';
import { updateEnemies, updateGemsAndCorpses } from './enemies.ts';
import { updateCamera, updatePlayerPhysics } from './physics.ts';
import { evaluateLiveTrophies, evaluateStageClearTrophies } from './progression.ts';
import { emitEvent, rechargeGunboots } from './simUtils.ts';
import { spawnBossWallModules, updateSideRoomsAndPickups } from './shop.ts';
import {
  handleUpgradeSelectInput,
  rollUpgradeChoices,
  updateUpgradesTick,
} from './upgrades.ts';
import { updateBulletsAndCasings, updateWeapons } from './weapons.ts';

function computeNextStage(area: AreaId, level: number): { area: AreaId; level: number } {
  if (area === 0) {
    return { area: 1, level: 1 };
  }
  if (area >= 1 && area <= 3) {
    if (level < 3) {
      return { area, level: level + 1 };
    }
    return { area: (area + 1) as AreaId, level: 1 };
  }
  if (area === 4) {
    if (level < 3) {
      return { area: 4, level: level + 1 };
    }
    return { area: 5, level: 1 };
  }
  return { area: 5, level: 1 };
}

export function advanceToNextStage(state: SimState): void {
  const prevArea = state.area;
  const next = computeNextStage(state.area, state.level);
  const enteringNewArea = next.area !== prevArea;

  state.runStats.stageDamageTaken = 0;
  state.runStats.stageKills = 0;
  state.runStats.stageShotsFired = 0;
  state.runStats.stageGemsSpawned = 0;
  state.runStats.stageGemsCollected = 0;
  state.runStats.stageLandings = 0;
  state.runStats.stageSideRoomsVisited = 0;
  state.runStats.stageStartTick = state.tick;

  if (enteringNewArea) {
    state.runStats.areaDamageTaken = 0;
    state.runStats.areaLandings = 0;
  }

  buildStageIntoState(state, next.area, next.level);
  state.mode = 'playing';
  rechargeGunboots(state);

  if (next.area === 5) {
    initBoss(state);
    spawnBossWallModules(state);
  }
}

export function warpStageWithEntities(state: SimState, area: AreaId, level = 1): void {
  buildStageIntoState(state, area, level);
  state.mode = area === 0 ? 'surface' : 'playing';
  rechargeGunboots(state);
  if (area === 5) {
    initBoss(state);
    spawnBossWallModules(state);
  } else {
    state.boss = null;
  }
}

/**
 * Pure deterministic 60 Hz simulation step.
 * Drains previous tick's `state.events` at entry and emits fresh events for this tick.
 */
export function stepSim(
  state: SimState,
  input: InputFrame,
  unlockedTrophies: readonly string[] = [],
): void {
  state.events.length = 0;

  if (state.mode === 'title' || state.mode === 'paused' || state.mode === 'gameover') {
    return;
  }

  if (state.mode === 'victory') {
    state.victoryTimer += 1;
    return;
  }

  if (state.mode === 'upgrade_select') {
    state.tick += 1;
    const confirmed = handleUpgradeSelectInput(state, input);
    if (confirmed) {
      advanceToNextStage(state);
    }
    return;
  }

  // Playing or Surface mode
  state.tick += 1;
  if (state.mode === 'playing') {
    state.runStats.elapsedTicks += 1;
  }

  if (state.impactSlowdownTicks > 0) {
    state.impactSlowdownTicks -= 1;
  }
  if (state.hitStopTicks > 0) {
    state.hitStopTicks -= 1;
    updateCamera(state);
    return;
  }

  if (state.comboPopup) {
    state.comboPopup.timer -= 1;
    if (state.comboPopup.timer <= 0) {
      state.comboPopup = null;
    }
  }

  // World spike trap & ghost wall cadence (paused in side rooms)
  if (!state.inSideRoom) {
    state.world.spikeTrapTimer += 1;
    state.world.spikeTrapExtended = Math.floor(state.world.spikeTrapTimer / 90) % 2 === 1;
  }

  // Ensure Abyss boss is initialized if warped or loaded into Area 5
  if (state.area === 5 && !state.boss) {
    initBoss(state);
    spawnBossWallModules(state);
  }

  // 1. Player movement, physics, collision, oxygen, landing recharge
  updatePlayerPhysics(state, input);

  // 2. Gunboot weapons, burst cadence, casings, bullets
  updateWeapons(state, input);
  updateBulletsAndCasings(state);

  // 3. Upgrade passives (Drone, Heart Balloon, Gem Attractor, Timeout Void, Knife & Fork)
  updateUpgradesTick(state);

  // 4. Side rooms (time-stop alcove, camera lock, shops, gun modules, bubbles)
  updateSideRoomsAndPickups(state, input);

  // 5. Enemies & Abyssal Leviathan Boss (frozen while inside time-stopped side rooms)
  if (!state.inSideRoom) {
    updateEnemies(state);
    if (state.boss && state.boss.active) {
      updateBoss(state);
    }
  }

  // 6. Gems (collection, Gem High, Gem Powered, Popping Gems) & Corpses
  updateGemsAndCorpses(state);

  // 7. Camera tracking & screen shake decay
  updateCamera(state);

  // 8. Depth tracking (meters)
  if (state.area >= 1) {
    const stageBase = (state.area - 1) * 300 + (state.level - 1) * 100;
    const localMeters = Math.max(0, Math.floor(state.player.y / WELL_CONSTANTS.TILE_SIZE));
    const totalDepth = stageBase + localMeters;
    if (totalDepth > state.runStats.maxDepthMeters) {
      state.runStats.maxDepthMeters = totalDepth;
    }
  }

  // 9. Live trophy checks
  evaluateLiveTrophies(state, unlockedTrophies);

  // 10. Stage exit check
  if (state.mode === 'playing' && state.player.alive) {
    const exitY = state.world.exitRow * WELL_CONSTANTS.TILE_SIZE;
    if (state.area === 0 && state.player.y >= exitY) {
      advanceToNextStage(state);
      return;
    }
    if (state.area >= 1 && state.area <= 4 && state.player.y >= exitY) {
      const areaCleared = state.level >= 3;
      emitEvent(state, { type: 'stage_clear', area: state.area, level: state.level });
      evaluateStageClearTrophies(state, areaCleared, unlockedTrophies);

      const choices = rollUpgradeChoices(state);
      if (choices.length > 0) {
        state.upgradeChoices = choices;
        state.upgradeCursor = 0;
        state.mode = 'upgrade_select';
      } else {
        advanceToNextStage(state);
      }
    }
  }
}
