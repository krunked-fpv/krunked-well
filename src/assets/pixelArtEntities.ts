import type { StyleId } from '../contracts/index.ts';
import type { PixelSurface, SemanticChannel, ShelfPacker } from './pixelSurface.ts';

// ============================================================================
// Krunked Well — Masterclass 24x24 Hero Sprites (5 Styles x 18 Poses) &
// All 40 Hand-Pixeled 16x16 Enemies (Strict L = Stompable / M = Hazard)
// Every sprite gets crisp rounded pixel curvature, internal dark anatomy lines,
// expressive eyes, and automatic 1px 'D' silhouette outline!
// ============================================================================

export type PlayerPose =
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
  | 'dead';

export function drawPlayerFrame(
  surf: PixelSurface,
  ox: number,
  oy: number,
  styleId: StyleId,
  pose: PlayerPose,
): void {
  const accent: SemanticChannel = styleId === 3 ? 'S' : 'M';

  // ---- SPIN JUMP: Snappy tucked somersault ball + crisp motion arc streaks ----
  if (pose === 'spin0' || pose === 'spin1' || pose === 'spin2' || pose === 'spin3') {
    const step = Number(pose.charAt(4));
    const grids: readonly (readonly string[])[] = [
      [
        '....LL......',
        '..L....LLL..',
        '.L...LLLLLL.',
        '....LLLLLDLL',
        '...LLLLLLDLL',
        '...MLLLLLLLL',
        '...MMLLLLLL.',
        '....MMLLLL..',
        '.....LLLL...',
        '..LL........',
      ],
      [
        '.......LL...',
        '..LLLL......',
        '.LLLLLL...L.',
        'LLLLLLLL...L',
        'LLLLLLLL....',
        'LLDDLLLL....',
        '.LLLLLLMM...',
        '..LLLLMMM...',
        '...LLLL.....',
        '........LL..',
      ],
      [
        '........LL..',
        '..LLLL......',
        '.LLMMLLLL...',
        'LLMMLLLLLL..',
        'LLLLLLLLLL..',
        'LLDLLLLLLL.L',
        'LLDLLLLLL..L',
        '.LLLLLL.....',
        '..LLL....L..',
        '......LL....',
      ],
      [
        '..LL........',
        '.....LLLL...',
        '...MMLLLL...',
        '..MMMLLLLL..',
        '....LLLLLL..',
        'L...LLLLDDLL',
        'L...LLLLLLLL',
        '.L..LLLLLLL.',
        '.....LLLL...',
        '...LL.......',
      ],
    ];
    const g = grids[step] ?? grids[0]!;
    for (let r = 0; r < g.length; r++) {
      const line = g[r]!;
      for (let c = 0; c < line.length; c++) {
        const ch = line.charAt(c);
        if (ch === 'M') surf.px(ox + 6 + c, oy + 7 + r, accent);
        else if (ch === 'L' || ch === 'D') surf.px(ox + 6 + c, oy + 7 + r, ch);
      }
    }
    surf.addOutline(ox, oy, 24, 24, 'D');
    return;
  }

  // ---- DEAD: Knocked-out hero ----
  if (pose === 'dead') {
    surf.stampGrid(ox + 4, oy + 12, [
      '....LLLLLL....',
      '..LLLLLLLLLL..',
      '.LLMLMLLMLMLL.',
      '.LLLLLLLLLLLL.',
      'MMLLLLLLLLLLMM',
      'MM..LLLLLL..MM',
    ]);
    surf.addOutline(ox, oy, 24, 24, 'D');
    return;
  }

  const isSpin = styleId === 1;
  const isHeavy = styleId === 2;
  const isFloat = styleId === 3;
  const isAscetic = styleId === 4;
  const body: SemanticChannel = pose === 'hurt' ? 'M' : 'L';

  const headBob =
    pose === 'run1' || pose === 'run3' ? -1 : pose === 'shoot' ? -1 : pose === 'jump' ? -1 : 0;
  const hx = ox + 8;
  const hy = oy + 4 + headBob;

  // ---- Style-Specific Iconic Headgear / Silhoutte Accents ----
  if (isSpin) {
    // Fluttering red ninja/acrobat scarf tail streaming behind!
    const tailY = hy + 6 + (pose === 'run1' || pose === 'fall' ? -1 : 0);
    surf.stampGrid(ox + 2, tailY, [
      '..MMMM',
      'MMMM..',
      'MM....',
    ]);
    surf.rect(hx + 1, hy - 1, 6, 1, 'M');
  } else if (isFloat) {
    // Glowing Special Cyan Levitation Halo floating above head!
    surf.stampGrid(ox + 7, hy - 3, [
      '..SSSSSS..',
      '.S......S.',
    ]);
  } else if (isAscetic) {
    // Pointed Monk Hood + fluttering headband tails
    surf.stampGrid(ox + 8, hy - 3, [
      '...LL...',
      '..LLLL..',
      '.LLLLLL.',
    ]);
    surf.rect(ox + 5, hy + 2, 3, 1, 'L');
    surf.px(ox + 4, hy + 3, 'L');
  } else if (isHeavy) {
    // Curved Armored Helmet Horns!
    surf.px(hx - 1, hy - 2, 'L');
    surf.rect(hx - 1, hy - 1, 2, 2, 'L');
    surf.px(hx + 8, hy - 2, 'L');
    surf.rect(hx + 7, hy - 1, 2, 2, 'L');
  } else {
    // Standard: Iconic sleek curved explorer helmet crest nub
    surf.rect(hx + 3, hy - 1, 2, 1, 'L');
  }

  // ---- Sculpted Rounded Hero Head (Organic pixel capsule — NO flat boxes!) ----
  if (isHeavy) {
    surf.rect(hx - 1, hy + 1, 10, 6, body);
    surf.rect(hx, hy, 8, 1, body);
    surf.rect(hx, hy + 7, 8, 1, body);
    // Heavy Knight Dark T-Visor with fierce eyes
    surf.rect(hx + 2, hy + 3, 6, 2, 'D');
    surf.px(hx + 3, hy + 3, 'M');
    surf.px(hx + 6, hy + 3, 'M');
  } else {
    surf.rect(hx + 1, hy, 6, 1, body);
    surf.rect(hx, hy + 1, 8, 5, body);
    surf.rect(hx + 1, hy + 6, 6, 1, body);
    // Expressive big retro arcade eyes!
    if (pose === 'hurt') {
      surf.px(hx + 2, hy + 3, 'D');
      surf.px(hx + 6, hy + 3, 'D');
      surf.rect(hx + 3, hy + 4, 3, 1, 'D');
    } else if (pose === 'shoot') {
      // Determined squinting recoil eyes!
      surf.rect(hx + 2, hy + 3, 2, 1, 'D');
      surf.rect(hx + 5, hy + 3, 2, 1, 'D');
    } else {
      surf.rect(hx + 3, hy + 2, 1, 3, 'D');
      surf.rect(hx + 6, hy + 2, 1, 3, 'D');
    }
  }

  // ---- Torso + Belt + Expressive Swinging Arms ----
  const ty = hy + 7;
  const torsoW = isHeavy ? 8 : 6;
  const tx = ox + 12 - Math.floor(torsoW / 2);
  surf.rect(tx, ty, torsoW, 4, body);
  // Crisp crimson/cyan waist belt
  surf.rect(tx, ty + 3, torsoW, 1, accent);

  // Arms by pose
  if (pose === 'jump' || pose === 'fall' || pose === 'swim0' || pose === 'swim1') {
    const ay = pose === 'fall' || pose === 'swim1' ? ty - 2 : ty - 1;
    surf.rect(tx - 2, ay, 2, 3, body);
    surf.rect(tx + torsoW, ay, 2, 3, body);
  } else if (pose === 'shoot') {
    surf.rect(tx - 2, ty, 2, 2, body);
    surf.rect(tx + torsoW, ty, 2, 2, body);
  } else if (pose === 'run0') {
    surf.rect(tx - 2, ty + 1, 2, 2, body);
    surf.rect(tx + torsoW, ty, 2, 2, body);
  } else if (pose === 'run2') {
    surf.rect(tx - 2, ty, 2, 2, body);
    surf.rect(tx + torsoW, ty + 1, 2, 2, body);
  } else {
    surf.rect(tx - 1, ty + 1, 1, 3, body);
    surf.rect(tx + torsoW, ty + 1, 1, 3, body);
  }

  // ---- Iconic Heavy Downward Gunboots! ----
  const by = ty + 4;
  let lx = ox + 8;
  let rx = ox + 13;
  let ly = by;
  let ry = by;

  if (pose === 'run0') {
    lx = ox + 6;
    rx = ox + 14;
    ly = by - 1;
  } else if (pose === 'run1') {
    lx = ox + 9;
    rx = ox + 12;
  } else if (pose === 'run2') {
    lx = ox + 14;
    rx = ox + 6;
    ry = by - 1;
  } else if (pose === 'run3') {
    lx = ox + 12;
    rx = ox + 9;
  } else if (pose === 'jump') {
    lx = ox + 7;
    rx = ox + 13;
    ly = by - 1;
    ry = by + 1;
  } else if (pose === 'fall') {
    lx = ox + 8;
    rx = ox + 13;
    ly = by + 1;
    ry = by + 1;
  } else if (pose === 'swim0') {
    lx = ox + 7;
    rx = ox + 14;
    ly = by + 1;
  } else if (pose === 'swim1') {
    lx = ox + 9;
    rx = ox + 12;
    ry = by + 1;
  }

  const bw = isHeavy ? 4 : 3;
  // Left gunboot (white shin + red/cyan barrel cuff + dark muzzle bore)
  surf.rect(lx, ly, bw, 3, body);
  surf.rect(lx, ly + 2, bw, 2, accent);
  surf.px(lx + 1, ly + 3, 'D');
  // Right gunboot
  surf.rect(rx, ry, bw, 3, body);
  surf.rect(rx, ry + 2, bw, 2, accent);
  surf.px(rx + 1, ry + 3, 'D');

  // Jetpack exhaust & tank
  if (pose === 'jet0' || pose === 'jet1') {
    surf.rect(tx - 3, ty - 1, 2, 5, 'S');
    surf.px(tx - 3, ty, 'L');
    const fh = pose === 'jet0' ? 4 : 2;
    surf.rect(lx, ly + 4, 2, fh, 'M');
    surf.rect(rx, ry + 4, 2, fh, 'M');
    surf.px(lx + 1, ly + 4, 'L');
    surf.px(rx + 1, ry + 4, 'L');
  } else if (pose === 'shoot') {
    // Built-in boot recoil spark
    surf.rect(lx, ly + 4, 3, 2, 'M');
    surf.px(lx + 1, ly + 4, 'L');
    surf.rect(rx, ry + 4, 3, 2, 'M');
    surf.px(rx + 1, ry + 4, 'L');
  }

  // Crisp 1px black pixel outline around the whole hero silhouette!
  surf.addOutline(ox, oy, 24, 24, 'D');
}

