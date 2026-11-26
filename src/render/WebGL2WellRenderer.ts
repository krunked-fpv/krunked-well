import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AssetManifest,
  type RenderSettings,
  type SimState,
  type SpriteRect,
} from '../contracts/index.ts';
import { getEnemyDef } from '../data/enemies.ts';
import { getPalette } from '../data/palettes.ts';
import { getStyleDef } from '../data/styles.ts';
import { getShopItemDef } from '../data/upgrades.ts';
import { getWeaponDef } from '../data/weapons.ts';
import { getTile } from '../sim/simUtils.ts';
import { drawWellHud } from '../ui/HudRenderer.ts';
import { computeWallBitmask } from './Autotiler.ts';
import { drawBitmapText, drawBitmapTextOutlined } from './BitmapFont.ts';
import type { ParticleSystem } from './ParticleSystem.ts';

// ============================================================================
// Krunked Well — WebGL2 4-Channel Semantic Palette-Swap Renderer (160 x 284)
// Zero blur (gl.NEAREST + CLAMP_TO_EDGE), instant 38-palette GPU swap,
// with seamless Canvas2D fallback when WebGL2 is unavailable.
// ============================================================================

const VIEW_W = WELL_CONSTANTS.VIEW_W;
const VIEW_H = WELL_CONSTANTS.VIEW_H;
const TILE = WELL_CONSTANTS.TILE_SIZE;

const COL_L = '#FFFFFF';
const COL_M = '#FF0000';
const COL_D = '#000000';
const COL_S = '#007EFF';

const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDark;
uniform vec3 uSpecial;

