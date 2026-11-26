import type { AreaId } from '../contracts/index.ts';

/**
 * 9-column ASCII chunk definitions for Krunked Well procedural shafts.
 *
 * Legend:
 *   '.' = EMPTY
 *   '#' = SOLID
 *   'B' = BREAKABLE
 *   '-' = THIN_PLATFORM (2px one-way)
 *   '^' = SPIKE_UP
 *   'v' = SPIKE_DOWN
 *   '<' = SPIKE_LEFT
 *   '>' = SPIKE_RIGHT
 *   'O' = BUBBLE_BLOCK (Aquifer breakable oxygen block)
 *   'G' = GHOST_WALL (Limbo phasing wall)
 *   'T' = SPIKE_TRAP (retracting hazard tile)
 *   'E' = Enemy spawn (placed on EMPTY tile)
 *   'A' = Air pocket (placed on EMPTY tile, Aquifer oxygen refill)
 */

export const SURFACE_CHUNKS: readonly string[][] = [
  [
    '.........',
    '.........',
    '.........',
    '###...###',
  ],
];

export const CAVERN_CHUNKS: readonly string[][] = [
  // 1. Staggered ledges with breakable spine
  [
    '..E......',
    '##..B..##',
    '....B....',
    '..---....',
    '.....E...',
    '....###..',
  ],
  // 2. Thin bridge with breakable side pockets
  [
    '....E....',
    '.##---##.',
    'B.......B',
    'B..E.E..B',
    '##.....##',
    '...---...',
  ],
  // 3. Breakable shaft plug flanked by spikes
  [
    '.........',
    '^##BBB##^',
    '###BBB###',
    '....E....',
    '.---.---.',
    '.........',
  ],
  // 4. Zigzag cavern ledges with wall spikes
  [
    '>....E...',
    '####.....',
    '......---',
    '....E...<',
    '.....####',
    '---......',
  ],
  // 5. Twin stone pillars with hanging spikes and breakable flanks
  [
    '..E...E..',
    '.B#...#B.',
    '.B#---#B.',
    '..#...#..',
    '..v.E.v..',
    '.........',
  ],
  // 6. Central breakable monolith with floor spikes
  [
    '....E....',
    '...BBB...',
    '..E.B.E..',
    '###...###',
    '^.......^',
    '...---...',
  ],
  // 7. Slalom thin platforms with breakable center key
  [
    '---......',
    '..E......',
    '...---...',
    '......E..',
    '......---',
    '.##.B.##.',
  ],
  // 8. Twin side pocket vaults sealed by red blocks
  [
    '.........',
    '###...###',
    'B.E...E.B',
    'B..---..B',
    '###.B.###',
    '....E....',
  ],
  // 9. Spiked central island with lower breakable deck
  [
    '....^....',
    '...###...',
    '.E..v..E.',
    '--.....--',
    '...BBB...',
    '....E....',
  ],
  // 10. Checkerboard breakable ruins
  [
    '..E...E..',
    '.B..B..B.',
    '..#...#..',
    '---...---',
    '.B..E..B.',
    '....#....',
  ],
  // 11. Left cavern alcove with stalactite spike
  [
    '....v....',
    '....#....',
    'E..###...',
    '##....---',
    '....E....',
    '..B..###.',
  ],
  // 12. Right cavern alcove with stalactite spike
  [
    '....v....',
    '....#....',
    '...###..E',
    '---....##',
    '....E....',
    '.###..B..',
  ],
  // 13. Funnel drop into deep breakable cluster
  [
    '##.....##',
    '.#..E..#.',
    '..--.--..',
    '...BBB...',
    '.E.BBB.E.',
    '.........',
  ],
  // 14. Wide twin bridges over spiked centerpiece
  [
    '.........',
    '.--...--.',
    '..E...E..',
    '##..^..##',
    '...###...',
    '.B..E..B.',
  ],
  // 15. Stepped descent terrace
  [
    'E........',
    '###......',
    '....E....',
    '...###...',
    '........E',
    '......###',
  ],
  // 16. Breakable ceiling combat arena
  [
    'BBBB.BBBB',
    '....E....',
    '.--...--.',
    '>.......<',
    '..E...E..',
    '...---...',
  ],
];

export const CATACOMB_CHUNKS: readonly string[][] = [
  // 1. Crypt bridge over spike traps
  [
    '..E...E..',
    '##.---.##',
    '...T.T...',
    '###...###',
    '....E....',
    '..B...B..',
  ],
  // 2. Bone shaft with opposing wall spikes
  [
    '>...E...<',
    '.##...##.',
    '...BBB...',
    '....E....',
    '.---.---.',
    '..T...T..',
  ],
  // 3. Three-column tomb colonnade
  [
    '....E....',
    '.#..#..#.',
    '.#--#--#.',
    '.v..E..v.',
    'B.......B',
    '...---...',
  ],
  // 4. Ossuary breakable floor
  [
    '..E...E..',
    '##BBBBB##',
    '##..E..##',
    '...---...',
    '^.......^',
    '....T....',
  ],
  // 5. Zigzag crypt terraces
  [
    '###......',
    '....E..--',
    '..T......',
    '......###',
    '--..E....',
    '......T..',
  ],
  // 6. Central breakable sarcophagus
  [
    '....^....',
    '...#B#...',
    '.E.#B#.E.',
    '--..v..--',
    '....E....',
    '.B..T..B.',
  ],
  // 7. Haunted choke with trapped bridge
  [
    'E.......E',
    '##.....##',
    '..--T--..',
    '....E....',
    '.B.###.B.',
    '.........',
  ],
  // 8. Retracting trap gauntlet
  [
    '....E....',
    '.T..#..T.',
    '..--.--..',
    'E.......E',
    '###.B.###',
    '.........',
  ],
];

