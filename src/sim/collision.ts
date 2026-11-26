import {
  TILE_KIND,
  WELL_CONSTANTS,
  type SimState,
  type TileKind,
  type WorldState,
} from '../contracts/index.ts';
import {
  getTile,
  isBreakableTile,
  isHazardTile,
  isSolidTile,
  isThinPlatform,
  xToCol,
  yToRow,
} from './simUtils.ts';

const TS = WELL_CONSTANTS.TILE_SIZE;
const HALF_W = WELL_CONSTANTS.PLAYER_HALF_W;
const TOP_OFF = WELL_CONSTANTS.PLAYER_TOP_OFFSET;
const BOT_OFF = WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;
const THIN_H = WELL_CONSTANTS.THIN_PLATFORM_H;
const EPS = 1e-6;

export interface PlayerCollisionResult {
  hitFloor: boolean;
  hitCeiling: boolean;
  hitWall: -1 | 0 | 1;
  landedOnThin: boolean;
  touchedHazard: boolean;
}

export interface HazardOverlapResult {
  hit: boolean;
  sourceX: number;
  sourceY: number;
}

export interface RaycastResult {
  hitY: number;
  hitCol: number;
  hitRow: number;
  hitTile: TileKind | null;
}

/**
 * Returns true if the player AABB centered horizontally at x with top y+TOP_OFF
 * and bottom y+BOT_OFF overlaps any solid tile in world.
 */