void main() {
  vec4 c = texture(uScene, vUv);
  vec3 outColor;
  if (c.r > 0.7 && c.g > 0.7 && c.b > 0.7) {
    outColor = uLight;
  } else if (c.r > 0.7 && c.g < 0.3 && c.b < 0.3) {
    outColor = uMid;
  } else if (c.b > 0.7 && c.r < 0.3) {
    outColor = uSpecial;
  } else {
    outColor = uDark;
  }
  fragColor = vec4(outColor, 1.0);
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

function channelToHex(ch: 'L' | 'M' | 'S' | 'D'): string {
  switch (ch) {
    case 'L':
      return COL_L;
    case 'M':
      return COL_M;
    case 'S':
      return COL_S;
    default:
      return COL_D;
  }
}

export class WebGL2WellRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly bufCanvas: HTMLCanvasElement;
  private readonly bufCtx: CanvasRenderingContext2D;

  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private uLightLoc: WebGLUniformLocation | null = null;
  private uMidLoc: WebGLUniformLocation | null = null;
  private uDarkLoc: WebGLUniformLocation | null = null;
  private uSpecialLoc: WebGLUniformLocation | null = null;

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

    this.bufCanvas = document.createElement('canvas');
    this.bufCanvas.width = VIEW_W;
    this.bufCanvas.height = VIEW_H;
    const bctx = this.bufCanvas.getContext('2d', { willReadFrequently: true });
    if (!bctx) {
      throw new Error('Failed to create 2D semantic buffer context');
    }
    bctx.imageSmoothingEnabled = false;
    this.bufCtx = bctx;

    this.initWebGL2();
    if (!this.gl) {
      this.initCanvasFallback();
    }
  }

  private initWebGL2(): void {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      gl = null;
    }
    if (!gl) return;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const tex = gl.createTexture();
    if (!vao || !vbo || !tex) {
      gl.deleteProgram(prog);
      return;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      VIEW_W,
      VIEW_H,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    gl.useProgram(prog);
    const uScene = gl.getUniformLocation(prog, 'uScene');
    if (uScene) gl.uniform1i(uScene, 0);

    this.gl = gl;
    this.program = prog;
    this.vao = vao;
    this.vbo = vbo;
    this.sceneTex = tex;
    this.uLightLoc = gl.getUniformLocation(prog, 'uLight');
    this.uMidLoc = gl.getUniformLocation(prog, 'uMid');
    this.uDarkLoc = gl.getUniformLocation(prog, 'uDark');
    this.uSpecialLoc = gl.getUniformLocation(prog, 'uSpecial');
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    src: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private initCanvasFallback(): void {
    try {
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        this.fallbackCtx = ctx;
        this.fallbackOutImg = ctx.createImageData(VIEW_W, VIEW_H);
      }
    } catch {
      this.fallbackCtx = null;
    }
  }

  setAtlas(source: TexImageSource, manifest: AssetManifest): void {
    // TexImageSource includes HTMLCanvasElement, HTMLImageElement, ImageBitmap, OffscreenCanvas, etc.
    this.atlasSource = source as CanvasImageSource;
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

    const ctx = this.bufCtx;
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

  private drawDitheredCircle(
    cx: number,
    cy: number,
    radius: number,
    color: string,
    tick: number,
    outlineOnly = true,
  ): void {
    const ctx = this.bufCtx;
    ctx.fillStyle = color;
    const r = Math.max(1, Math.round(radius));
    const steps = Math.max(12, Math.round(r * 5));
    const rot = (tick % 60) * 0.04;
    for (let i = 0; i < steps; i++) {
      if (outlineOnly && (i & 1) === 1 && r > 18) continue;
      const ang = (i / steps) * Math.PI * 2 + rot;
      const px = Math.round(cx + Math.cos(ang) * r);
      const py = Math.round(cy + Math.sin(ang) * r);
      ctx.fillRect(px, py, 1, 1);
    }
  }

  render(
    state: SimState,
    interpAlpha: number,
    settings: RenderSettings,
    particles: ParticleSystem,
  ): void {
    if (this.destroyed) return;

    const ctx = this.bufCtx;
    const alpha = settings.pixelSnap60 ? 1 : Math.max(0, Math.min(1, interpAlpha));

    // Camera center + deterministic screen shake
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

    // ------------------------------------------------------------------------
    // 1. Dark Void Background (+ Surface Sky Decor when area === 0)
    // ------------------------------------------------------------------------
    ctx.fillStyle = COL_D;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (state.area === 0) {
      this.renderSurfaceBackdrop(scrollX, scrollY, state.tick);
    }

    // ------------------------------------------------------------------------
    // 2. Side Room Interiors
    // ------------------------------------------------------------------------
    const world = state.world;
    for (let i = 0; i < world.sideRooms.length; i++) {
      const room = world.sideRooms[i]!;
      const rx = room.minCol * TILE - scrollX;
      const ry = room.minRow * TILE - scrollY;
      const rw = (room.maxCol - room.minCol + 1) * TILE;
      const rh = (room.maxRow - room.minRow + 1) * TILE;
      if (rx + rw < -16 || rx > VIEW_W + 16 || ry + rh < -16 || ry > VIEW_H + 16) continue;

      // Subtle architectural framing inside side room
      ctx.fillStyle = COL_L;
      ctx.fillRect(rx + 4, ry + 4, 4, 1);
      ctx.fillRect(rx + 4, ry + 4, 1, 4);
      ctx.fillRect(rx + rw - 8, ry + 4, 4, 1);
      ctx.fillRect(rx + rw - 5, ry + 4, 1, 4);
      if (room.kind === 'shop') {
        drawBitmapText(ctx, 'SHOP', rx + rw / 2, ry + 6, COL_M, 1, 'center');
      } else if (room.kind === 'gun_module') {
        drawBitmapText(ctx, 'ARMORY', rx + rw / 2, ry + 6, COL_S, 1, 'center');
      } else if (room.kind === 'secret') {
        drawBitmapText(ctx, 'SECRET', rx + rw / 2, ry + 6, COL_S, 1, 'center');
      }
    }

    // ------------------------------------------------------------------------
    // 3. Aquifer Water Volume Background Accent
    // ------------------------------------------------------------------------
    if (world.waterStartRow >= 0 && world.waterStartRow < world.rows) {
      const waterScreenY = world.waterStartRow * TILE - scrollY;
      if (waterScreenY < VIEW_H) {
        const topY = Math.max(0, waterScreenY);
        // Subtle animated Special blue wave crest at water surface
        if (waterScreenY >= -4 && waterScreenY < VIEW_H) {
          for (let sx = 8; sx < VIEW_W - 8; sx += 2) {
            const wave = Math.round(Math.sin(sx * 0.14 + state.tick * 0.12) * 1.5);
            ctx.fillStyle = (sx & 2) === 0 ? COL_L : COL_S;
            ctx.fillRect(sx, waterScreenY + wave, 2, 1);
            ctx.fillStyle = COL_S;
            ctx.fillRect(sx, waterScreenY + wave + 1, 2, 2);
          }
        }
        // Subtle vertical Special blue water shimmer along shaft edges & rising micro-specks
        ctx.fillStyle = COL_S;
        for (let sy = topY + ((state.tick >> 2) & 3); sy < VIEW_H; sy += 6) {
          ctx.fillRect(9, sy, 1, 2);
          ctx.fillRect(VIEW_W - 10, sy + 2, 1, 2);
        }
        for (let b = 0; b < 6; b++) {
          const bx = 18 + ((b * 23 + ((state.tick >> 4) * 3)) % (VIEW_W - 36));
          const by =
            VIEW_H - (((state.tick * (1 + (b & 1)) + b * 47) % Math.max(16, VIEW_H - topY)) + 2);
          if (by > topY + 4) {
            ctx.fillRect(bx, by, 1, 1);
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 4. Visible Tilemap (Autotiled Walls + Breakables + Platforms + Spikes)
    // ------------------------------------------------------------------------
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
        if (kind === TILE_KIND.EMPTY) continue;
        const sx = col * TILE - scrollX;

        switch (kind) {
          case TILE_KIND.SOLID: {
            const mask = computeWallBitmask(world, col, row);
            if (!this.drawSprite(wallSpriteId, mask, sx, sy)) {
              ctx.fillStyle = COL_L;
              ctx.fillRect(sx, sy, TILE, TILE);
              ctx.fillStyle = COL_D;
              ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
            }
            break;
          }
          case TILE_KIND.BREAKABLE: {
            if (!this.drawSprite('sprBreakable', 0, sx, sy)) {
              ctx.fillStyle = COL_M;
              ctx.fillRect(sx, sy, TILE, TILE);
            }
            break;
          }
          case TILE_KIND.THIN_PLATFORM: {
            if (!this.drawSprite('sprThinPlatform', 0, sx, sy)) {
              ctx.fillStyle = COL_L;
              ctx.fillRect(sx, sy, TILE, WELL_CONSTANTS.THIN_PLATFORM_H);
            }
            break;
          }
          case TILE_KIND.SPIKE_UP:
            this.drawSprite('sprSpikeUp', 0, sx, sy);
            break;
          case TILE_KIND.SPIKE_DOWN:
            this.drawSprite('sprSpikeDown', 0, sx, sy);
            break;
          case TILE_KIND.SPIKE_LEFT:
            this.drawSprite('sprSpikeLeft', 0, sx, sy);
            break;
          case TILE_KIND.SPIKE_RIGHT:
            this.drawSprite('sprSpikeRight', 0, sx, sy);
            break;
          case TILE_KIND.SPIKE_TRAP:
            this.drawSprite(
              world.spikeTrapExtended ? 'sprSpikeTrapExtended' : 'sprSpikeTrapRetracted',
              0,
              sx,
              sy,
            );
            break;
          case TILE_KIND.BUBBLE_BLOCK:
            this.drawSprite('sprBubbleBlock', 0, sx, sy);
            break;
          case TILE_KIND.GHOST_WALL:
            this.drawSprite(ghostSolid ? 'sprGhostWallSolid' : 'sprGhostWallPhased', 0, sx, sy);
            break;
          case TILE_KIND.SHOP_FLOOR:
            this.drawSprite('sprShopFloor', 0, sx, sy);
            break;
          case TILE_KIND.STAGE_EXIT:
            this.drawSprite('sprStageExit', Math.floor(state.tick / 14) % 2, sx, sy);
            break;
          default:
            break;
        }
      }
    }

    // ------------------------------------------------------------------------
    // 5. Air Pockets (Aquifer)
    // ------------------------------------------------------------------------
    for (let i = 0; i < world.airPockets.length; i++) {
      const pocket = world.airPockets[i]!;
      if (!pocket.active) continue;
      const px = Math.round(pocket.x - scrollX);
      const py = Math.round(pocket.y - scrollY + Math.sin(state.tick * 0.08 + pocket.id) * 1.5);
      if (px < -24 || px > VIEW_W + 24 || py < -24 || py > VIEW_H + 24) continue;
      this.drawSprite('sprAirBubble', Math.floor(state.tick / 15) % 2, px, py);
      this.drawDitheredCircle(px, py, pocket.radius, COL_S, state.tick, true);
    }

    // ------------------------------------------------------------------------
    // 6. Pickups (Gun Modules, Shop Glass Cases + Prices, Bubbles, Hearts)
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i]!;
      if (!pk.alive) continue;
      const sx = Math.round(pk.x - scrollX);
      const sy = Math.round(pk.y - scrollY);
      if (sx < -24 || sx > VIEW_W + 24 || sy < -24 || sy > VIEW_H + 24) continue;

      const bob = Math.round(Math.sin(state.tick * 0.1 + pk.id) * 1.5);
      if (pk.kind === 'gun_module') {
        const wDef = getWeaponDef(pk.weaponId ?? 0);
        // Pedestal glow
        ctx.fillStyle = COL_L;
        ctx.fillRect(sx - 7, sy + 7, 14, 2);
        this.drawSprite(wDef.spriteId, 0, sx, sy + bob - 2);
        drawBitmapTextOutlined(
          ctx,
          wDef.shortName,
          sx,
          sy - 16,
          COL_L,
          COL_D,
          1,
          'center',
        );
        if (pk.bonusType) {
          drawBitmapTextOutlined(
            ctx,
            pk.bonusType === 'hp' ? '+HP' : '+CHG',
            sx,
            sy + 11,
            pk.bonusType === 'hp' ? COL_M : COL_S,
            COL_D,
            1,
            'center',
          );
        }
      } else if (pk.kind === 'shop_item') {
        this.drawSprite('sprShopCase', 0, sx, sy);
        const item = getShopItemDef(pk.shopItemId ?? 100);
        this.drawSprite(item.spriteId, 0, sx, sy - 4 + (bob > 0 ? 1 : 0));
        if (pk.price !== undefined) {
          const canAfford = state.gems >= pk.price;
          drawBitmapTextOutlined(
            ctx,
            `${pk.price}`,
            sx,
            sy + 12,
            canAfford ? COL_L : COL_M,
            COL_D,
            1,
            'center',
          );
        }
      } else if (pk.kind === 'air_bubble') {
        this.drawSprite('sprAirBubble', Math.floor(state.tick / 12) % 2, sx, sy + bob);
      } else if (pk.kind === 'heart_drop') {
        this.drawSprite('sprHeartFull', 0, sx, sy + bob);
      }
    }

    // ------------------------------------------------------------------------
    // 7. Corpses
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.corpses.length; i++) {
      const c = state.corpses[i]!;
      if (!c.alive) continue;
      if (c.ttl < 36 && (c.ttl & 2) === 0) continue;
      const sx = Math.round(c.x - scrollX);
      const sy = Math.round(c.y - scrollY);
      if (sx < -16 || sx > VIEW_W + 16 || sy < -16 || sy > VIEW_H + 16) continue;
      const def = getEnemyDef(c.kind);
      if (!this.drawSprite(def.spriteId, 0, sx, sy, false, true)) {
        ctx.fillStyle = COL_L;
        ctx.fillRect(sx - 4, sy - 2, 8, 4);
      }
    }

    // ------------------------------------------------------------------------
    // 8. Shell Casings
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.casings.length; i++) {
      const cs = state.casings[i]!;
      if (!cs.alive) continue;
      const sx = Math.round(cs.x - scrollX);
      const sy = Math.round(cs.y - scrollY);
      if (sx < -4 || sx > VIEW_W + 4 || sy < -4 || sy > VIEW_H + 4) continue;
      this.drawSprite('sprCasing', cs.hot ? 1 : 0, sx, sy);
    }

    // ------------------------------------------------------------------------
    // 9. Gems
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.gemsEntities.length; i++) {
      const g = state.gemsEntities[i]!;
      if (!g.alive) continue;
      if (g.ttl < 45 && (g.ttl & 2) === 0) continue;
      const sx = Math.round(g.x - scrollX);
      const sy = Math.round(g.y - scrollY);
      if (sx < -10 || sx > VIEW_W + 10 || sy < -10 || sy > VIEW_H + 10) continue;
      this.drawSprite('sprGem', Math.floor((state.tick + g.id * 3) / 8) % 2, sx, sy);
    }

    // ------------------------------------------------------------------------
    // 10. Enemies (Interpolated, Hit Flash, Semantic Stomp Clarity)
    // ------------------------------------------------------------------------
    const tv = state.player.timeoutVoid;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]!;
      if (!e.alive) continue;
      const ex = Math.round(lerp(e.prevX, e.x, alpha) - scrollX);
      const ey = Math.round(lerp(e.prevY, e.y, alpha) - scrollY);
      if (ex < -24 || ex > VIEW_W + 24 || ey < -24 || ey > VIEW_H + 24) continue;

      if (e.hitFlashTicks > 0 && (e.hitFlashTicks & 1) === 1) {
        // Crisp bright L hit-flash block silhouette
        ctx.fillStyle = COL_L;
        ctx.fillRect(
          ex - Math.floor(e.w / 2),
          ey - Math.floor(e.h / 2),
          e.w,
          e.h,
        );
      } else {
        const def = getEnemyDef(e.kind);
        const frame = Math.floor((state.tick + e.id * 5) / 10) % 2;
        if (!this.drawSprite(def.spriteId, frame, ex, ey, e.facing < 0, false)) {
          ctx.fillStyle = e.stompable ? COL_L : COL_M;
          ctx.fillRect(ex - Math.floor(e.w / 2), ey - Math.floor(e.h / 2), e.w, e.h);
        }
      }

      // Timeout Void indicator on slowed enemies
      if (tv.active) {
        const dx = e.x - tv.x;
        const dy = e.y - tv.y;
        if (dx * dx + dy * dy <= tv.radius * tv.radius) {
          ctx.fillStyle = COL_S;
          ctx.fillRect(ex - 1, ey - Math.floor(e.h / 2) - 3, 2, 2);
        }
      }
    }

    // ------------------------------------------------------------------------
    // 11. Final Boss (Area 5 Abyss: Eye + Sweeping Tentacles + Warning Laser)
    // ------------------------------------------------------------------------
    if (state.boss && state.boss.active) {
      const b = state.boss;
      const bx = Math.round(lerp(b.prevX, b.x, alpha) - scrollX);
      const by = Math.round(lerp(b.prevY, b.y, alpha) - scrollY);
      const tentFrame = Math.floor(state.tick / 12) % 2;
      const sweepY = Math.round(Math.sin(b.tentacleAngle) * 20);
      const sweepX = Math.round(Math.cos(b.tentacleAngle * 0.8) * 10);

      // Left & right sweeping tentacles
      this.drawSprite('sprTentacle', tentFrame, bx - 68 + sweepX, by + 10 + sweepY, true, false);
      this.drawSprite('sprTentacle', tentFrame, bx + 68 - sweepX, by + 10 - sweepY, false, false);

      // Warning laser telegraph
      if (b.laserCharge > 0 && b.laserActiveTicks <= 0) {
        const lx = Math.round(b.laserX - scrollX);
        ctx.fillStyle = (state.tick & 2) === 0 ? COL_M : COL_L;
        for (let ly = Math.max(0, by - 20); ly < VIEW_H; ly += 6) {
          ctx.fillRect(lx, ly, 1, 3);
        }
      }

      // Active boss laser beam
      if (b.laserActiveTicks > 0) {
        const lx = Math.round(b.laserX - scrollX);
        const beamW = (state.tick & 1) === 0 ? 10 : 8;
        ctx.fillStyle = COL_M;
        ctx.fillRect(lx - Math.floor(beamW / 2), Math.max(0, by - 20), beamW, VIEW_H);
        ctx.fillStyle = COL_L;
        ctx.fillRect(lx - 2, Math.max(0, by - 20), 4, VIEW_H);
      }

      // Boss Eye core
      const eyeClosed = b.state === 2 || b.state === 3;
      if (b.hitFlashTicks > 0 && (b.hitFlashTicks & 1) === 1) {
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 12, by - 32, 24, 64);
      } else {
        this.drawSprite('sprBossEye', eyeClosed ? 1 : 0, bx, by);
      }

      // Defeat explosions flicker
      if (b.state === 3 && (state.tick & 3) === 0) {
        const exOff = ((state.tick * 13) % 40) - 20;
        const eyOff = ((state.tick * 29) % 56) - 28;
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx + exOff - 4, by + eyOff - 4, 8, 8);
        ctx.fillStyle = COL_M;
        ctx.fillRect(bx + exOff - 2, by + eyOff - 2, 4, 4);
      }
    }

    // ------------------------------------------------------------------------
    // 12. Player Bullets, Hitscan Laser Beams & Enemy Bullets
    // ------------------------------------------------------------------------
    for (let i = 0; i < state.bullets.length; i++) {
      const b = state.bullets[i]!;
      if (!b.alive) continue;
      const bx = Math.round(lerp(b.prevX, b.x, alpha) - scrollX);
      const by = Math.round(lerp(b.prevY, b.y, alpha) - scrollY);

      if (b.isLaser) {
        const endY = Math.round(b.laserEndY - scrollY);
        const beamH = Math.max(4, endY - by);
        const outerCol = state.gemHigh ? COL_M : COL_S;
        ctx.fillStyle = outerCol;
        ctx.fillRect(bx - 3, by, 6, beamH);
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 1, by, 2, beamH);
        // Impact flare at beam bottom
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - 4, endY - 2, 8, 3);
      } else {
        if (bx < -8 || bx > VIEW_W + 8 || by < -8 || by > VIEW_H + 8) continue;
        if (!this.drawSprite('sprBullet', state.gemHigh ? 1 : 0, bx, by)) {
          ctx.fillStyle = state.gemHigh ? COL_M : COL_L;
          ctx.fillRect(bx - 2, by - 3, 4, 6);
        }
      }
    }

    for (let i = 0; i < state.enemyBullets.length; i++) {
      const eb = state.enemyBullets[i]!;
      if (!eb.alive) continue;
      const bx = Math.round(lerp(eb.prevX, eb.x, alpha) - scrollX);
      const by = Math.round(lerp(eb.prevY, eb.y, alpha) - scrollY);
      if (bx < -10 || bx > VIEW_W + 10 || by < -10 || by > VIEW_H + 10) continue;

      const r = Math.max(2, Math.round(eb.radius));
      if (eb.kind === 'bone') {
        ctx.fillStyle = COL_L;
        ctx.fillRect(bx - r, by - 1, r * 2, 2);
        ctx.fillStyle = COL_M;
        ctx.fillRect(bx - 1, by - r, 2, r * 2);
      } else {
        ctx.fillStyle = COL_M;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
        ctx.fillStyle = (state.tick & 2) === 0 ? COL_L : COL_D;
        ctx.fillRect(bx - 1, by - 1, 2, 2);
      }
    }

    // ------------------------------------------------------------------------
    // 13. Timeout Void Ring, Drone, Heart Balloon, Afterimages & Gem High Aura
    // ------------------------------------------------------------------------
    const p = state.player;
    const px = Math.round(lerp(p.prevX, p.x, alpha) - scrollX);
    const py = Math.round(lerp(p.prevY, p.y, alpha) - scrollY);

    if (tv.active) {
      const tx = Math.round(tv.x - scrollX);
      const ty = Math.round(tv.y - scrollY);
      this.drawDitheredCircle(tx, ty, tv.radius, COL_S, state.tick, true);
      if (tv.timer > 30 || (state.tick & 2) === 0) {
        this.drawDitheredCircle(tx, ty, Math.max(6, tv.radius - 6), COL_L, -state.tick, true);
      }
    }

    // 8-frame Player Afterimages (crisp semantic trail, zero muddy gray alpha)
    for (let i = 0; i < p.afterimages.length; i++) {
      const ai = p.afterimages[i]!;
      if (ai.alpha <= 0.08) continue;
      // Alternating cadence creates retro motion-trail fade in 4-color mode
      if (((i + state.tick) & 1) === 1 && ai.alpha < 0.65) continue;
      const ax = Math.round(ai.x - scrollX);
      const ay = Math.round(ai.y - scrollY);
      const trailCol = state.gemHigh ? COL_M : COL_S;
      ctx.fillStyle = trailCol;
      ctx.fillRect(ax - 3, ay - 4, 6, 1);
      ctx.fillRect(ax - 3, ay + 6, 6, 1);
      ctx.fillRect(ax - 4, ay - 3, 1, 9);
      ctx.fillRect(ax + 3, ay - 3, 1, 9);
    }

    // Gem High Flashing Aura around player
    if (state.gemHigh && p.alive) {
      const auraCol = ((state.tick >> 1) & 1) === 0 ? COL_M : COL_L;
      this.drawDitheredCircle(px, py + 1, 10 + ((state.tick >> 2) & 1), auraCol, state.tick * 2, true);
    }

    // Drone companion
    if (p.drone.active) {
      const dx = Math.round(p.drone.x - scrollX);
      const dy = Math.round(p.drone.y - scrollY);
      this.drawSprite('sprDrone', Math.floor(state.tick / 8) % 2, dx, dy);
    }

    // Heart Balloon companion
    if (p.balloon.active) {
      const blx = Math.round(p.balloon.x - scrollX);
      const bly = Math.round(p.balloon.y - scrollY);
      // Crisp 1px pixel tether line from player to balloon
      ctx.fillStyle = COL_L;
      const steps = 6;
      for (let s = 1; s < steps; s++) {
        const lx = Math.round(lerp(px, blx, s / steps));
        const ly = Math.round(lerp(py - 2, bly + 5, s / steps));
        ctx.fillRect(lx, ly, 1, 1);
      }
      this.drawSprite('sprHeartBalloon', 0, blx, bly);
    }

    // ------------------------------------------------------------------------
    // 14. Player Sprite (Style 0..4 + Invuln Flicker + Muzzle Flash)
    // ------------------------------------------------------------------------
    let showPlayer = true;
    if (p.invulnTicks > 0 && p.alive) {
      if (p.invulnTicks <= WELL_CONSTANTS.FLICKER_AT) {
        showPlayer = Math.floor(p.invulnTicks / Math.max(1, Math.floor(WELL_CONSTANTS.FLICKER_DUR / 2))) % 2 === 0;
      } else {
        showPlayer = (p.invulnTicks & 2) === 0;
      }
    }

    if (showPlayer) {
      const styleDef = getStyleDef(state.styleId);
      const spriteId = `${styleDef.spritePrefix}_${p.animState}`;
      const flip = p.facing < 0;
      if (
        !this.drawSprite(spriteId, p.animFrame, px, py, flip, false) &&
        !this.drawSprite('sprPlayerIdle', 0, px, py, flip, false)
      ) {
        ctx.fillStyle = COL_L;
        ctx.fillRect(px - 4, py - 4, 8, 12);
      }
    }

    if (p.muzzleFlashTicks > 0 && p.alive) {
      this.drawSprite(
        'sprMuzzleFlash',
        state.gemHigh ? 1 : 0,
        px + p.bootSide * 2,
        py + 9,
      );
    }

    // ------------------------------------------------------------------------
    // 15. Particles & Floating Text (World-Space)
    // ------------------------------------------------------------------------
    const partList = particles.getParticles();
    for (let i = 0; i < partList.length; i++) {
      const pt = partList[i]!;
      if (!pt.active) continue;
      const sx = Math.round(pt.x - scrollX);
      const sy = Math.round(pt.y - scrollY);
      if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;

      const hex = channelToHex(pt.channel);
      if (pt.kind === 'ring') {
        this.drawDitheredCircle(sx, sy, pt.radius, hex, state.tick, true);
      } else if (pt.kind === 'bubble') {
        ctx.fillStyle = hex;
        const r = Math.max(1, Math.round(pt.size));
        ctx.fillRect(sx - r, sy - r, r * 2 + 1, 1);
        ctx.fillRect(sx - r, sy + r, r * 2 + 1, 1);
        ctx.fillRect(sx - r, sy - r, 1, r * 2 + 1);
        ctx.fillRect(sx + r, sy - r, 1, r * 2 + 1);
      } else {
        const lifeRatio = pt.life / Math.max(1, pt.maxLife);
        if (lifeRatio < 0.25 && (pt.life & 1) === 0) continue;
        const sz = lifeRatio < 0.4 ? 1 : Math.max(1, Math.round(pt.size));
        ctx.fillStyle = hex;
        ctx.fillRect(sx - Math.floor(sz / 2), sy - Math.floor(sz / 2), sz, sz);
      }
    }

    const texts = particles.getFloatingTexts();
    for (let i = 0; i < texts.length; i++) {
      const ft = texts[i]!;
      if (!ft.active) continue;
      if (ft.life < 10 && (ft.life & 1) === 0) continue;
      const sx = Math.max(24, Math.min(VIEW_W - 24, Math.round(ft.x - scrollX)));
      const sy = Math.max(14, Math.min(VIEW_H - 14, Math.round(ft.y - scrollY)));
      drawBitmapTextOutlined(ctx, ft.text, sx, sy, channelToHex(ft.channel), COL_D, 1, 'center');
    }

    // ------------------------------------------------------------------------
    // 16. In-Well Semantic HUD (remapped cleanly by GPU shader!)
    // ------------------------------------------------------------------------
    drawWellHud(ctx, state, this.paletteIndex, state.tick);

    // ------------------------------------------------------------------------
    // 17. Present via WebGL2 Semantic Palette-Swap Shader (or Canvas2D Fallback)
    // ------------------------------------------------------------------------
    this.present();
  }

  private renderSurfaceBackdrop(scrollX: number, scrollY: number, tick: number): void {
    const ctx = this.bufCtx;
    // Twinkling crisp pixel stars & crescent moon above well rim
    for (let i = 0; i < 18; i++) {
      const sx = (i * 37 + 11) % VIEW_W;
      const sy = ((i * 29 + 7) % 130) - Math.floor(scrollY * 0.2);
      if (sy < 2 || sy > VIEW_H - 40) continue;
      const twinkle = ((tick + i * 13) % 90) < 12;
      ctx.fillStyle = twinkle ? COL_S : COL_L;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Crescent moon
    const mx = 128;
    const my = 46 - Math.floor(scrollY * 0.15);
    if (my > 0 && my < VIEW_H) {
      ctx.fillStyle = COL_L;
      ctx.fillRect(mx - 4, my - 5, 8, 10);
      ctx.fillRect(mx - 5, my - 3, 10, 6);
      ctx.fillStyle = COL_D;
      ctx.fillRect(mx - 1, my - 4, 6, 8);
    }

    // Well Signpost near surface entrance
    const signX = 34 - scrollX;
    const signY = 120 - scrollY;
    if (signY > -20 && signY < VIEW_H + 20) {
      ctx.fillStyle = COL_L;
      ctx.fillRect(signX, signY, 2, 16);
      ctx.fillRect(signX - 10, signY - 8, 22, 9);
      ctx.fillStyle = COL_D;
      ctx.fillRect(signX - 9, signY - 7, 20, 7);
      drawBitmapText(ctx, 'WELL', signX + 1, signY - 6, COL_M, 1, 'center');
    }
  }

  private present(): void {
    const pal = getPalette(this.paletteIndex);

    if (this.gl && this.program && this.vao && this.sceneTex) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.bufCanvas,
      );

      if (this.uLightLoc) {
        gl.uniform3f(this.uLightLoc, pal.light[0] / 255, pal.light[1] / 255, pal.light[2] / 255);
      }
      if (this.uMidLoc) {
        gl.uniform3f(this.uMidLoc, pal.mid[0] / 255, pal.mid[1] / 255, pal.mid[2] / 255);
      }
      if (this.uDarkLoc) {
        gl.uniform3f(this.uDarkLoc, pal.dark[0] / 255, pal.dark[1] / 255, pal.dark[2] / 255);
      }
      if (this.uSpecialLoc) {
        gl.uniform3f(
          this.uSpecialLoc,
          pal.special[0] / 255,
          pal.special[1] / 255,
          pal.special[2] / 255,
        );
      }

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      return;
    }

    // Canvas2D Nearest-Neighbor Palette Remap Fallback (when WebGL2 unavailable)
    if (this.fallbackCtx && this.fallbackOutImg) {
      const src = this.bufCtx.getImageData(0, 0, VIEW_W, VIEW_H).data;
      const dst = this.fallbackOutImg.data;
      const [lr, lg, lb] = pal.light;
      const [mr, mg, mb] = pal.mid;
      const [dr, dg, db] = pal.dark;
      const [sr, sg, sb] = pal.special;

      for (let i = 0; i < src.length; i += 4) {
        const r = src[i]!;
        const g = src[i + 1]!;
        const b = src[i + 2]!;
        if (r > 178 && g > 178 && b > 178) {
          dst[i] = lr;
          dst[i + 1] = lg;
          dst[i + 2] = lb;
        } else if (r > 178 && g < 76 && b < 76) {
          dst[i] = mr;
          dst[i + 1] = mg;
          dst[i + 2] = mb;
        } else if (b > 178 && r < 76) {
          dst[i] = sr;
          dst[i + 1] = sg;
          dst[i + 2] = sb;
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
      if (this.sceneTex) this.gl.deleteTexture(this.sceneTex);
      if (this.vbo) this.gl.deleteBuffer(this.vbo);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
      this.sceneTex = null;
      this.vbo = null;
      this.vao = null;
      this.program = null;
      this.gl = null;
    }
    this.fallbackCtx = null;
    this.fallbackOutImg = null;
    this.atlasSource = null;
    this.manifest = null;
  }
}
