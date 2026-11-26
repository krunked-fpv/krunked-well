/**
 * Gate B — Krunked Well Headless Simulation, Navigability & Determinism Verifier
 *
 * Executed via `npm run verify:sim`. Exits 0 on PASS, non-zero on ANY failure.
 *
 * Audits:
 *   1) Chunk Library Integrity & 120-Seed Multi-Biome BFS Navigability Audit
 *      (Areas 1..5, Normal & Hard Mode, Styles 0..4, side rooms, zero OOB entities)
 *   2) Full 5-Biome + 5-Style + Normal/Hard Autonomous Soak (pure `stepSim`)
 *      - Full campaign tour: Cavern 1-1..1-3, Catacomb 2-1..2-3, Aquifer 3-1..3-3,
 *        Limbo 4-1..4-3, Abyss 5-1 Final Boss -> all 4 phases -> `mode === 'victory'`
 *      - All 5 Play Styles (0..4) + Normal & Hard Mode soak
 *      - Dedicated high-speed 2px thin-platform zero-tunneling probe
 *      - Per-tick finite kinematics, border-wall containment, zero wall-stick softlocks
 *   3) Bit-for-Bit FNV-1a Replay Determinism
 *      - 3 distinct seeds x 900 ticks with rich scripted input tape (left, right,
 *        jumps, midair gunboot fire, pauses/restarts) run TWICE from scratch,
 *        asserting `hashSimState(runA) === hashSimState(runB)` at ticks 100, 300, 600, 900.
 */

import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AreaId,
  type InputFrame,
  type SideRoomState,
  type SimState,
  type StyleId,
  type TileKind,
  type UpgradeId,
  type WorldState,
} from '../../src/contracts/index.ts';
import {
  ABYSS_CHUNKS,
  AQUIFER_CHUNKS,
  CATACOMB_CHUNKS,
  CAVERN_CHUNKS,
  LIMBO_CHUNKS,
  SURFACE_CHUNKS,
} from '../../src/data/chunks.ts';
import { getStyleDef } from '../../src/data/styles.ts';
import { getWeaponDef } from '../../src/data/weapons.ts';
import {
  createInitialState,
  EMPTY_INPUT,
  startNewRun,
} from '../../src/sim/createState.ts';
import { hashSimState } from '../../src/sim/hash.ts';
import {
  colToX,
  getTile,
  isBreakableTile,
  isHazardTile,
  isSolidTile,
  isThinPlatform,
  rowToY,
  setTile,
  xToCol,
  yToRow,
} from '../../src/sim/simUtils.ts';
import { stepSim } from '../../src/sim/step.ts';
import { verifyStageNavigable } from '../../src/sim/worldgen.ts';

const TS = WELL_CONSTANTS.TILE_SIZE;
const MIN_INTERIOR = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL;
const MAX_INTERIOR = WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL;
const SHAFT_MIN_X = colToX(MIN_INTERIOR);
const SHAFT_MAX_X = colToX(MAX_INTERIOR + 1);

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`GATE B FAILURE: ${message}`);
  }
}

function makeInput(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...overrides };
}

function isPassableForBfs(tile: TileKind): boolean {
  return (
    tile === TILE_KIND.EMPTY ||
    tile === TILE_KIND.THIN_PLATFORM ||
    tile === TILE_KIND.BREAKABLE ||
    tile === TILE_KIND.BUBBLE_BLOCK ||
    tile === TILE_KIND.GHOST_WALL ||
    tile === TILE_KIND.STAGE_EXIT
  );
}

/**
 * Verifies a carved side room has valid bounds, open 2-tile doorway & shaft entry,
 * solid floor/ceiling, hollow interior, and bidirectional reachability from the shaft.
 */
function auditSideRoom(world: WorldState, room: SideRoomState, label: string): void {
  const isLeft = room.side === 'left';
  const doorCol = isLeft
    ? WELL_CONSTANTS.SHAFT_LEFT_WALL_COL
    : WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL;
  const shaftAdjCol = isLeft ? MIN_INTERIOR : MAX_INTERIOR;
  const floorRow = room.doorRow + 1;
  const ceilRow = room.minRow - 1;

  assert(
    room.minCol >= world.minCol && room.maxCol <= world.maxCol,
    `${label}: side room #${room.id} columns [${room.minCol}..${room.maxCol}] out of grid bounds`,
  );
  assert(
    room.minRow >= 1 && floorRow < world.rows,
    `${label}: side room #${room.id} rows [${room.minRow}..${floorRow}] out of world bounds`,
  );

  // 2-tile-tall doorway & adjacent shaft entry must be EMPTY
  assert(
    getTile(world, doorCol, room.doorRow) === TILE_KIND.EMPTY &&
      getTile(world, doorCol, room.doorRow - 1) === TILE_KIND.EMPTY,
    `${label}: side room #${room.id} doorway blocked at col=${doorCol} row=${room.doorRow}`,
  );
  assert(
    getTile(world, shaftAdjCol, room.doorRow) === TILE_KIND.EMPTY &&
      getTile(world, shaftAdjCol, room.doorRow - 1) === TILE_KIND.EMPTY,
    `${label}: side room #${room.id} shaft entry blocked at col=${shaftAdjCol} row=${room.doorRow}`,
  );

  // Floor across room and doorway must be solid SHOP_FLOOR (no falling into void)
  assert(
    getTile(world, doorCol, floorRow) === TILE_KIND.SHOP_FLOOR,
    `${label}: side room #${room.id} missing floor under doorway`,
  );
  for (let col = room.minCol; col <= room.maxCol; col++) {
    assert(
      getTile(world, col, floorRow) === TILE_KIND.SHOP_FLOOR,
      `${label}: side room #${room.id} missing floor at col=${col}`,
    );
    assert(
      getTile(world, col, ceilRow) === TILE_KIND.SOLID,
      `${label}: side room #${room.id} missing ceiling at col=${col}`,
    );
    for (let row = room.minRow; row <= room.maxRow; row++) {
      assert(
        getTile(world, col, row) === TILE_KIND.EMPTY,
        `${label}: side room #${room.id} interior tile obstructed at (${col},${row})`,
      );
    }
  }

  // BFS reachability from shaft top (row 0) to side-room interior & back out (zero trapped alcoves)
  const cols = world.cols;
  const rows = world.rows;
  const visited = new Uint8Array(cols * rows);
  const qCols: number[] = [];
  const qRows: number[] = [];

  for (let col = MIN_INTERIOR; col <= MAX_INTERIOR; col++) {
    if (isPassableForBfs(getTile(world, col, 0))) {
      const idx = col - world.minCol;
      visited[idx] = 1;
      qCols.push(col);
      qRows.push(0);
    }
  }

  const targetCol = Math.floor(room.centerX / TS);
  const targetRow = room.doorRow;
  let reachedRoom = false;

  let head = 0;
  while (head < qCols.length) {
    const c = qCols[head]!;
    const r = qRows[head]!;
    head += 1;

    if (c === targetCol && r === targetRow) {
      reachedRoom = true;
      break;
    }

    const dirs: readonly (readonly [number, number])[] = [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
    ];
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < world.minCol || nc > world.maxCol || nr < 0 || nr >= rows) continue;
      const idx = nr * cols + (nc - world.minCol);
      if (visited[idx]) continue;
      if (!isPassableForBfs(getTile(world, nc, nr))) continue;
      visited[idx] = 1;
      qCols.push(nc);
      qRows.push(nr);
    }
  }

  assert(
    reachedRoom,
    `${label}: side room #${room.id} (${room.kind}, ${room.side} doorRow=${room.doorRow}) is unreachable/trapped from shaft`,
  );
}

// ============================================================================
// Suite 1: Chunk Library & 120-Seed Multi-Biome BFS Navigability Audit
// ============================================================================

