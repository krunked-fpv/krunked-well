import { PALETTES } from '../data/palettes.ts';
import type { AssetManifest, SpriteRect, StyleId } from '../contracts/index.ts';

// ============================================================================
// Krunked Well — Procedural 4-Channel Semantic Pixel Art Atlas (100% Original)
// Strictly uses the 4 semantic RGB keys + transparent alpha=0:
//   L = #FFFFFF (Light: player, stompable foes, platforms, primary HUD)
//   M = #FF0000 (Mid: hazards, un-stompable foes, spikes, breakables, gems)
//   D = #000000 (Dark: interiors, outlines, eyes, shadows)
//   S = #007EFF (Special: water, bubble blocks, air, tech accents)
// ============================================================================

const ATLAS_W = 1024;
const ATLAS_H = 512;

const SEMANTIC_RGBA: Record<string, readonly [number, number, number, number]> = {
  L: [255, 255, 255, 255],
  M: [255, 0, 0, 255],
  D: [0, 0, 0, 255],
  S: [0, 126, 255, 255],
};

class PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  px(x: number, y: number, ch: 'L' | 'M' | 'D' | 'S'): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const rgba = SEMANTIC_RGBA[ch];
    if (!rgba) return;
    const idx = (iy * this.width + ix) * 4;
    this.data[idx] = rgba[0];
    this.data[idx + 1] = rgba[1];
    this.data[idx + 2] = rgba[2];
    this.data[idx + 3] = rgba[3];
  }

  clearPx(x: number, y: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const idx = (iy * this.width + ix) * 4;
    this.data[idx + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, ch: 'L' | 'M' | 'D' | 'S'): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.px(x + dx, y + dy, ch);
      }
    }
  }

  circle(cx: number, cy: number, r: number, ch: 'L' | 'M' | 'D' | 'S', outlineOnly = false): void {
    const r2 = r * r;
    const inner2 = Math.max(0, (r - 1.2) * (r - 1.2));
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
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
}