export const AQUIFER_CHUNKS: readonly string[][] = [
  // 1. Bubble reef with central air pocket
  [
    '....A....',
    '##.OOO.##',
    '..E...E..',
    '...---...',
    'O.......O',
    '....E....',
  ],
  // 2. Coral pillars sheltering air pocket
  [
    '.#..E..#.',
    '.#..A..#.',
    '.#--O--#.',
    '....E....',
    '##.....##',
    '...OOO...',
  ],
  // 3. Kelp slalom with dual air pockets
  [
    '---...A..',
    '....E....',
    '###..OOO.',
    '......E..',
    '.A...---.',
    '.OOO..###',
  ],
  // 4. Bubble-sealed cavern chamber
  [
    '....E....',
    '##OOOOO##',
    '##..A..##',
    '..E...E..',
    '...---...',
    '^.......^',
  ],
  // 5. Twin side air vaults
  [
    'A.......A',
    'O#..E..#O',
    '.#..O..#.',
    '...---...',
    '..E...E..',
    '.##...##.',
  ],
  // 6. Spiked coral arch with side air pockets
  [
    '....^....',
    '...###...',
    'A..E.E..A',
    '--..O..--',
    '...OOO...',
    '....E....',
  ],
  // 7. Bubble cascade chute
  [
    '..O.E.O..',
    '...OOO...',
    '....A....',
    '##.....##',
    '..E...E..',
    '.---.---.',
  ],
  // 8. Open swim basin
  [
    'E...A...E',
    '.--...--.',
    '...O.O...',
    '....E....',
    '##..O..##',
    '.........',
  ],
];

export const LIMBO_CHUNKS: readonly string[][] = [
  // 1. Phasing ghost wall gate
  [
    '....E....',
    '##GGGGG##',
    '..E...E..',
    '...---...',
    'G.......G',
    '....E....',
  ],
  // 2. Floating void islands
  [
    '..E......',
    '.###.....',
    '......E..',
    '.....###.',
    '...---...',
    '.G..E..G.',
  ],
  // 3. Phasing corridor
  [
    '.G..E..G.',
    '.G.---.G.',
    '..B...B..',
    '....E....',
    '###GGG###',
    '.........',
  ],
  // 4. Open void arena with central trap
  [
    'E.......E',
    '.--...--.',
    '....T....',
    '...GGG...',
    '..E...E..',
    '.#.....#.',
  ],
  // 5. Suspended breakable core with ghost heart
  [
    '...BBB...',
    '.E.BGB.E.',
    '...BBB...',
    '----.----',
    '....E....',
    '..G...G..',
  ],
  // 6. Ghost-lined chute
  [
    '##..E..##',
    '.G.....G.',
    '..--.--..',
    '....E....',
    '.G..T..G.',
    '##.....##',
  ],
  // 7. Floating turret perches
  [
    '....E....',
    '.#.....#.',
    '..--E--..',
    '....G....',
    'E..###..E',
    '.........',
  ],
  // 8. Shattered phasing bridge
  [
    'GG..E..GG',
    '...---...',
    '.E..B..E.',
    '##.....##',
    '...GGG...',
    '....E....',
  ],
];

export const ABYSS_CHUNKS: readonly string[][] = [
  // 1. Symmetric boss perches
  [
    '.........',
    '.--...--.',
    '.........',
    '.........',
    '...---...',
    '.........',
  ],
  // 2. Center perch over split ledges
  [
    '.........',
    '...---...',
    '.........',
    '.--...--.',
    '.........',
    '.........',
  ],
  // 3. Wall footholds and center split
  [
    '.........',
    '--.....--',
    '.........',
    '.........',
    '..--.--..',
    '.........',
  ],
  // 4. Staggered boss ledges
  [
    '.........',
    '.---.....',
    '.........',
    '.....---.',
    '.........',
    '.........',
  ],
];

export function getChunksForArea(area: AreaId): readonly string[][] {
  switch (area) {
    case 0:
      return SURFACE_CHUNKS;
    case 1:
      return CAVERN_CHUNKS;
    case 2:
      return CATACOMB_CHUNKS;
    case 3:
      return AQUIFER_CHUNKS;
    case 4:
      return LIMBO_CHUNKS;
    case 5:
      return ABYSS_CHUNKS;
  }
}