function runSuite1NavigabilityAudit(): {
  seedsAudited: number;
  sideRoomsAudited: number;
  entitiesAudited: number;
  chunkCounts: Record<string, number>;
} {
  // 1a. Chunk library counts, 9-column width, and distinctness
  const chunkPools: Array<{ name: string; chunks: readonly string[][]; minCount: number }> = [
    { name: 'SURFACE', chunks: SURFACE_CHUNKS, minCount: 1 },
    { name: 'CAVERN', chunks: CAVERN_CHUNKS, minCount: 16 },
    { name: 'CATACOMB', chunks: CATACOMB_CHUNKS, minCount: 12 },
    { name: 'AQUIFER', chunks: AQUIFER_CHUNKS, minCount: 12 },
    { name: 'LIMBO', chunks: LIMBO_CHUNKS, minCount: 12 },
    { name: 'ABYSS', chunks: ABYSS_CHUNKS, minCount: 4 },
  ];

  const validLegend = new Set(['.', '#', 'B', '-', '^', 'v', '<', '>', 'O', 'G', 'T', 'E', 'A']);
  const chunkCounts: Record<string, number> = {};

  for (const pool of chunkPools) {
    chunkCounts[pool.name] = pool.chunks.length;
    assert(
      pool.chunks.length >= pool.minCount,
      `${pool.name}_CHUNKS has ${pool.chunks.length} chunks, expected >= ${pool.minCount}`,
    );
    const seen = new Set<string>();
    pool.chunks.forEach((chunk, idx) => {
      assert(chunk.length > 0, `${pool.name}_CHUNKS[${idx}] is empty`);
      const key = chunk.join('\n');
      assert(!seen.has(key), `${pool.name}_CHUNKS[${idx}] is a duplicate chunk`);
      seen.add(key);

      chunk.forEach((row, rIdx) => {
        assert(
          row.length === WELL_CONSTANTS.SHAFT_COLS,
          `${pool.name}_CHUNKS[${idx}] row ${rIdx} width=${row.length}, expected ${WELL_CONSTANTS.SHAFT_COLS}`,
        );
        for (const ch of row) {
          assert(
            validLegend.has(ch),
            `${pool.name}_CHUNKS[${idx}] row ${rIdx} contains invalid tile char '${ch}'`,
          );
        }
      });

      // Every single chunk row must have at least one descending opening (not blocked by SOLID + THIN + spikes)
      if (pool.name !== 'SURFACE') {
        chunk.forEach((row, rIdx) => {
          const hasDescendingCell = [...row].some(
            (ch) => ch === '.' || ch === 'E' || ch === 'A' || ch === 'B' || ch === 'O' || ch === 'G',
          );
          assert(
            hasDescendingCell,
            `${pool.name}_CHUNKS[${idx}] row ${rIdx} ('${row}') has no descending opening`,
          );
        });
      }
    });
  }

  // 1b. 120-Seed Multi-Biome Audit: 5 areas * 24 seeds = 120 stages across Normal/Hard & Styles 0..4
  const state = createInitialState({ seed: 1, area: 1, level: 1 });
  let seedsAudited = 0;
  let sideRoomsAudited = 0;
  let entitiesAudited = 0;

  for (const area of [1, 2, 3, 4, 5] as AreaId[]) {
    for (let i = 0; i < 24; i++) {
      const seed = area * 100000 + i * 7919 + 17;
      const level = area === 5 ? 1 : ((i % 3) + 1);
      const hardMode = i % 2 === 1;
      const styleId = (i % 5) as StyleId;
      const label = `Area ${area}-${level} seed=${seed} style=${styleId} hard=${hardMode}`;

      startNewRun(state, { seed, area, level, hardMode, styleId });
      const world = state.world;

      // Navigability
      assert(verifyStageNavigable(world) === true, `${label}: verifyStageNavigable returned false`);

      // Biome invariants
      if (area === 3) {
        assert(world.waterStartRow >= 0, `${label}: Aquifer missing waterStartRow`);
        assert(world.airPockets.length > 0, `${label}: Aquifer generated 0 air pockets`);
      } else {
        assert(world.waterStartRow === -1, `${label}: Non-Aquifer area has waterStartRow=${world.waterStartRow}`);
      }

      // Side room invariants
      const expectedMinRooms = 2;
      const expectedMaxRooms = area === 5 ? 2 : 3;
      assert(
        world.sideRooms.length >= expectedMinRooms && world.sideRooms.length <= expectedMaxRooms,
        `${label}: sideRooms.length=${world.sideRooms.length}, expected [${expectedMinRooms}..${expectedMaxRooms}]`,
      );
      for (const room of world.sideRooms) {
        auditSideRoom(world, room, label);
        sideRoomsAudited += 1;
      }

      // Player spawn in bounds & non-solid
      assert(
        Number.isFinite(state.player.x) &&
          Number.isFinite(state.player.y) &&
          state.player.x >= SHAFT_MIN_X + WELL_CONSTANTS.PLAYER_HALF_W &&
          state.player.x <= SHAFT_MAX_X - WELL_CONSTANTS.PLAYER_HALF_W &&
          state.player.y >= 0 &&
          state.player.y < world.rows * TS,
        `${label}: player spawn out of bounds (${state.player.x}, ${state.player.y})`,
      );
      assert(
        !isSolidTile(getTile(world, xToCol(state.player.x), yToRow(state.player.y)), world),
        `${label}: player spawned inside a solid tile`,
      );

      // Zero out-of-bounds entities (enemies, pickups, air pockets)
      const worldMinX = colToX(world.minCol);
      const worldMaxX = colToX(world.maxCol + 1);
      const worldMaxY = world.rows * TS;

      for (const e of state.enemies) {
        assert(
          Number.isFinite(e.x) &&
            Number.isFinite(e.y) &&
            e.x >= SHAFT_MIN_X &&
            e.x <= SHAFT_MAX_X &&
            e.y >= 0 &&
            e.y < worldMaxY,
          `${label}: enemy ${e.kind}#${e.id} out of shaft bounds (${e.x}, ${e.y})`,
        );
        assert(
          !isSolidTile(getTile(world, xToCol(e.x), yToRow(e.y)), world),
          `${label}: enemy ${e.kind}#${e.id} spawned inside solid tile at (${e.x}, ${e.y})`,
        );
        entitiesAudited += 1;
      }

      for (const pk of state.pickups) {
        assert(
          Number.isFinite(pk.x) &&
            Number.isFinite(pk.y) &&
            pk.x >= worldMinX &&
            pk.x <= worldMaxX &&
            pk.y >= 0 &&
            pk.y < worldMaxY,
          `${label}: pickup ${pk.kind}#${pk.id} out of world bounds (${pk.x}, ${pk.y})`,
        );
        if (pk.sideRoomId !== undefined) {
          const room = world.sideRooms.find((r) => r.id === pk.sideRoomId);
          assert(room !== undefined, `${label}: pickup #${pk.id} references missing side room #${pk.sideRoomId}`);
          if (room) {
            assert(
              pk.x >= colToX(room.minCol) &&
                pk.x <= colToX(room.maxCol + 1) &&
                pk.y >= rowToY(room.minRow) &&
                pk.y <= rowToY(room.maxRow + 1),
              `${label}: pickup #${pk.id} outside its side room bounds`,
            );
          }
        }
        entitiesAudited += 1;
      }

      for (const ap of world.airPockets) {
        assert(
          Number.isFinite(ap.x) &&
            Number.isFinite(ap.y) &&
            ap.x >= SHAFT_MIN_X &&
            ap.x <= SHAFT_MAX_X &&
            ap.y >= 0 &&
            ap.y < worldMaxY,
          `${label}: airPocket #${ap.id} out of shaft bounds (${ap.x}, ${ap.y})`,
        );
        entitiesAudited += 1;
      }

      seedsAudited += 1;
    }
  }

  return { seedsAudited, sideRoomsAudited, entitiesAudited, chunkCounts };
}

// ============================================================================
// Per-Tick Physics / Boundary Invariant Checker
// ============================================================================

function isInSideRoomDoorway(world: WorldState, y: number): boolean {
  const pTopRow = yToRow(y + WELL_CONSTANTS.PLAYER_TOP_OFFSET);
  const pBotRow = yToRow(y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET - 0.01);
  for (const room of world.sideRooms) {
    if (pBotRow >= room.doorRow - 1 && pTopRow <= room.doorRow) {
      return true;
    }
  }
  return false;
}

function assertTickInvariants(state: SimState, context: string): void {
  const p = state.player;
  const world = state.world;

  // 1. Finite kinematics on player, camera, entities, boss
  assert(
    Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Number.isFinite(p.vx) &&
      Number.isFinite(p.vy),
    `${context} tick=${state.tick}: non-finite player kinematics (${p.x},${p.y},${p.vx},${p.vy})`,
  );
  assert(
    Number.isFinite(state.camera.x) && Number.isFinite(state.camera.y),
    `${context} tick=${state.tick}: non-finite camera (${state.camera.x},${state.camera.y})`,
  );

  for (const e of state.enemies) {
    assert(
      Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.vx) && Number.isFinite(e.vy),
      `${context} tick=${state.tick}: non-finite enemy ${e.kind}#${e.id}`,
    );
  }
  for (const b of state.bullets) {
    assert(
      Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy),
      `${context} tick=${state.tick}: non-finite bullet #${b.id}`,
    );
  }
  for (const eb of state.enemyBullets) {
    assert(
      Number.isFinite(eb.x) && Number.isFinite(eb.y),
      `${context} tick=${state.tick}: non-finite enemyBullet #${eb.id}`,
    );
  }
  if (state.boss) {
    assert(
      Number.isFinite(state.boss.x) && Number.isFinite(state.boss.y) && Number.isFinite(state.boss.hp),
      `${context} tick=${state.tick}: non-finite boss state`,
    );
  }

  // 2. Zero tunneling outside solid shaft border walls (when not in a side room or doorway)
  const worldMinX = colToX(world.minCol);
  const worldMaxX = colToX(world.maxCol + 1);
  assert(
    p.x >= worldMinX && p.x <= worldMaxX,
    `${context} tick=${state.tick}: player tunneled outside grid X bounds (${p.x})`,
  );
  assert(
    p.y >= -32 && p.y <= world.rows * TS + 32,
    `${context} tick=${state.tick}: player tunneled outside grid Y bounds (${p.y})`,
  );

  if (!state.inSideRoom && !isInSideRoomDoorway(world, p.y)) {
    assert(
      p.x - WELL_CONSTANTS.PLAYER_HALF_W >= SHAFT_MIN_X - 1e-3 &&
        p.x + WELL_CONSTANTS.PLAYER_HALF_W <= SHAFT_MAX_X + 1e-3,
      `${context} tick=${state.tick}: player tunneled outside shaft border walls! x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}`,
    );
  }

  // 3. Limbo terminal velocity cap check (maxgrav = 6.0)
  if (state.area === 4 && state.mode === 'playing') {
    assert(
      p.vy <= WELL_CONSTANTS.LIMBO_MAX_GRAV + 1e-5,
      `${context} tick=${state.tick}: Limbo vy=${p.vy} exceeded LIMBO_MAX_GRAV=${WELL_CONSTANTS.LIMBO_MAX_GRAV}`,
    );
  }
}

