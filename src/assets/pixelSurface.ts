import type { SpriteRect } from '../contracts/index.ts';

// ============================================================================
// Krunked Well — Strict 4-Channel Semantic Pixel Surface & Atlas Packer
// Strictly uses the 4 semantic RGB keys + transparent alpha=0:
//   L = #FFFFFF (Light: player, stompable foes, carved stone, platforms, HUD)
//   M = #FF0000 (Mid: hazards, un-stompable foes, spikes, breakables, gems)
//   D = #000000 (Dark: void, ink outlines, eyes, deep shadow crevices)
//   S = #007EFF (Special: Aquifer water, bubbles, air, Limbo tech, accents)
// ============================================================================

export const ATLAS_W = 1024;
export const ATLAS_H = 512;

export type SemanticChannel = 'L' | 'M' | 'D' | 'S';

const SEMANTIC_RGBA: Record<SemanticChannel, readonly [number, number, number, number]> = {
  L: [255, 255, 255, 255],
  M: [255, 0, 0, 255],
  D: [0, 0, 0, 255],
  S: [0, 126, 255, 255],
};

export class PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width = ATLAS_W, height = ATLAS_H) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, ch: SemanticChannel): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const rgba = SEMANTIC_RGBA[ch];
    const idx = (iy * this.width + ix) * 4;
    this.data[idx] = rgba[0];
    this.data[idx + 1] = rgba[1];
    this.data[idx + 2] = rgba[2];
    this.data[idx + 3] = rgba[3];
  }

  isOpaque(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false;
    return this.data[(iy * this.width + ix) * 4 + 3]! > 0;
  }

  clearPx(x: number, y: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    this.data[(iy * this.width + ix) * 4 + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, ch: SemanticChannel): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.px(x + dx, y + dy, ch);
      }
    }
  }

  ditherRect(
    x: number,
    y: number,
    w: number,
    h: number,
    chA: SemanticChannel,
    chB: SemanticChannel,
    density: 0.25 | 0.5 | 0.75 = 0.5,
  ): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = Math.floor(x + dx);
        const py = Math.floor(y + dy);
        let useA: boolean;
        if (density === 0.5) {
          useA = ((px + py) & 1) === 0;
        } else if (density === 0.25) {
          useA = (px & 1) === 0 && (py & 1) === 0;
        } else {
          useA = !((px & 1) === 1 && (py & 1) === 1);
        }
        this.px(px, py, useA ? chA : chB);
      }
    }
  }

  circle(
    cx: number,
    cy: number,
    r: number,
    ch: SemanticChannel,
    outlineOnly = false,
  ): void {
    const r2 = r * r;
    const inner2 = Math.max(0, (r - 1.15) * (r - 1.15));
    const lim = Math.ceil(r);
    for (let dy = -lim; dy <= lim; dy++) {
      for (let dx = -lim; dx <= lim; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && (!outlineOnly || d2 >= inner2)) {
          this.px(cx + dx, cy + dy, ch);
        }
      }
    }
  }

  stampGrid(ox: number, oy: number, rows: readonly string[]): void {
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r]!;
      for (let c = 0; c < line.length; c++) {
        const ch = line.charAt(c);
        if (ch === 'L' || ch === 'M' || ch === 'D' || ch === 'S') {
          this.px(ox + c, oy + r, ch);
        }
      }
    }
  }

  /**
   * Adds a crisp 1px dark ('D') outline into transparent neighbors around
   * an already-drawn sprite box [ox..ox+w-1, oy..oy+h-1] so silhouettes pop
   * cleanly even over dense textured walls!
   */
  addOutline(ox: number, oy: number, w: number, h: number, outlineCh: SemanticChannel = 'D'): void {
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.isOpaque(ox + x, oy + y)) {
          mask[y * w + x] = 1;
        }
      }
    }
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x] === 1) continue;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
            this.px(ox + x, oy + y, outlineCh);
            break;
          }
        }
      }
    }
  }
}

export class ShelfPacker {
  private penX = 0;
  private penY = 0;
  private rowH = 0;
  readonly sprites: Record<string, SpriteRect> = {};

  alloc(
    id: string,
    frameW: number,
    frameH: number,
    frames: number,
    originX: number,
    originY: number,
  ): { x: number; y: number } {
    const totalW = frameW * frames;
    if (this.penX + totalW > ATLAS_W) {
      this.penX = 0;
      this.penY += this.rowH + 1;
      this.rowH = 0;
    }
    if (this.penY + frameH > ATLAS_H) {
      throw new Error(`ProceduralWellAtlas overflow while packing ${id}`);
    }
    const x = this.penX;
    const y = this.penY;
    this.penX += totalW + 1;
    if (frameH > this.rowH) {
      this.rowH = frameH;
    }
    this.sprites[id] = {
      id,
      x,
      y,
      w: frameW,
      h: frameH,
      originX,
      originY,
      frames,
      frameStrideX: frames > 1 ? frameW : 0,
    };
    return { x, y };
  }

  alias(aliasId: string, sourceId: string): void {
    const src = this.sprites[sourceId];
    if (!src) return;
    this.sprites[aliasId] = { ...src, id: aliasId };
  }
}