class ShelfPacker {
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

// ============================================================================
// Player Sprite Painter (24x24, origin 12,12, distinct style 0..4 accents!)
// ============================================================================

function drawPlayerFrame(
  surf: PixelSurface,
  ox: number,
  oy: number,
  styleId: StyleId,
  pose:
    | 'idle'
    | 'run0'
    | 'run1'
    | 'run2'
    | 'run3'
    | 'jump'
    | 'spin0'
    | 'spin1'
    | 'spin2'
    | 'spin3'
    | 'fall'
    | 'shoot'
    | 'hurt'
    | 'jet0'
    | 'jet1'
    | 'swim0'
    | 'swim1'
    | 'dead',
): void {
  // Spin jump draws a crisp tucked spinning ball silhouette with rotating highlight
  if (pose === 'spin0' || pose === 'spin1' || pose === 'spin2' || pose === 'spin3') {
    const step = Number(pose.charAt(4));
    surf.circle(ox + 12, oy + 12, 5.2, 'D');
    surf.circle(ox + 12, oy + 12, 4.4, 'L');
    // Rotating visor/boot stripe
    const angles = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const;
    const dir = angles[step] ?? angles[0];
    surf.rect(ox + 11 + dir[0] * 2, oy + 11 + dir[1] * 2, 2, 2, 'D');
    const accent: 'M' | 'S' | 'L' = styleId === 3 ? 'S' : 'M';
    surf.rect(ox + 11 - dir[0] * 3, oy + 11 - dir[1] * 3, 2, 2, accent);
    // Motion arc ticks
    surf.px(ox + 12 + dir[1] * 6, oy + 12 - dir[0] * 6, 'L');
    surf.px(ox + 12 - dir[1] * 6, oy + 12 + dir[0] * 6, 'L');
    return;
  }

  if (pose === 'dead') {
    // Cracked knocked-out explorer silhouette
    surf.rect(ox + 6, oy + 12, 12, 6, 'D');
    surf.rect(ox + 7, oy + 13, 10, 4, 'L');
    surf.px(ox + 9, oy + 14, 'M');
    surf.px(ox + 14, oy + 14, 'M');
    surf.rect(ox + 5, oy + 17, 3, 3, 'M');
    surf.rect(ox + 16, oy + 17, 3, 3, 'M');
    return;
  }

  const headBob = pose === 'run1' || pose === 'run3' ? -1 : pose === 'shoot' ? -1 : 0;
  const hx = ox + 8;
  const hy = oy + 5 + headBob;
  const isHeavy = styleId === 2;
  const isFloat = styleId === 3;
  const isSpin = styleId === 1;
  const isAscetic = styleId === 4;

  const bodyCh: 'L' | 'M' = pose === 'hurt' ? 'M' : 'L';
  const bootAccent: 'M' | 'S' = isFloat ? 'S' : 'M';

  // Style-specific headgear & silhouette accents
  if (styleId === 0) {
    // Standard: crisp explorer antenna nub
    surf.rect(ox + 11, hy - 2, 2, 2, 'L');
  } else if (isSpin) {
    // Spin style: dynamic swept back scarf & top crest
    surf.rect(ox + 10, hy - 2, 4, 2, 'M');
    const tailY = hy + 5 + (pose === 'run1' || pose === 'fall' ? -1 : 0);
    surf.rect(ox + 4, tailY, 4, 2, 'M');
    surf.rect(ox + 3, tailY + 1, 2, 2, 'L');
  } else if (isHeavy) {
    // Heavy style: wide armored helm horns & shoulder pads
    surf.rect(hx - 2, hy, 12, 7, 'D');
    surf.rect(hx - 1, hy + 1, 10, 6, bodyCh);
    surf.rect(hx - 1, hy - 1, 2, 2, 'L');
    surf.rect(hx + 7, hy - 1, 2, 2, 'L');
  } else if (isFloat) {
    // Float style: glowing Special blue levitation halo
    surf.rect(ox + 8, hy - 3, 8, 1, 'S');
    surf.px(ox + 7, hy - 2, 'S');
    surf.px(ox + 16, hy - 2, 'S');
  } else if (isAscetic) {
    // Ascetic style: sharp peaked hood / headband
    surf.rect(ox + 9, hy - 2, 6, 2, 'L');
    surf.rect(ox + 10, hy - 3, 4, 1, 'L');
    surf.rect(ox + 5, hy + 1, 3, 1, 'L');
  }

  // Head outline + crisp boxy explorer helmet (8x7)
  if (!isHeavy) {
    surf.rect(hx - 1, hy, 10, 7, 'D');
    surf.rect(hx, hy + 1, 8, 5, bodyCh);
    surf.rect(hx + 1, hy, 6, 1, bodyCh);
  }

  // Visor & expressive eyes (facing right by default; renderer mirrors when facing left)
  if (pose === 'hurt') {
    surf.px(hx + 3, hy + 3, 'D');
    surf.px(hx + 6, hy + 3, 'D');
    surf.rect(hx + 4, hy + 4, 2, 1, 'D');
  } else if (isHeavy) {
    // Broad armored visor slit
    surf.rect(hx + 2, hy + 3, 6, 2, 'D');
    surf.px(hx + 4, hy + 3, 'M');
    surf.px(hx + 6, hy + 3, 'M');
  } else {
    // Crisp dark eyes
    surf.rect(hx + 3, hy + 3, 1, 2, 'D');
    surf.rect(hx + 6, hy + 3, 1, 2, 'D');
  }

  // Torso (compact hero jacket)
  const ty = hy + 6;
  const torsoW = isHeavy ? 8 : isAscetic ? 5 : 6;
  const torsoX = ox + 12 - Math.floor(torsoW / 2);
  surf.rect(torsoX - 1, ty, torsoW + 2, 5, 'D');
  surf.rect(torsoX, ty, torsoW, 4, bodyCh);
  // Belt / core accent
  surf.rect(torsoX, ty + 3, torsoW, 1, bootAccent);

  // Arms
  if (pose === 'jump' || pose === 'fall' || pose === 'swim0' || pose === 'swim1') {
    const armY = pose === 'fall' || pose === 'swim1' ? ty - 1 : ty;
    surf.rect(torsoX - 2, armY, 2, 3, bodyCh);
    surf.rect(torsoX + torsoW, armY, 2, 3, bodyCh);
  } else if (pose === 'shoot') {
    surf.rect(torsoX - 2, ty + 1, 2, 2, bodyCh);
    surf.rect(torsoX + torsoW, ty + 1, 2, 2, bodyCh);
  } else if (pose === 'run0' || pose === 'run2') {
    surf.rect(torsoX - 2, ty + 1, 2, 3, bodyCh);
    surf.rect(torsoX + torsoW, ty + 2, 2, 2, bodyCh);
  } else {
    surf.rect(torsoX - 1, ty + 1, 1, 3, bodyCh);
    surf.rect(torsoX + torsoW, ty + 1, 1, 3, bodyCh);
  }

  // Gunboots! Iconic heavy downward barrels on feet
  const by = ty + 4;
  let lFootX = ox + 8;
  let rFootX = ox + 13;
  let lFootY = by;
  let rFootY = by;

  if (pose === 'run0') {
    lFootX = ox + 7;
    rFootX = ox + 14;
    lFootY = by - 1;
    rFootY = by;
  } else if (pose === 'run1') {
    lFootX = ox + 9;
    rFootX = ox + 12;
  } else if (pose === 'run2') {
    lFootX = ox + 14;
    rFootX = ox + 7;
    rFootY = by - 1;
  } else if (pose === 'run3') {
    lFootX = ox + 12;
    rFootX = ox + 9;
  } else if (pose === 'jump') {
    lFootY = by - 1;
    rFootY = by;
  } else if (pose === 'fall') {
    lFootX = ox + 8;
    rFootX = ox + 13;
    lFootY = by + 1;
    rFootY = by + 1;
  } else if (pose === 'shoot') {
    lFootX = ox + 8;
    rFootX = ox + 13;
    lFootY = by;
    rFootY = by;
  } else if (pose === 'swim0') {
    lFootX = ox + 7;
    rFootX = ox + 14;
    lFootY = by + 1;
  } else if (pose === 'swim1') {
    lFootX = ox + 9;
    rFootX = ox + 12;
    rFootY = by + 1;
  }

  const bootW = isHeavy ? 4 : 3;
  // Left gunboot
  surf.rect(lFootX - 1, lFootY, bootW + 2, 4, 'D');
  surf.rect(lFootX, lFootY, bootW, 3, bodyCh);
  surf.rect(lFootX, lFootY + 2, bootW, 1, bootAccent);
  // Right gunboot
  surf.rect(rFootX - 1, rFootY, bootW + 2, 4, 'D');
  surf.rect(rFootX, rFootY, bootW, 3, bodyCh);
  surf.rect(rFootX, rFootY + 2, bootW, 1, bootAccent);

  // Shoot barrel flare / Jetpack exhaust
  if (pose === 'shoot') {
    surf.rect(ox + 9, by + 3, 2, 2, 'M');
    surf.rect(ox + 13, by + 3, 2, 2, 'L');
  } else if (pose === 'jet0' || pose === 'jet1') {
    const flameH = pose === 'jet0' ? 4 : 2;
    surf.rect(lFootX, lFootY + 3, 2, flameH, 'M');
    surf.rect(rFootX, rFootY + 3, 2, flameH, 'M');
    surf.px(lFootX + 1, lFootY + 3, 'L');
    surf.px(rFootX + 1, rFootY + 3, 'L');
    // Small jetpack canister on back
    surf.rect(torsoX - 3, ty, 2, 4, 'S');
  }
}

// ============================================================================
// Biome Autotiled Solid Wall Painter (16x16 x 16 N/E/S/W bitmasks)
// ============================================================================

function drawBiomeWallTile(
  surf: PixelSurface,
  ox: number,
  oy: number,
  area: number,
  mask: number,
): void {
  const hasN = (mask & 1) !== 0;
  const hasE = (mask & 2) !== 0;
  const hasS = (mask & 4) !== 0;
  const hasW = (mask & 8) !== 0;

  // Base solid dark rock fill
  surf.rect(ox, oy, 16, 16, 'D');

  const edgeCh: 'L' | 'M' | 'S' = area === 3 ? 'S' : area === 5 ? 'M' : 'L';
  const accentCh: 'L' | 'M' | 'S' = area === 3 ? 'L' : area === 4 ? 'S' : area === 5 ? 'L' : 'L';

  // Biome interior rock texture (subtle, low noise so foreground pops!)
  if (area === 0 || area === 1) {
    // Cavern carved stone blocks
    surf.px(ox + 4, oy + 4, 'L');
    surf.px(ox + 5, oy + 4, 'L');
    surf.px(ox + 11, oy + 10, 'L');
    surf.px(ox + 10, oy + 11, 'L');
    if (area === 0 && !hasN) {
      // Surface grassy/mossy rim accent
      surf.rect(ox, oy, 16, 2, 'M');
      surf.rect(ox, oy + 2, 16, 1, 'L');
    }
  } else if (area === 2) {
    // Catacomb bone-brick mortar joints
    surf.rect(ox + 2, oy + 7, 5, 1, 'L');
    surf.rect(ox + 9, oy + 7, 5, 1, 'L');
    surf.px(ox + 8, oy + 3, 'L');
    surf.px(ox + 4, oy + 12, 'L');
  } else if (area === 3) {
    // Aquifer coral pores with Special blue highlights
    surf.rect(ox + 4, oy + 4, 2, 2, 'S');
    surf.rect(ox + 10, oy + 9, 2, 2, 'S');
    surf.px(ox + 5, oy + 12, 'L');
  } else if (area === 4) {
    // Limbo geometric void circuits
    surf.rect(ox + 4, oy + 4, 8, 1, 'L');
    surf.rect(ox + 4, oy + 4, 1, 4, 'L');
    surf.rect(ox + 11, oy + 8, 1, 4, 'M');
    surf.rect(ox + 7, oy + 11, 5, 1, 'M');
  } else {
    // Abyss obsidian with pulsing crimson veins
    surf.px(ox + 5, oy + 5, 'M');
    surf.px(ox + 6, oy + 6, 'M');
    surf.px(ox + 10, oy + 10, 'M');
    surf.px(ox + 9, oy + 11, 'M');
  }

  // Exposed borders (2px crisp edge + 1px bevel highlight)
  if (!hasN) {
    surf.rect(ox, oy, 16, 2, edgeCh);
    surf.px(ox + 3, oy + 2, accentCh);
    surf.px(ox + 11, oy + 2, accentCh);
  }
  if (!hasS) {
    surf.rect(ox, oy + 14, 16, 2, edgeCh);
    surf.px(ox + 5, oy + 13, accentCh);
  }
  if (!hasW) {
    surf.rect(ox, oy, 2, 16, edgeCh);
    surf.px(ox + 2, oy + 6, accentCh);
  }
  if (!hasE) {
    surf.rect(ox + 14, oy, 2, 16, edgeCh);
    surf.px(ox + 13, oy + 9, accentCh);
  }

  // Round off outer corners slightly for authentic pixel cavern charm
  if (!hasN && !hasW) surf.clearPx(ox, oy);
  if (!hasN && !hasE) surf.clearPx(ox + 15, oy);
  if (!hasS && !hasW) surf.clearPx(ox, oy + 15);
  if (!hasS && !hasE) surf.clearPx(ox + 15, oy + 15);

  // Inner corner pixels when two adjacent neighbors exist (visual polish)
  if (hasN && hasW) surf.px(ox, oy, 'D');
  if (hasN && hasE) surf.px(ox + 15, oy, 'D');
  if (hasS && hasW) surf.px(ox, oy + 15, 'D');
  if (hasS && hasE) surf.px(ox + 15, oy + 15, 'D');
}

// ============================================================================
// Enemy Sprite Painter (16x16, 2 frames, STRICT semantic color rule!)
// WHITE (L) = stompable | RED (M) = un-stompable / hazard
// ============================================================================

const ENEMY_SPRITES: Record<string, readonly [readonly string[], readonly string[]]> = {
  // ---- AREA 1: CAVERN ----
  sprBat: [
    [
      '................',
      '................',
      '..LL........LL..',
      '.LLLL..LL..LLLL.',
      'LLLLLLLLLLLLLLLL',
      '.LLL.LDLLDL.LLL.',
      '..LL.LLLLLL.LL..',
      '.....LLDDLL.....',
      '......L..L......',
      '................',
    ],
    [
      '................',
      '.....L....L.....',
      '.....LLLLLL.....',
      '....LLDLLDLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '.LLL..LLLL..LLL.',
      'LL.....LL.....LL',
      '................',
      '................',
    ],
  ],
  sprSnake: [
    [
      '................',
      '................',
      '.........LLLL...',
      '........LLDLLL..',
      '........LLLLLLM.',
      '..LLL...LLL.....',
      '.LLLLL.LLLL.....',
      'LLLLLLLLLL......',
      '.LLLLLLLL.......',
      '................',
    ],
    [
      '................',
      '................',
      '........LLLL....',
      '.......LLDLLL...',
      '.......LLLLLL...',
      '...LLL..LLL.....',
      '..LLLLLLLLL.....',
      '.LLLLLLLLL......',
      '..LLLLLLL.......',
      '................',
    ],
  ],
  sprFrog: [
    [
      '................',
      '....LL....LL....',
      '...LDLL..LLDL...',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLDDDDDDLLL..',
      '..LLLLLLLLLLLL..',
      '.LLL..LLLL..LLL.',
      'LLL...LLLL...LLL',
      '................',
    ],
    [
      '....LL....LL....',
      '...LDLL..LLDL...',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLDDDDDDLLL..',
      '...LLLLLLLLLL...',
      '..LL..LLLL..LL..',
      '.LL...LLLL...LL.',
      '.L............L.',
      '................',
    ],
  ],
  sprSnail: [
    [
      '................',
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMDDMMMMMMM..',
      '..MMMDMMMDMMMM..',
      '..MMMMDDDDMMMM..',
      '..MMMMMMMMMMMM..',
      '.LLMMMMMMMMMML..',
      'LLDLLLLLLLLLLLL.',
      '.LLLLLLLLLLLLLL.',
    ],
    [
      '................',
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMDDDDMMMM..',
      '..MMMDMMMDMMMM..',
      '..MMMDDMMMMMMM..',
      '..MMMMMMMMMMMM..',
      'LLLMMMMMMMMMMML.',
      'LDLLLLLLLLLLLL..',
      '.LLLLLLLLLLLL...',
    ],
  ],
  sprTurtle: [
    [
      '................',
      '......M..M......',
      '....MMMMMMMM....',
      '...MMMDMMDMMM...',
      '..MMMMMMMMMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      'LLDLLLLLLLLLLLL.',
      'LLL..LL..LL..LL.',
      '................',
    ],
    [
      '................',
      '.....M....M.....',
      '....MMMMMMMM....',
      '...MMMDMMDMMM...',
      '..MMMMMMMMMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      '.LDLLLLLLLLLLLL.',
      '..LL..LL..LL..L.',
      '................',
    ],
  ],
  sprWhiteJelly: [
    [
      '.....LLLLLL.....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLDLLLLDLLL..',
      '..LLLLLLLLLLLL..',
      '...LLLLLLLLLL...',
      '...LL.LL.LL.LL..',
      '..LL..LL..LL.LL.',
      '..L...L...L...L.',
      '................',
    ],
    [
      '.....LLLLLL.....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLDLLLLDLLL..',
      '..LLLLLLLLLLLL..',
      '...LLLLLLLLLL...',
      '..LL..LL..LL..L.',
      '...LL.LL.LL..LL.',
      '...L...L...L..L.',
      '................',
    ],
  ],
  sprRedBall: [
    [
      '.......MM.......',
      '..M...MMMM...M..',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '.MMMMMLDDLMNMMM.'.replace('N', 'M'),
      'MMMMMMLDDLMMMMMM',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '..M...MMMM...M..',
      '.......MM.......',
    ],
    [
      '......M..M......',
      '.MM..MMMMMM..MM.',
      '..MMMMMMMMMMMM..',
      '..MMMMMMMMMMMM..',
      '.MMMMMLDDLMMMMM.',
      '.MMMMMLDDLMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '..MMMMMMMMMMMM..',
      '.MM..MMMMMM..MM.',
      '......M..M......',
    ],
  ],
  sprCrawler: [
    [
      '................',
      '................',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLDLLLLDLLLL..',
      '..LLLLLLLLLLLL..',
      '.LL.LL.LL.LL.LL.',
      '.L..L..L..L..L..',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLDLLLLDLLLL..',
      '..LLLLLLLLLLLL..',
      '..LL.LL.LL.LL...',
      '..L..L..L..L....',
      '................',
      '................',
    ],
  ],

  // ---- AREA 2: CATACOMB ----
  sprSkeleton: [
    [
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '....LLDLLDLL....',
      '....LLLLLLLL....',
      '.....L.LL.L.....',
      '...LLLLLLLLLL...',
      '..LL..LLLL..LL..',
      '......L..L......',
      '.....LL..LL.....',
      '....LL....LL....',
    ],
    [
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '....LLDLLDLL....',
      '....LLLLLLLL....',
      '.....L.LL.L.....',
      '..LLLLLLLLLLLL..',
      '.LL...LLLL...LL.',
      '.....LL..LL.....',
      '.....L....L.....',
      '....LL....LL....',
    ],
  ],
  sprObake: [
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMMLMMMMMLMM..',
      '..MMMMMMMMMMMM..',
      '..MMMMDDDDMMMM..',
      '..MMMMMMMMMMMM..',
      '..MM.MM..MM.MM..',
      '.MM..M....M..MM.',
      '................',
    ],
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMMLMMMMMLMM..',
      '..MMMMMMMMMMMM..',
      '..MMMMMDDDMMMM..',
      '...MMMMMMMMMM...',
      '...MM.MMMM.MM...',
      '..MM...MM...MM..',
      '................',
    ],
  ],
  sprGasWander: [
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLDLLLLDLLL..',
      '..LLLLLLLLLLLL..',
      '...LLLLLLLLLL...',
      '....LL.LL.LL....',
      '.....L....L.....',
      '................',
      '................',
    ],
    [
      '.....LLLLLL.....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLDLLLLDLLL..',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '...LL..LL..LL...',
      '....L......L....',
      '................',
      '................',
    ],
  ],
  sprGasChaser: [
    [
      '......MMMM......',
      '....MMMMMMMM....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMLMMM..',
      '..MMMMDDDDMMMM..',
      '...MMMMMMMMMM...',
      '....MM.MM.MM....',
      '...M...MM...M...',
      '................',
      '................',
    ],
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMMLMMMMLMMM..',
      '..MMMMDDDDMMMM..',
      '...MMMMMMMMMM...',
      '...MM..MM..MM...',
      '....M......M....',
      '................',
      '................',
    ],
  ],
  sprWanderSkull: [
    [
      '...MM......MM...',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMLLMMMMLLMM..',
      '..MMLLMMMMLLMM..',
      '..MMMMMLLMMMMM..',
      '...MMMMMMMMMM...',
      '....M.M.MM.M....',
      '....M.M.MM.M....',
      '................',
    ],
    [
      '..MM........MM..',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMLLMMMMLLMM..',
      '..MMLLMMMMLLMM..',
      '..MMMMMLLMMMMM..',
      '...MMMMMMMMMM...',
      '....MM.MM.MM....',
      '.....M.MM.M.....',
      '................',
    ],
  ],
  sprJumpySkull: [
    [
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLDDLLLLDDLL..',
      '..LLDDLLLLDDLL..',
      '..LLLLLDDLLLLL..',
      '...LLLLLLLLLL...',
      '....L.L..L.L....',
      '................',
      '................',
    ],
    [
      '................',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLDDLLLLDDLL..',
      '..LLDDLLLLDDLL..',
      '..LLLLLDDLLLLL..',
      '...LLLLLLLLLL...',
      '...LL.L..L.LL...',
      '................',
    ],
  ],
  sprRat: [
    [
      '................',
      '................',
      '.........LL.....',
      '....LLLLLLLL....',
      '..LLLLLLLLDLLL..',
      '.LLLLLLLLLLLLLL.',
      'LL..LLLLLLLLLL..',
      '.....LL....LL...',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '........LL......',
      '....LLLLLLLL....',
      '..LLLLLLLLDLLL..',
      'LLLLLLLLLLLLLLL.',
      '.L...LLLLLLLL...',
      '......LL..LL....',
      '................',
      '................',
    ],
  ],
  sprSpider: [
    [
      '.......L........',
      '.L.....L.....L..',
      '..LL..LLL..LL...',
      '...LLLLLLLLL....',
      '..LLLDLLLDLLL...',
      '...LLLLLLLLL....',
      '..LL..LLL..LL...',
      '.L...L...L...L..',
      '................',
      '................',
    ],
    [
      '.......L........',
      '..L....L....L...',
      '.LL...LLL...LL..',
      '...LLLLLLLLL....',
      '..LLLDLLLDLLL...',
      '...LLLLLLLLL....',
      '.LL...LLL...LL..',
      '..L..L...L..L...',
      '................',
      '................',
    ],
  ],
  sprFirebat: [
    [
      '................',
      '..MM........MM..',
      '.MMMM..MM..MMMM.',
      'MMMMMMMMMMMMMMMM',
      '.MMM.MLMMLM.MMM.',
      '..MM.MMMMMM.MM..',
      '.....MMLLMM.....',
      '......M..M......',
      '................',
      '................',
    ],
    [
      '.....M....M.....',
      '.....MMMMMM.....',
      '....MMLMMLMM....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '.MMM..MMMM..MMM.',
      'MM.....MM.....MM',
      '................',
      '................',
      '................',
    ],
  ],

  // ---- AREA 3: AQUIFER ----
  sprEyefish: [
    [
      '................',
      '......LLLLL.....',
      '..L..LLLLLLL....',
      '.LL.LLLLLLDLL...',
      'LLLLLLLLLLLDLL..',
      'LLLLLLLLLLLLLL..',
      '.LL.LLLLLLLLL...',
      '..L..LLLLLLL....',
      '......LLLLL.....',
      '................',
    ],
    [
      '................',
      '......LLLLL.....',
      '.L...LLLLLLL....',
      '.LLL.LLLLLDLL...',
      '..LLLLLLLLLDLL..',
      '..LLLLLLLLLLLL..',
      '.LLL.LLLLLLLL...',
      '.L...LLLLLLL....',
      '......LLLLL.....',
      '................',
    ],
  ],
  sprRedFish: [
    [
      '......M..M......',
      '.....MMMMMM.....',
      '.M..MMMMMMMMM...',
      'MM.MMMMMMMLMMM..',
      'MMMMMMMMMMMLMMM.',
      'MM.MMMMMMMMMMM..',
      '.M..MMMMMMMMM...',
      '.....MMMMMM.....',
      '......M..M......',
      '................',
    ],
    [
      '.....M....M.....',
      '.....MMMMMM.....',
      '..M.MMMMMMMMM...',
      '.MMMMMMMMMLMMM..',
      '..MMMMMMMMMLMMM.',
      '.MMMMMMMMMMMMM..',
      '..M.MMMMMMMMM...',
      '.....MMMMMM.....',
      '.....M....M.....',
      '................',
    ],
  ],
  sprSquid: [
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '...LLLDLLDLLL...',
      '....LLLLLLLL....',
      '...LL.LLLL.LL...',
      '..LL..L..L..LL..',
      '..L...L..L...L..',
      '................',
    ],
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '...LLLDLLDLLL...',
      '....LLLLLLLL....',
      '....LLLLLLLL....',
      '...LL.L..L.LL...',
      '...L..L..L..L...',
      '................',
    ],
  ],
  sprAquaTurtle: [
    [
      '.....M....M.....',
      '...MMMMMMMMMM...',
      '..MMMMLMMLMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      'LLLLMMMMMMMMMML.',
      'LLDLL..MM..MML..',
      '................',
      '................',
      '................',
    ],
    [
      '......M..M......',
      '...MMMMMMMMMM...',
      '..MMMMLMMLMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      'LLLLMMMMMMMMMML.',
      '.LDLL..MM..MMML.',
      '................',
      '................',
      '................',
    ],
  ],
  sprRedJelly: [
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '...MM.MM.MM.MM..',
      '..MM..MM..MM.MM.',
      '..M...M...M...M.',
      '................',
    ],
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '..MM..MM..MM..M.',
      '...MM.MM.MM..MM.',
      '...M...M...M..M.',
      '................',
    ],
  ],
  sprJellofish: [
    [
      '....LLLLLLLL....',
      '..LLLLSLLSLLLL..',
      '.LLLLLLLLLLLLLL.',
      '.LLLDLLLLLLDLLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLLLLLLLLLL..',
      '..LL.LL..LL.LL..',
      '.LL..LL..LL..LL.',
      '.L...L....L...L.',
      '................',
    ],
    [
      '....LLLLLLLL....',
      '..LLLSLLLLSLLL..',
      '.LLLLLLLLLLLLLL.',
      '.LLLDLLLLLLDLLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLLLLLLLLLL..',
      '...LLLL..LLLL...',
      '..LL.LL..LL.LL..',
      '..L...L..L...L..',
      '................',
    ],
  ],
  sprMohawkmon: [
    [
      '....M..MM..M....',
      '....MMMMMMMM....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '..MMLLLLLLLLMM..',
      '...MMMMMMMMMM...',
      '...MM......MM...',
      '..MM........MM..',
      '................',
    ],
    [
      '.....M.MM.M.....',
      '....MMMMMMMM....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '..MMLLLLLLLLMM..',
      '...MMMMMMMMMM...',
      '....MM....MM....',
      '...MM......MM...',
      '................',
    ],
  ],
  sprUnichan: [
    [
      '.......MM.......',
      '..M....MM....M..',
      '...MM.MMMM.MM...',
      '....MMMMMMMM....',
      '.MMMMMMMMMMMMMM.',
      'MMMMMLMMMMLMMMMM',
      '.MMMMMMMMMMMMMM.',
      '....MMMMMMMM....',
      '...MM.MMMM.MM...',
      '..M....MM....M..',
    ],
    [
      '....M......M....',
      '....MM.MM.MM....',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '..MMMMLMMLMMMM..',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '....MM.MM.MM....',
      '....M......M....',
    ],
  ],
  sprTadpole: [
    [
      '................',
      '................',
      '......LLLLL.....',
      '.....LLLLDLL....',
      '.LL.LLLLLLLL....',
      'LL..LLLLLLLL....',
      '.....LLLLLL.....',
      '................',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '......LLLLL.....',
      '.....LLLLDLL....',
      'LL..LLLLLLLL....',
      '.LL.LLLLLLLL....',
      '.....LLLLLL.....',
      '................',
      '................',
      '................',
    ],
  ],

  // ---- AREA 4: LIMBO ----
  sprCrawlbot: [
    [
      '....LLLLLLLL....',
      '...LLDDDDDDLL...',
      '...LLDLSSLDLL...',
      '...LLDDDDDDLL...',
      '....LLLLLLLL....',
      '..LL..LLLL..LL..',
      '.LL...L..L...LL.',
      '................',
      '................',
      '................',
    ],
    [
      '....LLLLLLLL....',
      '...LLDDDDDDLL...',
      '...LLDLSLLDLL...',
      '...LLDDDDDDLL...',
      '....LLLLLLLL....',
      '...LL.LLLL.LL...',
      '..LL..L..L..LL..',
      '................',
      '................',
      '................',
    ],
  ],
  sprDodger: [
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLDDDDDDLL...',
      '..LLDDLLLLDDLL..',
      '...LLLLLLLLLL...',
      '....LL.LL.LL....',
      '...LL......LL...',
      '................',
      '................',
      '................',
    ],
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLDDDDDDLL...',
      '..LLDDLLLLDDLL..',
      '...LLLLLLLLLL...',
      '.....LL..LL.....',
      '....LL....LL....',
      '................',
      '................',
      '................',
    ],
  ],
  sprLeapon: [
    [
      '....LLLLLLLL....',
      '...LLLDLLDLLL...',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '......LLLL......',
      '.....L....L.....',
      '......LLLL......',
      '.....LL..LL.....',
      '................',
      '................',
    ],
    [
      '.....LLLLLL.....',
      '....LLDLLDLL....',
      '....LLLLLLLL....',
      '.....LLLLLL.....',
      '......L..L......',
      '......LLLL......',
      '......L..L......',
      '.....LL..LL.....',
      '....LL....LL....',
      '................',
    ],
  ],
  sprTwinbot: [
    [
      '................',
      '..LLLL....LLLL..',
      '.LLDLLL..LLLDLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLL....LLLL..',
      '...LL......LL...',
      '................',
      '................',
      '................',
      '................',
    ],
    [
      '..LLLL....LLLL..',
      '.LLDLLL..LLLDLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLL....LLLL..',
      '...LL......LL...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  sprPoofer: [
    [
      '......MMMM......',
      '...MMMMMMMMMM...',
      '..MMMDMMMMDMMM..',
      '.MMMMMLMMLMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '.MMMMMDDDDMMMMM.',
      '..MMMMMMMMMMMM..',
      '...MMMMMMMMMM...',
      '......MMMM......',
      '................',
    ],
    [
      '.....MMMMMM.....',
      '..MMMMMMMMMMMM..',
      '.MMMMDMMMMDMMMM.',
      '.MMMMMLMMLMMMMM.',
      'MMMMMMMMMMMMMMMM',
      '.MMMMMDDDDMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '.....MMMMMM.....',
      '................',
    ],
  ],
  sprSporeSpawner: [
    [
      '...MM.MMMM.MM...',
      '..MMMMMMMMMMMM..',
      '.MMMDMMMMMMDMMM.',
      '.MMMMLMMMMLMMMM.',
      'MMMMMMDDDDMMMMMM',
      'MMMMMMDDDDMMMMMM',
      '.MMMMLMMMMLMMMM.',
      '.MMMDMMMMMMDMMM.',
      '..MMMMMMMMMMMM..',
      '...MM.MMMM.MM...',
    ],
    [
      '..MM..MMMM..MM..',
      '..MMMMMMMMMMMM..',
      '.MMMMDDDDDDMMMM.',
      '.MMMMLMMMMLMMMM.',
      'MMMMMMLDDLMMMMMM',
      'MMMMMMLDDLMMMMMM',
      '.MMMMLMMMMLMMMM.',
      '.MMMMDDDDDDMMMM.',
      '..MMMMMMMMMMMM..',
      '..MM..MMMM..MM..',
    ],
  ],
  sprAngryFace: [
    [
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '.MMLLMMMMMMLLMM.',
      '.MMMMLLMMLLMMMM.',
      '.MMMLDMMMMDLMMM.',
      '.MMMMMMMMMMMMMM.',
      '.MMMMDDDDDDMMMM.',
      '..MMMDMMMMDMMM..',
      '...MMMMMMMMMM...',
      '................',
    ],
    [
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '.MMLLMMMMMMLLMM.',
      '.MMMMLLMMLLMMMM.',
      '.MMMLDMMMMDLMMM.',
      '.MMMMMMMMMMMMMM.',
      '.MMMDDDDDDDDMMM.',
      '..MMMDMMMMDMMM..',
      '...MMMMMMMMMM...',
      '................',
    ],
  ],
  sprLunger: [
    [
      '.......LL.......',
      '......LLLL......',
      '.....LLLLLL.....',
      '....LLDLLDLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '....LLLLLLLL....',
      '.....LL..LL.....',
      '................',
      '................',
    ],
    [
      '.......LL.......',
      '......LLLL......',
      '.....LLLLLL.....',
      '....LLDLLDLL....',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '.....LLLLLL.....',
      '......L..L......',
      '................',
      '................',
    ],
  ],
  sprUpshoot: [
    [
      '.....MM..MM.....',
      '.....MM..MM.....',
      '....MMMMMMMM....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      '..MMMMMMMMMMMM..',
      '................',
    ],
    [
      '.....LL..LL.....',
      '.....MM..MM.....',
      '....MMMMMMMM....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      '..MMMMMMMMMMMM..',
      '................',
    ],
  ],
  sprGasAscend: [
    [
      '.......LL.......',
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '...LLDLLLLDLL...',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '.....LL..LL.....',
      '......L..L......',
      '.......LL.......',
      '................',
    ],
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '...LLDLLLLDLL...',
      '....LLLLLLLL....',
      '.....LLLLLL.....',
      '......L..L......',
      '.....L....L.....',
      '................',
      '................',
    ],
  ],
  sprGasDescend: [
    [
      '.......LL.......',
      '......L..L......',
      '.....LL..LL.....',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '...LLDLLLLDLL...',
      '....LLLLLLLL....',
      '.....LLLLLL.....',
      '.......LL.......',
      '................',
    ],
    [
      '................',
      '.....L....L.....',
      '......L..L......',
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '...LLDLLLLDLL...',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '......LLLL......',
      '................',
    ],
  ],
  sprGasBounce: [
    [
      '.......MM.......',
      '......MMMM......',
      '....MMMMMMMM....',
      '...MMMLMMLMMM...',
      '..MMMMMMMMMMMM..',
      '...MMMLMMLMMM...',
      '....MMMMMMMM....',
      '......MMMM......',
      '.......MM.......',
      '................',
    ],
    [
      '......MMMM......',
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMLMMLMMMM..',
      '..MMMMMMMMMMMM..',
      '..MMMMLMMLMMMM..',
      '...MMMMMMMMMM...',
      '.....MMMMMM.....',
      '......MMMM......',
      '................',
    ],
  ],
  sprGasSpin: [
    [
      '...MM......MM...',
      '....MM.MM.MM....',
      '....MMMMMMMM....',
      '..MMMMLMMLMMMM..',
      '..MMMMMMMMMMMM..',
      '..MMMMLMMLMMMM..',
      '....MMMMMMMM....',
      '....MM.MM.MM....',
      '...MM......MM...',
      '................',
    ],
    [
      '......MMMM......',
      '...MM.MMMM.MM...',
      '..MMMMMMMMMMMM..',
      '...MMMLMMLMMM...',
      '..MMMMMMMMMMMM..',
      '...MMMLMMLMMM...',
      '..MMMMMMMMMMMM..',
      '...MM.MMMM.MM...',
      '......MMMM......',
      '................',
    ],
  ],
  sprGuntle: [
    [
      '.....M....M.....',
      '...MMMMMMMMMM...',
      '..MMMLMMMMMLMM..',
      '.MMMMMMLLMMMMMM.',
      'MMMMMMMMMMMMMMMM',
      'MMDDDDDDDDDDDDMM',
      'LLMMMMMMMMMMMMLL',
      '.LL..MM..MM..LL.',
      '................',
      '................',
    ],
    [
      '......M..M......',
      '...MMMMMMMMMM...',
      '..MMMLMMMMMLMM..',
      '.MMMMMMLLMMMMMM.',
      'MMMMMMMMMMMMMMMM',
      'MMDDDDDDDDDDDDMM',
      '.LMMMMMMMMMMMML.',
      '..LL..MM..MM.LL.',
      '................',
      '................',
    ],
  ],
};

