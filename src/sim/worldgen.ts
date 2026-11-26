import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AirPocket,
  type AreaId,
  type EnemyKind,
  type SideRoomKind,
  type SideRoomState,
  type SimState,
  type TileKind,
  type WorldState,
} from '../contracts/index.ts';
import { getChunksForArea } from '../data/chunks.ts';
import { BIOME_ENEMY_POOLS } from '../data/enemies.ts';
import { getStyleDef } from '../data/styles.ts';
import { nextRandom, randInt, randPick } from './prng.ts';
import { allocId, getTile, hasUpgrade, setTile } from './simUtils.ts';

const TS = WELL_CONSTANTS.TILE_SIZE;
const MIN_INTERIOR = WELL_CONSTANTS.SHAFT_INTERIOR_MIN_COL;
const MAX_INTERIOR = WELL_CONSTANTS.SHAFT_INTERIOR_MAX_COL;
const SHAFT_W = WELL_CONSTANTS.SHAFT_COLS;

export interface StageGenResult {
  enemySpawns: Array<{ x: number; y: number; kind: EnemyKind }>;
  sideRooms: SideRoomState[];
}

function isNavigableTile(kind: TileKind): boolean {
  return (
    kind === TILE_KIND.EMPTY ||
    kind === TILE_KIND.THIN_PLATFORM ||
    kind === TILE_KIND.BREAKABLE ||
    kind === TILE_KIND.BUBBLE_BLOCK ||
    kind === TILE_KIND.GHOST_WALL ||
    kind === TILE_KIND.STAGE_EXIT
  );
}

/**
 * BFS from top entry row interior cols (1..9) down to world.exitRow passing
 * through non-solid or breakable/thin/ghost/exit tiles.
 */
export function verifyStageNavigable(world: WorldState): boolean {
  const maxRow = Math.min(world.exitRow, world.rows - 1);
  if (maxRow < 0) return false;

  const visited = new Uint8Array((maxRow + 1) * SHAFT_W);
  const queueCols: number[] = [];
  const queueRows: number[] = [];

  for (let col = MIN_INTERIOR; col <= MAX_INTERIOR; col++) {
    if (isNavigableTile(getTile(world, col, 0))) {
      const idx = col - MIN_INTERIOR;
      visited[idx] = 1;
      queueCols.push(col);
      queueRows.push(0);
    }
  }

  let head = 0;
  while (head < queueCols.length) {
    const col = queueCols[head]!;
    const row = queueRows[head]!;
    head += 1;

    if (row >= maxRow) {
      return true;
    }

    const dirs: readonly (readonly [number, number])[] = [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
    ];

    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < MIN_INTERIOR || nc > MAX_INTERIOR || nr < 0 || nr > maxRow) {
        continue;
      }
      const idx = nr * SHAFT_W + (nc - MIN_INTERIOR);
      if (visited[idx]) continue;
      if (!isNavigableTile(getTile(world, nc, nr))) continue;
      visited[idx] = 1;
      queueCols.push(nc);
      queueRows.push(nr);
    }
  }

  return false;
}

/**
 * Finds the deepest row reached by BFS from row 0 and a reachable column on it.
 */
function findDeepestReachable(world: WorldState): { row: number; col: number } {
  const maxRow = Math.min(world.exitRow, world.rows - 1);
  const visited = new Uint8Array((maxRow + 1) * SHAFT_W);
  const queueCols: number[] = [];
  const queueRows: number[] = [];

  let bestRow = -1;
  let bestCol = 5;

  for (let col = MIN_INTERIOR; col <= MAX_INTERIOR; col++) {
    if (isNavigableTile(getTile(world, col, 0))) {
      visited[col - MIN_INTERIOR] = 1;
      queueCols.push(col);
      queueRows.push(0);
      if (bestRow < 0) {
        bestRow = 0;
        bestCol = col;
      }
    }
  }

  let head = 0;
  while (head < queueCols.length) {
    const col = queueCols[head]!;
    const row = queueRows[head]!;
    head += 1;

    if (row > bestRow) {
      bestRow = row;
      bestCol = col;
    }

    const dirs: readonly (readonly [number, number])[] = [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
    ];

    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < MIN_INTERIOR || nc > MAX_INTERIOR || nr < 0 || nr > maxRow) continue;
      const idx = nr * SHAFT_W + (nc - MIN_INTERIOR);
      if (visited[idx]) continue;
      if (!isNavigableTile(getTile(world, nc, nr))) continue;
      visited[idx] = 1;
      queueCols.push(nc);
      queueRows.push(nr);
    }
  }

  return { row: bestRow, col: bestCol };
}