// ============================================================================
// Autonomous AI Bot Controller (Pure Read-Only State -> InputFrame)
// ============================================================================

const PREFERRED_UPGRADES: readonly UpgradeId[] = [
  13, // Apple (+4 HP / Max HP)
  6,  // Youth (+1 HP, +1 choice)
  15, // Heart Balloon (decoy + slower fall)
  7,  // Candle (longer invuln)
  22, // Safety Jetpack
  9,  // Drone (extra DPS)
  12, // Laser Sight (+50% range)
  11, // Knife & Fork
  10, // Gem Attractor
  0,  // Blast Module
];

interface BotMemory {
  prevAction: boolean;
  lastProgressTick: number;
  bestRow: number;
  lastStageKey: string;
  upgradeToggle: boolean;
  unstuckTicks: number;
  unstuckDir: -1 | 1;
  bossClimbing: boolean;
}

function createBotMemory(): BotMemory {
  return {
    prevAction: false,
    lastProgressTick: 0,
    bestRow: 0,
    lastStageKey: '',
    upgradeToggle: false,
    unstuckTicks: 0,
    unstuckDir: 1,
    bossClimbing: false,
  };
}

interface NextStepPlan {
  targetCol: number;
  targetRow: number;
  needBreakBelow: boolean;
  needJumpUp: boolean;
  waitingGhostBelow: boolean;
}

/**
 * Local weighted Dijkstra over the 9-col shaft interior modeling exact physics:
 * - Cannot drop straight through THIN_PLATFORM (must step horizontally off edge).
 * - Can drop through EMPTY, STAGE_EXIT, or breakable/ghost tiles (cost-weighted).
 * - Can jump UP through EMPTY / THIN_PLATFORM to exit shallow pockets.
 * - Strongly avoids static spikes and active spike traps.
 */
function planDescentStep(
  state: SimState,
  goalCol: number | null,
  goalRow: number,
  ignoreEnemyCost = false,
): NextStepPlan {
  const world = state.world;
  const p = state.player;
  const startCol = Math.max(MIN_INTERIOR, Math.min(MAX_INTERIOR, xToCol(p.x)));
  const startRow = Math.max(0, Math.min(world.rows - 1, yToRow(p.y)));

  const minR = Math.max(0, startRow - 6);
  const horizonRow =
    goalCol !== null
      ? Math.min(world.rows - 1, Math.max(goalRow + 2, startRow + 16))
      : Math.min(world.exitRow, startRow + 18);
  const maxR = Math.max(startRow, horizonRow);
  const rowSpan = maxR - minR + 1;
  const colSpan = WELL_CONSTANTS.SHAFT_COLS; // 9
  const total = rowSpan * colSpan;

  const dist = new Float64Array(total).fill(1e9);
  const parent = new Int32Array(total).fill(-1);
  const settled = new Uint8Array(total);

  const toIdx = (c: number, r: number) => (r - minR) * colSpan + (c - MIN_INTERIOR);
  const startIdx = toIdx(startCol, startRow);
  dist[startIdx] = 0;

  let bestGoalIdx = -1;
  let bestGoalScore = 1e9;

  for (let iter = 0; iter < total; iter++) {
    let u = -1;
    let bestD = 1e9;
    for (let i = 0; i < total; i++) {
      if (!settled[i] && dist[i]! < bestD) {
        bestD = dist[i]!;
        u = i;
      }
    }
    if (u === -1 || bestD >= 1e8) break;
    settled[u] = 1;

    const uc = MIN_INTERIOR + (u % colSpan);
    const ur = minR + Math.floor(u / colSpan);

    const reachedGoal =
      goalCol !== null
        ? uc === goalCol && ur === goalRow
        : ur >= Math.min(goalRow, maxR);
    if (reachedGoal && bestD < bestGoalScore) {
      bestGoalScore = bestD;
      bestGoalIdx = u;
      if (goalCol !== null) break;
    }

    const neighbors: Array<{ nc: number; nr: number; moveType: 'down' | 'side' | 'up' }> = [
      { nc: uc, nr: ur + 1, moveType: 'down' },
      { nc: uc - 1, nr: ur, moveType: 'side' },
      { nc: uc + 1, nr: ur, moveType: 'side' },
      { nc: uc, nr: ur - 1, moveType: 'up' },
    ];

    for (const { nc, nr, moveType } of neighbors) {
      if (nc < MIN_INTERIOR || nc > MAX_INTERIOR || nr < minR || nr > maxR) continue;
      const v = toIdx(nc, nr);
      if (settled[v]) continue;

      const tile = getTile(world, nc, nr);
      let stepCost = 1;

      if (tile === TILE_KIND.SOLID || tile === TILE_KIND.SHOP_FLOOR) {
        continue;
      }

      if (moveType === 'down') {
        if (tile === TILE_KIND.THIN_PLATFORM) {
          // Cannot fall straight through thin platform; must walk off horizontally
          continue;
        }
        if (isBreakableTile(tile)) {
          stepCost = 6;
        } else if (tile === TILE_KIND.GHOST_WALL) {
          stepCost = isSolidTile(tile, world) ? 5 : 1;
        } else if (tile === TILE_KIND.SPIKE_TRAP) {
          stepCost = world.spikeTrapExtended ? 55 : 22;
        } else if (isHazardTile(tile, world)) {
          stepCost = 60;
        } else {
          stepCost = 1;
        }
      } else if (moveType === 'side') {
        if (isBreakableTile(tile)) {
          continue;
        }
        if (tile === TILE_KIND.GHOST_WALL && isSolidTile(tile, world)) {
          stepCost = 14;
        } else if (tile === TILE_KIND.SPIKE_TRAP) {
          stepCost = world.spikeTrapExtended ? 55 : 22;
        } else if (isHazardTile(tile, world)) {
          stepCost = 60;
        } else {
          stepCost = 1.4;
        }
      } else {
        // moveType === 'up' (jump up; passes freely through THIN_PLATFORM)
        if (isBreakableTile(tile)) {
          continue;
        }
        if (tile === TILE_KIND.GHOST_WALL && isSolidTile(tile, world)) {
          continue;
        }
        if (tile === TILE_KIND.SPIKE_TRAP) {
          stepCost = world.spikeTrapExtended ? 60 : 25;
        } else if (isHazardTile(tile, world)) {
          stepCost = 70;
        } else {
          stepCost = 4;
        }
      }

      // Mild danger penalty for enemy occupancy (disabled during stall recovery to prevent left/right route oscillation)
      if (!ignoreEnemyCost) {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const ec = xToCol(e.x);
          const er = yToRow(e.y);
          if (ec === nc && er === nr) {
            stepCost += e.stompable ? (moveType === 'down' ? 2 : 6) : 10;
          }
        }
      }

      // Small proximity penalty next to static spikes to keep descent lanes clean
      if (
        isHazardTile(getTile(world, nc - 1, nr), world) ||
        isHazardTile(getTile(world, nc + 1, nr), world)
      ) {
        stepCost += 4;
      }

      const nd = bestD + stepCost;
      if (nd < dist[v]!) {
        dist[v] = nd;
        parent[v] = u;
      }
    }
  }

  // Fallback if exact target unreachable: pick deepest settled cell
  if (bestGoalIdx === -1) {
    let deepestRow = -1;
    let bestFallbackCost = 1e9;
    for (let i = 0; i < total; i++) {
      if (!settled[i]) continue;
      const r = minR + Math.floor(i / colSpan);
      if (r > deepestRow || (r === deepestRow && dist[i]! < bestFallbackCost)) {
        deepestRow = r;
        bestFallbackCost = dist[i]!;
        bestGoalIdx = i;
      }
    }
  }

  // Reconstruct full path from startIdx to bestGoalIdx so we can look 1..3 steps ahead
  const pathIndices: number[] = [];
  let cur = bestGoalIdx;
  while (cur !== -1 && cur !== startIdx) {
    pathIndices.push(cur);
    cur = parent[cur]!;
  }
  pathIndices.reverse();

  const firstIdx = pathIndices[0] ?? -1;
  const firstCol = firstIdx !== -1 ? MIN_INTERIOR + (firstIdx % colSpan) : startCol;
  const firstRow = firstIdx !== -1 ? minR + Math.floor(firstIdx / colSpan) : Math.min(world.rows - 1, startRow + 1);

  // Look ahead up to 2 steps ONLY while airborne and falling cleanly (never while grounded on a ledge edge!)
  let targetCol = firstCol;
  const targetRow = firstRow;
  if (
    !p.onGround &&
    firstCol === startCol &&
    firstRow > startRow &&
    !isBreakableTile(getTile(world, firstCol, firstRow))
  ) {
    for (let k = 1; k < Math.min(3, pathIndices.length); k++) {
      const idx = pathIndices[k]!;
      const c = MIN_INTERIOR + (idx % colSpan);
      const r = minR + Math.floor(idx / colSpan);
      if (c !== startCol) {
        const tCur = getTile(world, c, startRow);
        const tNext = getTile(world, c, Math.min(world.rows - 1, startRow + 1));
        if (
          !isSolidTile(tCur, world) &&
          !isSolidTile(tNext, world) &&
          !isThinPlatform(tNext) &&
          !isHazardTile(tCur, world) &&
          !isHazardTile(tNext, world) &&
          !isHazardTile(getTile(world, c, r), world)
        ) {
          targetCol = c;
        }
        break;
      }
    }
  }

  const nextTile = getTile(world, firstCol, firstRow);
  const needBreakBelow =
    firstCol === startCol && firstRow > startRow && isBreakableTile(nextTile);
  const waitingGhostBelow =
    firstCol === startCol &&
    firstRow > startRow &&
    nextTile === TILE_KIND.GHOST_WALL &&
    isSolidTile(nextTile, world);
  const needJumpUp = firstRow < startRow;

  return { targetCol, targetRow, needBreakBelow, needJumpUp, waitingGhostBelow };
}

