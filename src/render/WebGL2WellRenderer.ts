import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AssetManifest,
  type BossState,
  type RenderSettings,
  type SideRoomState,
  type SimState,
  type SpriteRect,
  type WorldState,
} from '../contracts/index.ts';
import { getEnemyDef } from '../data/enemies.ts';
import { getPalette } from '../data/palettes.ts';
import { getStyleDef } from '../data/styles.ts';
import { getShopItemDef } from '../data/upgrades.ts';
import { getWeaponDef } from '../data/weapons.ts';
import { getTile } from '../sim/simUtils.ts';
import { drawWellHud } from '../ui/HudRenderer.ts';
import { AUTOTILE_E, AUTOTILE_W, computeWallBitmask } from './Autotiler.ts';
import { drawBitmapTextOutlined } from './BitmapFont.ts';
import type { ParticleSystem } from './ParticleSystem.ts';

// ============================================================================
// Krunked Well — Authentic 160x284 WebGL2 4-Channel Semantic Pixel Renderer
//
// * Native 160x284 integer pixel pipeline with gl.NEAREST scaling (zero blur).
// * Strict 4-channel semantic color keys (L=#FFFFFF, M=#FF0000, D=#000000,
//   S=#007EFF) remapped in a single GPU fragment shader pass across all 38
//   unlockable palettes — identically for Built-In and Owned Custom Packs.
// * Seamless outer bedrock wall fusion, 4-variant cracked breakable blocks,
//   minimalist 4-channel biome architecture, hooded shopkeeper interiors,
//   exact-silhouette hit-flashes & dithered afterimages, and iconic integer-
//   stepped pixel-circle explosions/smoke/shockwave VFX.
// ============================================================================

const VIEW_W = WELL_CONSTANTS.VIEW_W;
const VIEW_H = WELL_CONSTANTS.VIEW_H;
const TILE = WELL_CONSTANTS.TILE_SIZE;

const COL_L = '#FFFFFF';
const COL_M = '#FF0000';
const COL_D = '#000000';
const COL_S = '#007EFF';

const VERT_SRC = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);
const vec2 UV[4] = vec2[4](
  vec2(0.0, 1.0),
  vec2(1.0, 1.0),
  vec2(0.0, 0.0),
  vec2(1.0, 0.0)
);
out vec2 vUv;
void main() {
  vUv = UV[gl_VertexID];
  gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
}
`;

// Nearest-semantic-key 4-channel GPU palette swapper (bit-exact on L/M/D/S)
const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDark;
uniform vec3 uSpecial;
out vec4 outColor;

void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 dL = c - vec3(1.0, 1.0, 1.0);
  vec3 dM = c - vec3(1.0, 0.0, 0.0);
  vec3 dD = c - vec3(0.0, 0.0, 0.0);
  vec3 dS = c - vec3(0.0, 0.49411765, 1.0);

  float distL = dot(dL, dL);
  float distM = dot(dM, dM);
  float distD = dot(dD, dD);
  float distS = dot(dS, dS);

  vec3 col = uDark;
  float best = distD;
  if (distL < best) { best = distL; col = uLight; }
  if (distM < best) { best = distM; col = uMid; }
  if (distS < best) { col = uSpecial; }

  outColor = vec4(col, 1.0);
}
`;

interface ExtendedFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  targetX?: number;
  targetY?: number;
}

interface ExtendedSpriteRect extends SpriteRect {
  targetX?: number;
  targetY?: number;
  frameRects?: readonly ExtendedFrameRect[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function isInsideAnySideRoom(world: WorldState, col: number, row: number): boolean {
  for (let i = 0; i < world.sideRooms.length; i++) {
    const r = world.sideRooms[i]!;
    if (col >= r.minCol && col <= r.maxCol && row >= r.minRow && row <= r.maxRow) {
      return true;
    }
  }
  return false;
}

function isOutsideShaftBedrock(world: WorldState, col: number, row: number): boolean {
  if (col >= WELL_CONSTANTS.SHAFT_LEFT_WALL_COL && col <= WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL) {
    return false;
  }
  if (world.area === 0 && row < 8) {
    return false;
  }
  return !isInsideAnySideRoom(world, col, row);
}

// ============================================================================
// Integer-Stepped Pixel-Art Primitives (Zero Canvas2D Anti-Aliasing!)
// ============================================================================

function fillPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  const ir = Math.round(r);
  if (ir <= 0) return;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  ctx.fillStyle = color;
  if (ir === 1) {
    ctx.fillRect(icx - 1, icy, 3, 1);
    ctx.fillRect(icx, icy - 1, 1, 3);
    return;
  }
  const r2 = (ir + 0.25) * (ir + 0.25);
  for (let dy = -ir; dy <= ir; dy++) {
    const span = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
  }
}

function strokePixelRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  dashed = false,
): void {
  const ir = Math.round(r);
  if (ir <= 0) return;
  const icx = Math.round(cx);
  const icy = Math.round(cy);
  ctx.fillStyle = color;
  let x = ir;
  let y = 0;
  let err = 1 - ir;
  let step = 0;
  while (x >= y) {
    if (!dashed || (step & 1) === 0) {
      ctx.fillRect(icx + x, icy + y, 1, 1);
      ctx.fillRect(icx + y, icy + x, 1, 1);
      ctx.fillRect(icx - y, icy + x, 1, 1);
      ctx.fillRect(icx - x, icy + y, 1, 1);
      ctx.fillRect(icx - x, icy - y, 1, 1);
      ctx.fillRect(icx - y, icy - x, 1, 1);
      ctx.fillRect(icx + y, icy - x, 1, 1);
      ctx.fillRect(icx + x, icy - y, 1, 1);
    }
    y++;
    step++;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err += 2 * (y - x + 1);
    }
  }
}

function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  stepMask = 1,
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  let count = 0;
  ctx.fillStyle = color;
  while (true) {
    if (stepMask <= 1 || count % stepMask === 0) {
      ctx.fillRect(ix0, iy0, 1, 1);
    }
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
    count++;
    if (count > 512) break;
  }
}

// ============================================================================
// WebGL2 Semantic Palette Renderer Class
// ============================================================================