function overlapsSolid(world: WorldState, x: number, y: number): boolean {
  const left = x - HALF_W;
  const right = x + HALF_W;
  const top = y + TOP_OFF;
  const bottom = y + BOT_OFF;

  const colMin = Math.floor(left / TS);
  const colMax = Math.floor((right - EPS) / TS);
  const rowMin = Math.floor(top / TS);
  const rowMax = Math.floor((bottom - EPS) / TS);

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      if (isSolidTile(getTile(world, col, row), world)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks whether a 1px probe left or right of the player touches a solid wall.
 */
export function detectWallContact(world: WorldState, x: number, y: number): -1 | 0 | 1 {
  if (overlapsSolid(world, x - 0.5, y)) {
    return -1;
  }
  if (overlapsSolid(world, x + 0.5, y)) {
    return 1;
  }
  return 0;
}

/**
 * Checks if any one-way 2px thin platform supports a falling player stepping
 * from prevBottom to newBottom. Returns the top Y of the caught platform, or null.
 */
function findCaughtThinPlatformTop(
  world: WorldState,
  x: number,
  prevBottom: number,
  newBottom: number,
): number | null {
  const left = x - HALF_W;
  const right = x + HALF_W;
  const colMin = Math.floor(left / TS);
  const colMax = Math.floor((right - EPS) / TS);

  const rowStart = Math.floor((prevBottom - 1) / TS);
  const rowEnd = Math.floor((newBottom + EPS) / TS);

  let caughtTop: number | null = null;
  for (let row = rowStart; row <= rowEnd; row++) {
    const platTop = row * TS;
    // Only catch when player's previous feet were at or above platTop + 1
    // and new feet have reached or crossed platTop (top strip platTop .. platTop + THIN_H).
    if (prevBottom <= platTop + 1 + EPS && newBottom >= platTop - EPS && newBottom <= platTop + THIN_H + 1) {
      for (let col = colMin; col <= colMax; col++) {
        if (isThinPlatform(getTile(world, col, row))) {
          if (caughtTop === null || platTop < caughtTop) {
            caughtTop = platTop;
          }
        }
      }
    }
  }
  return caughtTop;
}

/**
 * Attempts a <= CORNER_NUDGE_PX horizontal shift to clear a ceiling corner bonk.
 * Returns the nudged X position if clear, or null if squarely blocked.
 */
function tryCeilingCornerNudge(world: WorldState, x: number, curY: number, nextY: number): number | null {
  const maxNudge = WELL_CONSTANTS.CORNER_NUDGE_PX;
  const left = x - HALF_W;
  const right = x + HALF_W;
  const topRow = Math.floor((nextY + TOP_OFF) / TS);
  const colMin = Math.floor(left / TS);
  const colMax = Math.floor((right - EPS) / TS);

  // Collect exact candidate shifts (to tile edge) plus 1..maxNudge integer steps.
  const candidates: number[] = [];

  // Shift right to clear left-edge overlap with colMin
  if (isSolidTile(getTile(world, colMin, topRow), world)) {
    const exactRight = (colMin + 1) * TS - left;
    if (exactRight > 0 && exactRight <= maxNudge + EPS) {
      candidates.push(exactRight);
    }
  }
  // Shift left to clear right-edge overlap with colMax
  if (isSolidTile(getTile(world, colMax, topRow), world)) {
    const exactLeft = right - colMax * TS;
    if (exactLeft > 0 && exactLeft <= maxNudge + EPS) {
      candidates.push(-exactLeft);
    }
  }

  for (let d = 1; d <= maxNudge; d++) {
    candidates.push(d, -d);
  }

  for (const dx of candidates) {
    if (Math.abs(dx) > maxNudge + EPS) continue;
    const nudgedX = x + dx;
    if (!overlapsSolid(world, nudgedX, curY) && !overlapsSolid(world, nudgedX, nextY)) {
      return nudgedX;
    }
  }
  return null;
}

/**
 * Swept axis-separated 1px-stepped AABB movement and collision for the player.
 * Handles solid tiles, 2px ceiling corner nudging, and zero-tunneling 2px thin platforms.
 */
export function moveAndCollidePlayer(state: SimState): PlayerCollisionResult {
  const p = state.player;
  const world = state.world;

  let hitFloor = false;
  let hitCeiling = false;
  let hitWall: -1 | 0 | 1 = 0;
  let landedOnThin = false;

  // --- 1. Horizontal Sweep (1px max sub-step) ---
  let remX = p.vx;
  while (Math.abs(remX) > 1e-7) {
    const step = Math.abs(remX) > 1 ? Math.sign(remX) : remX;
    const nextX = p.x + step;

    if (overlapsSolid(world, nextX, p.y)) {
      if (step > 0) {
        const rightCol = Math.floor((nextX + HALF_W - EPS) / TS);
        p.x = rightCol * TS - HALF_W;
        hitWall = 1;
      } else {
        const leftCol = Math.floor((nextX - HALF_W) / TS);
        p.x = (leftCol + 1) * TS + HALF_W;
        hitWall = -1;
      }
      p.vx = 0;
      break;
    }

    p.x = nextX;
    remX -= step;
  }

  // --- 2. Vertical Sweep (1px max sub-step) ---
  let remY = p.vy;
  if (Math.abs(remY) <= 1e-7) {
    // Grounded probe at vy === 0 so standing on floor or thin platform stays grounded.
    const bottom = p.y + BOT_OFF;
    if (overlapsSolid(world, p.x, p.y + 0.5)) {
      hitFloor = true;
    } else {
      const thinTop = findCaughtThinPlatformTop(world, p.x, bottom, bottom + 0.5);
      if (thinTop !== null) {
        p.y = thinTop - BOT_OFF;
        hitFloor = true;
        landedOnThin = true;
      }
    }
  } else {
    while (Math.abs(remY) > 1e-7) {
      const step = Math.abs(remY) > 1 ? Math.sign(remY) : remY;
      const prevY = p.y;
      const nextY = prevY + step;

      if (step > 0) {
        // Falling / downward movement
        const prevBottom = prevY + BOT_OFF;
        const nextBottom = nextY + BOT_OFF;

        // Check one-way 2px thin platforms first so standing on a thin platform
        // at a tile boundary snaps before stepping past its 2px top strip.
        const thinTop = findCaughtThinPlatformTop(world, p.x, prevBottom, nextBottom);
        if (thinTop !== null) {
          p.y = thinTop - BOT_OFF;
          p.vy = 0;
          hitFloor = true;
          landedOnThin = true;
          break;
        }

        if (overlapsSolid(world, p.x, nextY)) {
          const hitRow = Math.floor((nextBottom - EPS) / TS);
          p.y = hitRow * TS - BOT_OFF;
          p.vy = 0;
          hitFloor = true;
          landedOnThin = false;
          break;
        }

        p.y = nextY;
      } else {
        // Rising / upward movement — passes freely through THIN_PLATFORM
        if (overlapsSolid(world, p.x, nextY)) {
          const nudgedX = tryCeilingCornerNudge(world, p.x, prevY, nextY);
          if (nudgedX !== null) {
            p.x = nudgedX;
            p.y = nextY;
          } else {
            const hitRow = Math.floor((nextY + TOP_OFF) / TS);
            p.y = (hitRow + 1) * TS - TOP_OFF;
            p.vy = 0;
            hitCeiling = true;
            break;
          }
        } else {
          p.y = nextY;
        }
      }

      remY -= step;
    }
  }

  const hazard = checkHazardOverlap(state);

  return {
    hitFloor,
    hitCeiling,
    hitWall,
    landedOnThin,
    touchedHazard: hazard.hit,
  };
}

/**
 * Checks if the player's AABB overlaps any active hazard/spike tile.
 */
export function checkHazardOverlap(state: SimState): HazardOverlapResult {
  const p = state.player;
  const world = state.world;

  const pLeft = p.x - HALF_W;
  const pRight = p.x + HALF_W;
  const pTop = p.y + TOP_OFF;
  const pBottom = p.y + BOT_OFF;

  const colMin = Math.floor(pLeft / TS);
  const colMax = Math.floor((pRight - EPS) / TS);
  const rowMin = Math.floor(pTop / TS);
  const rowMax = Math.floor((pBottom - EPS) / TS);

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const tile = getTile(world, col, row);
      if (!isHazardTile(tile, world)) continue;

      const tx = col * TS;
      const ty = row * TS;
      let hLeft = tx + 2;
      let hRight = tx + TS - 2;
      let hTop = ty + 2;
      let hBottom = ty + TS - 2;

      if (tile === TILE_KIND.SPIKE_UP) {
        hTop = ty + 4;
        hBottom = ty + TS;
      } else if (tile === TILE_KIND.SPIKE_DOWN) {
        hTop = ty;
        hBottom = ty + TS - 4;
      } else if (tile === TILE_KIND.SPIKE_LEFT) {
        hLeft = tx + 4;
        hRight = tx + TS;
      } else if (tile === TILE_KIND.SPIKE_RIGHT) {
        hLeft = tx;
        hRight = tx + TS - 4;
      }

      if (pRight > hLeft && pLeft < hRight && pBottom > hTop && pTop < hBottom) {
        return {
          hit: true,
          sourceX: tx + TS * 0.5,
          sourceY: ty + TS * 0.5,
        };
      }
    }
  }

  return { hit: false, sourceX: 0, sourceY: 0 };
}

/**
 * Downward vertical hitscan raycast for the Laser gunboot.
 * Pierces non-solid and breakable tiles (unless stopOnBreakable is true)
 * until hitting a solid wall or reaching maxDist.
 */
export function raycastDown(
  world: WorldState,
  x: number,
  startY: number,
  maxDist: number,
  stopOnBreakable = false,
): RaycastResult {
  const col = xToCol(x);
  const endY = startY + Math.max(0, maxDist);
  const startRow = Math.max(0, yToRow(startY));
  const endRow = Math.min(world.rows - 1, yToRow(endY));

  for (let row = startRow; row <= endRow; row++) {
    const tile = getTile(world, col, row);
    const stopsRay = isSolidTile(tile, world) && (stopOnBreakable || !isBreakableTile(tile));
    if (stopsRay) {
      const tileTop = row * TS;
      const hitY = row === startRow ? startY : Math.min(endY, tileTop);
      return {
        hitY,
        hitCol: col,
        hitRow: row,
        hitTile: tile,
      };
    }
  }

  return {
    hitY: endY,
    hitCol: col,
    hitRow: -1,
    hitTile: null,
  };
}