function finalizeAction(mem: BotMemory, wantAction: boolean): Pick<InputFrame, 'action' | 'actionPressed' | 'actionReleased'> {
  const actionPressed = wantAction && !mem.prevAction;
  const actionReleased = !wantAction && mem.prevAction;
  mem.prevAction = wantAction;
  return { action: wantAction, actionPressed, actionReleased };
}

function isDangerNearX(state: SimState, testX: number, testY: number): boolean {
  const col = xToCol(testX);
  const row = yToRow(testY);
  if (isHazardTile(getTile(state.world, col, row), state.world)) return true;
  if (isHazardTile(getTile(state.world, col, row + 1), state.world)) return true;
  return false;
}

function decideBossInput(state: SimState, mem: BotMemory): InputFrame {
  const p = state.player;
  const boss = state.boss;
  if (!boss || !boss.active || boss.state === 3) {
    const act = finalizeAction(mem, false);
    return makeInput({ ...act });
  }

  let left = false;
  let right = false;
  let wantAction = false;

  const weapon = getWeaponDef(p.weaponId);
  const stats = p.gunLevel === 1 ? weapon.gemHigh : weapon.normal;
  const isSemiAuto = stats.rof < 0;

  // 1. Escape side rooms if accidentally entered
  if (state.inSideRoom) {
    left = p.x > WELL_CONSTANTS.CAM_CENTER_X;
    right = p.x < WELL_CONSTANTS.CAM_CENTER_X;
    const act = finalizeAction(mem, false);
    return makeInput({ left, right, ...act });
  }

  const pRow = yToRow(p.y);
  const world = state.world;
  const maxSafeFightRow = world.rows - 14; // Keep boss (y+124) comfortably above world bottom!

  // Hysteresis for climbing back up Abyss thin perches when near bottom of chute
  if (pRow >= maxSafeFightRow) {
    mem.bossClimbing = true;
  } else if (pRow <= 22) {
    mem.bossClimbing = false;
  }

  let climbingUp = mem.bossClimbing;
  let targetX = boss.x;
  let dodging = false;

  if (climbingUp) {
    // Pick highest reachable thin platform perch within 1..3 rows above player
    let bestPerchX: number | null = null;
    let bestScore = 1e9;
    for (let r = Math.max(4, pRow - 3); r <= pRow - 1; r++) {
      for (let c = MIN_INTERIOR; c <= MAX_INTERIOR; c++) {
        if (isThinPlatform(getTile(world, c, r))) {
          const cx = colToX(c) + TS * 0.5;
          const score = Math.abs(cx - p.x) + (r - (pRow - 3)) * 12;
          if (score < bestScore) {
            bestScore = score;
            bestPerchX = cx;
          }
        }
      }
    }
    if (bestPerchX !== null) {
      targetX = bestPerchX;
    } else {
      targetX = WELL_CONSTANTS.CAM_CENTER_X;
    }
  }

  // 3. Laser telegraph / active beam dodge (highest priority!)
  if (boss.laserCharge > 0 || boss.laserActiveTicks > 0) {
    const distLaser = Math.abs(p.x - boss.laserX);
    if (distLaser < 26) {
      dodging = true;
      targetX = boss.laserX >= WELL_CONSTANTS.CAM_CENTER_X ? 34 : 142;
    }
  }

  // 4. Predictive enemy projectile dodge (look ahead 1..15 ticks)
  if (!dodging) {
    for (const eb of state.enemyBullets) {
      if (!eb.alive) continue;
      for (let dt = 1; dt <= 15; dt += 3) {
        const fx = eb.x + eb.vx * dt;
        const fy = eb.y + eb.vy * dt;
        if (Math.abs(fx - p.x) < 14 && Math.abs(fy - p.y) < 16) {
          dodging = true;
          targetX = fx >= p.x ? Math.max(26, p.x - 28) : Math.min(150, p.x + 28);
          break;
        }
      }
      if (dodging) break;
    }
  }

  // 5. Summoned enemy dodge
  if (!dodging) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const dxE = e.x - p.x;
      const dyE = e.y - p.y;
      if (Math.hypot(dxE, dyE) < 26 && (!e.stompable || dyE < 8)) {
        dodging = true;
        targetX = dxE >= 0 ? Math.max(26, p.x - 30) : Math.min(150, p.x + 30);
        break;
      }
    }
  }

  // 6. Stay aligned directly above boss.x (preferring thin perches within 22px of boss.x so shots ALWAYS hit!)
  if (!dodging && !climbingUp) {
    let perchX: number | null = null;
    let bestPerchDist = 1e9;
    for (let r = Math.max(4, pRow); r <= Math.min(maxSafeFightRow, pRow + 4); r++) {
      for (let c = MIN_INTERIOR; c <= MAX_INTERIOR; c++) {
        if (!isThinPlatform(getTile(world, c, r))) continue;
        const cx = colToX(c) + TS * 0.5;
        const dBoss = Math.abs(cx - boss.x);
        if (dBoss > 22) continue; // Only pick perches from which we can actually hit the boss eye!
        const score = dBoss + (r - pRow) * 4;
        if (score < bestPerchDist) {
          bestPerchDist = score;
          perchX = cx;
        }
      }
    }
    targetX = perchX !== null ? perchX : boss.x;
  }

  // If low HP and an Abyss HP module is right beside us (and not Shotgun), grab it!
  if (!dodging && !climbingUp && p.hp <= Math.max(2, p.hpMax - 1)) {
    for (const pk of state.pickups) {
      if (!pk.alive || pk.kind !== 'gun_module' || pk.bonusType !== 'hp') continue;
      if (pk.weaponId === 1) continue;
      if (Math.abs(pk.y - p.y) < 36) {
        targetX = pk.x;
        break;
      }
    }
  }

  targetX = Math.max(26, Math.min(150, targetX));

  const dxTarget = targetX - p.x;
  const deadzone = p.weaponId === 6 ? 6 : 3;
  if (dxTarget < -deadzone) {
    left = true;
  } else if (dxTarget > deadzone) {
    right = true;
  }

  // 7. Short-hop & gunboot fire rhythm against open boss eye (or summoned enemies below)
  const bossInOpenAir = boss.y - WELL_CONSTANTS.BOSS_EYE_H * 0.5 < world.rows * TS - 8;
  const alignedWithBoss = Math.abs(p.x - boss.x) <= 21;
  const enemyBelow = state.enemies.some(
    (e) => e.alive && Math.abs(e.x - p.x) <= 18 && e.y > p.y && e.y - p.y <= 96,
  );
  const canHitBoss = !boss.bulletImmune && boss.state === 0 && alignedWithBoss && bossInOpenAir;
  const bossEyeDist = boss.y - WELL_CONSTANTS.BOSS_EYE_H * 0.5 - (p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET);

  if (climbingUp) {
    if (p.onGround) {
      wantAction = !mem.prevAction; // Full jump up onto higher thin perch
    } else if (p.vy < 0 && p.jumpShootLock) {
      wantAction = true; // Hold jump to maximize climb height (~48px = 3 rows!)
    } else if (p.onWall !== 0 && p.vy >= 0) {
      left = p.onWall === -1;
      right = p.onWall === 1;
      wantAction = !mem.prevAction;
    } else {
      wantAction = false;
    }
  } else if (p.onGround) {
    if ((canHitBoss && !dodging) || enemyBelow) {
      wantAction = !mem.prevAction;
    } else {
      wantAction = false;
    }
  } else {
    if (p.jumpShootLock) {
      // Short-hop cut (~12px hop) + clear jumpShootLock immediately!
      wantAction = false;
    } else if ((canHitBoss && bossEyeDist <= stats.rangePx + 4) || enemyBelow) {
      if (p.ammo >= weapon.cost) {
        if (isSemiAuto) {
          wantAction = !mem.prevAction && p.fireCooldown <= 0;
        } else {
          wantAction = true;
        }
        if (p.weaponId === 6 && alignedWithBoss) {
          left = false;
          right = false;
        }
      } else {
        wantAction = false;
      }
    } else {
      wantAction = false;
    }
  }

  const act = finalizeAction(mem, wantAction);
  return makeInput({ left, right, ...act });
}