// ============================================================================
// Boss Sprites: sprBossEye (32x80 x2) & sprTentacle (176x88 x2)
// ============================================================================

function drawBossEyeFrame(surf: PixelSurface, ox: number, oy: number, closed: boolean): void {
  // Organic armored vertical abyssal eye pod (32x80)
  for (let y = 2; y < 78; y++) {
    const ny = (y - 40) / 38;
    const halfW = Math.round(14 * Math.sqrt(Math.max(0, 1 - ny * ny)));
    for (let x = 16 - halfW; x <= 16 + halfW; x++) {
      const distEdge = Math.min(x - (16 - halfW), 16 + halfW - x);
      if (distEdge <= 1) {
        surf.px(ox + x, oy + y, 'M');
      } else if (distEdge <= 3 && ((y + x) & 3) === 0) {
        surf.px(ox + x, oy + y, 'M');
      } else {
        surf.px(ox + x, oy + y, 'D');
      }
    }
  }
  // Ribbed armor ridges top & bottom
  for (let i = 0; i < 4; i++) {
    const ry = 8 + i * 5;
    surf.rect(ox + 9, oy + ry, 14, 1, 'L');
    surf.rect(ox + 9, oy + 72 - i * 5, 14, 1, 'L');
  }

  if (!closed) {
    // Open glaring eye (centered at 16, 40)
    surf.circle(ox + 16, oy + 40, 11, 'M');
    surf.circle(ox + 16, oy + 40, 9, 'L');
    surf.circle(ox + 16, oy + 40, 5, 'M');
    surf.circle(ox + 16, oy + 40, 2.5, 'D');
    // Specular glint
    surf.rect(ox + 12, oy + 35, 2, 2, 'L');
    // Upper/lower eyelid veins
    surf.rect(ox + 11, oy + 26, 10, 2, 'M');
    surf.rect(ox + 11, oy + 52, 10, 2, 'M');
  } else {
    // Closed stunned eyelid seam
    surf.circle(ox + 16, oy + 40, 10, 'M');
    surf.circle(ox + 16, oy + 40, 8, 'D');
    surf.rect(ox + 7, oy + 39, 18, 2, 'L');
    // Stunned cross ticks
    surf.px(ox + 11, oy + 37, 'M');
    surf.px(ox + 16, oy + 37, 'M');
    surf.px(ox + 21, oy + 37, 'M');
  }
}

