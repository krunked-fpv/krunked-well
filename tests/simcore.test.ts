import { describe, expect, it } from 'vitest';
import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AreaId,
  type InputFrame,
  type SimState,
  type TileKind,
} from '../src/contracts/index.ts';
import { getChunksForArea } from '../src/data/chunks.ts';
import {
  checkHazardOverlap,
  moveAndCollidePlayer,
  raycastDown,
} from '../src/sim/collision.ts';
import {
  buildStageIntoState,
  createInitialState,
  EMPTY_INPUT,
  startNewRun,
} from '../src/sim/createState.ts';
import { hashSimState } from '../src/sim/hash.ts';
import { updateCamera, updatePlayerPhysics } from '../src/sim/physics.ts';
import { nextRandom, randInt, randPick, seedRng } from '../src/sim/prng.ts';
import { getTile, setTile } from '../src/sim/simUtils.ts';
import { generateStage, verifyStageNavigable } from '../src/sim/worldgen.ts';

function makeInput(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...overrides };
}

/**
 * Helper to create a clean empty shaft world (cols 1..9 EMPTY, cols 0 and 10 SOLID)
 * for deterministic isolated physics and collision unit tests.
 */
function makeEmptyTestState(opts?: {
  area?: AreaId;
  styleId?: 0 | 1 | 2 | 3 | 4;
  hardMode?: boolean;
  rows?: number;
  waterStartRow?: number;
}): SimState {
  const area = opts?.area ?? 1;
  const rows = opts?.rows ?? 30;
  const state = createInitialState({
    seed: 4242,
    area,
    styleId: opts?.styleId ?? 0,
    hardMode: opts?.hardMode ?? false,
  });

  const minCol = WELL_CONSTANTS.GRID_MIN_COL;
  const maxCol = WELL_CONSTANTS.GRID_MAX_COL;
  const cols = WELL_CONSTANTS.GRID_COLS;
  const tiles = new Array<TileKind>(rows * cols).fill(TILE_KIND.SOLID);

  state.world = {
    area,
    level: 1,
    minCol,
    maxCol,
    cols,
    rows,
    tiles,
    waterStartRow: opts?.waterStartRow ?? -1,
    exitRow: rows - 2,
    sideRooms: [],
    airPockets: [],
    spikeTrapTimer: 0,
    spikeTrapExtended: true,
  };

  for (let r = 0; r < rows; r++) {
    for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
      setTile(state.world, c, r, TILE_KIND.EMPTY);
    }
  }

  state.player.x = WELL_CONSTANTS.CAM_CENTER_X;
  state.player.y = 48;
  state.player.prevX = state.player.x;
  state.player.prevY = state.player.y;
  state.player.vx = 0;
  state.player.vy = 0;
  state.player.onGround = false;
  state.player.onThinPlatform = false;
  state.player.inWater = false;
  state.player.wasInWater = false;
  state.events = [];
  return state;
}

describe('PRNG & State Hash Determinism', () => {
  it('produces identical PRNG sequences and state hashes for identical seeds', () => {
    const a = { rngState: seedRng(987654) };
    const b = { rngState: seedRng(987654) };

    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 64; i++) {
      seqA.push(nextRandom(a));
      seqB.push(nextRandom(b));
    }
    expect(seqA).toEqual(seqB);
    expect(randInt(a, 1, 100)).toBe(randInt(b, 1, 100));
    expect(randPick(a, ['alpha', 'beta', 'gamma'])).toBe(randPick(b, ['alpha', 'beta', 'gamma']));

    const s1 = createInitialState({ seed: 202611, area: 1, level: 1 });
    const s2 = createInitialState({ seed: 202611, area: 1, level: 1 });
    expect(hashSimState(s1)).toBe(hashSimState(s2));

    for (let t = 0; t < 30; t++) {
      const inp = makeInput({ right: t < 15, action: t === 5, actionPressed: t === 5 });
      updatePlayerPhysics(s1, inp);
      updateCamera(s1);
      updatePlayerPhysics(s2, inp);
      updateCamera(s2);
    }
    expect(hashSimState(s1)).toBe(hashSimState(s2));
  });

  it('produces distinct state hashes for different seeds', () => {
    const s1 = createInitialState({ seed: 101, area: 1, level: 1 });
    const s2 = createInitialState({ seed: 202, area: 1, level: 1 });
    expect(hashSimState(s1)).not.toBe(hashSimState(s2));
  });
});