/**
 * Guarantees 100% passable stages by carving a 2-tile-wide shaft opening
 * on any blocking row until verifyStageNavigable succeeds.
 */
function ensureStageNavigable(world: WorldState): void {
  // Always keep spawn entry cols 4..6 on row 0 open
  for (let col = 4; col <= 6; col++) {
    if (!isNavigableTile(getTile(world, col, 0))) {
      setTile(world, col, 0, TILE_KIND.EMPTY);
    }
  }

  let guard = world.rows + 4;
  while (!verifyStageNavigable(world) && guard > 0) {
    guard -= 1;
    const deepest = findDeepestReachable(world);
    const targetRow = Math.min(world.exitRow, Math.max(0, deepest.row + 1));
    const colA = Math.max(MIN_INTERIOR, Math.min(MAX_INTERIOR, deepest.col));
    const colB = colA < MAX_INTERIOR ? colA + 1 : colA - 1;
    setTile(world, colA, targetRow, TILE_KIND.EMPTY);
    setTile(world, colB, targetRow, TILE_KIND.EMPTY);
  }
}

function charToTileKind(ch: string): TileKind {
  switch (ch) {
    case '#':
      return TILE_KIND.SOLID;
    case 'B':
      return TILE_KIND.BREAKABLE;
    case '-':
      return TILE_KIND.THIN_PLATFORM;
    case '^':
      return TILE_KIND.SPIKE_UP;
    case 'v':
      return TILE_KIND.SPIKE_DOWN;
    case '<':
      return TILE_KIND.SPIKE_LEFT;
    case '>':
      return TILE_KIND.SPIKE_RIGHT;
    case 'O':
      return TILE_KIND.BUBBLE_BLOCK;
    case 'G':
      return TILE_KIND.GHOST_WALL;
    case 'T':
      return TILE_KIND.SPIKE_TRAP;
    case '.':
    case 'E':
    case 'A':
    default:
      return TILE_KIND.EMPTY;
  }
}

function pickEnemyForArea(state: SimState, area: AreaId): EnemyKind {
  const biome: 1 | 2 | 3 | 4 = area === 1 || area === 2 || area === 3 || area === 4 ? area : 1;
  const pool = state.hardMode ? BIOME_ENEMY_POOLS[biome].hard : BIOME_ENEMY_POOLS[biome].normal;
  return randPick(state, pool);
}

function carveSideRoom(
  world: WorldState,
  roomId: number,
  side: 'left' | 'right',
  doorRow: number,
  kind: SideRoomKind,
): SideRoomState {
  const minRow = doorRow - 3;
  const maxRow = doorRow;
  const floorRow = doorRow + 1;
  const ceilRow = minRow - 1;

  const isLeft = side === 'left';
  const minCol = isLeft ? -6 : 11;
  const maxCol = isLeft ? -1 : 16;
  const doorCol = isLeft ? WELL_CONSTANTS.SHAFT_LEFT_WALL_COL : WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL;
  const backWallCol = isLeft ? minCol - 1 : maxCol + 1;
  const shaftAdjacentCol = isLeft ? MIN_INTERIOR : MAX_INTERIOR;

  // Solid ceiling & back wall
  for (let col = Math.min(backWallCol, minCol); col <= Math.max(backWallCol, maxCol); col++) {
    setTile(world, col, ceilRow, TILE_KIND.SOLID);
  }
  for (let row = ceilRow; row <= floorRow; row++) {
    setTile(world, backWallCol, row, TILE_KIND.SOLID);
  }

  // Hollow room interior
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      setTile(world, col, row, TILE_KIND.EMPTY);
    }
  }

  // Solid shop floor across room and under doorway
  for (let col = minCol; col <= maxCol; col++) {
    setTile(world, col, floorRow, TILE_KIND.SHOP_FLOOR);
  }
  setTile(world, doorCol, floorRow, TILE_KIND.SHOP_FLOOR);

  // 2-tile-tall doorway through shaft border wall
  setTile(world, doorCol, doorRow - 1, TILE_KIND.EMPTY);
  setTile(world, doorCol, doorRow, TILE_KIND.EMPTY);

  // Ensure shaft entrance directly outside doorway is unobstructed and has a foothold
  setTile(world, shaftAdjacentCol, doorRow - 1, TILE_KIND.EMPTY);
  setTile(world, shaftAdjacentCol, doorRow, TILE_KIND.EMPTY);
  if (getTile(world, shaftAdjacentCol, floorRow) === TILE_KIND.EMPTY) {
    setTile(world, shaftAdjacentCol, floorRow, TILE_KIND.THIN_PLATFORM);
  }

  const centerX = ((minCol + maxCol + 1) * 0.5) * TS;
  const centerY = ((minRow + maxRow + 1) * 0.5) * TS;

  return {
    id: roomId,
    side,
    doorRow,
    minCol,
    maxCol,
    minRow,
    maxRow,
    centerX,
    centerY,
    kind,
    visited: false,
  };
}