function drawBossTentacleFrame(surf: PixelSurface, ox: number, oy: number, phase: number): void {
  // Huge undulating 176x88 sweeping tentacle with crimson ridge barbs & white suckers
  for (let x = 4; x < 172; x++) {
    const t = x / 176;
    const thickness = Math.max(3, Math.round(14 * (1 - t * 0.72)));
    const wave = Math.round(Math.sin(t * Math.PI * 3.2 + phase * Math.PI) * (10 + t * 12));
    const cy = 44 + wave;

    for (let dy = -thickness; dy <= thickness; dy++) {
      const y = cy + dy;
      if (y < 2 || y >= 86) continue;
      if (Math.abs(dy) >= thickness - 1) {
        surf.px(ox + x, oy + y, 'M');
      } else if (dy < -thickness + 3 && x % 6 < 3) {
        surf.px(ox + x, oy + y, 'L');
      } else {
        surf.px(ox + x, oy + y, 'D');
      }
    }

    // Spiked top barbs
    if (x % 14 === 0 && x < 156) {
      const tipY = cy - thickness - 3;
      surf.rect(ox + x - 1, oy + tipY + 1, 3, 2, 'M');
      surf.px(ox + x, oy + tipY, 'L');
    }

    // Underside pale suckers
    if (x % 12 === 6 && x < 160) {
      const sy = cy + thickness;
      surf.rect(ox + x - 2, oy + sy - 1, 4, 3, 'L');
      surf.rect(ox + x - 1, oy + sy, 2, 1, 'D');
    }
  }
}

