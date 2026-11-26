import { describe, expect, it } from 'vitest';
import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AreaId,
  type InputFrame,
  type SimState,
  type StyleId,
} from '../src/contracts/index.ts';
import {
  AQUIFER_CHUNKS,
  CATACOMB_CHUNKS,
  CAVERN_CHUNKS,
  LIMBO_CHUNKS,
} from '../src/data/chunks.ts';
import { createInitialState, EMPTY_INPUT, startNewRun } from '../src/sim/createState.ts';
import { hashSimState } from '../src/sim/hash.ts';
import {
  colToX,
  isSolidTile,
  rowToY,
  setTile,
} from '../src/sim/simUtils.ts';
import { stepSim } from '../src/sim/step.ts';
import { applyUpgrade } from '../src/sim/upgrades.ts';
import { verifyStageNavigable } from '../src/sim/worldgen.ts';

function makeInput(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...overrides };
}

/**
 * Clears a clean vertical drop lane in col 5 so integration tests can drive
 * the player down to `exitRow` purely via `stepSim` physics without external state mutation.
 */
function clearCenterDropLane(state: SimState): void {
  const world = state.world;
  for (let row = 0; row < world.exitRow; row++) {
    setTile(world, 5, row, TILE_KIND.EMPTY);
  }
  state.enemies = [];
}

describe('Biome Chunk Library Expansion', () => {
  it('provides 12 distinct, 9-column chunks each for Catacomb, Aquifer, and Limbo (plus 16 Cavern)', () => {
    expect(CAVERN_CHUNKS.length).toBeGreaterThanOrEqual(16);
    expect(CATACOMB_CHUNKS.length).toBe(12);
    expect(AQUIFER_CHUNKS.length).toBe(12);
    expect(LIMBO_CHUNKS.length).toBe(12);

    for (const pool of [CAVERN_CHUNKS, CATACOMB_CHUNKS, AQUIFER_CHUNKS, LIMBO_CHUNKS]) {
      const seen = new Set<string>();
      for (const chunk of pool) {
        const key = chunk.join('\n');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        for (const row of chunk) {
          expect(row.length).toBe(WELL_CONSTANTS.SHAFT_COLS);
        }
      }
    }

    // Spot-check generated navigability across all enriched biomes
    for (const area of [2, 3, 4] as AreaId[]) {
      for (let i = 0; i < 6; i++) {
        const s = createInitialState({ seed: area * 900 + i * 31, area, level: (i % 3) + 1 });
        expect(verifyStageNavigable(s.world)).toBe(true);
      }
    }
  });
});

