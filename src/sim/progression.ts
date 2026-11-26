import type { SimState, StyleId } from '../contracts/index.ts';
import { TROPHIES, UNLOCK_MILESTONES } from '../data/trophies.ts';
import { emitEvent } from './simUtils.ts';

const TROPHY_MAP = new Map(TROPHIES.map((t) => [t.id, t]));
const NON_MASTER_TROPHY_IDS = TROPHIES.filter((t) => t.id !== 'trophy_0').map((t) => t.id);

function unlockIfNew(
  state: SimState,
  knownUnlocked: Set<string>,
  newlyUnlocked: string[],
  trophyId: string,
): void {
  if (knownUnlocked.has(trophyId)) {
    return;
  }
  knownUnlocked.add(trophyId);
  newlyUnlocked.push(trophyId);
  if (!state.unlockedTrophiesInRun.includes(trophyId)) {
    state.unlockedTrophiesInRun.push(trophyId);
  }
  const def = TROPHY_MAP.get(trophyId);
  emitEvent(state, {
    type: 'trophy_unlock',
    trophyId,
    name: def?.name ?? trophyId,
  });
}

function checkMasterTrophy(
  state: SimState,
  knownUnlocked: Set<string>,
  newlyUnlocked: string[],
): void {
  if (knownUnlocked.has('trophy_0')) {
    return;
  }
  for (const id of NON_MASTER_TROPHY_IDS) {
    if (!knownUnlocked.has(id)) {
      return;
    }
  }
  unlockIfNew(state, knownUnlocked, newlyUnlocked, 'trophy_0');
}

export function evaluateLiveTrophies(
  state: SimState,
  unlockedAlready: readonly string[],
): string[] {
  const known = new Set<string>(unlockedAlready);
  for (const id of state.unlockedTrophiesInRun) {
    known.add(id);
  }
  const newlyUnlocked: string[] = [];

  const peakCombo = Math.max(state.combo, state.maxCombo);
  if (peakCombo >= 10) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_4'); // WOW COMBO
  }
  if (peakCombo >= 30) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_5'); // WHOA COMBO
  }
  if (peakCombo >= 100 || state.runStats.combo100Hit) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_14'); // SUGOI COMBO
  }

  if (state.gems >= 3000) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_15'); // SAVING UP
  }
  if (state.gems >= 5000) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_22'); // FRUGALITY
  }

  const bossBeaten = state.runStats.bossDefeated || state.mode === 'victory';
  if (bossBeaten) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_11'); // BYE WELL
    if (state.hardMode) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_21'); // WELL MASTER
    }
  }

  checkMasterTrophy(state, known, newlyUnlocked);
  return newlyUnlocked;
}

export function evaluateStageClearTrophies(
  state: SimState,
  areaCleared: boolean,
  unlockedAlready: readonly string[],
): string[] {
  const known = new Set<string>(unlockedAlready);
  for (const id of state.unlockedTrophiesInRun) {
    known.add(id);
  }
  const newlyUnlocked: string[] = [];
  const stats = state.runStats;

  // Stage-clear challenge trophies apply to dungeon areas 1..4
  if (state.area >= 1 && state.area <= 4) {
    if (stats.stageDamageTaken === 0) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_1'); // CAREFUL DESCENT
    }
    if (stats.stageSideRoomsVisited === 0) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_2'); // TIME NEVER STOPS
    }
    if (stats.stageShotsFired === 0) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_3'); // MOTTAINAI
    }
    if (stats.stageKills === 0) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_12'); // PACIFIST
    }
    if (stats.stageLandings === 0) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_13'); // GROUND ALLERGY
    }

    if (areaCleared) {
      if (stats.areaDamageTaken === 0) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_6'); // MASTERFUL DESCENT
      }
      if (stats.areaLandings === 0) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_16'); // CLEAN BOOTS
      }

      if (state.area === 1) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_7'); // BYE FROGS
        if (state.hardMode) unlockIfNew(state, known, newlyUnlocked, 'trophy_17'); // SO MANY FROGS
      } else if (state.area === 2) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_8'); // BYE GHOSTS
        if (state.hardMode) unlockIfNew(state, known, newlyUnlocked, 'trophy_18'); // SO MANY GHOSTS
      } else if (state.area === 3) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_9'); // BYE SQUIDS
        if (state.hardMode) unlockIfNew(state, known, newlyUnlocked, 'trophy_19'); // SO MANY SQUIDS
      } else if (state.area === 4) {
        unlockIfNew(state, known, newlyUnlocked, 'trophy_10'); // BYE STUFF
        if (state.hardMode) unlockIfNew(state, known, newlyUnlocked, 'trophy_20'); // SO MUCH STUFF
      }
    }
  }

  // Also check boss victory if cleared from Abyss
  if (state.area === 5 && (areaCleared || stats.bossDefeated)) {
    unlockIfNew(state, known, newlyUnlocked, 'trophy_11'); // BYE WELL
    if (state.hardMode) {
      unlockIfNew(state, known, newlyUnlocked, 'trophy_21'); // WELL MASTER
    }
  }

  checkMasterTrophy(state, known, newlyUnlocked);
  return newlyUnlocked;
}

export function computeUnlockedFromGems(totalGems: number): {
  styles: StyleId[];
  palettes: number[];
} {
  const styleSet = new Set<StyleId>([0]);
  const paletteSet = new Set<number>([0]);

  for (const milestone of UNLOCK_MILESTONES) {
    if (totalGems >= milestone.gems) {
      if (milestone.kind === 'style') {
        styleSet.add(milestone.targetId as StyleId);
      } else {
        paletteSet.add(milestone.targetId);
      }
    }
  }

  return {
    styles: Array.from(styleSet).sort((a, b) => a - b),
    palettes: Array.from(paletteSet).sort((a, b) => a - b),
  };
}