// ============================================================================
// Tiles, Pickups, Shop Items, Weapons, Upgrade Icons
// ============================================================================

function drawSpecialTiles(surf: PixelSurface, packer: ShelfPacker): void {
  // Breakable cracked red block (16x16)
  {
    const { x, y } = packer.alloc('sprBreakable', 16, 16, 1, 0, 0);
    surf.rect(x, y, 16, 16, 'M');
    surf.rect(x + 1, y + 1, 14, 14, 'D');
    surf.rect(x + 2, y + 2, 12, 12, 'M');
    // Crisp fissure cracks
    surf.rect(x + 3, y + 5, 4, 1, 'D');
    surf.rect(x + 6, y + 6, 1, 4, 'D');
    surf.rect(x + 7, y + 9, 5, 1, 'D');
    surf.rect(x + 10, y + 4, 1, 4, 'D');
    // Corner specular glint
    surf.rect(x + 2, y + 2, 3, 1, 'L');
    surf.px(x + 2, y + 3, 'L');
  }

  // Thin platform (16x16, crisp 2px white top bar + bracket feet!)
  {
    const { x, y } = packer.alloc('sprThinPlatform', 16, 16, 1, 0, 0);
    surf.rect(x, y, 16, 2, 'L');
    surf.rect(x + 1, y + 2, 2, 2, 'L');
    surf.rect(x + 13, y + 2, 2, 2, 'L');
    surf.px(x + 2, y + 4, 'L');
    surf.px(x + 13, y + 4, 'L');
  }

  // Spikes (Up, Down, Left, Right) — crisp RED hazards
  {
    const up = packer.alloc('sprSpikeUp', 16, 16, 1, 0, 0);
    for (let s = 0; s < 2; s++) {
      const sx = up.x + s * 8;
      for (let row = 0; row < 8; row++) {
        const half = Math.floor((row + 1) / 2);
        surf.rect(sx + 4 - half, up.y + 8 + row, half * 2, 1, 'M');
      }
      surf.px(sx + 3, up.y + 9, 'L');
      surf.px(sx + 4, up.y + 8, 'L');
    }
    surf.rect(up.x, up.y + 15, 16, 1, 'D');

    const dn = packer.alloc('sprSpikeDown', 16, 16, 1, 0, 0);
    for (let s = 0; s < 2; s++) {
      const sx = dn.x + s * 8;
      for (let row = 0; row < 8; row++) {
        const half = Math.floor((8 - row) / 2);
        surf.rect(sx + 4 - half, dn.y + row, half * 2, 1, 'M');
      }
      surf.px(sx + 4, dn.y + 7, 'L');
    }
    surf.rect(dn.x, dn.y, 16, 1, 'D');

    const lt = packer.alloc('sprSpikeLeft', 16, 16, 1, 0, 0);
    for (let s = 0; s < 2; s++) {
      const sy = lt.y + s * 8;
      for (let col = 0; col < 8; col++) {
        const half = Math.floor((col + 1) / 2);
        surf.rect(lt.x + 8 + col, sy + 4 - half, 1, half * 2, 'M');
      }
      surf.px(lt.x + 8, sy + 4, 'L');
    }

    const rt = packer.alloc('sprSpikeRight', 16, 16, 1, 0, 0);
    for (let s = 0; s < 2; s++) {
      const sy = rt.y + s * 8;
      for (let col = 0; col < 8; col++) {
        const half = Math.floor((8 - col) / 2);
        surf.rect(rt.x + col, sy + 4 - half, 1, half * 2, 'M');
      }
      surf.px(rt.x + 7, sy + 4, 'L');
    }
  }

  // Spike Trap (Retracted & Extended)
  {
    const ret = packer.alloc('sprSpikeTrapRetracted', 16, 16, 1, 0, 0);
    surf.rect(ret.x, ret.y + 12, 16, 4, 'L');
    surf.rect(ret.x + 1, ret.y + 13, 14, 2, 'D');
    surf.px(ret.x + 4, ret.y + 11, 'M');
    surf.px(ret.x + 11, ret.y + 11, 'M');

    const ext = packer.alloc('sprSpikeTrapExtended', 16, 16, 1, 0, 0);
    surf.rect(ext.x, ext.y + 13, 16, 3, 'L');
    for (let s = 0; s < 3; s++) {
      const sx = ext.x + 2 + s * 5;
      surf.rect(sx, ext.y + 7, 2, 6, 'M');
      surf.px(sx, ext.y + 5, 'M');
      surf.px(sx + 1, ext.y + 6, 'L');
    }
  }

  // Bubble Block (Special Blue S)
  {
    const { x, y } = packer.alloc('sprBubbleBlock', 16, 16, 1, 0, 0);
    surf.circle(x + 6, y + 6, 5, 'S');
    surf.circle(x + 11, y + 9, 4.5, 'S');
    surf.circle(x + 5, y + 11, 4, 'S');
    surf.circle(x + 6, y + 6, 3.5, 'D');
    surf.circle(x + 11, y + 9, 3, 'D');
    surf.rect(x + 4, y + 4, 2, 1, 'L');
    surf.px(x + 4, y + 5, 'L');
    surf.px(x + 10, y + 7, 'L');
  }

  // Ghost Wall (Solid vs Phased)
  {
    const solid = packer.alloc('sprGhostWallSolid', 16, 16, 1, 0, 0);
    surf.rect(solid.x, solid.y, 16, 16, 'S');
    surf.rect(solid.x + 1, solid.y + 1, 14, 14, 'D');
    surf.rect(solid.x + 2, solid.y + 2, 12, 12, 'L');
    surf.rect(solid.x + 4, solid.y + 4, 8, 8, 'D');
    surf.rect(solid.x + 6, solid.y + 6, 4, 4, 'S');

    const phased = packer.alloc('sprGhostWallPhased', 16, 16, 1, 0, 0);
    for (let i = 0; i < 16; i += 4) {
      surf.rect(phased.x + i, phased.y, 2, 1, 'S');
      surf.rect(phased.x + i, phased.y + 15, 2, 1, 'S');
      surf.rect(phased.x, phased.y + i, 1, 2, 'S');
      surf.rect(phased.x + 15, phased.y + i, 1, 2, 'S');
    }
  }

  // Shop Floor
  {
    const { x, y } = packer.alloc('sprShopFloor', 16, 16, 1, 0, 0);
    surf.rect(x, y, 16, 16, 'D');
    surf.rect(x, y, 16, 2, 'L');
    surf.rect(x + 2, y + 4, 5, 4, 'L');
    surf.rect(x + 9, y + 4, 5, 4, 'L');
    surf.rect(x + 3, y + 5, 3, 2, 'D');
    surf.rect(x + 10, y + 5, 3, 2, 'D');
    surf.rect(x, y + 14, 16, 2, 'L');
  }

  // Stage Exit Chevron (2 frames)
  {
    const { x, y } = packer.alloc('sprStageExit', 16, 16, 2, 0, 0);
    for (let f = 0; f < 2; f++) {
      const fx = x + f * 16;
      const dy = f * 2;
      for (let i = 0; i < 5; i++) {
        surf.rect(fx + 3 + i, y + 3 + dy + i, 2, 1, 'L');
        surf.rect(fx + 11 - i, y + 3 + dy + i, 2, 1, 'L');
      }
      surf.rect(fx + 7, y + 9 + dy, 2, 2, 'M');
    }
  }
}