export class WebGL2WellRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly semCanvas: HTMLCanvasElement;
  private readonly semCtx: CanvasRenderingContext2D;

  // Scratch canvas for exact-silhouette hit flashes & dithered afterimages
  private readonly tintCanvas: HTMLCanvasElement;
  private readonly tintCtx: CanvasRenderingContext2D;

  // WebGL2 state
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private tex: WebGLTexture | null = null;
  private uLightLoc: WebGLUniformLocation | null = null;
  private uMidLoc: WebGLUniformLocation | null = null;
  private uDarkLoc: WebGLUniformLocation | null = null;
  private uSpecialLoc: WebGLUniformLocation | null = null;

  // Software fallback state
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private fallbackOutImg: ImageData | null = null;

  private atlasSource: CanvasImageSource | null = null;
  private manifest: AssetManifest | null = null;
  private paletteIndex = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;

    this.semCanvas = document.createElement('canvas');
    this.semCanvas.width = VIEW_W;
    this.semCanvas.height = VIEW_H;
    const sCtx = this.semCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx) {
      throw new Error('Failed to create 2D semantic offscreen context');
    }
    sCtx.imageSmoothingEnabled = false;
    this.semCtx = sCtx;

    this.tintCanvas = document.createElement('canvas');
    this.tintCanvas.width = 48;
    this.tintCanvas.height = 96;
    const tCtx = this.tintCanvas.getContext('2d');
    if (!tCtx) {
      throw new Error('Failed to create 2D tint scratch context');
    }
    tCtx.imageSmoothingEnabled = false;
    this.tintCtx = tCtx;

    if (!this.initWebGL2()) {
      const fCtx = this.canvas.getContext('2d');
      if (fCtx) {
        fCtx.imageSmoothingEnabled = false;
        this.fallbackCtx = fCtx;
        this.fallbackOutImg = fCtx.createImageData(VIEW_W, VIEW_H);
      }
    }
  }

  private initWebGL2(): boolean {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!gl) return false;

      const vs = gl.createShader(gl.VERTEX_SHADER);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      if (!vs || !fs) return false;

      gl.shaderSource(vs, VERT_SRC);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return false;
      }

      gl.shaderSource(fs, FRAG_SRC);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return false;
      }

      const prog = gl.createProgram();
      if (!prog) return false;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        return false;
      }

      const vao = gl.createVertexArray();
      const tex = gl.createTexture();
      if (!vao || !tex) return false;

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, VIEW_W, VIEW_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      gl.useProgram(prog);
      const uTexLoc = gl.getUniformLocation(prog, 'uTex');
      if (uTexLoc) gl.uniform1i(uTexLoc, 0);

      this.gl = gl;
      this.program = prog;
      this.vao = vao;
      this.tex = tex;
      this.uLightLoc = gl.getUniformLocation(prog, 'uLight');
      this.uMidLoc = gl.getUniformLocation(prog, 'uMid');
      this.uDarkLoc = gl.getUniformLocation(prog, 'uDark');
      this.uSpecialLoc = gl.getUniformLocation(prog, 'uSpecial');
      return true;
    } catch {
      return false;
    }
  }

  setAtlas(source: CanvasImageSource, manifest: AssetManifest): void {
    this.atlasSource = source;
    this.manifest = manifest;
  }

  setPalette(paletteIndex: number): void {
    this.paletteIndex = paletteIndex;
  }

  private lookupSprite(id: string): ExtendedSpriteRect | null {
    const sprites = this.manifest?.sprites;
    if (!sprites) return null;
    return (sprites[id] as ExtendedSpriteRect | undefined) ?? null;
  }

  private drawSprite(
    id: string,
    frame: number,
    screenX: number,
    screenY: number,
    flipX = false,
    flipY = false,
  ): boolean {
    if (!this.atlasSource) return false;
    const spr = this.lookupSprite(id);
    if (!spr) return false;

    const ctx = this.semCtx;
    const fCount = Math.max(1, spr.frames);
    const fIdx = ((Math.floor(frame) % fCount) + fCount) % fCount;

    let sx = spr.x + fIdx * spr.frameStrideX;
    let sy = spr.y;
    let sw = spr.w;
    let sh = spr.h;
    let offX = spr.targetX ?? 0;
    let offY = spr.targetY ?? 0;

    if (spr.frameRects && spr.frameRects[fIdx]) {
      const fr = spr.frameRects[fIdx]!;
      sx = fr.x;
      sy = fr.y;
      sw = fr.w;
      sh = fr.h;
      offX = fr.targetX ?? 0;
      offY = fr.targetY ?? 0;
    }

    const dx = Math.round(screenX);
    const dy = Math.round(screenY);

    if (!flipX && !flipY) {
      ctx.drawImage(
        this.atlasSource,
        sx,
        sy,
        sw,
        sh,
        dx - spr.originX + offX,
        dy - spr.originY + offY,
        sw,
        sh,
      );
      return true;
    }

    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(
      this.atlasSource,
      sx,
      sy,
      sw,
      sh,
      -spr.originX + offX,
      -spr.originY + offY,
      sw,
      sh,
    );
    ctx.restore();
    return true;
  }

  /**
   * Renders the exact pixel silhouette of a sprite filled with a solid semantic
   * channel (used for crisp white hit-flashes and dithered pixel afterimages!).
   */
  private drawSilhouetteSprite(
    id: string,
    frame: number,
    screenX: number,
    screenY: number,
    color: string,
    flipX = false,
    flipY = false,
    ditherPhase: -1 | 0 | 1 = -1,
  ): boolean {
    if (!this.atlasSource) return false;
    const spr = this.lookupSprite(id);
    if (!spr) return false;

    const fCount = Math.max(1, spr.frames);
    const fIdx = ((Math.floor(frame) % fCount) + fCount) % fCount;
    let sx = spr.x + fIdx * spr.frameStrideX;
    let sy = spr.y;
    let sw = spr.w;
    let sh = spr.h;
    let offX = spr.targetX ?? 0;
    let offY = spr.targetY ?? 0;

    if (spr.frameRects && spr.frameRects[fIdx]) {
      const fr = spr.frameRects[fIdx]!;
      sx = fr.x;
      sy = fr.y;
      sw = fr.w;
      sh = fr.h;
      offX = fr.targetX ?? 0;
      offY = fr.targetY ?? 0;
    }

    if (sw > this.tintCanvas.width || sh > this.tintCanvas.height) {
      return this.drawSprite(id, frame, screenX, screenY, flipX, flipY);
    }

    const tCtx = this.tintCtx;
    tCtx.globalCompositeOperation = 'source-over';
    tCtx.clearRect(0, 0, sw, sh);
    tCtx.drawImage(this.atlasSource, sx, sy, sw, sh, 0, 0, sw, sh);
    tCtx.globalCompositeOperation = 'source-atop';
    tCtx.fillStyle = color;
    tCtx.fillRect(0, 0, sw, sh);

    if (ditherPhase >= 0) {
      // Crisp 1-bit pixel checkerboard mask so afterimages look truly retro!
      tCtx.globalCompositeOperation = 'destination-out';
      tCtx.fillStyle = '#000000';
      for (let py = 0; py < sh; py++) {
        for (let px = (py + ditherPhase) & 1; px < sw; px += 2) {
          tCtx.fillRect(px, py, 1, 1);
        }
      }
    }
    tCtx.globalCompositeOperation = 'source-over';

    const ctx = this.semCtx;
    const dx = Math.round(screenX);
    const dy = Math.round(screenY);
    if (!flipX && !flipY) {
      ctx.drawImage(this.tintCanvas, 0, 0, sw, sh, dx - spr.originX + offX, dy - spr.originY + offY, sw, sh);
    } else {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(this.tintCanvas, 0, 0, sw, sh, -spr.originX + offX, -spr.originY + offY, sw, sh);
      ctx.restore();
    }
    return true;
  }

  // ==========================================================================
  // Minimalist 4-Channel Retro Pixel Biome Backdrops (Never Clutters Readability)
  // ==========================================================================

  private renderBiomeBackdrop(
    world: WorldState,
    scrollX: number,
    scrollY: number,
    tick: number,
  ): void {
    const ctx = this.semCtx;
    ctx.fillStyle = COL_D;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const area = world.area;

    if (area === 0) {
      // SURFACE OVERWORLD: Crisp night starfield, pixel crescent moon, mountain rim & wellhead
      // Ground tiles sit cleanly at row 4 (y = 64px)!
      const skyBottomY = Math.round(4 * TILE - scrollY);
      if (skyBottomY > 0) {
        // Stars (subtle parallax strictly in the open night sky above row 4)
        for (let i = 0; i < 28; i++) {
          const sx = ((i * 37 + 13) % (VIEW_W - 8)) + 4;
          const sy = ((i * 23 + 7) % 108) - Math.round(scrollY * 0.12);
          if (sy >= 14 && sy < Math.min(skyBottomY - 12, VIEW_H)) {
            const twinkle = ((tick >> 4) + i) % 9 === 0;
            ctx.fillStyle = i % 7 === 0 ? COL_S : COL_L;
            ctx.fillRect(sx, sy, 1, 1);
            if (twinkle && i % 3 === 0) {
              ctx.fillRect(sx - 1, sy, 3, 1);
              ctx.fillRect(sx, sy - 1, 1, 3);
            }
          }
        }

        // Pixel Crescent Moon perched cleanly in upper-right night sky
        const moonX = 128;
        const moonY = Math.round(skyBottomY - 62);
        if (moonY > 18 && moonY < skyBottomY - 18) {
          fillPixelCircle(ctx, moonX, moonY, 9, COL_L);
          fillPixelCircle(ctx, moonX - 4, moonY - 2, 8, COL_D);
        }

        // Distant pixel mountain ridge silhouette resting cleanly on ground row 4
        const ridgeY = skyBottomY - 1;
        if (ridgeY > 0 && ridgeY < VIEW_H + 30) {
          ctx.fillStyle = COL_L;
          for (let x = 0; x < VIEW_W; x += 2) {
            const h = Math.round(Math.sin(x * 0.055) * 6 + Math.cos(x * 0.13) * 4 + 10);
            ctx.fillRect(x, ridgeY - h, 2, 1);
          }
        }

        // Crisp wooden WELL signpost planted solidly on the left ground ledge (col 2, row 4)
        const signX = Math.round(2 * TILE - scrollX + 4);
        const signY = Math.round(4 * TILE - scrollY - 20);
        if (signY > -24 && signY < VIEW_H) {
          ctx.fillStyle = COL_L;
          ctx.fillRect(signX + 11, signY + 11, 2, 9);
          ctx.fillRect(signX, signY, 24, 12);
          ctx.fillStyle = COL_D;
          ctx.fillRect(signX + 1, signY + 1, 22, 10);
          drawBitmapTextOutlined(ctx, 'WELL', signX + 12, signY + 3, COL_L, COL_D, 1, 'center');
        }
      }
      return;
    }

    // World-anchored shaft wall inner edges so wall accents NEVER float in mid-air!
    const leftWallEdgeX = (WELL_CONSTANTS.SHAFT_LEFT_WALL_COL + 1) * TILE - scrollX;
    const rightWallEdgeX = WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL * TILE - scrollX;

    if (area === 1) {
      // CAVERN: Subtle hanging pixel chains anchored physically to the shaft walls
      const parallaxY = Math.round(scrollY * 0.35);
      ctx.fillStyle = COL_L;
      for (let i = 0; i < 12; i++) {
        const y = ((i * 61 - parallaxY) % (VIEW_H + 40) + (VIEW_H + 40)) % (VIEW_H + 40) - 20;
        const x = (i & 1) === 0 ? leftWallEdgeX + 2 : rightWallEdgeX - 3;
        if (x < 0 || x >= VIEW_W) continue;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x, y + 3, 1, 1);
        ctx.fillRect(x, y + 6, 1, 1);
      }
      return;
    }

    if (area === 2) {
      // CATACOMB: Gothic arch ribs & tiny flickering wall sconces physically mounted to shaft walls!
      const step = 64;
      const firstBand = Math.floor((scrollY * 0.5) / step) - 1;
      for (let b = firstBand; b <= firstBand + 6; b++) {
        const by = Math.round(b * step - scrollY * 0.5);
        if (by < -20 || by > VIEW_H + 20) continue;
        const flick = ((tick >> 2) + b) & 1;
        if (leftWallEdgeX >= -4 && leftWallEdgeX < VIEW_W) {
          ctx.fillStyle = COL_L;
          ctx.fillRect(leftWallEdgeX, by, 4, 1);
          ctx.fillRect(leftWallEdgeX, by + 1, 2, 2);
          ctx.fillStyle = COL_M;
          ctx.fillRect(leftWallEdgeX + 2, by - 3 - flick, 1, 2 + flick);
          ctx.fillStyle = COL_L;
          ctx.fillRect(leftWallEdgeX + 2, by - 2, 1, 1);
        }
        if (rightWallEdgeX > 0 && rightWallEdgeX <= VIEW_W + 4) {
          ctx.fillStyle = COL_L;
          ctx.fillRect(rightWallEdgeX - 4, by, 4, 1);
          ctx.fillRect(rightWallEdgeX - 2, by + 1, 2, 2);
          ctx.fillStyle = COL_M;
          ctx.fillRect(rightWallEdgeX - 3, by - 3 - (flick ^ 1), 1, 2 + (flick ^ 1));
          ctx.fillStyle = COL_L;
          ctx.fillRect(rightWallEdgeX - 3, by - 2, 1, 1);
        }
      }
      return;
    }

    if (area === 3) {
      // AQUIFER: Subtle underwater wall shimmer & tiny rising ambient bubbles!
      const waterY = Math.round(world.waterStartRow * TILE - scrollY);
      const topY = Math.max(0, waterY);
      if (topY < VIEW_H) {
        ctx.fillStyle = COL_S;
        for (let y = topY + ((tick >> 2) & 7); y < VIEW_H; y += 8) {
          const wave = ((y + (tick >> 1)) & 8) !== 0 ? 1 : 0;
          if (leftWallEdgeX >= 0) ctx.fillRect(leftWallEdgeX + 1 + wave, y, 1, 2);
          if (rightWallEdgeX <= VIEW_W) ctx.fillRect(rightWallEdgeX - 2 - wave, y + 3, 1, 2);
        }
        for (let i = 0; i < 12; i++) {
          const bx = 18 + ((i * 29) % (VIEW_W - 36));
          const span = Math.max(40, VIEW_H - topY + 24);
          const rawY = ((i * 47 - Math.floor(tick * 0.45) - Math.floor(scrollY * 0.4)) % span + span) % span;
          const by = topY + 6 + rawY;
          if (by > topY + 3 && by < VIEW_H - 4) {
            ctx.fillStyle = (i & 1) === 0 ? COL_S : COL_L;
            ctx.fillRect(bx, by, 1, 1);
          }
        }
      }
      return;
    }

    if (area === 4) {
      // LIMBO: Floating surreal pixel crosses & hollow geometric specks drifting gently upward
      for (let i = 0; i < 18; i++) {
        const bx = 14 + ((i * 43 + 11) % (VIEW_W - 28));
        const by =
          (((i * 37 - Math.floor(tick * 0.3) - Math.floor(scrollY * 0.25)) % VIEW_H) + VIEW_H) %
          VIEW_H;
        ctx.fillStyle = i % 5 === 0 ? COL_S : i % 7 === 0 ? COL_M : COL_L;
        ctx.fillRect(bx, by, 1, 1);
        if (i % 4 === 0) {
          ctx.fillRect(bx - 1, by, 3, 1);
          ctx.fillRect(bx, by - 1, 1, 3);
          ctx.fillStyle = COL_D;
          ctx.fillRect(bx, by, 1, 1);
        }
      }
      return;
    }

    if (area === 5) {
      // ABYSS: Symmetrical biomechanical crimson rib-ticks mounted onto the actual shaft walls
      const step = 32;
      const offset = ((Math.floor(scrollY * 0.6) % step) + step) % step;
      for (let y = -offset; y < VIEW_H; y += step) {
        ctx.fillStyle = COL_M;
        if (leftWallEdgeX >= -4 && leftWallEdgeX < VIEW_W) {
          ctx.fillRect(leftWallEdgeX, y, 4, 1);
          ctx.fillRect(leftWallEdgeX, y + 1, 2, 2);
        }
        if (rightWallEdgeX > 0 && rightWallEdgeX <= VIEW_W + 4) {
          ctx.fillRect(rightWallEdgeX - 4, y, 4, 1);
          ctx.fillRect(rightWallEdgeX - 2, y + 1, 2, 2);
        }
      }
    }
  }

  private renderAquiferWaterSurface(
    world: WorldState,
    scrollY: number,
    tick: number,
  ): void {
    if (world.waterStartRow < 0 || world.waterStartRow >= world.rows) return;
    const wy = Math.round(world.waterStartRow * TILE - scrollY);
    if (wy < -8 || wy > VIEW_H + 8) return;

    const ctx = this.semCtx;
    // Crisp animated 2-pixel stepped wave crest (S + L foam)
    for (let x = 8; x < VIEW_W - 8; x += 2) {
      const wave = Math.round(Math.sin(x * 0.14 + tick * 0.1) * 1.4);
      ctx.fillStyle = COL_L;
      ctx.fillRect(x, wy + wave, 2, 1);
      ctx.fillStyle = COL_S;
      ctx.fillRect(x, wy + wave + 1, 2, 2);
      if (((x + (tick >> 2)) & 6) === 0) {
        ctx.fillRect(x, wy + wave + 3, 1, 1);
      }
    }
  }

  private renderSideRoomDetails(
    sideRooms: readonly SideRoomState[],
    scrollX: number,
    scrollY: number,
    tick: number,
  ): void {
    const ctx = this.semCtx;
    for (let i = 0; i < sideRooms.length; i++) {
      const r = sideRooms[i]!;
      const leftPx = r.minCol * TILE - scrollX;
      const rightPx = (r.maxCol + 1) * TILE - scrollX;
      const topPx = r.minRow * TILE - scrollY;
      const botPx = (r.maxRow + 1) * TILE - scrollY;
      if (rightPx < -16 || leftPx > VIEW_W + 16 || botPx < -16 || topPx > VIEW_H + 16) {
        continue;
      }

      const cx = Math.round(r.centerX - scrollX);
      const ceilingY = (r.minRow + 1) * TILE - scrollY;
      const floorY = r.maxRow * TILE - scrollY;

      // Subtle hanging pixel lantern from room ceiling
      const sway = Math.round(Math.sin(tick * 0.05 + r.id) * 1);
      ctx.fillStyle = COL_L;
      ctx.fillRect(cx, ceilingY, 1, 5);
      ctx.fillRect(cx - 2 + sway, ceilingY + 5, 5, 5);
      ctx.fillStyle = ((tick >> 3) + r.id) % 3 === 0 ? COL_L : COL_M;
      ctx.fillRect(cx - 1 + sway, ceilingY + 6, 3, 3);

      // Room banner & shopkeeper!
      if (r.kind === 'shop') {
        // Hooded pixel shopkeeper standing behind display cases
        this.drawSprite(
          'sprShopkeeper',
          Math.floor(tick / 42) % 2,
          cx,
          floorY - 26,
          false,
          false,
        );
        drawBitmapTextOutlined(ctx, 'SHOP', cx, ceilingY + 12, COL_L, COL_D, 1, 'center');
      } else if (r.kind === 'gun_module') {
        drawBitmapTextOutlined(ctx, 'ARMS', cx, ceilingY + 12, COL_S, COL_D, 1, 'center');
      } else if (r.kind === 'gem_cache') {
        drawBitmapTextOutlined(ctx, 'GEMS', cx, ceilingY + 12, COL_M, COL_D, 1, 'center');
      } else if (r.kind === 'secret') {
        drawBitmapTextOutlined(ctx, '???', cx, ceilingY + 12, COL_S, COL_D, 1, 'center');
      }
    }
  }

  private renderBoss(
    boss: BossState,
    state: SimState,
    alpha: number,
    scrollX: number,
    scrollY: number,
  ): void {
    const ctx = this.semCtx;
    const bx = Math.round(lerp(boss.prevX, boss.x, alpha) - scrollX);
    const by = Math.round(lerp(boss.prevY, boss.y, alpha) - scrollY);
    const tentFrame = Math.floor(state.tick / 10) % 2;
    const tentBob = Math.round(Math.sin(boss.tentacleAngle) * 5);

    // Sweeping giant pixel-dithered tentacles welded tightly to the Leviathan carapace
    this.drawSprite('sprTentacle', tentFrame, bx - 56, by + 6 + tentBob, true, false);
    this.drawSprite('sprTentacle', (tentFrame + 1) % 2, bx + 56, by + 6 - tentBob, false, false);

    // Boss Eye Pod (open vs closed/stunned)
    const closed = boss.state === 2 || boss.state === 3;
    const eyeFrame = closed ? 1 : 0;
    if (boss.hitFlashTicks > 0 && (boss.hitFlashTicks & 1) === 1) {
      this.drawSilhouetteSprite('sprBossEye', eyeFrame, bx, by, COL_L);
    } else {
      this.drawSprite('sprBossEye', eyeFrame, bx, by);
      // Dynamic pupil tracking glint when eye is open
      if (!closed) {
        const px = lerp(state.player.prevX, state.player.x, alpha) - scrollX;
        const py = lerp(state.player.prevY, state.player.y, alpha) - scrollY;
        const dx = Math.max(-3, Math.min(3, Math.round((px - bx) * 0.06)));
        const dy = Math.max(-2, Math.min(3, Math.round((py - by) * 0.05)));
        ctx.fillStyle = COL_D;
        ctx.fillRect(bx - 1 + dx, by - 3 + dy, 2, 7);
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 3 + dx, by - 3 + dy, 2, 2);
      }
    }

    // Boss Laser Telegraph Charge!
    if (boss.laserCharge > 0 && boss.laserActiveTicks <= 0) {
      const lx = Math.round(boss.laserX - scrollX);
      const chargeR = Math.max(2, Math.min(11, Math.round(boss.laserCharge * 0.18)));
      strokePixelRing(ctx, lx, by + 26, chargeR, (state.tick & 2) === 0 ? COL_M : COL_L);
      drawPixelLine(
        ctx,
        lx,
        by + 28,
        lx,
        VIEW_H,
        (state.tick & 2) === 0 ? COL_M : COL_L,
        4,
      );
    }

    // Active Colossal Boss Laser Beam!
    if (boss.laserActiveTicks > 0) {
      const lx = Math.round(boss.laserX - scrollX);
      const pulse = (state.tick & 1) === 0 ? 1 : 0;
      const outerHalf = 7 + pulse * 2;
      const innerHalf = 3 + pulse;
      ctx.fillStyle = COL_M;
      ctx.fillRect(lx - outerHalf, by + 20, outerHalf * 2, VIEW_H - (by + 20));
      ctx.fillStyle = COL_L;
      ctx.fillRect(lx - innerHalf, by + 20, innerHalf * 2, VIEW_H - (by + 20));
      fillPixelCircle(ctx, lx, by + 24, 9 + pulse * 2, COL_L);
      strokePixelRing(ctx, lx, by + 24, 12 + pulse * 2, COL_M);
    }
  }

  // ==========================================================================
  // Main Render Entrypoint
  // ==========================================================================

  render(
    state: SimState,
    interpAlpha: number,
    settings: RenderSettings,
    particles: ParticleSystem,
  ): void {
    if (this.destroyed) return;

    const ctx = this.semCtx;
    const alpha = settings.pixelSnap60 ? 1 : Math.max(0, Math.min(1, interpAlpha));
    const cam = state.camera;
    const camCx = lerp(cam.prevX, cam.x, alpha);
    const camCy = lerp(cam.prevY, cam.y, alpha);

    let shakeX = 0;
    let shakeY = 0;
    if (settings.screenshake && cam.shakeTicks > 0 && cam.shakeMag > 0) {
      const mag = cam.shakeMag * Math.min(1, cam.shakeTicks / 8);
      shakeX = Math.sin(state.tick * 17.3 + 1.1) * mag;
      shakeY = Math.cos(state.tick * 23.7 + 2.3) * mag;
    }

    const scrollX = Math.round(camCx - VIEW_W / 2 + shakeX);
    const scrollY = Math.round(camCy - VIEW_H / 2 + shakeY);
    const world = state.world;

    // 1. Minimalist 4-Channel Pixel Biome Backdrop
    this.renderBiomeBackdrop(world, scrollX, scrollY, state.tick);

    // 2. Side Room Interior Details (Shopkeeper, Lanterns, Room Plaques)
    if (world.sideRooms.length > 0) {
      this.renderSideRoomDetails(world.sideRooms, scrollX, scrollY, state.tick);
    }

    // 3. Tile Grid (Autotiled Biome Walls + Seamless Outer Bedrock + 4-Variant Breakables)
    const startCol = Math.max(world.minCol, Math.floor(scrollX / TILE) - 1);
    const endCol = Math.min(world.maxCol, Math.floor((scrollX + VIEW_W) / TILE) + 1);
    const startRow = Math.max(0, Math.floor(scrollY / TILE) - 1);
    const endRow = Math.min(world.rows - 1, Math.floor((scrollY + VIEW_H) / TILE) + 1);

    const wallSpriteId = this.lookupSprite(`sprTile_area${world.area}`)
      ? `sprTile_area${world.area}`
      : 'sprTile1';
    const ghostSolid = Math.floor(world.spikeTrapTimer / 90) % 2 === 0;

    for (let row = startRow; row <= endRow; row++) {
      const sy = row * TILE - scrollY;
      for (let col = startCol; col <= endCol; col++) {
        const kind = getTile(world, col, row);
        const sx = col * TILE - scrollX;

        if (kind === TILE_KIND.EMPTY) {
          // Weld uncarved columns outside the shaft into deep pebbled subterranean bedrock!
          if (isOutsideShaftBedrock(world, col, row)) {
            this.drawSprite(wallSpriteId, 15, sx, sy);
          }
          continue;
        }

        if (kind === TILE_KIND.SOLID) {
          let mask = computeWallBitmask(world, col, row);
          if (isOutsideShaftBedrock(world, col - 1, row)) mask |= AUTOTILE_W;
          if (isOutsideShaftBedrock(world, col + 1, row)) mask |= AUTOTILE_E;
          this.drawSprite(wallSpriteId, mask, sx, sy);
        } else if (kind === TILE_KIND.BREAKABLE) {
          const variant = Math.abs((col * 7 + row * 13) % 4);
          this.drawSprite('sprBreakable', variant, sx, sy);
        } else if (kind === TILE_KIND.THIN_PLATFORM) {
          this.drawSprite('sprThinPlatform', 0, sx, sy);
        } else if (kind === TILE_KIND.SPIKE_UP) {
          this.drawSprite('sprSpikeUp', 0, sx, sy);
        } else if (kind === TILE_KIND.SPIKE_DOWN) {
          this.drawSprite('sprSpikeDown', 0, sx, sy);
        } else if (kind === TILE_KIND.SPIKE_LEFT) {
          this.drawSprite('sprSpikeLeft', 0, sx, sy);
        } else if (kind === TILE_KIND.SPIKE_RIGHT) {
          this.drawSprite('sprSpikeRight', 0, sx, sy);
        } else if (kind === TILE_KIND.SPIKE_TRAP) {
          this.drawSprite(
            world.spikeTrapExtended ? 'sprSpikeTrapExtended' : 'sprSpikeTrapRetracted',
            0,
            sx,
            sy,
          );
        } else if (kind === TILE_KIND.BUBBLE_BLOCK) {
          this.drawSprite('sprBubbleBlock', 0, sx, sy);
        } else if (kind === TILE_KIND.GHOST_WALL) {
          this.drawSprite(ghostSolid ? 'sprGhostWallSolid' : 'sprGhostWallPhased', 0, sx, sy);
        } else if (kind === TILE_KIND.SHOP_FLOOR) {
          this.drawSprite('sprShopFloor', 0, sx, sy);
        } else if (kind === TILE_KIND.STAGE_EXIT) {
          this.drawSprite('sprStageExit', Math.floor(state.tick / 12) % 2, sx, sy);
        }
      }
    }

    // 4. Aquifer Animated Water Wave Crest
    if (world.area === 3) {
      this.renderAquiferWaterSurface(world, scrollY, state.tick);
    }

    // 5. Aquifer Air Pockets
    for (let i = 0; i < world.airPockets.length; i++) {
      const ap = world.airPockets[i]!;
      if (!ap.active) continue;
      const ax = Math.round(ap.x - scrollX);
      const ay = Math.round(ap.y - scrollY + Math.sin(state.tick * 0.08 + ap.id) * 1.5);
      if (ay < -20 || ay > VIEW_H + 20) continue;
      strokePixelRing(ctx, ax, ay, ap.radius, COL_S);
      strokePixelRing(ctx, ax, ay, Math.max(2, ap.radius - 2), COL_L, true);
      ctx.fillStyle = COL_L;
      ctx.fillRect(ax - Math.round(ap.radius * 0.45), ay - Math.round(ap.radius * 0.45), 2, 2);
    }

    // 6. Pickups (Gun Modules, Shop Glass Cases + Price Tags, Air Bubbles, Hearts)
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (!pk.alive) continue;
      const sx = Math.round(pk.x - scrollX);
      const sy = Math.round(pk.y - scrollY);
      if (sy < -32 || sy > VIEW_H + 32) continue;

      const bob = Math.round(Math.sin(state.tick * 0.1 + pk.id) * 1.5);
      if (pk.kind === 'gun_module') {
        const wDef = getWeaponDef(pk.weaponId ?? 0);
        // Subtle crisp pulsing aura ring around gun module
        if (((state.tick >> 3) & 1) === 0) {
          strokePixelRing(ctx, sx, sy + bob, 10, COL_S, true);
        }
        this.drawSprite(wDef.spriteId, 0, sx, sy + bob);
        drawBitmapTextOutlined(ctx, wDef.shortName, sx, sy - 17, COL_L, COL_D, 1, 'center');
        const bonusTxt = pk.bonusType === 'hp' ? '+HP' : '+CHG';
        drawBitmapTextOutlined(
          ctx,
          bonusTxt,
          sx,
          sy + 11,
          pk.bonusType === 'hp' ? COL_M : COL_S,
          COL_D,
          1,
          'center',
        );
      } else if (pk.kind === 'shop_item') {
        const sDef = getShopItemDef(pk.shopItemId ?? 100);
        this.drawSprite('sprShopCase', 0, sx, sy);
        this.drawSprite(sDef.spriteId, 0, sx, sy - 4 + (bob > 0 ? 1 : 0));
        if (pk.price !== undefined) {
          const canAfford = state.gems >= pk.price;
          const priceStr = `${pk.price}`;
          ctx.fillStyle = COL_D;
          ctx.fillRect(sx - 11, sy + 12, 22, 9);
          drawBitmapTextOutlined(
            ctx,
            priceStr,
            sx,
            sy + 13,
            canAfford ? COL_L : COL_M,
            COL_D,
            1,
            'center',
          );
        }
      } else if (pk.kind === 'air_bubble') {
        this.drawSprite('sprAirBubble', Math.floor((state.tick + pk.id * 4) / 14) % 2, sx, sy + bob);
      } else if (pk.kind === 'heart_drop') {
        this.drawSprite('sprHeartFull', 0, sx, sy + bob);
      }
    }

    // 7. Edible Corpses (Knife & Fork)
    for (let i = 0; i < state.corpses.length; i++) {
      const c = state.corpses[i]!;
      if (!c.alive) continue;
      if (c.ttl < 45 && (c.ttl & 2) === 0) continue;
      const cx = Math.round(c.x - scrollX);
      const cy = Math.round(c.y - scrollY);
      const def = getEnemyDef(c.kind);
      this.drawSprite(def.spriteId, 0, cx, cy, false, true);
    }

    // 8. Shell Casings
    for (let i = 0; i < state.casings.length; i++) {
      const cs = state.casings[i]!;
      if (!cs.alive) continue;
      const cx = Math.round(cs.x - scrollX);
      const cy = Math.round(cs.y - scrollY);
      this.drawSprite('sprCasing', cs.hot ? 1 : 0, cx, cy);
    }

    // 9. Gems (Faceted Red Crystals)
    for (let i = 0; i < state.gemsEntities.length; i++) {
      const g = state.gemsEntities[i]!;
      if (!g.alive) continue;
      if (g.ttl < 60 && (g.ttl & 2) === 0) continue;
      const gx = Math.round(g.x - scrollX);
      const gy = Math.round(g.y - scrollY);
      if (gy < -12 || gy > VIEW_H + 12) continue;
      this.drawSprite('sprGem', Math.floor((state.tick + g.id * 3) / 8) % 2, gx, gy);
    }

    // 10. Timeout Void Ring (Upgrade #17)
    const p = state.player;
    if (p.timeoutVoid.active) {
      const vx = Math.round(p.timeoutVoid.x - scrollX);
      const vy = Math.round(p.timeoutVoid.y - scrollY);
      strokePixelRing(ctx, vx, vy, p.timeoutVoid.radius, COL_S, true);
      strokePixelRing(
        ctx,
        vx,
        vy,
        Math.max(4, p.timeoutVoid.radius - 3),
        (state.tick & 4) === 0 ? COL_L : COL_S,
        true,
      );
    }

    // 11. Enemies (40 Hand-Pixeled Sprites + Exact-Silhouette White Hit-Flashes!)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (!e.alive) continue;
      const ex = Math.round(lerp(e.prevX, e.x, alpha) - scrollX);
      const ey = Math.round(lerp(e.prevY, e.y, alpha) - scrollY);
      if (ey < -28 || ey > VIEW_H + 28) continue;

      const def = getEnemyDef(e.kind);
      const frame = Math.floor((state.tick + e.id * 5) / 10) % 2;
      const flipX = e.facing < 0;

      if (e.hitFlashTicks > 0) {
        this.drawSilhouetteSprite(def.spriteId, frame, ex, ey, COL_L, flipX, false);
      } else {
        this.drawSprite(def.spriteId, frame, ex, ey, flipX, false);
      }

      // Crisp micro HP bar only for damaged heavy enemies
      if (e.maxHp >= 25 && e.hp > 0 && e.hp < e.maxHp) {
        const bw = 12;
        const bx = ex - 6;
        const by = ey - Math.ceil(e.h * 0.5) - 5;
        ctx.fillStyle = COL_D;
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = COL_M;
        ctx.fillRect(bx, by, Math.max(1, Math.round((e.hp / e.maxHp) * bw)), 2);
      }
    }

    // 12. Final Boss (Abyssal Leviathan)
    if (state.boss && state.boss.active) {
      this.renderBoss(state.boss, state, alpha, scrollX, scrollY);
    }

    // 13. Player Bullets & Hitscan Lasers (Punchy Weapon-Specific Pixel VFX!)
    for (let i = 0; i < state.bullets.length; i++) {
      const b = state.bullets[i]!;
      if (!b.alive) continue;
      const bx = Math.round(lerp(b.prevX, b.x, alpha) - scrollX);
      const by = Math.round(lerp(b.prevY, b.y, alpha) - scrollY);

      if (b.isLaser) {
        const endY = Math.round(b.laserEndY - scrollY);
        const beamH = Math.max(4, endY - by);
        const outerCol = state.gemHigh ? COL_M : COL_S;
        const outerW = state.gemHigh ? 8 : 6;
        ctx.fillStyle = outerCol;
        ctx.fillRect(bx - (outerW >> 1), by, outerW, beamH);
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 1, by, 2, beamH);
        // Signature pixel-circle laser blast caps!
        fillPixelCircle(ctx, bx, by + 2, state.gemHigh ? 5 : 4, COL_L);
        fillPixelCircle(ctx, bx, endY, state.gemHigh ? 7 : 5, outerCol);
        fillPixelCircle(ctx, bx, endY, state.gemHigh ? 4 : 3, COL_L);
      } else if (b.weaponId === 1) {
        // Shotgun: punchy hot pellets
        ctx.fillStyle = COL_D;
        ctx.fillRect(bx - 2, by - 2, 5, 5);
        ctx.fillStyle = state.gemHigh ? COL_M : COL_L;
        ctx.fillRect(bx - 1, by - 1, 3, 3);
        ctx.fillStyle = state.gemHigh ? COL_L : COL_M;
        ctx.fillRect(bx, by, 1, 1);
      } else if (b.weaponId === 4) {
        // Puncher: heavy twin-bordered slug
        ctx.fillStyle = COL_D;
        ctx.fillRect(bx - 3, by - 4, 6, 8);
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 2, by - 3, 4, 6);
        ctx.fillStyle = COL_M;
        ctx.fillRect(bx - 1, by - 2, 2, 4);
      } else {
        // Machinegun / Triple / Burst / Noppy: crisp pixel bullet sprite + tiny motion tail
        ctx.fillStyle = state.gemHigh ? COL_M : COL_L;
        ctx.fillRect(bx, by - 6, 1, 3);
        this.drawSprite('sprBullet', state.gemHigh ? 1 : 0, bx, by);
      }
    }

    // 14. Enemy Projectiles (Distinct High-Contrast Pixel Hazards)
    for (let i = 0; i < state.enemyBullets.length; i++) {
      const eb = state.enemyBullets[i]!;
      if (!eb.alive) continue;
      const ex = Math.round(lerp(eb.prevX, eb.x, alpha) - scrollX);
      const ey = Math.round(lerp(eb.prevY, eb.y, alpha) - scrollY);
      if (eb.kind === 'bone') {
        const rot = (state.tick >> 2) & 1;
        ctx.fillStyle = COL_D;
        ctx.fillRect(ex - 3, ey - 3, 7, 7);
        ctx.fillStyle = COL_L;
        if (rot === 0) {
          ctx.fillRect(ex - 3, ey, 7, 1);
          ctx.fillRect(ex - 3, ey - 1, 2, 3);
          ctx.fillRect(ex + 2, ey - 1, 2, 3);
        } else {
          ctx.fillRect(ex, ey - 3, 1, 7);
          ctx.fillRect(ex - 1, ey - 3, 3, 2);
          ctx.fillRect(ex - 1, ey + 2, 3, 2);
        }
      } else if (eb.kind === 'boss_orb') {
        const r = (state.tick & 2) === 0 ? 4 : 3;
        fillPixelCircle(ctx, ex, ey, r + 1, COL_D);
        fillPixelCircle(ctx, ex, ey, r, COL_M);
        fillPixelCircle(ctx, ex, ey, 1, COL_L);
      } else {
        fillPixelCircle(ctx, ex, ey, 3, COL_D);
        fillPixelCircle(ctx, ex, ey, 2, COL_M);
        ctx.fillStyle = COL_L;
        ctx.fillRect(ex - 1, ey - 1, 1, 1);
      }
    }

    // 15. Player Companions (Drone & Heart Balloon)
    const px = Math.round(lerp(p.prevX, p.x, alpha) - scrollX);
    const py = Math.round(lerp(p.prevY, p.y, alpha) - scrollY);

    if (p.balloon.active) {
      const bx = Math.round(p.balloon.x - scrollX);
      const by = Math.round(p.balloon.y - scrollY);
      drawPixelLine(ctx, px, py - 2, bx, by + 4, COL_L, 2);
      this.drawSprite('sprHeartBalloon', 0, bx, by);
    }

    if (p.drone.active) {
      const dx = Math.round(p.drone.x - scrollX);
      const dy = Math.round(p.drone.y - scrollY);
      this.drawSprite('sprDrone', Math.floor(state.tick / 10) % 2, dx, dy);
    }

    // 16. Laser Sight Guide (Upgrade #12)
    if (p.alive && state.upgrades.includes(12)) {
      let sightEndY = py + 110;
      const col = Math.floor(p.x / TILE);
      const startR = Math.floor((p.y + 8) / TILE);
      for (let r = startR; r < Math.min(world.rows, startR + 9); r++) {
        const k = getTile(world, col, r);
        if (k === TILE_KIND.SOLID || k === TILE_KIND.BREAKABLE || k === TILE_KIND.SHOP_FLOOR) {
          sightEndY = r * TILE - scrollY;
          break;
        }
      }
      drawPixelLine(ctx, px, py + 8, px, sightEndY, state.gemHigh ? COL_M : COL_S, 4);
    }

    // 17. Player Exact-Silhouette Dithered Afterimages
    const styleDef = getStyleDef(state.styleId);
    const afterCol = p.jetpackActive ? COL_S : state.gemHigh ? COL_M : COL_L;
    for (let i = 0; i < p.afterimages.length; i++) {
      const ai = p.afterimages[i]!;
      if (ai.alpha <= 0.08) continue;
      const ax = Math.round(ai.x - scrollX);
      const ay = Math.round(ai.y - scrollY);
      const sprId = `${styleDef.spritePrefix}_${ai.animState}`;
      const ok = this.drawSilhouetteSprite(
        sprId,
        0,
        ax,
        ay,
        afterCol,
        ai.facing < 0,
        false,
        (i & 1) as 0 | 1,
      );
      if (!ok) {
        this.drawSilhouetteSprite('sprPlayerIdle', 0, ax, ay, afterCol, ai.facing < 0, false, 0);
      }
    }

    // 18. Player Sprite + Punchy Gunboot Muzzle Flash!
    const flickerHide = p.invulnTicks > 0 && Math.floor(p.invulnTicks / 3) % 2 === 0;
    if (!flickerHide) {
      if (p.muzzleFlashTicks > 0) {
        const fx = px + p.bootSide * 3;
        const fy = py + 8;
        this.drawSprite('sprMuzzleFlash', state.gemHigh ? 1 : 0, fx, fy);
        if (p.muzzleFlashTicks >= 3) {
          fillPixelCircle(ctx, fx, fy + 2, state.gemHigh ? 6 : 4, COL_L);
        }
      }

      const playerSpriteId = `${styleDef.spritePrefix}_${p.animState}`;
      if (!this.drawSprite(playerSpriteId, p.animFrame, px, py, p.facing < 0, false)) {
        this.drawSprite('sprPlayerIdle', 0, px, py, p.facing < 0, false);
      }
    }

    // 19. Iconic Integer-Stepped Pixel-Circle Particles (Smoke, Blasts, Rings, Sparks!)
    const pts = particles.getParticles();
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i]!;
      if (!pt.active) continue;
      const sx = Math.round(pt.x - scrollX);
      const sy = Math.round(pt.y - scrollY);
      if (sx < -36 || sx > VIEW_W + 36 || sy < -36 || sy > VIEW_H + 36) continue;

      const ch =
        pt.channel === 'M'
          ? COL_M
          : pt.channel === 'S'
            ? COL_S
            : pt.channel === 'D'
              ? COL_D
              : COL_L;
      const lifeRatio = pt.life / Math.max(1, pt.maxLife);

      if (pt.kind === 'ring') {
        // Expanding crisp hollow pixel shockwave circle!
        strokePixelRing(ctx, sx, sy, pt.radius, ch);
        if (lifeRatio > 0.65 && pt.radius > 4) {
          strokePixelRing(ctx, sx, sy, pt.radius - 1, ch);
        }
      } else if (pt.kind === 'smoke') {
        // Iconic expanding-then-hollowing pixel-circle puff!
        const r = Math.max(1, Math.round((pt.size + 1.8) * (0.45 + lifeRatio * 0.75)));
        fillPixelCircle(ctx, sx, sy, r, ch);
        if (lifeRatio < 0.52 && r >= 2) {
          fillPixelCircle(ctx, sx, sy, Math.max(1, r - 1), COL_D);
        }
      } else if (pt.kind === 'bubble') {
        const r = Math.max(1, Math.round(pt.size));
        if (r >= 2) {
          strokePixelRing(ctx, sx, sy, r, ch);
          ctx.fillStyle = COL_L;
          ctx.fillRect(sx - 1, sy - 1, 1, 1);
        } else {
          ctx.fillStyle = ch;
          ctx.fillRect(sx, sy, 2, 2);
        }
      } else if (pt.kind === 'shard') {
        const sz = Math.max(1, Math.round(pt.size * (0.5 + lifeRatio * 0.6)));
        ctx.fillStyle = COL_D;
        ctx.fillRect(sx - 1, sy - 1, sz + 2, sz + 2);
        ctx.fillStyle = ch;
        ctx.fillRect(sx, sy, sz, sz);
      } else if (pt.kind === 'spark') {
        const sz = lifeRatio > 0.5 ? Math.max(1, Math.round(pt.size)) : 1;
        ctx.fillStyle = ch;
        ctx.fillRect(sx, sy, sz, sz);
      } else {
        const sz = Math.max(1, Math.round(pt.size));
        ctx.fillStyle = ch;
        ctx.fillRect(sx, sy, sz, sz);
      }
    }

    // 20. Floating Pixel Combat Popups (Outlined 5x7 Bitmap Text)
    const texts = particles.getFloatingTexts();
    for (let i = 0; i < texts.length; i++) {
      const ft = texts[i]!;
      if (!ft.active) continue;
      if (ft.life < 10 && (ft.life & 1) === 0) continue;
      const tx = Math.round(ft.x - scrollX);
      const ty = Math.round(ft.y - scrollY);
      const col = ft.channel === 'M' ? COL_M : ft.channel === 'S' ? COL_S : COL_L;
      drawBitmapTextOutlined(ctx, ft.text, tx, ty, col, COL_D, 1, 'center');
    }

    // 21. Crisp Pixel Curtain Wipe during Stage Transition
    if (state.stageTransitionTicks > 0) {
      const t = Math.min(1, state.stageTransitionTicks / 30);
      const bandH = Math.round(VIEW_H * 0.45 * t);
      ctx.fillStyle = COL_D;
      ctx.fillRect(0, 0, VIEW_W, bandH);
      ctx.fillRect(0, VIEW_H - bandH, VIEW_W, bandH);
      // Crisp pixel-dithered curtain fringe
      for (let x = 0; x < VIEW_W; x += 2) {
        ctx.fillRect(x, bandH, 1, 2);
        ctx.fillRect(x + 1, VIEW_H - bandH - 2, 1, 2);
      }
    }

    // 22. Authentic 4-Channel Semantic Pixel HUD (Remapped cleanly by WebGL2!)
    drawWellHud(ctx, state, this.paletteIndex, state.tick);

    // 23. Present 160x284 Semantic Frame via WebGL2 Palette-Swap Shader
    this.presentSemanticFrame();
  }

  private presentSemanticFrame(): void {
    const pal = getPalette(this.paletteIndex);

    if (this.gl && this.program && this.vao && this.tex) {
      const gl = this.gl;
      if (this.canvas.width !== VIEW_W || this.canvas.height !== VIEW_H) {
        this.canvas.width = VIEW_W;
        this.canvas.height = VIEW_H;
      }
      gl.viewport(0, 0, VIEW_W, VIEW_H);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.semCanvas);

      gl.uniform3f(this.uLightLoc, pal.light[0] / 255, pal.light[1] / 255, pal.light[2] / 255);
      gl.uniform3f(this.uMidLoc, pal.mid[0] / 255, pal.mid[1] / 255, pal.mid[2] / 255);
      gl.uniform3f(this.uDarkLoc, pal.dark[0] / 255, pal.dark[1] / 255, pal.dark[2] / 255);
      gl.uniform3f(
        this.uSpecialLoc,
        pal.special[0] / 255,
        pal.special[1] / 255,
        pal.special[2] / 255,
      );

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // Exact Canvas2D software fallback
    if (this.fallbackCtx && this.fallbackOutImg) {
      const src = this.semCtx.getImageData(0, 0, VIEW_W, VIEW_H).data;
      const dst = this.fallbackOutImg.data;
      const [lr, lg, lb] = pal.light;
      const [mr, mg, mb] = pal.mid;
      const [dr, dg, db] = pal.dark;
      const [sr, sg, sb] = pal.special;

      for (let i = 0; i < src.length; i += 4) {
        const r = src[i]!;
        const g = src[i + 1]!;
        const b = src[i + 2]!;
        if (b > 120 && r < 90) {
          dst[i] = sr;
          dst[i + 1] = sg;
          dst[i + 2] = sb;
        } else if (r > 128 && g > 128 && b > 128) {
          dst[i] = lr;
          dst[i + 1] = lg;
          dst[i + 2] = lb;
        } else if (r > 128 && g < 100) {
          dst[i] = mr;
          dst[i + 1] = mg;
          dst[i + 2] = mb;
        } else {
          dst[i] = dr;
          dst[i + 1] = dg;
          dst[i + 2] = db;
        }
        dst[i + 3] = 255;
      }
      this.fallbackCtx.putImageData(this.fallbackOutImg, 0, 0);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.gl) {
      if (this.tex) this.gl.deleteTexture(this.tex);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
      this.gl = null;
      this.tex = null;
      this.vao = null;
      this.program = null;
    }
    this.fallbackCtx = null;
    this.fallbackOutImg = null;
    this.atlasSource = null;
    this.manifest = null;
  }
}
