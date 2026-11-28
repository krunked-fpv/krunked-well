import type { UpgradeId } from '../contracts/index.ts';
import { getPalette, rgbToHex } from '../data/palettes.ts';

// ============================================================================
// Krunked Well — Crisp Palette-Synced Pixel-Art SVG Icons & Block Title Logo
// Strictly shape-rendering="crispEdges" and mapped 100% to the live 4-channel
// palette (light, mid, dark, special) across all 38 unlockable palettes!
// ============================================================================

export interface PaletteHex {
  light: string;
  mid: string;
  dark: string;
  special: string;
}

export function getPaletteHex(paletteIndex: number): PaletteHex {
  const pal = getPalette(paletteIndex);
  return {
    light: rgbToHex(pal.light),
    mid: rgbToHex(pal.mid),
    dark: rgbToHex(pal.dark),
    special: rgbToHex(pal.special),
  };
}

function gridToRects(
  grid: readonly string[],
  pal: PaletteHex,
  ox = 0,
  oy = 0,
): string {
  const parts: string[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === '.' || ch === ' ') {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) {
        run++;
      }
      const fill =
        ch === 'L'
          ? pal.light
          : ch === 'M'
            ? pal.mid
            : ch === 'S'
              ? pal.special
              : pal.dark;
      parts.push(`<rect x="${ox + x}" y="${oy + y}" width="${run}" height="1" fill="${fill}"/>`);
      x += run;
    }
  }
  return parts.join('');
}

// Bold chunky 6x7 / 7x7 pixel-block letters for unmistakable arcade legibility
const LOGO_GLYPHS: Record<string, readonly string[]> = {
  K: ['11..11', '11.11.', '1111..', '111...', '1111..', '11.11.', '11..11'],
  R: ['11111.', '11..11', '11..11', '11111.', '11.11.', '11..11', '11..11'],
  U: ['11..11', '11..11', '11..11', '11..11', '11..11', '11..11', '.1111.'],
  N: ['11..11', '111.11', '111111', '11.111', '11..11', '11..11', '11..11'],
  E: ['111111', '11....', '11....', '11111.', '11....', '11....', '111111'],
  D: ['11111.', '11..11', '11..11', '11..11', '11..11', '11..11', '11111.'],
  W: ['11.....11', '11.....11', '11.....11', '11..1..11', '11.111.11', '1111.1111', '.11...11.'],
  L: ['11....', '11....', '11....', '11....', '11....', '11....', '111111'],
  ' ': ['......', '......', '......', '......', '......', '......', '......'],
};

function measureWordCols(word: string): number {
  let w = 0;
  for (let i = 0; i < word.length; i++) {
    const g = LOGO_GLYPHS[word[i]!] ?? LOGO_GLYPHS[' ']!;
    w += g[0]!.length + (i > 0 ? 2 : 0);
  }
  return w;
}

/**
 * Renders the iconic chunky pixel-art "KRUNKED WELL" arcade block logo with
 * unmistakably crisp bold pixel lettering, 3D stepped `mid` shadow, and
 * flanking pixel ruby emblems!
 */
export function renderPixelLogoSvg(pal: PaletteHex, widthPx = 280): string {
  const line1 = 'KRUNKED';
  const line2 = 'WELL';
  const w1 = measureWordCols(line1);
  const w2 = measureWordCols(line2);
  const totalCols = Math.max(w1, w2 + 16) + 4;
  const totalRows = 20;
  const heightPx = Math.round((widthPx * totalRows) / totalCols);

  const rects: string[] = [];

  const emitWord = (word: string, yOff: number, faceColor: string, shadowColor: string): void => {
    const wordW = measureWordCols(word);
    let penX = Math.floor((totalCols - wordW) / 2);
    // 1. Bold 3D stepped drop shadow (+1, +1)
    let sx = penX;
    for (let i = 0; i < word.length; i++) {
      const g = LOGO_GLYPHS[word[i]!] ?? LOGO_GLYPHS[' ']!;
      const gw = g[0]!.length;
      for (let r = 0; r < 7; r++) {
        const row = g[r]!;
        for (let c = 0; c < gw; c++) {
          if (row[c] === '1') {
            rects.push(`<rect x="${sx + c + 1}" y="${yOff + r + 1}" width="1" height="1" fill="${shadowColor}"/>`);
          }
        }
      }
      sx += gw + 2;
    }
    // 2. Crisp bright face
    for (let i = 0; i < word.length; i++) {
      const g = LOGO_GLYPHS[word[i]!] ?? LOGO_GLYPHS[' ']!;
      const gw = g[0]!.length;
      for (let r = 0; r < 7; r++) {
        const row = g[r]!;
        for (let c = 0; c < gw; c++) {
          if (row[c] === '1') {
            rects.push(`<rect x="${penX + c}" y="${yOff + r}" width="1" height="1" fill="${faceColor}"/>`);
          }
        }
      }
      penX += gw + 2;
    }
  };

  emitWord(line1, 1, pal.light, pal.mid);
  emitWord(line2, 11, pal.light, pal.mid);

  // Flanking pixel gem accents beside "WELL"
  const gemIcon: readonly string[] = [
    '..M..',
    '.MLM.',
    'MMMMM',
    '.MMM.',
    '..M..',
  ];
  const wellStart = Math.floor((totalCols - w2) / 2);
  rects.push(gridToRects(gemIcon, pal, Math.max(1, wellStart - 8), 12));
  rects.push(gridToRects(gemIcon, pal, Math.min(totalCols - 6, wellStart + w2 + 3), 12));

  return `<svg width="${widthPx}" height="${heightPx}" viewBox="0 0 ${totalCols} ${totalRows}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;image-rendering:pixelated;">${rects.join('')}</svg>`;
}