function drawWeaponsShopAndItems(surf: PixelSurface, packer: ShelfPacker): void {
  // 7 Gun Modules (16x16, origin 8,8)
  const gunGlyphs: Record<string, readonly string[]> = {
    sprGunMachinegun: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDSSSSSSSSSSDL.',
      '.LDSLLLLLLLLSDL.',
      '.LDSLDDDDDDLSDL.',
      '.LDSLDLLLLDLSDL.',
      '.LDSLDLLLLDLSDL.',
      '.LDSLDDDDDDLSDL.',
      '.LDSLLLLLLLLSDL.',
      '.LDSSSSSSSSSSDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunShotgun: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDMMMMMMMMMMDL.',
      '.LDMLL.LL.LLMDL.',
      '.LDMLL.LL.LLMDL.',
      '.LDMLLLLLLLLMDL.',
      '.LDMLLLLLLLLMDL.',
      '.LDMMLLMMLLMMDL.',
      '.LDMMMMMMMMMMDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunLaser: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSMLLMSSSDL.',
      '.LDSSSMLLMSSSDL.',
      '.LDSSSMLLMSSSDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunTriple: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDLL..LL..LLDL.',
      '.LDLL..LL..LLDL.',
      '.LD.LL.LL.LL.DL.',
      '.LD..LLLLLL..DL.',
      '.LD...LLLL...DL.',
      '.LD...MLLM...DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunPuncher: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.MM.MM.MM.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.MM.MM.MM.DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunBurst: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LD...LLLL...DL.',
      '.LD...MLLM...DL.',
      '.LD...DDDD...DL.',
      '.LD...LLLL...DL.',
      '.LD...MLLM...DL.',
      '.LD...LLLL...DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunNoppy: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDLL......LLDL.',
      '.LD.LL....LL.DL.',
      '.LD..MM..MM..DL.',
      '.LD...LLLL...DL.',
      '.LD..LL..LL..DL.',
      '.LD.LL....LL.DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
  };

  for (const [id, grid] of Object.entries(gunGlyphs)) {
    const { x, y } = packer.alloc(id, 16, 16, 1, 8, 8);
    surf.stampGrid(x, y + 2, grid);
  }

  // 6 Shop Items (16x16, origin 8,8)
  const shopGlyphs: Record<string, readonly string[]> = {
    sprShop100: [
      // Rice Ball (Onigiri)
      '......LLLL......',
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '..LLLLDDDDLLLL..',
      '.LLLLLDDDDLLLLL.',
      '.LLLLLDDDDLLLLL.',
      '..LLLLDDDDLLLL..',
    ],
    sprShop101: [
      // Battery
      '......LLLL......',
      '....LLLLLLLL....',
      '....LDDDDDDL....',
      '....LDMMMMDL....',
      '....LDMMMMDL....',
      '....LDLLLLDL....',
      '....LDMMMMDL....',
      '....LDDDDDDL....',
      '....LLLLLLLL....',
    ],
    sprShop102: [
      // Sushi
      '...MMMMMMMMMM...',
      '..MMMLMMMMMLMM..',
      '..MMMMMMMMMMMM..',
      '..LLLLLLLLLLLL..',
      '..LLLLDDDDLLLL..',
      '...LLLDDDDLLL...',
      '....LLLLLLLL....',
    ],
    sprShop103: [
      // Car Battery
      '...LL......LL...',
      '..LLLLLLLLLLLL..',
      '..LDDDDDDDDDDL..',
      '..LDMMLDDLMMDD..'.replace(/D$/, 'L'),
      '..LDMMLDDLMMDL..',
      '..LDMMLLLLMMDL..',
      '..LDDDDDDDDDDL..',
      '..LLLLLLLLLLLL..',
    ],
    sprShop104: [
      // Energy Drink
      '.....LLLLLL.....',
      '....LSSSSSSL....',
      '....LSSLLSSL....',
      '....LSLMMLSL....',
      '....LSSLLSSL....',
      '....LSSLLSSL....',
      '....LSSSSSSL....',
      '.....LLLLLL.....',
    ],
    sprShop105: [
      // Curry Bowl
      '....L..L..L.....',
      '.....L..L..L....',
      '..MMMMMMMMMMMM..',
      '.MMLLLLLLMMMMMM.',
      '.LLLLLLLLLLLLLL.',
      '..LLLLLLLLLLLL..',
      '....LLLLLLLL....',
    ],
  };

  for (const [id, grid] of Object.entries(shopGlyphs)) {
    const { x, y } = packer.alloc(id, 16, 16, 1, 8, 8);
    surf.stampGrid(x, y + 3, grid);
  }

  // Shop Glass Case (20x24, origin 10,14)
  {
    const { x, y } = packer.alloc('sprShopCase', 20, 24, 1, 10, 14);
    surf.rect(x + 1, y + 1, 18, 1, 'L');
    surf.rect(x + 1, y + 1, 1, 16, 'L');
    surf.rect(x + 18, y + 1, 1, 16, 'L');
    // Subtle glass shine diagonal
    surf.px(x + 3, y + 3, 'S');
    surf.px(x + 4, y + 2, 'S');
    surf.px(x + 3, y + 4, 'L');
    // Pedestal base
    surf.rect(x, y + 17, 20, 2, 'L');
    surf.rect(x + 2, y + 19, 16, 4, 'D');
    surf.rect(x + 2, y + 19, 16, 1, 'M');
    surf.rect(x + 1, y + 23, 18, 1, 'L');
  }

  // Faceted Red Gem (8x10, 2f)
  {
    const { x, y } = packer.alloc('sprGem', 8, 10, 2, 4, 5);
    const f0 = [
      '...MM...',
      '..MLLM..',
      '.MLMMMM.',
      'MLMMMMMM',
      'MMMMMMMM',
      'MMMMMDMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
    ];
    const f1 = [
      '...LL...',
      '..MLLM..',
      '.MLMLMM.',
      'MLMMMMMM',
      'MMMMMLMM',
      'MMMMMDMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
    ];
    surf.stampGrid(x, y, f0);
    surf.stampGrid(x + 8, y, f1);
  }

  // Shell Casing (4x4, 2f: normal L / hot M)
  {
    const { x, y } = packer.alloc('sprCasing', 4, 4, 2, 2, 2);
    surf.rect(x + 1, y, 2, 3, 'L');
    surf.px(x + 1, y + 3, 'D');
    surf.rect(x + 5, y, 2, 3, 'M');
    surf.px(x + 5, y, 'L');
  }

  // Hearts (8x8)
  {
    const full = packer.alloc('sprHeartFull', 8, 8, 1, 4, 4);
    surf.stampGrid(full.x, full.y, [
      '.MM..MM.',
      'MLMMMMMM',
      'MLMMMMMM',
      'MMMMMMMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
    ]);
    const empty = packer.alloc('sprHeartEmpty', 8, 8, 1, 4, 4);
    surf.stampGrid(empty.x, empty.y, [
      '.LL..LL.',
      'LDDLLDDL',
      'LDDDDDDL',
      'LDDDDDDL',
      '.LDDDDL.',
      '..LDDL..',
      '...LL...',
    ]);
    const piece = packer.alloc('sprHeartPiece', 8, 8, 1, 4, 4);
    surf.stampGrid(piece.x, piece.y, [
      '.MM.....',
      'MLMM....',
      'MLMM....',
      'MMMM....',
      '.MMM....',
      '..MM....',
      '...M....',
    ]);
  }

  // Air Bubble (16x16, 2f)
  {
    const { x, y } = packer.alloc('sprAirBubble', 16, 16, 2, 8, 8);
    for (let f = 0; f < 2; f++) {
      const cx = x + f * 16 + 8;
      const cy = y + 8;
      surf.circle(cx, cy, f === 0 ? 6 : 5.5, 'S', true);
      surf.rect(cx - 3, cy - 3, 2, 1, 'L');
      surf.px(cx - 3, cy - 2, 'L');
    }
  }

  // Drone (10x10, 2f)
  {
    const { x, y } = packer.alloc('sprDrone', 10, 10, 2, 5, 5);
    for (let f = 0; f < 2; f++) {
      const ox = x + f * 10;
      surf.rect(ox + 2, y + 2, 6, 5, 'L');
      surf.rect(ox + 3, y + 3, 4, 3, 'D');
      surf.rect(ox + 4, y + 4, 2, 1, f === 0 ? 'S' : 'M');
      surf.rect(ox + 1, y + 1, 2, 1, 'L');
      surf.rect(ox + 7, y + 1, 2, 1, 'L');
      surf.rect(ox + 4, y + 7, 2, 2, 'L');
    }
  }

  // Heart Balloon (12x16, origin 6,8)
  {
    const { x, y } = packer.alloc('sprHeartBalloon', 12, 16, 1, 6, 8);
    surf.stampGrid(x + 2, y + 1, [
      '.MM..MM.',
      'MLMMMMMM',
      'MLMMMMMM',
      'MMMMMMMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
      '...LL...',
      '....L...',
      '...L....',
      '....L...',
    ]);
  }

  // Muzzle Flash (12x10, 2f)
  {
    const { x, y } = packer.alloc('sprMuzzleFlash', 12, 10, 2, 6, 2);
    surf.stampGrid(x, y, [
      '..LLLLLLLL..',
      '.LLMLLLLML..',
      '..LLLLLLLL..',
      '...LLMMLL...',
      '....LLLL....',
      '.....LL.....',
    ]);
    surf.stampGrid(x + 12, y, [
      '...MMMMMM...',
      '..MMLLLLMM..',
      '...MLLLLM...',
      '....MLLM....',
      '.....MM.....',
    ]);
  }

  // Bullet (6x8, 2f: normal / gemHigh)
  {
    const { x, y } = packer.alloc('sprBullet', 6, 8, 2, 3, 4);
    surf.rect(x + 1, y + 1, 4, 6, 'L');
    surf.rect(x + 2, y + 2, 2, 4, 'M');
    surf.rect(x + 7, y, 4, 8, 'M');
    surf.rect(x + 8, y + 1, 2, 6, 'L');
  }

  // 20 Upgrade Icons (12x12, origin 6,6)
  const upgradeIds = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22];
  for (let i = 0; i < upgradeIds.length; i++) {
    const uid = upgradeIds[i]!;
    const { x, y } = packer.alloc(`sprUg${uid}`, 12, 12, 1, 6, 6);
    // Crisp framed badge
    surf.rect(x, y, 12, 12, 'L');
    surf.rect(x + 1, y + 1, 10, 10, 'D');
    const accent: 'M' | 'S' | 'L' = uid % 3 === 0 ? 'M' : uid % 3 === 1 ? 'S' : 'L';
    // Distinct geometric glyph per upgrade
    if (uid === 0 || uid === 3 || uid === 5) {
      // Explosion / blast starburst
      surf.rect(x + 5, y + 2, 2, 8, 'M');
      surf.rect(x + 2, y + 5, 8, 2, 'M');
      surf.rect(x + 4, y + 4, 4, 4, 'L');
    } else if (uid === 4 || uid === 10 || uid === 16 || uid === 20) {
      // Gem-themed diamond
      surf.rect(x + 5, y + 2, 2, 8, 'M');
      surf.rect(x + 3, y + 4, 6, 4, 'M');
      surf.px(x + 5, y + 4, 'L');
    } else if (uid === 6 || uid === 11 || uid === 13 || uid === 15) {
      // Heart/HP themed
      surf.rect(x + 3, y + 3, 2, 3, 'M');
      surf.rect(x + 7, y + 3, 2, 3, 'M');
      surf.rect(x + 4, y + 4, 4, 4, 'M');
      surf.rect(x + 5, y + 8, 2, 1, 'M');
    } else if (uid === 9 || uid === 12 || uid === 17) {
      // Tech / sight / time ring
      surf.circle(x + 6, y + 6, 3.5, 'S', true);
      surf.rect(x + 5, y + 5, 2, 2, 'L');
    } else {
      // Boot / jetpack / card emblem
      surf.rect(x + 3, y + 3, 6, 6, accent);
      surf.rect(x + 4, y + 4, 4, 4, 'D');
      surf.rect(x + 5, y + 5, 2, 2, 'L');
    }
  }
}

