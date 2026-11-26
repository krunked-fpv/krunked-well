import { TILE_KIND, type TileKind, type WorldState } from '../contracts/index.ts';
import { getTile } from '../sim/simUtils.ts';

export const AUTOTILE_N = 1;
export const AUTOTILE_E = 2;
export const AUTOTILE_S = 4;
export const AUTOTILE_W = 8;

function connectsAsWall(kind: TileKind): boolean {
  return kind === TILE_KIND.SOLID || kind === TILE_KIND.SHOP_FLOOR;
}

/**
 * Computes a 4-bit N/E/S/W connectivity bitmask (0..15) for a wall tile.
 * Bit 0 (1): North, Bit 1 (2): East, Bit 2 (4): South, Bit 3 (8): West.
 */
export function computeWallBitmask(world: WorldState, col: number, row: number): number {
  let mask = 0;
  if (connectsAsWall(getTile(world, col, row - 1))) mask |= AUTOTILE_N;
  if (connectsAsWall(getTile(world, col + 1, row))) mask |= AUTOTILE_E;
  if (connectsAsWall(getTile(world, col, row + 1))) mask |= AUTOTILE_S;
  if (connectsAsWall(getTile(world, col - 1, row))) mask |= AUTOTILE_W;
  return mask;
}