export function renderPixelHeartSvg(filled: boolean, pal: PaletteHex, size = 16): string {
  const grid: readonly string[] = filled
    ? [
        '.MM..MM.',
        'MLMMMMMM',
        'MLMMMMMM',
        'MMMMMMMM',
        '.MMMMMM.',
        '..MMMM..',
        '...MM...',
      ]
    : [
        '.LL..LL.',
        'L..LL..L',
        'L......L',
        'L......L',
        '.L....L.',
        '..L..L..',
        '...LL...',
      ];
  return `<svg width="${size}" height="${Math.round((size * 7) / 8)}" viewBox="0 0 8 7" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;image-rendering:pixelated;">${gridToRects(grid, pal)}</svg>`;
}

export function renderPixelGemSvg(pal: PaletteHex, size = 14): string {
  const grid: readonly string[] = [
    '...MM...',
    '..MLLM..',
    '.MLMMMM.',
    'MLMMMMMM',
    'MMMMMMMM',
    '.MMMMMM.',
    '..MMMM..',
    '...MM...',
  ];
  return `<svg width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;image-rendering:pixelated;">${gridToRects(grid, pal)}</svg>`;
}

const UPGRADE_PIXEL_GRIDS: Record<number, readonly string[]> = {
  0: [
    '.....MM.....',
    '.M...MM...M.',
    '..MM.LL.MM..',
    '...MLLLLM...',
    'MMMLLLLLLMMM',
    'MMMLLLLLLMMM',
    '...MLLLLM...',
    '..MM.LL.MM..',
    '.M...MM...M.',
    '.....MM.....',
  ],
  1: [
    '...SSSSSS...',
    '..SS....SS..',
    '.SS..SS..SS.',
    '.S..S..S..S.',
    '....S..S.LLL',
    'LLL.S..S....',
    '.S..S..S..S.',
    '.SS..SS..SS.',
    '..SS....SS..',
    '...SSSSSS...',
  ],
  3: [
    '.M..LLLL..M.',
    '...LLLLLL...',
    '..LLDLLDLL..',
    '..LLLLLLLL..',
    '...LLDDLL...',
    '...L.LL.L...',
    '.M........M.',
    'M...M..M...M',
    '....M..M....',
    '............',
  ],
  4: [
    '.....MM.....',
    '....MMMM....',
    '...MMLLMM...',
    '..MML..MMM..',
    '.MMLLLLLMMM.',
    '.MMMMMLLMMM.',
    '..MMMLMMMM..',
    '...MMMMMM...',
    '....MMMM....',
    '.....MM.....',
  ],
  5: [
    '....L..L....',
    '.....MM.....',
    '.MMMMMMMMMM.',
    '.MMDDDDMMMM.',
    '.MMMMMDMMMM.',
    '.MMMMMDDDMM.',
    '.MMMDMMMMMM.',
    '.MMMDMMMMMM.',
    '.MMMMMMMMMM.',
    '............',
  ],
  6: [
    '..MM....MM..',
    '.MMMM..MMMM.',
    'MMMMMLLMMMMM',
    'MMMLLLLLLMMM',
    'MMMMMLLMMMMM',
    '.MMMMMMMMMM.',
    '..MMMMMMMM..',
    '...MMMMMM...',
    '....MMMM....',
    '.....MM.....',
  ],
  7: [
    '.....LL.....',
    '....MLLM....',
    '....MMMM....',
    '.....MM.....',
    '...LLLLLL...',
    '...LLLLLL...',
    '...LLDDLL...',
    '...LLLLLL...',
    '...LLLLLL...',
    '..LLLLLLLL..',
  ],
  8: [
    '....MMMM....',
    '...MLLLLM...',
    '...MMMMMM...',
    '...LLLLLL...',
    '...LLMMLL...',
    '...LLLLLL...',
    '...LLLLLL...',
    '...LLLLLL...',
    '..LLLLLLLL..',
    '............',
  ],
  9: [
    '...SSSSSS...',
    '..S......S..',
    '.S.LLLLLL.S.',
    '.S.LDDDDL.S.',
    '.S.LDSSDL.S.',
    '.S.LLLLLL.S.',
    '..S..LL..S..',
    '...S.LL.S...',
    '....SSSS....',
    '............',
  ],
  10: [
    '.LL......LL.',
    '.LL......LL.',
    '.MM..MM..MM.',
    '.MM.MLLM.MM.',
    '.MM..MM..MM.',
    '.MM......MM.',
    '.MMM....MMM.',
    '..MMMMMMMM..',
    '...MMMMMM...',
    '............',
  ],
  11: [
    '.L.L.L...MM.',
    '.L.L.L..MMM.',
    '.LLLLL..MMM.',
    '..LLL...MMM.',
    '...L....MM..',
    '...L....MM..',
    '...L....MM..',
    '...L....MM..',
    '...L....MM..',
    '............',
  ],
  12: [
    '.....SS.....',
    '...SS..SS...',
    '..S..SS..S..',
    '.S........S.',
    'SS..SMMS..SS',
    'SS..SMMS..SS',
    '.S........S.',
    '..S..SS..S..',
    '...SS..SS...',
    '.....SS.....',
  ],
  13: [
    '......LL....',
    '.....L......',
    '..MMM..MMM..',
    '.MLLMMMMMMM.',
    '.MLMMMMMMMM.',
    '.MMMMMMMMMM.',
    '.MMMMMMMMMM.',
    '..MMMMMMMM..',
    '...MM..MM...',
    '............',
  ],
  14: [
    '............',
    '.LLLLLLLLLL.',
    '.LDDDDDDDDL.',
    '.LMMMMMMMMM.',
    '.LDDDDDDDDL.',
    '.LDMMDLLDDL.',
    '.LDMMDLLDDL.',
    '.LDDDDDDDDL.',
    '.LLLLLLLLLL.',
    '............',
  ],
  15: [
    '..MM....MM..',
    '.MLMM..MMMM.',
    '.MMMMMMMMMM.',
    '..MMMMMMMM..',
    '...MMMMMM...',
    '....MMMM....',
    '.....MM.....',
    '.....L......',
    '......L.....',
    '.....L......',
  ],
  16: [
    '.....LL.....',
    '....LLLL....',
    '.....LL.....',
    '....MMMM....',
    '...MLLMMM...',
    '..MMMMMMMM..',
    '...MMMMMM...',
    '....MMMM....',
    '.....MM.....',
    '............',
  ],
  17: [
    '...SSSSSS...',
    '..S......S..',
    '.S...LL...S.',
    '.S...LL...S.',
    '.S...LLLL.S.',
    '.S........S.',
    '.S........S.',
    '..S......S..',
    '...SSSSSS...',
    '............',
  ],
  18: [
    '....LLLL....',
    '...LLLLLL...',
    '...LLDDLL...',
    '...LLLLLL...',
    '..LLLLLLLL..',
    '..MMMMMMMM..',
    '...MLLLLM...',
    '....MMMM....',
    '.....MM.....',
    '............',
  ],
  20: [
    '.L...MM...L.',
    '..L.MMMM.L..',
    '...MMLLMM...',
    '..MMLLLLMM..',
    '.MMMLLLLMMM.',
    '..MMLLLLMM..',
    '...MMMMMM...',
    '..L.MMMM.L..',
    '.L...MM...L.',
    '............',
  ],
  22: [
    '..SSS..SSS..',
    '.SLLSS.SLLS.',
    '.SSSS..SSSS.',
    '.SSSS..SSSS.',
    '.SSSS..SSSS.',
    '..MM....MM..',
    '..ML....ML..',
    '..MM....MM..',
    '...M....M...',
    '............',
  ],
};

/**
 * Renders any of the 20 Upgrade Icons as a razor-sharp 16x16 framed pixel-art
 * badge dynamically color-mapped to the live 4-channel palette!
 */
export function renderPixelUpgradeIconSvg(
  id: UpgradeId,
  pal: PaletteHex,
  size = 40,
): string {
  const grid = UPGRADE_PIXEL_GRIDS[id] ?? UPGRADE_PIXEL_GRIDS[0]!;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;image-rendering:pixelated;">
    <rect x="0" y="0" width="16" height="16" fill="${pal.light}"/>
    <rect x="1" y="1" width="14" height="14" fill="${pal.dark}"/>
    ${gridToRects(grid, pal, 2, 3)}
  </svg>`;
}