/**
 * Generates a deterministic stage for the given area & level, assigns state.world,
 * carves side rooms, guarantees 100% navigability via BFS repair, and returns
 * enemy spawn descriptors & side room metadata.
 */
export function generateStage(state: SimState, area: AreaId, level: number): StageGenResult {
  const minCol = WELL_CONSTANTS.GRID_MIN_COL;
  const maxCol = WELL_CONSTANTS.GRID_MAX_COL;
  const cols = WELL_CONSTANTS.GRID_COLS;
  const chunks = getChunksForArea(area);

  const selectedChunks: Array<readonly string[]> = [];
  let entryRows = 6;
  let exitPaddingRows = 7;

  if (area === 0) {
    // Surface overworld shaft entrance
    entryRows = 6;
    exitPaddingRows = 4;
    selectedChunks.push(chunks[0]!);
  } else if (area === 5) {
    // Abyss tall boss chute (~60 rows total) with periodic thin ledges & wall module alcoves
    entryRows = 6;
    exitPaddingRows = 6;
    let bodyRows = 0;
    let lastIdx = -1;
    while (bodyRows < 48) {
      let idx = randInt(state, 0, chunks.length - 1);
      if (chunks.length > 1 && idx === lastIdx) {
        idx = (idx + 1) % chunks.length;
      }
      lastIdx = idx;
      const chunk = chunks[idx]!;
      selectedChunks.push(chunk);
      bodyRows += chunk.length;
    }
  } else {
    // Areas 1..4: levelLength = (area === 4 ? 16 : 15) + level chunks
    const levelLength = (area === 4 ? 16 : 15) + level;
    let lastIdx = -1;
    for (let i = 0; i < levelLength; i++) {
      let idx = randInt(state, 0, chunks.length - 1);
      if (chunks.length > 1 && idx === lastIdx) {
        idx = (idx + 1) % chunks.length;
      }
      lastIdx = idx;
      selectedChunks.push(chunks[idx]!);
    }
  }

  let bodyRowCount = 0;
  for (const chunk of selectedChunks) {
    bodyRowCount += chunk.length;
  }

  const totalRows = entryRows + bodyRowCount + exitPaddingRows;
  const exitRow = totalRows - 4;
  const waterStartRow = area === 3 ? 5 : -1;

  // Fill entire grid with SOLID border/exterior rock
  const tiles = new Array<TileKind>(totalRows * cols).fill(TILE_KIND.SOLID);
  const airPockets: AirPocket[] = [];
  const sideRooms: SideRoomState[] = [];
  const enemySpawns: Array<{ x: number; y: number; kind: EnemyKind }> = [];

  const world: WorldState = {
    area,
    level,
    minCol,
    maxCol,
    cols,
    rows: totalRows,
    tiles,
    waterStartRow,
    exitRow,
    sideRooms,
    airPockets,
    spikeTrapTimer: 0,
    spikeTrapExtended: false,
  };

  // Carve safe top entry shaft (cols 1..9)
  for (let row = 0; row < entryRows; row++) {
    for (let col = MIN_INTERIOR; col <= MAX_INTERIOR; col++) {
      setTile(world, col, row, TILE_KIND.EMPTY);
    }
  }
  // Helpful starting thin platform under spawn on row 4 for safe footing before descent
  if (area === 0) {
    for (let col = MIN_INTERIOR; col <= 3; col++) {
      setTile(world, col, 4, TILE_KIND.SOLID);
    }
    for (let col = 7; col <= MAX_INTERIOR; col++) {
      setTile(world, col, 4, TILE_KIND.SOLID);
    }
  } else {
    setTile(world, 4, 4, TILE_KIND.THIN_PLATFORM);
    setTile(world, 5, 4, TILE_KIND.THIN_PLATFORM);
    setTile(world, 6, 4, TILE_KIND.THIN_PLATFORM);
  }

  // Stamp chunks into interior cols 1..9
  let cursorRow = entryRows;
  for (const chunk of selectedChunks) {
    for (const rowStr of chunk) {
      for (let i = 0; i < SHAFT_W; i++) {
        const ch = rowStr[i] ?? '.';
        const col = MIN_INTERIOR + i;
        setTile(world, col, cursorRow, charToTileKind(ch));

        if (ch === 'E' && area >= 1 && area <= 4) {
          enemySpawns.push({
            x: col * TS + TS * 0.5,
            y: cursorRow * TS + TS * 0.5,
            kind: pickEnemyForArea(state, area),
          });
        } else if (ch === 'A') {
          airPockets.push({
            id: allocId(state),
            x: col * TS + TS * 0.5,
            y: cursorRow * TS + TS * 0.5,
            radius: 10,
            active: true,
            respawnTicks: 0,
          });
        }
      }
      cursorRow += 1;
    }
  }

  // Carve exit chamber & stage exit trigger row
  for (let row = cursorRow; row < totalRows; row++) {
    for (let col = MIN_INTERIOR; col <= MAX_INTERIOR; col++) {
      setTile(world, col, row, row === exitRow ? TILE_KIND.STAGE_EXIT : TILE_KIND.EMPTY);
    }
  }

  // Carve side rooms for Areas 1..4 (2..3 rooms) and Area 5 boss wall module alcoves (2 rooms)
  if (area >= 1 && area <= 4) {
    const roomCount = randInt(state, 2, 3);
    const style = getStyleDef(state.styleId);
    const membersCard = hasUpgrade(state, 14);
    const usableStart = entryRows + 5;
    const usableEnd = Math.max(usableStart + 10, exitRow - 8);
    const span = usableEnd - usableStart;

    // Choose room kinds according to Spin Style & Member's Card rules
    const kinds: SideRoomKind[] = [];
    for (let i = 0; i < roomCount; i++) {
      if (i === 0 && membersCard) {
        kinds.push('shop');
      } else if (style.gunModulesOnlyInSiderooms) {
        kinds.push(nextRandom(state) < 0.9 ? 'gun_module' : 'shop');
      } else if (i === 0) {
        kinds.push('gun_module');
      } else if (i === 1) {
        kinds.push('shop');
      } else {
        kinds.push(nextRandom(state) < 0.65 ? 'gun_module' : 'shop');
      }
    }

    // Shuffle non-Member's-Card rooms slightly so shop/module order varies naturally
    if (!membersCard && !style.gunModulesOnlyInSiderooms && kinds.length >= 2 && nextRandom(state) < 0.5) {
      const tmp = kinds[0]!;
      kinds[0] = kinds[1]!;
      kinds[1] = tmp;
    }

    let prevSide: 'left' | 'right' = nextRandom(state) < 0.5 ? 'left' : 'right';
    for (let i = 0; i < roomCount; i++) {
      const side: 'left' | 'right' = i === 0 ? prevSide : prevSide === 'left' ? 'right' : 'left';
      prevSide = side;

      let doorRow: number;
      if (i === 0 && membersCard) {
        doorRow = Math.min(usableEnd - 4, usableStart + randInt(state, 0, 3));
      } else {
        const segStart = usableStart + Math.floor((span * i) / roomCount);
        const segEnd = usableStart + Math.floor((span * (i + 1)) / roomCount) - 4;
        const clampedEnd = Math.max(segStart, segEnd);
        doorRow = randInt(state, segStart, clampedEnd);
      }

      // Clamp to valid interior vertical bounds for ceiling/floor
      doorRow = Math.max(6, Math.min(exitRow - 4, doorRow));

      const room = carveSideRoom(world, allocId(state), side, doorRow, kinds[i]!);
      sideRooms.push(room);
    }
  } else if (area === 5) {
    // Periodic wall-mounted gun module alcoves on alternating walls during boss chute
    const alcoveRows = [Math.floor(totalRows * 0.35), Math.floor(totalRows * 0.68)];
    for (let i = 0; i < alcoveRows.length; i++) {
      const side: 'left' | 'right' = i % 2 === 0 ? 'left' : 'right';
      const doorRow = Math.max(8, Math.min(exitRow - 6, alcoveRows[i]!));
      const room = carveSideRoom(world, allocId(state), side, doorRow, 'gun_module');
      sideRooms.push(room);
    }
  }

  // Remove any enemy spawns placed directly in carved side-room doorway tiles
  const filteredSpawns = enemySpawns.filter((sp) => {
    const col = Math.floor(sp.x / TS);
    const row = Math.floor(sp.y / TS);
    for (const room of sideRooms) {
      const adjCol = room.side === 'left' ? MIN_INTERIOR : MAX_INTERIOR;
      if (col === adjCol && (row === room.doorRow || row === room.doorRow - 1)) {
        return false;
      }
    }
    return true;
  });

  // Guarantee 100% passable descent path via BFS + auto-carve fallback
  ensureStageNavigable(world);

  state.world = world;

  return {
    enemySpawns: filteredSpawns,
    sideRooms,
  };
}