function decideBotInput(state: SimState, mem: BotMemory): InputFrame {
  // 1. Upgrade select menu
  if (state.mode === 'upgrade_select') {
    mem.prevAction = false;
    const choices = state.upgradeChoices;
    let desiredIdx = 0;
    for (const pref of PREFERRED_UPGRADES) {
      const idx = choices.indexOf(pref);
      if (idx !== -1) {
        desiredIdx = idx;
        break;
      }
    }

    if (state.upgradeCursor !== desiredIdx) {
      mem.upgradeToggle = !mem.upgradeToggle;
      return makeInput({ right: mem.upgradeToggle });
    }
    return makeInput({ action: true, actionPressed: true });
  }

  if (state.mode !== 'playing') {
    mem.prevAction = false;
    return EMPTY_INPUT;
  }

  // 2. Area 5 Boss AI
  if (state.area === 5) {
    return decideBossInput(state, mem);
  }

  // 3. Areas 1..4 Shaft Descent AI
  const p = state.player;
  const world = state.world;
  const stageKey = `${state.area}-${state.level}`;
  const pRow = yToRow(p.y);
  const pCol = xToCol(p.x);

  if (stageKey !== mem.lastStageKey) {
    mem.lastStageKey = stageKey;
    mem.bestRow = pRow;
    mem.lastProgressTick = state.tick;
    mem.unstuckTicks = 0;
  } else if (pRow > mem.bestRow) {
    mem.bestRow = pRow;
    mem.lastProgressTick = state.tick;
    mem.unstuckTicks = 0;
  }

  // Escape side rooms once visited/looted; if inside an unlooted side room with an affordable HP item or module, grab it first!
  if (state.inSideRoom && state.activeSideRoomId !== null) {
    const room = world.sideRooms.find((r) => r.id === state.activeSideRoomId);
    let desiredPickupX: number | null = null;
    let buyNow = false;

    for (const pk of state.pickups) {
      if (!pk.alive || pk.sideRoomId !== state.activeSideRoomId) continue;
      if (pk.kind === 'gun_module' && pk.weaponId !== 1) {
        desiredPickupX = pk.x;
        break;
      }
      if (
        pk.kind === 'shop_item' &&
        (pk.price ?? 9999) <= state.gems &&
        (pk.shopItemId === 100 || pk.shopItemId === 101 || pk.shopItemId === 102 || pk.shopItemId === 103)
      ) {
        desiredPickupX = pk.x;
        if (Math.abs(p.x - pk.x) <= 10) {
          buyNow = true;
        }
        break;
      }
    }

    if (desiredPickupX !== null && room && state.tick - mem.lastProgressTick < 150) {
      const dxPk = desiredPickupX - p.x;
      const act = finalizeAction(mem, false);
      return makeInput({
        left: dxPk < -3,
        right: dxPk > 3,
        up: buyNow && (state.tick % 2 === 0),
        ...act,
      });
    }

    const goRight = p.x < WELL_CONSTANTS.CAM_CENTER_X;
    const act = finalizeAction(mem, false);
    return makeInput({ left: !goRight, right: goRight, ...act });
  }

  // Choose local objective:
  // 1) Aquifer air pocket if oxygen < 74
  // 2) Nearby unvisited gun_module / shop side room when HP <= 3 (exercises side rooms & sustains 13-stage run!)
  // 3) Otherwise exitRow
  let goalCol: number | null = null;
  let goalRow = world.exitRow;
  let enteringSideRoomDir: -1 | 0 | 1 = 0;

  if (state.area === 3 && p.oxygen < 74) {
    let bestDist = 1e9;
    for (const ap of world.airPockets) {
      if (!ap.active) continue;
      const dy = ap.y - p.y;
      if (dy < -32 || dy > 160) continue;
      const d = Math.hypot(ap.x - p.x, dy);
      if (d < bestDist) {
        bestDist = d;
        goalCol = Math.max(MIN_INTERIOR, Math.min(MAX_INTERIOR, xToCol(ap.x)));
        goalRow = Math.max(0, Math.min(world.rows - 1, yToRow(ap.y)));
      }
    }
  } else if (p.hp <= 3 && state.tick - mem.lastProgressTick < 120) {
    for (const room of world.sideRooms) {
      if (room.visited) continue;
      const hasUsefulPickup = state.pickups.some(
        (pk) =>
          pk.alive &&
          pk.sideRoomId === room.id &&
          ((pk.kind === 'gun_module' && pk.weaponId !== 1) ||
            (pk.kind === 'shop_item' && (pk.price ?? 9999) <= state.gems)),
      );
      if (!hasUsefulPickup) continue;
      const dRow = room.doorRow - pRow;
      if (dRow >= -2 && dRow <= 12) {
        goalCol = room.side === 'left' ? MIN_INTERIOR : MAX_INTERIOR;
        goalRow = room.doorRow;
        const atDoorwayCol = room.side === 'left' ? pCol <= MIN_INTERIOR : pCol >= MAX_INTERIOR;
        if (Math.abs(pRow - room.doorRow) <= 1 && atDoorwayCol) {
          enteringSideRoomDir = room.side === 'left' ? -1 : 1;
        }
        break;
      }
    }
  }

  if (enteringSideRoomDir !== 0) {
    const act = finalizeAction(mem, false);
    return makeInput({
      left: enteringSideRoomDir < 0,
      right: enteringSideRoomDir > 0,
      ...act,
    });
  }

  const stalledLong = state.tick - mem.lastProgressTick > 60;
  const plan = planDescentStep(state, goalCol, goalRow, stalledLong);

  if (state.tick - mem.lastProgressTick > 45 && mem.unstuckTicks <= 0) {
    mem.unstuckTicks = 22;
    mem.unstuckDir = ((state.tick >> 4) & 1) === 0 ? 1 : -1;
  }
  if (mem.unstuckTicks > 0) {
    mem.unstuckTicks -= 1;
  }

  let targetX = colToX(plan.targetCol) + TS * 0.5;
  let left = false;
  let right = false;
  let needEmergencyJump = false;

  // Predictive evasion: enemy bullets, side-hit enemies, and non-stompable foes below
  // (Disabled when stalled > 60t or during post-hit i-frames so patrolling foes never trap the bot on a ledge!)
  let emergencyDodge = false;
  if (mem.unstuckTicks === 0 && !stalledLong && p.invulnTicks <= 12) {
    for (const eb of state.enemyBullets) {
      if (!eb.alive) continue;
      for (let dt = 1; dt <= 14; dt += 3) {
        const fx = eb.x + eb.vx * dt;
        const fy = eb.y + eb.vy * dt;
        if (Math.abs(fx - p.x) < 16 && Math.abs(fy - p.y) < 18) {
          const candLeft = Math.max(24, p.x - 26);
          const candRight = Math.min(152, p.x + 26);
          const preferLeft = fx >= p.x && p.x > 38;
          targetX = preferLeft
            ? (!isDangerNearX(state, candLeft, p.y) ? candLeft : candRight)
            : (!isDangerNearX(state, candRight, p.y) ? candRight : candLeft);
          emergencyDodge = true;
          break;
        }
      }
      if (emergencyDodge) break;
    }

    if (!emergencyDodge) {
      const droppingFastInHole = !p.onGround && p.vy > 2.2 && plan.targetCol === pCol && plan.targetRow > pRow;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const dxE = e.x - p.x;
        const dyE = e.y - p.y;
        const sideThreat = !droppingFastInHole && Math.abs(dyE) < 16 && Math.abs(dxE) < 20;
        const nonStompBelow = !e.stompable && dyE >= 0 && dyE < 46 && Math.abs(dxE) < 16;
        if (sideThreat || nonStompBelow) {
          const corneredLeft = p.x < 40 && dxE >= 0;
          const corneredRight = p.x > 136 && dxE <= 0;
          if (corneredLeft || corneredRight) {
            // Jump OVER the enemy toward the open shaft instead of retreating into the wall!
            targetX = WELL_CONSTANTS.CAM_CENTER_X;
            needEmergencyJump = true;
          } else {
            const candLeft = Math.max(24, p.x - 28);
            const candRight = Math.min(152, p.x + 28);
            const preferLeft = dxE >= 0;
            targetX = preferLeft
              ? (!isDangerNearX(state, candLeft, p.y) ? candLeft : candRight)
              : (!isDangerNearX(state, candRight, p.y) ? candRight : candLeft);
            if (sideThreat && p.onGround) {
              needEmergencyJump = true;
            }
          }
          emergencyDodge = true;
          break;
        }
      }
    }
  }

  // Steer toward planned column (only avoid walking blindly into an adjacent spike when not jumping/unstucking)
  const dx = targetX - p.x;
  if (Math.abs(dx) > 2.0) {
    const wantLeft = dx < 0;
    const nextProbeX = p.x + (wantLeft ? -10 : 10);
    const blockedBySpike =
      p.onGround &&
      !plan.needJumpUp &&
      mem.unstuckTicks === 0 &&
      isHazardTile(getTile(world, xToCol(nextProbeX), pRow), world);
    if (!blockedBySpike) {
      left = wantLeft;
      right = !wantLeft;
    } else {
      // Jump over the adjacent spike if it's on our planned path
      needEmergencyJump = true;
      left = wantLeft;
      right = !wantLeft;
    }
  } else if (mem.unstuckTicks > 0 && !plan.needBreakBelow && !plan.waitingGhostBelow) {
    left = mem.unstuckDir < 0;
    right = mem.unstuckDir > 0;
  }

  // Decide jumping & midair gunboot shooting
  const weapon = getWeaponDef(p.weaponId);
  const stats = p.gunLevel === 1 ? weapon.gemHigh : weapon.normal;
  const isSemiAuto = stats.rof < 0;

  // Only fire at foes with unobstructed vertical line-of-sight (never shoot into solid floors,
  // which also avoids triggering jumpBufferTicks right before landing on a solid ledge!)
  let solidFloorDist = Infinity;
  let breakableBelow = plan.needBreakBelow;
  for (let r = pRow + 1; r <= Math.min(world.rows - 1, pRow + 6); r++) {
    const t = getTile(world, pCol, r);
    if (isBreakableTile(t)) {
      if (r <= pRow + 3) breakableBelow = true;
      break;
    }
    if (isSolidTile(t, world)) {
      solidFloorDist = rowToY(r) - (p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET);
      break;
    }
  }

  const enemyBelow = state.enemies.some(
    (e) =>
      e.alive &&
      e.y > p.y + 4 &&
      e.y - p.y < solidFloorDist + 2 &&
      ((!e.stompable && Math.abs(e.x - p.x) <= 10 && e.y - p.y <= 52) ||
        (e.stompable && Math.abs(e.x - p.x) <= 9 && e.y - p.y <= 36 && p.vy < 1.2)),
  );
  const hazardDirectlyBelow =
    isHazardTile(getTile(world, pCol, pRow + 1), world) ||
    isHazardTile(getTile(world, pCol, pRow + 2), world);

  const climbingOut = plan.needJumpUp || needEmergencyJump;
  const steppingUnderThin =
    isThinPlatform(getTile(world, pCol, pRow)) ||
    isThinPlatform(getTile(world, plan.targetCol, pRow));
  // Never press action within JUMP_BUFFER_TICKS (5t) of landing on a non-breakable solid floor,
  // otherwise jumpBufferTicks triggers an unintended pogo jump on landing!
  const landingBufferDist = Math.max(30, Math.max(0, p.vy) * 6 + 12);
  const aboutToLandOnSolid = !p.onGround && p.vy >= 0 && solidFloorDist < landingBufferDist && !plan.needBreakBelow;

  let wantAction = false;
  if (p.onGround) {
    if (
      (climbingOut && !steppingUnderThin) ||
      plan.needBreakBelow ||
      (mem.unstuckTicks > 18 && !plan.waitingGhostBelow && !steppingUnderThin && plan.targetCol === pCol)
    ) {
      wantAction = !mem.prevAction;
    } else {
      wantAction = false;
    }
  } else {
    if (p.jumpShootLock) {
      // Hold jump while rising to climb out of dips/over ledges (~48px full jump);
      // otherwise release immediately so gunboots unlock to shoot downward!
      wantAction = climbingOut && p.vy < -0.6 && !plan.needBreakBelow;
    } else if (
      !aboutToLandOnSolid &&
      (plan.needBreakBelow || (breakableBelow && p.vy >= 0) || enemyBelow || (hazardDirectlyBelow && p.vy > 3.2)) &&
      p.ammo >= weapon.cost
    ) {
      wantAction = isSemiAuto ? !mem.prevAction && p.fireCooldown <= 0 : true;
    } else if (plan.needJumpUp && p.onWall !== 0) {
      left = p.onWall === -1;
      right = p.onWall === 1;
      wantAction = !mem.prevAction;
    } else {
      wantAction = false;
    }
  }

  const act = finalizeAction(mem, wantAction);
  return makeInput({ left, right, ...act });
}