describe('Chunk Definitions Integrity', () => {
  it('provides at least 14 distinct 9-col Cavern chunks and valid 9-col chunks for Areas 1..5', () => {
    const cavern = getChunksForArea(1);
    expect(cavern.length).toBeGreaterThanOrEqual(14);

    // Ensure all Cavern chunks are distinct
    const serialized = new Set(cavern.map((c) => c.join('\n')));
    expect(serialized.size).toBe(cavern.length);

    for (const area of [0, 1, 2, 3, 4, 5] as AreaId[]) {
      const pool = getChunksForArea(area);
      expect(pool.length).toBeGreaterThan(0);
      for (const chunk of pool) {
        expect(chunk.length).toBeGreaterThan(0);
        for (const row of chunk) {
          expect(row.length).toBe(WELL_CONSTANTS.SHAFT_COLS);
        }
      }
    }
  });
});

describe('Collision: 2px Thin Platforms, Corner Nudge, Hazards & Raycast', () => {
  it('never tunnels through a 2px thin platform even at maxgrav vy = 7.0', () => {
    const state = makeEmptyTestState();
    // Place thin platform across row 10 (top Y = 160)
    for (let c = 1; c <= 9; c++) {
      setTile(state.world, c, 10, TILE_KIND.THIN_PLATFORM);
    }

    // Test multiple sub-pixel offsets right above the platform at full terminal velocity 7.0
    for (const offset of [0.1, 0.5, 1.0, 2.3, 4.7, 6.9]) {
      const platTop = 10 * WELL_CONSTANTS.TILE_SIZE;
      state.player.x = WELL_CONSTANTS.CAM_CENTER_X;
      state.player.y = platTop - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET - offset;
      state.player.vy = WELL_CONSTANTS.MAX_GRAV; // 7.0
      state.player.vx = 0;

      const res = moveAndCollidePlayer(state);
      expect(res.hitFloor).toBe(true);
      expect(res.landedOnThin).toBe(true);
      expect(state.player.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET).toBeCloseTo(platTop, 5);
      expect(state.player.vy).toBe(0);
    }
  });

  it('allows jumping UP freely through thin platforms and ignores them when starting below top strip', () => {
    const state = makeEmptyTestState();
    setTile(state.world, 5, 10, TILE_KIND.THIN_PLATFORM);
    const platTop = 10 * WELL_CONSTANTS.TILE_SIZE;

    // Jumping upward from below passes cleanly through
    state.player.x = 5 * 16 + 8;
    state.player.y = platTop + 6;
    state.player.vy = -4.4;
    const upRes = moveAndCollidePlayer(state);
    expect(upRes.hitCeiling).toBe(false);
    expect(upRes.hitFloor).toBe(false);
    expect(state.player.vy).toBe(-4.4);
    expect(state.player.y).toBeCloseTo(platTop + 6 - 4.4, 5);

    // Falling while feet are already below platTop + 1 does not snap upward
    state.player.y = platTop + 4 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET; // feet at platTop + 4
    state.player.vy = 2.0;
    const belowRes = moveAndCollidePlayer(state);
    expect(belowRes.hitFloor).toBe(false);
    expect(belowRes.landedOnThin).toBe(false);
  });

  it('nudges player up to 2px around ceiling tile corners when rising', () => {
    const state = makeEmptyTestState();
    // Solid ceiling block at col 4, row 5 => X in [64, 80), Y in [80, 96)
    setTile(state.world, 4, 5, TILE_KIND.SOLID);

    // Player left edge at 78.5 (overlapping col 4 by 1.5px <= 2px)
    state.player.x = 78.5 + WELL_CONSTANTS.PLAYER_HALF_W; // 82.5
    state.player.y = 96 - WELL_CONSTANTS.PLAYER_TOP_OFFSET + 0.5; // top at 96.5
    state.player.vy = -3.0;

    const res = moveAndCollidePlayer(state);
    expect(res.hitCeiling).toBe(false);
    expect(state.player.x).toBeGreaterThanOrEqual(80 + WELL_CONSTANTS.PLAYER_HALF_W - 1e-5);
    expect(state.player.vy).toBe(-3.0);
  });

  it('detects spike hazards and laser raycastDown pierces breakables down to solid wall', () => {
    const state = makeEmptyTestState();
    setTile(state.world, 5, 6, TILE_KIND.BREAKABLE);
    setTile(state.world, 5, 9, TILE_KIND.SOLID);
    setTile(state.world, 3, 7, TILE_KIND.SPIKE_UP);

    // Laser raycast pierces BREAKABLE at row 6 and hits SOLID at row 9 (y = 144)
    const ray = raycastDown(state.world, 5 * 16 + 8, 40, 284);
    expect(ray.hitCol).toBe(5);
    expect(ray.hitRow).toBe(9);
    expect(ray.hitTile).toBe(TILE_KIND.SOLID);
    expect(ray.hitY).toBe(9 * WELL_CONSTANTS.TILE_SIZE);

    // Spike overlap check
    state.player.x = 3 * 16 + 8;
    state.player.y = 7 * 16 + 8;
    const haz = checkHazardOverlap(state);
    expect(haz.hit).toBe(true);
    expect(haz.sourceX).toBe(3 * 16 + 8);
    expect(haz.sourceY).toBe(7 * 16 + 8);
  });
});

