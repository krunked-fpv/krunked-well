import type { PaletteDef } from '../contracts/index.ts';

// All 38 exact 4-channel semantic palettes (L / M / D / S) matching oracle.json.
// Palette #0 is clean-room branded as KRUNKED.
export const PALETTES: readonly PaletteDef[] = [
  { id: 0, name: 'KRUNKED', light: [250, 250, 250], mid: [250, 0, 0], dark: [5, 5, 5], special: [0, 126, 250] },
  { id: 1, name: 'MATCHA', light: [250, 250, 250], mid: [102, 181, 0], dark: [5, 5, 5], special: [0, 126, 250] },
  { id: 2, name: 'AQUA', light: [255, 255, 255], mid: [0, 126, 255], dark: [0, 0, 0], special: [255, 0, 0] },
  { id: 3, name: 'GBOY', light: [157, 174, 136], mid: [98, 114, 78], dark: [50, 59, 39], special: [109, 128, 86] },
  { id: 4, name: 'VBOY', light: [255, 17, 17], mid: [172, 0, 0], dark: [0, 0, 0], special: [255, 107, 107] },
  { id: 5, name: 'PASTEL', light: [255, 255, 255], mid: [255, 113, 96], dark: [29, 80, 195], special: [0, 126, 255] },
  { id: 6, name: 'UMEKOBCHA', light: [250, 239, 210], mid: [255, 53, 99], dark: [147, 165, 95], special: [194, 240, 110] },
  { id: 7, name: 'NUCLEAR', light: [222, 255, 218], mid: [144, 205, 62], dark: [15, 58, 0], special: [0, 0, 0] },
  { id: 8, name: 'GRANDMA', light: [255, 255, 255], mid: [83, 160, 62], dark: [99, 14, 52], special: [255, 178, 126] },
  { id: 9, name: 'GRAYSCALE', light: [255, 255, 255], mid: [110, 110, 110], dark: [0, 0, 0], special: [190, 190, 190] },
  { id: 10, name: '1BIT', light: [255, 255, 255], mid: [255, 255, 255], dark: [0, 0, 0], special: [255, 255, 255] },
  { id: 11, name: 'MARS', light: [229, 221, 174], mid: [235, 69, 86], dark: [97, 0, 29], special: [0, 126, 255] },
  { id: 12, name: 'BOKJU', light: [133, 133, 133], mid: [0, 0, 0], dark: [70, 70, 70], special: [153, 153, 153] },
  { id: 13, name: 'PURPLY', light: [70, 201, 255], mid: [138, 100, 181], dark: [52, 26, 18], special: [178, 168, 155] },
  { id: 14, name: 'VIVID', light: [255, 247, 255], mid: [202, 0, 0], dark: [0, 48, 70], special: [73, 106, 181] },
  { id: 15, name: 'OLDNCOLD', light: [255, 234, 170], mid: [105, 205, 240], dark: [4, 30, 55], special: [0, 126, 255] },
  { id: 16, name: 'MOSSY', light: [116, 246, 151], mid: [83, 134, 255], dark: [85, 47, 0], special: [0, 126, 255] },
  { id: 17, name: 'GLOW', light: [255, 0, 0], mid: [255, 255, 255], dark: [0, 0, 0], special: [255, 167, 167] },
  { id: 18, name: 'LAVENDER', light: [202, 232, 185], mid: [146, 155, 234], dark: [96, 93, 107], special: [80, 178, 242] },
  { id: 19, name: 'FOREST', light: [126, 103, 49], mid: [45, 93, 53], dark: [0, 0, 52], special: [0, 126, 255] },
  { id: 20, name: 'WINTER', light: [211, 255, 255], mid: [101, 255, 254], dark: [60, 98, 124], special: [0, 0, 0] },
  { id: 21, name: 'ANTIQUE', light: [167, 90, 53], mid: [240, 140, 85], dark: [49, 41, 22], special: [211, 126, 42] },
  { id: 22, name: 'DIRTSNOW', light: [75, 75, 75], mid: [197, 59, 59], dark: [165, 165, 165], special: [94, 127, 162] },
  { id: 23, name: 'JUNGLE', light: [255, 199, 170], mid: [156, 52, 76], dark: [0, 57, 38], special: [86, 149, 50] },
  { id: 24, name: 'SLEEPY', light: [211, 234, 219], mid: [226, 79, 128], dark: [27, 49, 77], special: [0, 126, 255] },
  { id: 25, name: 'ZENNYAN', light: [84, 183, 55], mid: [235, 11, 198], dark: [255, 255, 255], special: [0, 126, 255] },
  { id: 26, name: 'RHENIUM', light: [226, 151, 193], mid: [225, 247, 217], dark: [36, 44, 66], special: [255, 76, 67] },
  { id: 27, name: 'SEWERS', light: [255, 255, 255], mid: [1, 253, 255], dark: [4, 30, 55], special: [199, 199, 199] },
  { id: 28, name: 'MAD', light: [34, 31, 59], mid: [26, 225, 185], dark: [239, 155, 51], special: [243, 38, 235] },
  { id: 29, name: 'NIKAIDO', light: [255, 255, 255], mid: [255, 148, 0], dark: [26, 26, 12], special: [0, 126, 255] },
  { id: 30, name: 'MOLYBDENUM', light: [184, 239, 126], mid: [11, 7, 10], dark: [30, 57, 69], special: [108, 109, 106] },
  { id: 31, name: 'SEPIA', light: [212, 171, 106], mid: [112, 168, 151], dark: [85, 30, 0], special: [43, 75, 111] },
  { id: 32, name: 'WETLAND', light: [255, 200, 170], mid: [170, 125, 57], dark: [14, 84, 63], special: [43, 75, 111] },
  { id: 33, name: 'RGB', light: [86, 229, 123], mid: [223, 0, 48], dark: [22, 43, 158], special: [0, 0, 111] },
  { id: 34, name: 'NOSTALGIA', light: [243, 164, 164], mid: [100, 136, 202], dark: [52, 90, 121], special: [194, 151, 255] },
  { id: 35, name: 'CHARCOAL', light: [141, 141, 141], mid: [255, 255, 255], dark: [37, 38, 39], special: [0, 0, 0] },
  { id: 36, name: 'AERIAL', light: [118, 54, 58], mid: [255, 255, 255], dark: [221, 215, 154], special: [221, 215, 153] },
  { id: 37, name: 'HELL', light: [208, 208, 208], mid: [0, 0, 0], dark: [212, 0, 0], special: [255, 124, 1] },
] as const;

export function getPalette(index: number): PaletteDef {
  const safe = ((index % PALETTES.length) + PALETTES.length) % PALETTES.length;
  return PALETTES[safe] ?? PALETTES[0]!;
}

export function rgbToHex(rgb: readonly [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
      .join('')
  );
}