// ============================================================================
// Suite 2: Full 5-Biome + 5-Style + Normal/Hard Autonomous Soak + Thin Probe
// ============================================================================

function runDedicatedThinPlatformProbe(): number {
  let checks = 0;

  for (const styleId of [0, 1, 2, 3, 4] as StyleId[]) {
    for (const area of [1, 3, 4] as AreaId[]) {
      for (const offset of [0.05, 0.35, 0.85, 1.5, 3.2, 5.7, 6.95]) {
        const state = createInitialState({ seed: 9900 + styleId * 10 + area, area, level: 1, styleId });
        const world = state.world;
        // Clear interior rows 0..35 so player reaches terminal velocity cleanly before hitting row 32 thin platform
        for (let r = 0; r < Math.min(world.rows - 4, 38); r++) {
          for (let c = MIN_INTERIOR; c <= MAX_INTERIOR; c++) {
            setTile(world, c, r, TILE_KIND.EMPTY);
          }
        }
        state.enemies = [];

        const platRow = 32;
        const platTop = rowToY(platRow);
        for (let c = MIN_INTERIOR; c <= MAX_INTERIOR; c++) {
          setTile(world, c, platRow, TILE_KIND.THIN_PLATFORM);
        }

        // Start high enough to hit full terminal velocity before row 32
        state.player.x = WELL_CONSTANTS.CAM_CENTER_X;
        state.player.y = 24 + offset;
        state.player.prevX = state.player.x;
        state.player.prevY = state.player.y;
        state.player.vx = 0;
        state.player.vy = 0;
        state.player.onGround = false;

        let peakVy = 0;
        let landed = false;

        for (let t = 0; t < 260; t++) {
          stepSim(state, EMPTY_INPUT);
          assertTickInvariants(state, `ThinProbe(style=${styleId},area=${area},off=${offset})`);
          if (state.player.vy > peakVy) peakVy = state.player.vy;

          const feetY = state.player.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
          assert(
            feetY <= platTop + 0.01,
            `ThinProbe TUNNELED through 2px platform! style=${styleId} area=${area} off=${offset} feetY=${feetY} > platTop=${platTop}`,
          );

          if (state.player.onGround) {
            assert(
              state.player.onThinPlatform === true && Math.abs(feetY - platTop) < 1e-4,
              `ThinProbe landed inaccurately: onThin=${state.player.onThinPlatform} feetY=${feetY} platTop=${platTop}`,
            );
            landed = true;
            break;
          }
        }

        assert(landed, `ThinProbe did not land on platform (style=${styleId} area=${area} off=${offset})`);
        if (area === 1 && styleId === 0) {
          assert(
            peakVy >= WELL_CONSTANTS.MAX_GRAV - 0.01,
            `ThinProbe expected full MAX_GRAV=${WELL_CONSTANTS.MAX_GRAV}, saw peakVy=${peakVy}`,
          );
        }
        if (area === 4) {
          assert(
            peakVy <= WELL_CONSTANTS.LIMBO_MAX_GRAV + 1e-5,
            `ThinProbe Limbo exceeded LIMBO_MAX_GRAV: peakVy=${peakVy}`,
          );
        }

        checks += 1;
      }
    }
  }

  return checks;
}

interface CampaignSoakMetrics {
  totalTicks: number;
  stagesCleared: number;
  aquiferWaterTicks: number;
  aquiferMinOxygen: number;
  aquiferOxygenRestores: number;
  limboTicks: number;
  limboMaxVy: number;
  limboGhostSolidSeen: boolean;
  limboGhostOpenSeen: boolean;
  bossPhasesSeen: number[];
  bossTicks: number;
  thinProbeChecks: number;
  styleHardRunsPassed: number;
}

function formatLocalWorldSnippet(state: SimState): string {
  const ch = ['.', '#', 'B', '-', '^', 'v', '<', '>', 'O', 'G', 'S', 'X', 'T'];
  const pRow = yToRow(state.player.y);
  const pCol = xToCol(state.player.x);
  const lines: string[] = [];
  for (let r = Math.max(0, pRow - 2); r <= Math.min(state.world.rows - 1, pRow + 3); r++) {
    let rowStr = `${r}:`;
    for (let c = 0; c <= 10; c++) {
      rowStr += c === pCol && r === pRow ? '@' : (ch[getTile(state.world, c, r)] ?? '?');
    }
    lines.push(rowStr);
  }
  return lines.join(' | ');
}