describe('Player Physics: Speeds, Water Entry, Float Style, Heart Balloon, Jump-Shoot Lock & Oxygen', () => {
  it('enforces airMaxsp (2.5) > groundMaxsp (2.0)', () => {
    const groundState = makeEmptyTestState();
    // Solid floor on row 10
    for (let c = 1; c <= 9; c++) {
      setTile(groundState.world, c, 10, TILE_KIND.SOLID);
    }
    groundState.player.x = 32;
    groundState.player.y = 10 * 16 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
    groundState.player.onGround = true;

    for (let i = 0; i < 30; i++) {
      updatePlayerPhysics(groundState, makeInput({ right: true }));
    }
    const maxGroundVx = groundState.player.vx;

    const airState = makeEmptyTestState({ rows: 60 });
    airState.player.x = 32;
    airState.player.y = 32;
    airState.player.onGround = false;

    for (let i = 0; i < 30; i++) {
      updatePlayerPhysics(airState, makeInput({ right: true }));
    }
    const maxAirVx = airState.player.vx;

    expect(maxGroundVx).toBeCloseTo(WELL_CONSTANTS.GROUND_MAX_SP, 5);
    expect(maxAirVx).toBeCloseTo(WELL_CONSTANTS.AIR_MAX_SP, 5);
    expect(maxAirVx).toBeGreaterThan(maxGroundVx);
  });

  it('clamps vy <= 0.5 immediately on Aquifer water entry and emits splash event', () => {
    const state = makeEmptyTestState({ area: 3, waterStartRow: 8 });
    // Position just above water surface (y = 128) falling fast
    state.player.y = 8 * 16 - 2;
    state.player.vy = 6.5;
    state.player.inWater = false;

    updatePlayerPhysics(state, EMPTY_INPUT);

    expect(state.player.inWater).toBe(true);
    expect(state.player.vy).toBeLessThanOrEqual(WELL_CONSTANTS.WATER_ENTRY_CLAMP);
    expect(state.events.some((e) => e.type === 'splash' && e.entering)).toBe(true);
  });

  it('applies Float style (styleId 3) lower gravity and Heart Balloon (ug 15) lower maxgrav', () => {
    const standard = makeEmptyTestState({ rows: 120, styleId: 0 });
    const floatStyle = makeEmptyTestState({ rows: 120, styleId: 3 });

    updatePlayerPhysics(standard, EMPTY_INPUT);
    updatePlayerPhysics(floatStyle, EMPTY_INPUT);

    expect(standard.player.vy).toBeCloseTo(WELL_CONSTANTS.GRAV, 6);
    expect(floatStyle.player.vy).toBeCloseTo(WELL_CONSTANTS.LEVITATE_GRAV, 6);
    expect(floatStyle.player.vy).toBeLessThan(standard.player.vy);

    // Accelerate standard vs Heart Balloon to terminal velocity
    const balloon = makeEmptyTestState({ rows: 120, styleId: 0 });
    balloon.upgrades.push(15);
    balloon.player.balloon.active = true;

    for (let i = 0; i < 60; i++) {
      updatePlayerPhysics(standard, EMPTY_INPUT);
      updatePlayerPhysics(balloon, EMPTY_INPUT);
    }

    expect(standard.player.vy).toBeCloseTo(WELL_CONSTANTS.MAX_GRAV, 5);
    expect(balloon.player.vy).toBeCloseTo(
      WELL_CONSTANTS.MAX_GRAV + WELL_CONSTANTS.HEART_BALLOON_MAX_GRAV_DELTA,
      5,
    );
    expect(balloon.player.vy).toBe(6.0);
  });

  it('enforces Jump-Shoot Lock on jump frame and releases only after action release', () => {
    const state = makeEmptyTestState();
    for (let c = 1; c <= 9; c++) {
      setTile(state.world, c, 10, TILE_KIND.SOLID);
    }
    state.player.y = 10 * 16 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
    state.player.onGround = true;

    // Frame 1: press action to jump
    updatePlayerPhysics(state, makeInput({ action: true, actionPressed: true }));
    expect(state.player.onGround).toBe(false);
    expect(state.player.jumpShootLock).toBe(true);
    expect(state.events.some((e) => e.type === 'jump')).toBe(true);

    // Frame 2: continue holding action -> still locked so gunboots never waste ammo
    updatePlayerPhysics(state, makeInput({ action: true }));
    expect(state.player.jumpShootLock).toBe(true);

    // Frame 3: release action -> clears jumpShootLock and applies variable jump cut
    const vyBeforeCut = state.player.vy;
    expect(vyBeforeCut).toBeLessThan(0);
    updatePlayerPhysics(state, makeInput({ action: false, actionReleased: true }));
    expect(state.player.jumpShootLock).toBe(false);
    expect(state.player.vy).toBeCloseTo(vyBeforeCut * WELL_CONSTANTS.JUMP_CUT_MULT + WELL_CONSTANTS.GRAV, 5);
  });

  it('depletes Aquifer oxygen 1 every 13t on Normal and 1 every 7t on Hard, warning at <= 25', () => {
    const normal = makeEmptyTestState({ area: 3, hardMode: false, waterStartRow: 2, rows: 120 });
    const hard = makeEmptyTestState({ area: 3, hardMode: true, waterStartRow: 2, rows: 120 });

    // Place both submerged on a solid shelf so they stay underwater cleanly
    for (let c = 1; c <= 9; c++) {
      setTile(normal.world, c, 10, TILE_KIND.SOLID);
      setTile(hard.world, c, 10, TILE_KIND.SOLID);
    }
    normal.player.y = 10 * 16 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
    normal.player.inWater = true;
    hard.player.y = 10 * 16 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
    hard.player.inWater = true;

    // After 13 * 7 = 91 ticks: Normal loses 7 oxygen, Hard loses 13 oxygen
    for (let t = 0; t < 91; t++) {
      updatePlayerPhysics(normal, EMPTY_INPUT);
      updatePlayerPhysics(hard, EMPTY_INPUT);
    }

    expect(normal.player.oxygen).toBe(100 - 7);
    expect(hard.player.oxygen).toBe(100 - 13);

    // Test oxygen_warn emitted at <= 25 and suffocation damage at 0
    normal.player.oxygen = 26;
    normal.player.oxygenTick = 0;
    normal.events = [];
    for (let t = 0; t < WELL_CONSTANTS.OXYGEN_TICK_NORMAL; t++) {
      updatePlayerPhysics(normal, EMPTY_INPUT);
    }
    expect(normal.player.oxygen).toBe(25);
    expect(normal.events.some((e) => e.type === 'oxygen_warn' && e.oxygen === 25)).toBe(true);

    const hpBefore = normal.player.hp;
    normal.player.oxygen = 0;
    normal.player.suffocateTick = 0;
    for (let t = 0; t < WELL_CONSTANTS.OXYGEN_SUFFOCATE_INTERVAL; t++) {
      updatePlayerPhysics(normal, EMPTY_INPUT);
    }
    expect(normal.player.hp).toBe(hpBefore - 1);
  });

  it('tracks camera daop (+24 well / -32 surface), side room lock, and shake decay', () => {
    const state = makeEmptyTestState({ rows: 80 });
    state.player.y = 400;
    state.camera.y = 400;
    state.camera.shakeMag = 4;
    state.camera.shakeTicks = 5;

    updateCamera(state);
    expect(state.camera.targetY).toBe(400 + WELL_CONSTANTS.CAM_DAOP_WELL);
    expect(state.camera.y).toBeCloseTo(400 + WELL_CONSTANTS.CAM_DAOP_WELL / WELL_CONSTANTS.CAM_Y_SLOWDOWN, 5);
    expect(state.camera.shakeTicks).toBe(4);
    expect(state.camera.shakeMag).toBeLessThan(4);

    // Side room camera lock overrides shaft clamping
    state.camera.sideRoomLocked = true;
    state.camera.sideRoomX = -48;
    state.camera.sideRoomY = 300;
    updateCamera(state);
    expect(state.camera.targetX).toBe(-48);
    expect(state.camera.targetY).toBe(300);
  });

  it('handles landing recharge/combo/stats once per landing, wall-kick, Limbo maxgrav 6.0, and 8-frame afterimages', () => {
    const state = makeEmptyTestState({ area: 4, rows: 120 });
    // Limbo terminal velocity should cap at 6.0 and record up to 8 afterimages while vy >= 4.5
    for (let i = 0; i < 45; i++) {
      updatePlayerPhysics(state, EMPTY_INPUT);
    }
    expect(state.player.vy).toBeCloseTo(WELL_CONSTANTS.LIMBO_MAX_GRAV, 5);
    expect(state.player.afterimages.length).toBe(WELL_CONSTANTS.AFTERIMAGE_COUNT);

    // Wall-kick off left shaft wall (col 0 ends at x=16, player flush at x=20)
    state.player.x = 16 + WELL_CONSTANTS.PLAYER_HALF_W;
    state.player.y = 120;
    state.player.vx = 0;
    state.player.vy = 1.0;
    state.player.onGround = false;
    state.player.coyoteTicks = 0;
    state.events = [];
    updatePlayerPhysics(state, makeInput({ left: true, action: true, actionPressed: true }));
    expect(state.player.vx).toBeGreaterThan(0);
    expect(state.player.vy).toBeLessThan(0);
    expect(state.player.wallKickTicks).toBe(WELL_CONSTANTS.WALL_KICK_LENGTH);
    expect(state.player.jumpShootLock).toBe(true);
    expect(state.events.some((e) => e.type === 'wall_kick' && e.dir === 1)).toBe(true);

    // Landing transition recharges gunboots, completes combo, and increments landings exactly once
    for (let c = 1; c <= 9; c++) {
      setTile(state.world, c, 20, TILE_KIND.SOLID);
    }
    state.player.x = WELL_CONSTANTS.CAM_CENTER_X;
    state.player.y = 20 * 16 - WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET - 1;
    state.player.vx = 0;
    state.player.vy = 2.0;
    state.player.onGround = false;
    state.player.ammo = 2;
    state.combo = 9;
    state.runStats.stageLandings = 0;
    state.runStats.areaLandings = 0;
    state.events = [];

    updatePlayerPhysics(state, EMPTY_INPUT);
    expect(state.player.onGround).toBe(true);
    expect(state.player.ammo).toBe(state.player.ammoMax);
    expect(state.combo).toBe(0);
    expect(state.gems).toBe(WELL_CONSTANTS.COMBO_GEM_REWARD);
    expect(state.runStats.stageLandings).toBe(1);
    expect(state.runStats.areaLandings).toBe(1);
    expect(state.events.some((e) => e.type === 'land' && e.combo === 9)).toBe(true);

    // Staying grounded on next tick must NOT increment landings again
    updatePlayerPhysics(state, EMPTY_INPUT);
    expect(state.runStats.stageLandings).toBe(1);
    expect(state.runStats.areaLandings).toBe(1);
  });
});