// ============================================================================
// ALL 40 HAND-PIXELED 16x16 ENEMIES (2 Expressive Animated Frames Each)
// STRICT Semantic Color Rule:
//   * Stompable enemies -> Dominant WHITE ('L') with dark ('D') anatomy lines
//   * Un-stompable foes -> Dominant RED ('M') with white ('L') teeth/eyes/glints
// ============================================================================

const ENEMY_SPRITES: Record<string, readonly [readonly string[], readonly string[]]> = {
  // ---- AREA 1: CAVERN (8) ----
  sprBat: [
    [
      '................',
      '.LL..........LL.',
      'LLLL..L..L..LLLL',
      'LLDLLLLLLLLLDLLL',
      '.LLDLLDLLDLLDLL.',
      '..LL.LLLLLL.LL..',
      '.....LLDDLL.....',
      '......L..L......',
      '................',
      '................',
    ],
    [
      '................',
      '.....L....L.....',
      '....LLLLLLLL....',
      '....LLDLLDLL....',
      '...LLLLLLLLLL...',
      '..LLLLD..DLLLL..',
      '.LLLD......DLLL.',
      'LLL..........LLL',
      'L..............L',
      '................',
    ],
  ],
  sprSnake: [
    [
      '................',
      '.........LLLL...',
      '........LLDLLL..',
      '........LLLLLLM.',
      '.........LLLL.M.',
      '..LLLL..LLL.....',
      '.LLDDLLLLL......',
      'LLLLLLLLL.......',
      '.LLLLLLL........',
      '................',
    ],
    [
      '................',
      '........LLLL....',
      '.......LLDLLL...',
      '.......LLLLLLM..',
      '........LLLL....',
      '...LLLL.LLL.....',
      '..LLDDLLLL......',
      '.LLLLLLLLL......',
      '..LLLLLLL.......',
      '................',
    ],
  ],
  sprFrog: [
    [
      '....LL....LL....',
      '...LDLL..LLDL...',
      '...LLLLLLLLLL...',
      '..LLLLLLLLLLLL..',
      '.LLLLDDDDDDLLLL.',
      '.LLL.LLLLLL.LLL.',
      '.LL.LLLLLLLL.LL.',
      'LL..LL....LL..LL',
      'LLL.LL....LL.LLL',
      '................',
    ],
    [
      '....LL....LL....',
      '...LDLL..LLDL...',
      '...LLLLLLLLLL...',
      '..LLLLDDDDLLLL..',
      '...LLLLLLLLLL...',
      '..LL.LLLLLL.LL..',
      '.LL...LLLL...LL.',
      '.L....L..L....L.',
      'L..............L',
      '................',
    ],
  ],
  sprSnail: [
    [
      '......MMMM......',
      '....MMMMMMMM....',
      '...MMLMMMMMMM...',
      '..MMLDDDDMMMMM..',
      '..MMMDMMMDMMMM..',
      '..MMMMDDDDMMMM..',
      '..MMMMMMMMMMMM..',
      '.L.MMMMMMMMMML..',
      'LLDLLLLLLLLLLLL.',
      '.LLLLLLLLLLLLLL.',
    ],
    [
      '......MMMM......',
      '....MMMMMMMM....',
      '...MMLMMMMMMM...',
      '..MMLDDDDMMMMM..',
      '..MMMDMMMDMMMM..',
      '..MMMMDDDDMMMM..',
      '..MMMMMMMMMMMM..',
      'L..MMMMMMMMMMML.',
      'LDLLLLLLLLLLLL..',
      '.LLLLLLLLLLLL...',
    ],
  ],
  sprTurtle: [
    [
      '.....M....M.....',
      '....MLM..MLM....',
      '...MMMMMMMMMM...',
      '..MMMDMMMMDMMM..',
      '.MMMMMDMMDMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      'LLDLLLLLLLLLLLL.',
      'LLL..LL..LL..LL.',
      '................',
    ],
    [
      '......M..M......',
      '.....MLMMLM.....',
      '...MMMMMMMMMM...',
      '..MMMDMMMMDMMM..',
      '.MMMMMDMMDMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '.MMDDDDDDDDDDMM.',
      '.LDLLLLLLLLLLLL.',
      '..LL..LL..LL..L.',
      '................',
    ],
  ],
  sprWhiteJelly: [
    [
      '....LLLLLLLL....',
      '..LLDDLLLLDDLL..',
      '.LLLLLLLLLLLLLL.',
      '.LLLDLLLLLLDLLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLLLLLLLLLL..',
      '..LL..LL..LL.LL.',
      '.LL..LL..LL..LL.',
      '.L...L....L...L.',
      '................',
    ],
    [
      '....LLLLLLLL....',
      '..LLLLLLLLLLLL..',
      '.LLLLLLLLLLLLLL.',
      '.LLLDLLLLLLDLLL.',
      '.LLLLLLLLLLLLLL.',
      '..LLLLLLLLLLLL..',
      '...LL.LL.LL.LL..',
      '..LL..LL..LL..L.',
      '..L...L...L...L.',
      '................',
    ],
  ],
  sprRedBall: [
    [
      '.......MM.......',
      '..M...MLMM...M..',
      '..MM.MMMMMM.MM..',
      '...MMMMMMMMMM...',
      '.MMMMMLDDLMMMMM.',
      'MMMMMMLDDLMMMMMM',
      '.MMMMMMMMMMMMMM.',
      '...MMMMMMMMMM...',
      '..MM.MMMMMM.MM..',
      '..M...MMMM...M..',
      '.......MM.......',
    ],
    [
      '......M..M......',
      '.MM..MMMMMM..MM.',
      '..MMMMMMMMMMMM..',
      '..MMMMLDDLMMMM..',
      '.MMMMMLDDLMMMMM.',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '..MMMMMMMMMMMM..',
      '.MM..MMMMMM..MM.',
      '......M..M......',
      '................',
    ],
  ],
  sprCrawler: [
    [
      '................',
      '....LLLLLLLL....',
      '..LLLDLLLLDLLL..',
      '.LLLLDLLLLDLLLL.',
      '.LLDLLLLLLLLDLL.',
      '.LLLLLLLLLLLLLL.',
      '.LL.LL.LL.LL.LL.',
      '.L..L..L..L..L..',
      '................',
      '................',
    ],
    [
      '................',
      '....LLLLLLLL....',
      '..LLLDLLLLDLLL..',
      '.LLLLDLLLLDLLLL.',
      '.LLDLLLLLLLLDLL.',
      '.LLLLLLLLLLLLLL.',
      '..LL.LL.LL.LL...',
      '..L..L..L..L....',
      '................',
      '................',
    ],
  ],

  // ---- AREA 2: CATACOMB (9) ----
  sprSkeleton: [
    [
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '....LDDLLDDL....',
      '....LLLLLLLL....',
      '.....L.DD.L.....',
      '..LLLLLLLLLLLL..',
      '.LL..LDDDDL..LL.',
      '.....LLLLLL.....',
      '.....LL..LL.....',
      '....LL....LL....',
    ],
    [
      '.....LLLLLL.....',
      '....LLLLLLLL....',
      '....LDDLLDDL....',
      '....LLLLLLLL....',
      '.....L.DD.L.....',
      '.LL.LLLLLLLL.LL.',
      '.L...LDDDDL...L.',
      '.....LLLLLL.....',
      '....LL....LL....',
      '....L......L....',
    ],
  ],
  sprObake: [
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMLDMMMMDLMM..',
      '..MMMMMMMMMMMM..',
      '..MMMDLLLLDMMM..',
      '..MMMDDDDDDMMM..',
      '..MM.MM..MM.MM..',
      '.MM..M....M..MM.',
      '................',
    ],
    [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMMMMMMMMMMM..',
      '..MMLDMMMMDLMM..',
      '..MMMMMMMMMMMM..',
      '..MMMDLLLLDMMM..',
      '...MMDDDDDDMM...',
      '...MM.MMMM.MM...',
      '..MM...MM...MM..',
      '................',
    ],
  ],
  sprGasWander: [
    [
      '.......LL.......',
      '.....LLLLLL.....',
      '...LLLLLLLLLL...',
      '..LLLDLLLLDLLL..',
      '..LLLLLLLLLLLL..',
      '...LLLLDDLLLL...',
      '....LL.LL.LL....',
      '.....L....L.....',
      '................',
      '................',
    ],
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '..LLLLLLLLLLLL..',
      '..LLLDLLLLDLLL..',
      '...LLLLDDLLLL...',
      '....LLLLLLLL....',
      '...LL..LL..LL...',
      '....L......L....',
      '................',
      '................',
    ],
  ],
  sprGasChaser: [
    [
      '.......MM.......',
      '.....MMMMMM.....',
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
      '......MMMM......',
      '....MMMMMMMM....',
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
      '..MM........MM..',
      '..MMM.MMMM.MMM..',
      '...MMMMMMMMMM...',
      '..MMLLMMMMLLMM..',
      '..MMLLMMMMLLMM..',
      '..MMMMMLLMMMMM..',
      '...MMMMMMMMMM...',
      '....M.M.MM.M....',
      '....M.M.MM.M....',
      '................',
    ],
    [
      '.MM..........MM.',
      '..MMM.MMMM.MMM..',
      '...MMMMMMMMMM...',
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
      '....L.L..L.L....',
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
      '........LL......',
      '.......LLLL.....',
      '...LLLLLLLLLL...',
      '..LLLLLLLLDLLL..',
      '.LLLLLLLLLLLLLM.',
      'LL..LLLLLLLLLL..',
      '.....LL....LL...',
      '................',
      '................',
    ],
    [
      '................',
      '.......LL.......',
      '......LLLL......',
      '...LLLLLLLLLL...',
      '..LLLLLLLLDLLL..',
      'LLLLLLLLLLLLLLM.',
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
      '..LLLDMLMDLLL...',
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
      '..LLLDMLMDLLL...',
      '...LLLLLLLLL....',
      '.LL...LLL...LL..',
      '..L..L...L..L...',
      '................',
      '................',
    ],
  ],
  sprFirebat: [
    [
      '.MM..........MM.',
      'MMMM..M..M..MMMM',
      'MMMLMMMMMMMMMLMM',
      '.MMMLMLMMLMLMMM.',
      '..MM.MMMMMM.MM..',
      '.....MMLLMM.....',
      '......M..M......',
      '................',
      '................',
      '................',
    ],
    [
      '.....M....M.....',
      '....MMMMMMMM....',
      '....MMLMMLMM....',
      '...MMMMMMMMMM...',
      '..MMMML..LMMMM..',
      '.MMML......LMMM.',
      'MMM..........MMM',
      'M..............M',
      '................',
      '................',
    ],
  ],

  // ---- AREA 3: AQUIFER (9) ----
  sprEyefish: [
    [
      '......LLLLL.....',
      '..L..LLLLLLL....',
      '.LL.LLLLLDDLL...',
      'LLLLLLLLDLDDLL..',
      'LLLLLLLLDLLLLL..',
      '.LL.LLLLLLLLL...',
      '..L..LLLLLLL....',
      '......LLLLL.....',
      '................',
      '................',
    ],
    [
      '......LLLLL.....',
      '.L...LLLLLLL....',
      '.LLL.LLLLDDLL...',
      '..LLLLLLDLDDLL..',
      '..LLLLLLDLLLLL..',
      '.LLL.LLLLLLLL...',
      '.L...LLLLLLL....',
      '......LLLLL.....',
      '................',
      '................',
    ],
  ],
  sprRedFish: [
    [
      '.....ML..ML.....',
      '....MMMMMMMM....',
      '.M..MMMMMMMMM...',
      'MM.MMMMMMMLMMM..',
      'MMMMMMMMMMMLMMM.',
      'MM.MMMMMMDDDDM..',
      '.M..MMMMMMMMM...',
      '....MMMMMMMM....',
      '.....M....M.....',
      '................',
    ],
    [
      '....ML....ML....',
      '....MMMMMMMM....',
      '..M.MMMMMMMMM...',
      '.MMMMMMMMMLMMM..',
      '..MMMMMMMMMLMMM.',
      '.MMMMMMMMDDDDM..',
      '..M.MMMMMMMMM...',
      '....MMMMMMMM....',
      '....M......M....',
      '................',
    ],
  ],
  sprSquid: [
    [
      '......LLLL......',
      '....LLLLLLLL....',
      '..LLLLLLLLLLLL..',
      '.LLLLLLLLLLLLLL.',
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
      '..LLLLLLLLLLLL..',
      '.LLLLLLLLLLLLLL.',
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
      '....ML....ML....',
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
      '.....ML..ML.....',
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
      '....MMMMMMMM....',
      '..MMLLMMMMLLMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMMLMMMMMMLMMM.',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '..MM..MM..MM.MM.',
      '.MM..MM..MM..MM.',
      '.M...M....M...M.',
      '................',
    ],
    [
      '....MMMMMMMM....',
      '..MMMMMMMMMMMM..',
      '.MMMMMMMMMMMMMM.',
      '.MMMLMMMMMMLMMM.',
      '.MMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMM..',
      '...MM.MM.MM.MM..',
      '..MM..MM..MM..M.',
      '..M...M...M...M.',
      '................',
    ],
  ],
  sprJellofish: [
    [
      '....LLLLLLLL....',
      '..LLLLSLLSLLLL..',
      '.LLLLSSLLSSLLLL.',
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
      '.LLLSSLLLLSSLLL.',
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
      '...ML.MMLM.LM...',
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
      '....MLMMLMLM....',
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
      '..M....ML....M..',
      '...MM.MMMM.MM...',
      '....MMMMMMMM....',
      '.MMMMMMMMMMMMMM.',
      'MMMMMLDMMDLMNMMM'.replace('N', 'M'),
      '.MMMMMMMMMMMMMM.',
      '....MMMMMMMM....',
      '...MM.MMMM.MM...',
      '..M....MM....M..',
    ],
    [
      '....M......M....',
      '....MM.ML.MM....',
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
      '......LLLLL.....',
      '.....LLLLDLL....',
      '..L.LLLLLLLL....',
      'LLL.LLLLLLLL....',
      '.....LLLLLL.....',
      '................',
      '................',
      '................',
      '................',
    ],
    [
      '................',
      '......LLLLL.....',
      '.....LLLLDLL....',
      'LLL.LLLLLLLL....',
      '..L.LLLLLLLL....',
      '.....LLLLLL.....',
      '................',
      '................',
      '................',
      '................',
    ],
  ],

  // ---- AREA 4: LIMBO (14) ----
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
      '..LLDDSSLLDDLL..',
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
      '..LLDDLLSSDDLL..',
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
      '.LLDLLLSSLLLDLL.',
      '.LLLLLLSSLLLLLL.',
      '..LLLL....LLLL..',
      '...LL......LL...',
      '................',
      '................',
      '................',
      '................',
    ],
    [
      '..LLLL....LLLL..',
      '.LLDLLLSSLLLDLL.',
      '.LLLLLLSSLLLLLL.',
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
      '..MMMDLLLLDMMM..',
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
      '..MMMDLLLLDMMM..',
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
      '.....ML..ML.....',
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
      '....ML....ML....',
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
      '.....ML..ML.....',
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

export function packAllEnemies(surf: PixelSurface, packer: ShelfPacker): void {
  for (const [id, frames] of Object.entries(ENEMY_SPRITES)) {
    const pos = packer.alloc(id, 16, 16, 2, 8, 8);
    const padY0 = Math.max(0, Math.floor((16 - frames[0].length) / 2));
    const padY1 = Math.max(0, Math.floor((16 - frames[1].length) / 2));
    surf.stampGrid(pos.x, pos.y + padY0, frames[0]);
    surf.addOutline(pos.x, pos.y, 16, 16, 'D');
    surf.stampGrid(pos.x + 16, pos.y + padY1, frames[1]);
    surf.addOutline(pos.x + 16, pos.y, 16, 16, 'D');
  }
}