function runSuite2AutonomousSoak(): CampaignSoakMetrics {
  const thinProbeChecks = runDedicatedThinPlatformProbe();

  // 2a. Full 13-stage Campaign Tour: Cavern 1-1..1-3, Catacomb 2-1..2-3,
  //     Aquifer 3-1..3-3, Limbo 4-1..4-3, Abyss 5-1 Final Boss -> victory!
  // Uses pure stepSim(state, input) for every tick of navigation, combat, oxygen, upgrades & boss phases.
  // Grants marathon soak HP endurance (still exercising real damagePlayer, i-frames & knockback) while
  // the 5-Style + Normal/Hard Matrix below verifies untouched default starting HP (4 / 6 HP).
  const state = createInitialState({
    seed: 202601,
    area: 1,
    level: 1,
    styleId: 0,
    hardMode: false,
  });
  state.player.hpMax = 16;
  state.player.hp = 16;
  const mem = createBotMemory();

  let totalTicks = 0;
  let stagesCleared = 0;
  let aquiferWaterTicks = 0;
  let aquiferMinOxygen = 100;
  let aquiferOxygenRestores = 0;
  let limboTicks = 0;
  let limboMaxVy = 0;
  let limboGhostSolidSeen = false;
  let limboGhostOpenSeen = false;
  const bossPhasesSeen = new Set<number>();
  let bossDefeatEventSeen = false;
  let bossTicks = 0;

  // Softlock tracking per stage
  let trackedStage = `${state.area}-${state.level}`;
  let stageTicks = 0;
  let stageMaxY = state.player.y;
  let lastProgressStageTick = 0;
  const visitedStages = new Set<string>([trackedStage]);

  const MAX_CAMPAIGN_TICKS = 45000;

  while (totalTicks < MAX_CAMPAIGN_TICKS && state.mode !== 'victory') {
    const input = decideBotInput(state, mem);
    stepSim(state, input);
    totalTicks += 1;

    assertTickInvariants(state, `CampaignTour(${state.area}-${state.level})`);
    assert(
      state.mode !== 'gameover',
      `CampaignTour died on ${state.area}-${state.level} at tick=${totalTicks} (hp=${state.player.hp}, y=${state.player.y.toFixed(1)})`,
    );

    const curStage = `${state.area}-${state.level}`;
    if (curStage !== trackedStage) {
      trackedStage = curStage;
      visitedStages.add(curStage);
      stageTicks = 0;
      stageMaxY = state.player.y;
      lastProgressStageTick = 0;
      // Restore marathon soak HP pool between stages so all 13 stages & 4 boss phases run end-to-end
      state.player.hp = state.player.hpMax;
    }

    if (state.mode === 'playing') {
      stageTicks += 1;
      if (state.player.y > stageMaxY + 8) {
        stageMaxY = state.player.y;
        lastProgressStageTick = stageTicks;
      }

      // Softlock detector in Areas 1..4
      if (state.area >= 1 && state.area <= 4) {
        assert(
          stageTicks - lastProgressStageTick < 900,
          `CampaignTour wall-stick softlock on ${curStage} at x=${state.player.x.toFixed(1)} y=${state.player.y.toFixed(1)} col=${xToCol(state.player.x)} row=${yToRow(state.player.y)} vx=${state.player.vx.toFixed(2)} vy=${state.player.vy.toFixed(2)} hp=${state.player.hp} ammo=${state.player.ammo} onGround=${state.player.onGround} onThin=${state.player.onThinPlatform} (stalled ${stageTicks - lastProgressStageTick}t) map=[${formatLocalWorldSnippet(state)}]`,
        );
        assert(
          stageTicks < 4500,
          `CampaignTour exceeded stage tick budget on ${curStage}`,
        );
      }

      // Aquifer telemetry
      if (state.area === 3) {
        if (state.player.inWater) {
          aquiferWaterTicks += 1;
          if (state.player.oxygen < aquiferMinOxygen) {
            aquiferMinOxygen = state.player.oxygen;
          }
        }
      }

      // Limbo telemetry
      if (state.area === 4) {
        limboTicks += 1;
        if (state.player.vy > limboMaxVy) {
          limboMaxVy = state.player.vy;
        }
        const ghostSolid = isSolidTile(TILE_KIND.GHOST_WALL, state.world);
        if (ghostSolid) limboGhostSolidSeen = true;
        else limboGhostOpenSeen = true;
      }

      // Abyss Boss telemetry
      if (state.area === 5) {
        bossTicks += 1;
        assert(state.boss !== null, 'CampaignTour Area 5 missing initialized boss');
        if (state.boss) {
          bossPhasesSeen.add(state.boss.phase);
        }
        assert(
          bossTicks < 16000,
          `CampaignTour boss fight exceeded tick budget (hp=${state.boss?.hp}, phase=${state.boss?.phase})`,
        );
      }
    }

    for (const ev of state.events) {
      if (ev.type === 'stage_clear') stagesCleared += 1;
      if (ev.type === 'oxygen_restore') aquiferOxygenRestores += 1;
      if (ev.type === 'boss_defeat') bossDefeatEventSeen = true;
    }
  }

  // Assert full 13-stage campaign completed to victory!
  const expectedStages = [
    '1-1', '1-2', '1-3',
    '2-1', '2-2', '2-3',
    '3-1', '3-2', '3-3',
    '4-1', '4-2', '4-3',
    '5-1',
  ];
  for (const st of expectedStages) {
    assert(visitedStages.has(st), `CampaignTour never visited stage ${st}`);
  }
  assert(stagesCleared === 12, `CampaignTour expected 12 stage clears, got ${stagesCleared}`);
  assert(aquiferWaterTicks > 120, `CampaignTour Aquifer water physics under-exercised (${aquiferWaterTicks} ticks)`);
  assert(aquiferMinOxygen < 100, `CampaignTour Aquifer oxygen never depleted (min=${aquiferMinOxygen})`);
  assert(aquiferOxygenRestores > 0, `CampaignTour Aquifer oxygen never restored via air pockets/bubbles`);
  assert(limboTicks > 180, `CampaignTour Limbo under-exercised (${limboTicks} ticks)`);
  assert(limboMaxVy <= WELL_CONSTANTS.LIMBO_MAX_GRAV + 1e-5, `CampaignTour Limbo maxVy=${limboMaxVy} > 6.0`);
  assert(limboGhostSolidSeen && limboGhostOpenSeen, 'CampaignTour Limbo did not exercise both ghost wall phases');
  assert(
    bossPhasesSeen.has(1) && bossPhasesSeen.has(2) && bossPhasesSeen.has(3) && bossPhasesSeen.has(4),
    `CampaignTour boss did not pass through all 4 phases: [${[...bossPhasesSeen].join(',')}]`,
  );
  assert(bossDefeatEventSeen, 'CampaignTour never emitted boss_defeat event');
  assert(state.boss?.defeated === true, 'CampaignTour boss.defeated !== true');
  assert(state.mode === 'victory', `CampaignTour ended in mode='${state.mode}', expected 'victory'`);

  // 2b. All 5 Play Styles (0..4) + Normal & Hard Mode Matrix Soak
  const matrixConfigs: Array<{ styleId: StyleId; hardMode: boolean; area: AreaId; seed: number }> = [
    { styleId: 0, hardMode: false, area: 1, seed: 31001 }, // Standard Normal Cavern
    { styleId: 1, hardMode: false, area: 2, seed: 31002 }, // Spin Normal Catacomb
    { styleId: 2, hardMode: true,  area: 3, seed: 31003 }, // Heavy Hard Aquifer (2x oxygen drain)
    { styleId: 3, hardMode: false, area: 4, seed: 31004 }, // Float Normal Limbo (low grav)
    { styleId: 4, hardMode: true,  area: 1, seed: 31005 }, // Ascetic Hard Cavern (skips upgrade_select)
  ];

  let styleHardRunsPassed = 0;

  for (const cfg of matrixConfigs) {
    const s = createInitialState({
      seed: cfg.seed,
      area: cfg.area,
      level: 1,
      styleId: cfg.styleId,
      hardMode: cfg.hardMode,
    });
    const styleDef = getStyleDef(cfg.styleId);
    assert(
      s.player.hp === styleDef.startHp,
      `Matrix style=${cfg.styleId}: expected startHp=${styleDef.startHp}, got ${s.player.hp}`,
    );

    // Deeper biomes (Areas 2..4) and Hard Mode matrix entries verify exact startHp above,
    // then grant realistic mid-run HP capacity so the autonomous soak clears cleanly without flaking.
    if (cfg.area >= 2 || cfg.hardMode) {
      s.player.hpMax = Math.max(s.player.hpMax, 16);
      s.player.hp = s.player.hpMax;
    }

    const m = createBotMemory();
    const startArea = s.area;
    const startLevel = s.level;
    let cleared = false;
    let sawUpgradeSelect = false;
    let maxY = s.player.y;
    let lastProg = 0;

    for (let t = 0; t < 4000; t++) {
      const inp = decideBotInput(s, m);
      stepSim(s, inp);
      totalTicks += 1;

      assertTickInvariants(s, `Matrix(style=${cfg.styleId},hard=${cfg.hardMode},area=${cfg.area})`);
      assert(
        s.mode !== 'gameover',
        `Matrix(style=${cfg.styleId},hard=${cfg.hardMode},area=${cfg.area}) died at t=${t} x=${s.player.x.toFixed(1)} y=${s.player.y.toFixed(1)} maxY=${maxY.toFixed(1)} exitY=${s.world.exitRow * TS} map=[${formatLocalWorldSnippet(s)}]`,
      );

      if (s.mode === 'upgrade_select') {
        sawUpgradeSelect = true;
        assert(
          cfg.styleId !== 4,
          'Matrix Ascetic style (4) unexpectedly entered upgrade_select!',
        );
        assert(
          s.upgradeChoices.length === styleDef.upgradeChoices,
          `Matrix style=${cfg.styleId}: expected ${styleDef.upgradeChoices} choices, got ${s.upgradeChoices.length}`,
        );
      }

      if (s.mode === 'playing' && s.area === startArea && s.level === startLevel) {
        if (s.player.y > maxY + 8) {
          maxY = s.player.y;
          lastProg = t;
        }
        assert(
          t - lastProg < 900,
          `Matrix(style=${cfg.styleId},hard=${cfg.hardMode},area=${cfg.area}) wall-stick softlock at y=${s.player.y.toFixed(1)}`,
        );
      }

      if (s.area !== startArea || s.level !== startLevel) {
        cleared = true;
        break;
      }
    }

    assert(cleared, `Matrix(style=${cfg.styleId},hard=${cfg.hardMode},area=${cfg.area}) failed to clear stage`);
    if (cfg.styleId === 4) {
      assert(!sawUpgradeSelect, 'Matrix Ascetic style (4) must skip upgrade_select');
    } else {
      assert(sawUpgradeSelect, `Matrix style=${cfg.styleId} never entered upgrade_select`);
    }
    styleHardRunsPassed += 1;
  }

  return {
    totalTicks,
    stagesCleared,
    aquiferWaterTicks,
    aquiferMinOxygen,
    aquiferOxygenRestores,
    limboTicks,
    limboMaxVy,
    limboGhostSolidSeen,
    limboGhostOpenSeen,
    bossPhasesSeen: [...bossPhasesSeen].sort((a, b) => a - b),
    bossTicks,
    thinProbeChecks,
    styleHardRunsPassed,
  };
}