describe('Worldgen Navigability & Side Room Guarantees (60 Seeds Across Areas 1..5)', () => {
  it('verifies 60 deterministic seeds across Areas 1..5 all pass verifyStageNavigable', () => {
    const state = createInitialState({ seed: 1, area: 1, level: 1 });
    let checked = 0;

    for (const area of [1, 2, 3, 4, 5] as AreaId[]) {
      for (let i = 0; i < 12; i++) {
        const seed = area * 10000 + i * 137 + 7;
        const level = area === 5 ? 1 : ((i % 3) + 1);
        startNewRun(state, { seed, area, level });

        expect(verifyStageNavigable(state.world)).toBe(true);
        // Verify border walls at col 0 and col 10 outside side room doorways
        expect(getTile(state.world, WELL_CONSTANTS.SHAFT_LEFT_WALL_COL, 0)).toBe(TILE_KIND.SOLID);
        expect(getTile(state.world, WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL, 0)).toBe(TILE_KIND.SOLID);

        if (area >= 1 && area <= 4) {
          expect(state.world.sideRooms.length).toBeGreaterThanOrEqual(2);
          expect(state.world.sideRooms.length).toBeLessThanOrEqual(3);
        }
        if (area === 3) {
          expect(state.world.waterStartRow).toBeGreaterThanOrEqual(0);
        } else {
          expect(state.world.waterStartRow).toBe(-1);
        }

        checked += 1;
      }
    }

    expect(checked).toBe(60);
  });

  it('detects a fully blocked solid wall with verifyStageNavigable=false and honors Member Card shop guarantee', () => {
    const state = makeEmptyTestState({ rows: 20 });
    expect(verifyStageNavigable(state.world)).toBe(true);

    // Wall off full interior shaft on row 10
    for (let c = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL; c <= WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL; c++) {
      setTile(state.world, c, 10, TILE_KIND.SOLID);
    }
    expect(verifyStageNavigable(state.world)).toBe(false);

    // Member's Card (ug 14) guarantees first side room near top is a shop
    startNewRun(state, { seed: 555, area: 1, level: 1, styleId: 1 });
    state.upgrades.push(14);
    buildStageIntoState(state, 1, 2);
    expect(state.world.sideRooms.length).toBeGreaterThanOrEqual(2);
    expect(state.world.sideRooms[0]?.kind).toBe('shop');

    // Also verify generateStage direct invocation returns spawns and sideRooms cleanly
    const res = generateStage(state, 2, 1);
    expect(res.sideRooms.length).toBeGreaterThanOrEqual(2);
    expect(res.enemySpawns.length).toBeGreaterThan(0);
    expect(verifyStageNavigable(state.world)).toBe(true);
  });
});