// ============================================================================
// Public Atlas Generator
// ============================================================================

export function generateProceduralWellAtlas(): {
  canvas: HTMLCanvasElement;
  manifest: AssetManifest;
} {
  const surf = new PixelSurface(ATLAS_W, ATLAS_H);
  const packer = new ShelfPacker();

  // 1. Player sprites for all 5 styles (0..4)
  for (let s = 0; s < 5; s++) {
    const styleId = s as StyleId;
    const prefix = `style${s}`;

    const idle = packer.alloc(`${prefix}_idle`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, idle.x, idle.y, styleId, 'idle');

    const run = packer.alloc(`${prefix}_run`, 24, 24, 4, 12, 12);
    drawPlayerFrame(surf, run.x + 0, run.y, styleId, 'run0');
    drawPlayerFrame(surf, run.x + 24, run.y, styleId, 'run1');
    drawPlayerFrame(surf, run.x + 48, run.y, styleId, 'run2');
    drawPlayerFrame(surf, run.x + 72, run.y, styleId, 'run3');

    const jump = packer.alloc(`${prefix}_jump`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, jump.x, jump.y, styleId, 'jump');

    const spin = packer.alloc(`${prefix}_spin_jump`, 24, 24, 4, 12, 12);
    drawPlayerFrame(surf, spin.x + 0, spin.y, styleId, 'spin0');
    drawPlayerFrame(surf, spin.x + 24, spin.y, styleId, 'spin1');
    drawPlayerFrame(surf, spin.x + 48, spin.y, styleId, 'spin2');
    drawPlayerFrame(surf, spin.x + 72, spin.y, styleId, 'spin3');

    const fall = packer.alloc(`${prefix}_fall`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, fall.x, fall.y, styleId, 'fall');

    const shoot = packer.alloc(`${prefix}_shoot`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, shoot.x, shoot.y, styleId, 'shoot');

    const hurt = packer.alloc(`${prefix}_hurt`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, hurt.x, hurt.y, styleId, 'hurt');

    const jet = packer.alloc(`${prefix}_jetpack`, 24, 24, 2, 12, 12);
    drawPlayerFrame(surf, jet.x, jet.y, styleId, 'jet0');
    drawPlayerFrame(surf, jet.x + 24, jet.y, styleId, 'jet1');

    const swim = packer.alloc(`${prefix}_swim`, 24, 24, 2, 12, 12);
    drawPlayerFrame(surf, swim.x, swim.y, styleId, 'swim0');
    drawPlayerFrame(surf, swim.x + 24, swim.y, styleId, 'swim1');

    const dead = packer.alloc(`${prefix}_dead`, 24, 24, 1, 12, 12);
    drawPlayerFrame(surf, dead.x, dead.y, styleId, 'dead');
  }
  packer.alias('sprPlayerIdle', 'style0_idle');

  // 2. Autotiled biome wall strips (areas 0..5, 16 N/E/S/W bitmasks each)
  for (let area = 0; area <= 5; area++) {
    const pos = packer.alloc(`sprTile_area${area}`, 16, 16, 16, 0, 0);
    for (let mask = 0; mask < 16; mask++) {
      drawBiomeWallTile(surf, pos.x + mask * 16, pos.y, area, mask);
    }
  }
  packer.alias('sprTile1', 'sprTile_area1');

  // 3. Special tiles
  drawSpecialTiles(surf, packer);

  // 4. All 40 enemies (2 frames each)
  for (const [id, frames] of Object.entries(ENEMY_SPRITES)) {
    const pos = packer.alloc(id, 16, 16, 2, 8, 8);
    const padY0 = Math.max(0, Math.floor((16 - frames[0].length) / 2));
    const padY1 = Math.max(0, Math.floor((16 - frames[1].length) / 2));
    surf.stampGrid(pos.x, pos.y + padY0, frames[0]);
    surf.stampGrid(pos.x + 16, pos.y + padY1, frames[1]);
  }

  // 5. Weapons, Shop Items, Collectibles, FX, Upgrade Icons
  drawWeaponsShopAndItems(surf, packer);

  // 6. Final Boss (sprBossEye 32x80 x2, sprTentacle 176x88 x2)
  {
    const eye = packer.alloc('sprBossEye', 32, 80, 2, 16, 40);
    drawBossEyeFrame(surf, eye.x, eye.y, false);
    drawBossEyeFrame(surf, eye.x + 32, eye.y, true);

    const tent = packer.alloc('sprTentacle', 176, 88, 2, 88, 44);
    drawBossTentacleFrame(surf, tent.x, tent.y, 0);
    drawBossTentacleFrame(surf, tent.x + 176, tent.y, 1);
  }

  // Blit PixelSurface onto an HTMLCanvasElement
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    const imgData = ctx.createImageData(ATLAS_W, ATLAS_H);
    imgData.data.set(surf.data);
    ctx.putImageData(imgData, 0, 0);
  }

  const manifest: AssetManifest = {
    packName: 'krunked-well-builtin',
    version: 1,
    sourceType: 'builtin',
    sprites: packer.sprites,
    audio: {},
    paletteCount: PALETTES.length,
  };

  return { canvas, manifest };
}