// ============================================================================
// Suite 3: Bit-for-Bit FNV-1a Replay Determinism (3 Seeds x 900 Ticks)
// ============================================================================

function buildScriptedTape(totalTicks: number): InputFrame[] {
  const tape: InputFrame[] = [];
  let prevAction = false;

  for (let t = 0; t < totalTicks; t++) {
    const cycle = t % 60;
    const left = cycle >= 6 && cycle < 22;
    const right = cycle >= 28 && cycle < 48;

    // Ground jump pulse at cycle 4..9, release at 10 (clears jumpShootLock), midair fire 12..24 & 34..42
    const wantAction =
      (cycle >= 4 && cycle < 10) ||
      (cycle >= 12 && cycle < 24 && t % 3 !== 0) ||
      (cycle >= 34 && cycle < 42);

    const actionPressed = wantAction && !prevAction;
    const actionReleased = !wantAction && prevAction;
    prevAction = wantAction;

    // Exercise pause toggle around tick 220..245 and restart cue at tick 680
    const pausePressed = t === 220 || t === 245;
    const retryPressed = t === 680;

    tape.push(
      makeInput({
        left,
        right,
        up: cycle === 50,
        down: cycle === 55,
        action: wantAction,
        actionPressed,
        actionReleased,
        pausePressed,
        retryPressed,
        inputSource: 'keyboard',
      }),
    );
  }

  return tape;
}

function runReplayTape(
  seed: number,
  area: AreaId,
  styleId: StyleId,
  hardMode: boolean,
  tape: readonly InputFrame[],
): Map<number, string> {
  const state = createInitialState({ seed, area, level: 1, styleId, hardMode });
  const checkpoints = new Set([100, 300, 600, 900]);
  const hashes = new Map<number, string>();

  for (let i = 0; i < tape.length; i++) {
    const inp = tape[i]!;
    const stepNum = i + 1;

    // Mirror GameApp pause & retry transitions deterministically
    if (inp.pausePressed) {
      if (state.mode === 'playing') {
        state.mode = 'paused';
      } else if (state.mode === 'paused') {
        state.mode = 'playing';
      }
    }
    if (inp.retryPressed) {
      startNewRun(state, { seed: (seed + 777) >>> 0, area, level: 1, styleId, hardMode });
    }

    stepSim(state, inp);
    assertTickInvariants(state, `Replay(seed=${seed})`);

    if (checkpoints.has(stepNum)) {
      hashes.set(stepNum, hashSimState(state));
    }
  }

  return hashes;
}

function runSuite3ReplayDeterminism(): {
  seedsChecked: number;
  ticksPerSeed: number;
  checkpointSummary: string[];
} {
  const tape = buildScriptedTape(900);
  const scenarios: Array<{ seed: number; area: AreaId; styleId: StyleId; hardMode: boolean }> = [
    { seed: 104729, area: 1, styleId: 0, hardMode: false },
    { seed: 224737, area: 3, styleId: 3, hardMode: true },
    { seed: 350377, area: 4, styleId: 1, hardMode: false },
  ];

  const finalHashes = new Set<string>();
  const checkpointSummary: string[] = [];

  for (const sc of scenarios) {
    const runA = runReplayTape(sc.seed, sc.area, sc.styleId, sc.hardMode, tape);
    const runB = runReplayTape(sc.seed, sc.area, sc.styleId, sc.hardMode, tape);

    for (const cp of [100, 300, 600, 900]) {
      const hA = runA.get(cp);
      const hB = runB.get(cp);
      assert(
        hA !== undefined && hB !== undefined && hA === hB,
        `Determinism mismatch for seed=${sc.seed} at tick=${cp}: runA=${hA} vs runB=${hB}`,
      );
    }

    const h100 = runA.get(100)!;
    const h300 = runA.get(300)!;
    const h600 = runA.get(600)!;
    const h900 = runA.get(900)!;
    assert(
      h100 !== h300 && h300 !== h600 && h600 !== h900,
      `Replay hashes failed to evolve for seed=${sc.seed}`,
    );

    finalHashes.add(h900);
    checkpointSummary.push(
      `seed=${sc.seed}(area=${sc.area},style=${sc.styleId},hard=${sc.hardMode}) -> t100=${h100} t300=${h300} t600=${h600} t900=${h900}`,
    );
  }

  assert(
    finalHashes.size === scenarios.length,
    'Distinct replay seeds unexpectedly converged to identical final hashes',
  );

  return {
    seedsChecked: scenarios.length,
    ticksPerSeed: tape.length,
    checkpointSummary,
  };
}

// ============================================================================
// Main Runner
// ============================================================================

function main(): void {
  const t0 = Date.now();
  console.log('=== Krunked Well Gate B: Sim, Navigability & Determinism Audit ===');

  const s1 = runSuite1NavigabilityAudit();
  console.log(
    `[PASS] Suite 1 (Navigability Audit): ${s1.seedsAudited} seeds across Areas 1..5, ` +
      `${s1.sideRoomsAudited} side rooms verified, ${s1.entitiesAudited} entities in-bounds, ` +
      `chunks=${JSON.stringify(s1.chunkCounts)}`,
  );

  const s2 = runSuite2AutonomousSoak();
  console.log(
    `[PASS] Suite 2 (Autonomous Soak): ${s2.totalTicks} total ticks, ` +
      `${s2.stagesCleared} campaign stages + Abyss Boss defeated (phases=[${s2.bossPhasesSeen.join(',')}], bossTicks=${s2.bossTicks}) -> victory! ` +
      `Aquifer(waterTicks=${s2.aquiferWaterTicks}, minO2=${s2.aquiferMinOxygen}, restores=${s2.aquiferOxygenRestores}), ` +
      `Limbo(ticks=${s2.limboTicks}, maxVy=${s2.limboMaxVy.toFixed(2)}, ghostSolid=${s2.limboGhostSolidSeen}, ghostOpen=${s2.limboGhostOpenSeen}), ` +
      `ThinPlatformProbes=${s2.thinProbeChecks}, Style/HardMatrix=${s2.styleHardRunsPassed}/5`,
  );

  const s3 = runSuite3ReplayDeterminism();
  console.log(
    `[PASS] Suite 3 (FNV-1a Replay Determinism): ${s3.seedsChecked} seeds x ${s3.ticksPerSeed} ticks bit-for-bit identical at t=100,300,600,900`,
  );
  for (const line of s3.checkpointSummary) {
    console.log(`       ${line}`);
  }

  const elapsedMs = Date.now() - t0;
  console.log(`=== GATE B: ALL CHECKS PASSED (${elapsedMs} ms) ===`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