describe('Campaign Integration: Full stepSim Loop', () => {
  it('clears a stage -> enters upgrade_select -> navigates & picks upgrade -> advances to next stage', () => {
    const state = createInitialState({ seed: 1001, area: 1, level: 1, styleId: 0 });
    clearCenterDropLane(state);

    let stageClearEvent = false;
    for (let t = 0; t < 600 && state.mode === 'playing'; t++) {
      stepSim(state, EMPTY_INPUT);
      if (state.events.some((e) => e.type === 'stage_clear' && e.area === 1 && e.level === 1)) {
        stageClearEvent = true;
      }
    }

    expect(stageClearEvent).toBe(true);
    expect(state.mode).toBe('upgrade_select');
    expect(state.upgradeChoices.length).toBe(3);
    expect(state.upgradeCursor).toBe(0);

    const expectedUpgrade = state.upgradeChoices[1]!;

    // Navigate cursor right via stepSim
    stepSim(state, makeInput({ right: true }));
    expect(state.mode).toBe('upgrade_select');
    expect(state.upgradeCursor).toBe(1);

    // Confirm upgrade choice via stepSim -> applies upgrade & transitions to 1-2
    stepSim(state, makeInput({ action: true, actionPressed: true }));
    expect(state.events.some((e) => e.type === 'upgrade_pick' && e.upgradeId === expectedUpgrade)).toBe(true);
    expect(state.upgrades).toContain(expectedUpgrade);
    expect(state.runStats.upgradesTaken).toBe(1);
    expect(state.runStats.noUpgradeRun).toBe(false);
    expect(state.mode).toBe('playing');
    expect(state.area).toBe(1);
    expect(state.level).toBe(2);
    expect(verifyStageNavigable(state.world)).toBe(true);
  });

  it('transitions from stage 1-3 -> Area 2-1 and resets per-area counters', () => {
    const state = createInitialState({ seed: 1002, area: 1, level: 3, styleId: 0 });
    state.runStats.areaDamageTaken = 2;
    state.runStats.areaLandings = 5;
    clearCenterDropLane(state);

    for (let t = 0; t < 600 && state.mode === 'playing'; t++) {
      stepSim(state, EMPTY_INPUT);
    }
    expect(state.mode).toBe('upgrade_select');

    // Confirm upgrade -> transitions into Area 2 Level 1
    stepSim(state, makeInput({ action: true, actionPressed: true }));
    expect(state.mode).toBe('playing');
    expect(state.area).toBe(2);
    expect(state.level).toBe(1);
    expect(state.runStats.areaDamageTaken).toBe(0);
    expect(state.runStats.areaLandings).toBe(0);
  });

  it('skips upgrade_select cleanly in Ascetic Style (styleId 4) and advances straight to next stage', () => {
    const state = createInitialState({ seed: 4004, area: 1, level: 1, styleId: 4 });
    clearCenterDropLane(state);

    let sawUpgradeSelect = false;
    let sawStageClear = false;

    for (let t = 0; t < 600; t++) {
      stepSim(state, EMPTY_INPUT);
      if (state.mode === 'upgrade_select') {
        sawUpgradeSelect = true;
      }
      if (state.events.some((e) => e.type === 'stage_clear')) {
        sawStageClear = true;
      }
      if (state.area === 1 && state.level === 2) {
        break;
      }
    }

    expect(sawStageClear).toBe(true);
    expect(sawUpgradeSelect).toBe(false);
    expect(state.mode).toBe('playing');
    expect(state.area).toBe(1);
    expect(state.level).toBe(2);
    expect(state.upgradeChoices).toEqual([]);
    expect(state.upgrades).toEqual([]);
    expect(state.runStats.noUpgradeRun).toBe(true);
  });

  it('exercises Aquifer underwater entry, Normal vs Hard oxygen depletion, and air pocket refill via stepSim', () => {
    const normal = createInitialState({ seed: 3003, area: 3, level: 1, hardMode: false });
    const hard = createInitialState({ seed: 3003, area: 3, level: 1, hardMode: true });

    // Build a clean underwater holding shelf at row 10 with an active air pocket at col 7, row 9
    for (const s of [normal, hard]) {
      s.enemies = [];
      for (let r = 0; r <= 12; r++) {
        for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
          setTile(s.world, c, r, r === 10 ? TILE_KIND.SOLID : TILE_KIND.EMPTY);
        }
      }
      s.world.airPockets = [
        {
          id: 9001,
          x: colToX(7) + 8,
          y: rowToY(9) + 8,
          radius: 10,
          active: true,
          respawnTicks: 0,
        },
      ];
    }

    let sawSplash = false;
    for (let t = 0; t < 220; t++) {
      stepSim(normal, EMPTY_INPUT);
      stepSim(hard, EMPTY_INPUT);
      if (normal.events.some((e) => e.type === 'splash' && e.entering)) {
        sawSplash = true;
      }
    }

    expect(sawSplash).toBe(true);
    expect(normal.player.inWater).toBe(true);
    expect(hard.player.inWater).toBe(true);
    expect(normal.player.oxygen).toBeLessThan(WELL_CONSTANTS.OXYGEN_MAX);
    expect(hard.player.oxygen).toBeLessThan(normal.player.oxygen);

    // Walk normal player right into the air pocket at col 7 -> refills oxygen to 100
    let restored = false;
    for (let t = 0; t < 80; t++) {
      stepSim(normal, makeInput({ right: true }));
      if (normal.events.some((e) => e.type === 'oxygen_restore')) {
        restored = true;
        break;
      }
    }

    expect(restored).toBe(true);
    expect(normal.player.oxygen).toBe(WELL_CONSTANTS.OXYGEN_MAX);
    expect(normal.world.airPockets[0]!.active).toBe(false);
    expect(normal.world.airPockets[0]!.respawnTicks).toBeGreaterThan(0);
    expect(normal.player.oxygenStunTicks).toBeGreaterThan(0);
  });

  it('enforces Limbo maxgrav=6.0 and 90-tick GHOST_WALL phasing via stepSim', () => {
    const state = createInitialState({ seed: 4404, area: 4, level: 1 });
    state.enemies = [];
    for (let r = 0; r < 40; r++) {
      for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
        setTile(state.world, c, r, TILE_KIND.EMPTY);
      }
    }
    // Place a ghost wall barrier on row 25
    for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
      setTile(state.world, c, 25, TILE_KIND.GHOST_WALL);
    }

    let peakVy = 0;
    let sawSolidPhase = false;
    let sawPassablePhase = false;
    let passedThroughGhostWall = false;

    for (let t = 0; t < 200; t++) {
      stepSim(state, EMPTY_INPUT);
      if (state.player.vy > peakVy) peakVy = state.player.vy;
      if (isSolidTile(TILE_KIND.GHOST_WALL, state.world)) {
        sawSolidPhase = true;
      } else {
        sawPassablePhase = true;
      }
      if (state.player.y > rowToY(26)) {
        passedThroughGhostWall = true;
        break;
      }
    }

    expect(peakVy).toBeCloseTo(WELL_CONSTANTS.LIMBO_MAX_GRAV, 5);
    expect(sawSolidPhase).toBe(true);
    expect(sawPassablePhase).toBe(true);
    expect(passedThroughGhostWall).toBe(true);
  });

  it('auto-initializes Abyssal Leviathan Boss in Area 5 and reaches victory through all 4 phases via pure stepSim', () => {
    const state = createInitialState({ seed: 5005, area: 5, level: 1, styleId: 0 });
    expect(state.boss).toBeNull();

    // First stepSim in Area 5 auto-initializes Boss and spawns Abyss HP wall modules
    stepSim(state, EMPTY_INPUT);
    expect(state.boss).not.toBeNull();
    expect(state.boss!.active).toBe(true);
    expect(state.boss!.hp).toBe(WELL_CONSTANTS.BOSS_TOTAL_HP);
    expect(state.boss!.phase).toBe(1);
    expect(state.pickups.some((pk) => pk.kind === 'gun_module' && pk.bonusType === 'hp')).toBe(true);

    // Equip late-game loadout (Laser + Drone + Candle) and stand on a full-width thin perch at row 10
    // so the Abyssal Leviathan hovers in open air below (row ~18, well above world bottom row 60)
    state.player.weaponId = 2;
    state.player.ammoMax = 16;
    state.player.ammo = 16;
    state.player.hpMax = 12;
    state.player.hp = 12;
    applyUpgrade(state, 9); // Drone mirrors Laser shots
    applyUpgrade(state, 7); // Candle extended i-frames
    for (let r = 0; r < state.world.rows; r++) {
      for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
        setTile(state.world, c, r, r === 10 ? TILE_KIND.THIN_PLATFORM : TILE_KIND.EMPTY);
      }
    }

    const phasesSeen = new Set<number>([state.boss!.phase]);
    let defeatEventSeen = false;
    let victoryTrophySeen = false;
    let prevAction = false;

    for (let t = 0; t < 4500 && state.mode !== 'victory'; t++) {
      const p = state.player;
      const boss = state.boss!;
      let targetX = boss.x;
      let dodging = false;

      if (boss.laserCharge > 0 || boss.laserActiveTicks > 0) {
        if (Math.abs(p.x - boss.laserX) < 30) {
          targetX = boss.laserX >= WELL_CONSTANTS.CAM_CENTER_X ? 34 : 142;
          dodging = true;
        }
      }
      if (!dodging) {
        for (const eb of state.enemyBullets) {
          if (eb.alive && Math.abs(eb.x - p.x) < 22 && eb.y > p.y - 14 && eb.y < p.y + 52) {
            targetX = eb.x >= p.x ? Math.max(28, p.x - 28) : Math.min(148, p.x + 28);
            dodging = true;
            break;
          }
        }
      }
      if (!dodging) {
        for (const e of state.enemies) {
          if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 30) {
            targetX = e.x >= p.x ? Math.max(28, p.x - 32) : Math.min(148, p.x + 32);
            dodging = true;
            break;
          }
        }
      }

      const dx = targetX - p.x;
      const left = dx < -3;
      const right = dx > 3;

      let wantAction = false;
      const aligned = Math.abs(p.x - boss.x) <= 20;
      const enemyBelow = state.enemies.some(
        (e) => e.alive && Math.abs(e.x - p.x) <= 18 && e.y > p.y && e.y - p.y <= 140,
      );
      if (p.onGround) {
        wantAction = ((!boss.bulletImmune && boss.state === 0 && aligned && !dodging) || enemyBelow) && !prevAction;
      } else if (p.jumpShootLock) {
        wantAction = false;
      } else if (((!boss.bulletImmune && boss.state === 0 && aligned && !dodging) || enemyBelow) && p.ammo >= 4) {
        wantAction = !prevAction && p.fireCooldown <= 0;
      }

      const actionPressed = wantAction && !prevAction;
      const actionReleased = !wantAction && prevAction;
      prevAction = wantAction;

      stepSim(state, makeInput({ left, right, action: wantAction, actionPressed, actionReleased }));
      expect(state.mode).not.toBe('gameover');

      if (state.boss) {
        phasesSeen.add(state.boss.phase);
      }
      if (state.events.some((e) => e.type === 'boss_defeat')) {
        defeatEventSeen = true;
      }
      if (state.events.some((e) => e.type === 'trophy_unlock' && e.trophyId === 'trophy_11')) {
        victoryTrophySeen = true;
      }
    }

    expect([...phasesSeen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(defeatEventSeen).toBe(true);
    expect(state.boss!.defeated).toBe(true);
    expect(state.runStats.bossDefeated).toBe(true);
    expect(state.mode).toBe('victory');
    expect(victoryTrophySeen || state.unlockedTrophiesInRun.includes('trophy_11')).toBe(true);

    // Victory timer increments while in victory mode
    const vt0 = state.victoryTimer;
    stepSim(state, EMPTY_INPUT);
    expect(state.victoryTimer).toBe(vt0 + 1);
  });

  it('guarantees bit-for-bit hashSimState replay determinism across stepSim tapes with pause and restart', () => {
    const runTape = (seed: number, area: AreaId, styleId: StyleId): string[] => {
      const state = createInitialState({ seed, area, level: 1, styleId });
      const checkpoints: string[] = [];
      let prevAction = false;

      for (let t = 1; t <= 300; t++) {
        const cycle = t % 40;
        const left = cycle >= 5 && cycle < 16;
        const right = cycle >= 20 && cycle < 34;
        const wantAction = (cycle >= 2 && cycle < 7) || (cycle >= 9 && cycle < 18);
        const actionPressed = wantAction && !prevAction;
        const actionReleased = !wantAction && prevAction;
        prevAction = wantAction;

        if (t === 110) state.mode = state.mode === 'playing' ? 'paused' : state.mode;
        if (t === 125) state.mode = state.mode === 'paused' ? 'playing' : state.mode;
        if (t === 220) startNewRun(state, { seed: seed + 19, area, level: 1, styleId });

        stepSim(state, makeInput({ left, right, action: wantAction, actionPressed, actionReleased }));

        if (t === 100 || t === 200 || t === 300) {
          checkpoints.push(hashSimState(state));
        }
      }

      return checkpoints;
    };

    const a1 = runTape(77701, 1, 0);
    const b1 = runTape(77701, 1, 0);
    expect(a1).toEqual(b1);

    const a2 = runTape(77702, 3, 3);
    const b2 = runTape(77702, 3, 3);
    expect(a2).toEqual(b2);

    expect(a1[2]).not.toBe(a2[2]);
  });
});
