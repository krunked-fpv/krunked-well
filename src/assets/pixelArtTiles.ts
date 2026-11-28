import type { PixelSurface, SemanticChannel, ShelfPacker } from './pixelSurface.ts';

// ============================================================================
// Krunked Well — Masterclass 16x16 Hand-Pixeled Biome Tilesets & Terrain
//
// Authentic minimalist 4-channel retro pixel-art craftsmanship:
//   * Deep subterranean bedrock (mask === 15) is PURE PITCH BLACK ('D') so
//     the sculpted cave walls, side rooms, and shaft silhouettes pop with
//     iconic razor-sharp contrast — ZERO repeating polka-dot wallpaper!
//   * Exposed walls (mask < 15) feature clean, hand-sculpted tactile masonry:
//       - Surface / Cavern: Chunky sculpted cobblestone boulders with crisp
//         dark crevices & inner pebble highlights (zero static noise!)
//       - Catacomb: Crisp staggered rectangular dungeon bricks & mortar
//       - Aquifer: Water-eroded rounded cyan coral stone with white specular lip
//       - Limbo: Stark geometric double-bevel monolith slabs with arcane pips
//       - Abyss: Menacing crimson-obsidian riveted biomechanical ribs
// ============================================================================

function edgeDistance(
  dx: number,
  dy: number,
  hasN: boolean,
  hasE: boolean,
  hasS: boolean,
  hasW: boolean,
): number {
  let d = 99;
  if (!hasN) d = Math.min(d, dy);
  if (!hasS) d = Math.min(d, 15 - dy);
  if (!hasW) d = Math.min(d, dx);
  if (!hasE) d = Math.min(d, 15 - dx);
  return d;
}

export function drawBiomeWallTile(
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

  // Base deep dark rock fill — deep bedrock (mask === 15) stays pure crisp black!
  surf.rect(ox, oy, 16, 16, 'D');
  if (mask === 15) {
    return;
  }

  if (area === 0 || area === 1) {
    // ------------------------------------------------------------------------
    // AREA 0 (SURFACE) & AREA 1 (CAVERN): Clean Hand-Sculpted Cobblestone!
    // Bold 2px carved white rock crust with dark boulder notches, stepping
    // cleanly into sculpted dark cobble blocks with crisp 1px inner stone
    // facet highlights — ZERO noisy checkerboard static!
    // ------------------------------------------------------------------------
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dist = edgeDistance(x, y, hasN, hasE, hasS, hasW);
        if (dist <= 1) {
          surf.px(ox + x, oy + y, 'L');
        } else if (dist === 2) {
          // Subtle organic cobblestone contour undulation (not noisy!)
          const bump = ((x * 5 + y * 3 + mask) & 7) < 4;
          if (bump) surf.px(ox + x, oy + y, 'L');
        }
      }
    }

    // Crisp interior sculpted cobble stone highlights (clean retro pixel boulders!)
    const drawCobble = (cx: number, cy: number, w: number, h: number): void => {
      if (cx < 2 || cy < 2 || cx + w > 14 || cy + h > 14) return;
      // Top & left bright rock bevel
      surf.rect(ox + cx + 1, oy + cy, w - 2, 1, 'L');
      surf.rect(ox + cx, oy + cy + 1, 1, h - 2, 'L');
      // Subtle bottom-right shadow notch dot
      surf.px(ox + cx + w - 2, oy + cy + h - 1, 'L');
    };
    drawCobble(3, 3, 5, 4);
    drawCobble(9, 4, 4, 4);
    drawCobble(4, 9, 4, 4);
    drawCobble(9, 9, 4, 4);

    // Carved black boulder crevices breaking up exposed rock rims into organic stones
    if (!hasN) {
      surf.px(ox + 5, oy, 'D');
      surf.px(ox + 5, oy + 1, 'D');
      surf.px(ox + 11, oy, 'D');
      surf.px(ox + 11, oy + 1, 'D');
      // Surface overworld bold crimson meadow cap
      if (area === 0) {
        surf.rect(ox + 1, oy, 14, 2, 'M');
        surf.px(ox + 4, oy + 2, 'M');
        surf.px(ox + 11, oy + 2, 'M');
      }
    }
    if (!hasS) {
      surf.px(ox + 4, oy + 15, 'D');
      surf.px(ox + 4, oy + 14, 'D');
      surf.px(ox + 10, oy + 15, 'D');
      surf.px(ox + 10, oy + 14, 'D');
    }
    if (!hasW) {
      surf.px(ox, oy + 5, 'D');
      surf.px(ox + 1, oy + 5, 'D');
      surf.px(ox, oy + 11, 'D');
      surf.px(ox + 1, oy + 11, 'D');
    }
    if (!hasE) {
      surf.px(ox + 15, oy + 4, 'D');
      surf.px(ox + 14, oy + 4, 'D');
      surf.px(ox + 15, oy + 10, 'D');
      surf.px(ox + 14, oy + 10, 'D');
    }
  } else if (area === 2) {
    // ------------------------------------------------------------------------
    // AREA 2 (CATACOMB): Crisp Staggered Gothic Stone Brick Masonry!
    // Clean 4-row running-bond dungeon bricks: crisp L outer rim, clean D
    // recessed stone interior with sharp L mortar/bevel edges — zero static!
    // ------------------------------------------------------------------------
    // Clean inner staggered brick grid lines
    for (let row = 0; row < 4; row++) {
      const yTop = row * 4;
      const stagger = (row & 1) * 4;
      // Top brick highlight edge (dashed crisp stone look)
      for (let x = 2; x < 14; x++) {
        const isMortar = ((x + stagger) & 7) === 0;
        if (!isMortar) {
          surf.px(ox + x, oy + yTop + 1, 'L');
        }
      }
      // Vertical brick seam highlight
      for (let bx = stagger; bx < 16; bx += 8) {
        if (bx >= 2 && bx <= 13) {
          surf.px(ox + bx + 1, oy + yTop + 2, 'L');
        }
      }
    }

    // Solid bold chiseled catacomb border frame on all exposed faces
    if (!hasN) {
      surf.rect(ox, oy, 16, 2, 'L');
      surf.rect(ox, oy + 2, 16, 1, 'D');
      surf.px(ox + 7, oy + 1, 'D');
      surf.px(ox + 15, oy + 1, 'D');
    }
    if (!hasS) {
      surf.rect(ox, oy + 14, 16, 2, 'L');
      surf.rect(ox, oy + 13, 16, 1, 'D');
      surf.px(ox + 3, oy + 14, 'D');
      surf.px(ox + 11, oy + 14, 'D');
    }
    if (!hasW) {
      surf.rect(ox, oy, 2, 16, 'L');
      surf.rect(ox + 2, oy, 1, 16, 'D');
      surf.px(ox + 1, oy + 4, 'D');
      surf.px(ox + 1, oy + 12, 'D');
    }
    if (!hasE) {
      surf.rect(ox + 14, oy, 2, 16, 'L');
      surf.rect(ox + 13, oy, 1, 16, 'D');
      surf.px(ox + 14, oy + 4, 'D');
      surf.px(ox + 14, oy + 12, 'D');
    }
  } else if (area === 3) {
    // ------------------------------------------------------------------------
    // AREA 3 (AQUIFER): Lush Rounded Cyan Coral Stone & Clean Sea Pores!
    // Bold Special cyan ('S') rounded walls with bright white ('L') wet top
    // foam highlight and clean dark carved coral cavities (zero static!).
    // ------------------------------------------------------------------------
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dist = edgeDistance(x, y, hasN, hasE, hasS, hasW);
        if (dist <= 2) {
          surf.px(ox + x, oy + y, 'S');
        } else if (dist === 3 && ((x * 3 + y * 5) & 3) === 0) {
          surf.px(ox + x, oy + y, 'S');
        }
      }
    }

    // Bright white wet specular highlight lip on exposed top/left coral edges
    if (!hasN) {
      surf.rect(ox + 2, oy, 12, 1, 'L');
      surf.px(ox + 4, oy + 1, 'L');
      surf.px(ox + 11, oy + 1, 'L');
    }
    if (!hasW) {
      surf.rect(ox, oy + 2, 1, 12, 'L');
    }

    // Clean sculpted coral pores inside block
    surf.rect(ox + 4, oy + 4, 4, 3, 'S');
    surf.rect(ox + 5, oy + 5, 2, 1, 'D');
    surf.px(ox + 5, oy + 4, 'L');

    surf.rect(ox + 9, oy + 9, 4, 3, 'S');
    surf.rect(ox + 10, oy + 10, 2, 1, 'D');
    surf.px(ox + 10, oy + 9, 'L');
  } else if (area === 4) {
    // ------------------------------------------------------------------------
    // AREA 4 (LIMBO): Surreal Stark Geometric Void Architecture!
    // Crisp high-contrast double-bevel architectural slabs with precision
    // geometric corner brackets and arcane cyan/red center pips.
    // ------------------------------------------------------------------------
    surf.rect(ox + 4, oy + 4, 4, 1, 'L');
    surf.rect(ox + 4, oy + 4, 1, 4, 'L');
    surf.rect(ox + 8, oy + 11, 4, 1, 'L');
    surf.rect(ox + 11, oy + 8, 1, 4, 'L');
    const pipCh: SemanticChannel = (mask & 1) === 0 ? 'S' : 'M';
    surf.rect(ox + 7, oy + 7, 2, 2, pipCh);

    if (!hasN) {
      surf.rect(ox, oy, 16, 2, 'L');
      surf.rect(ox, oy + 2, 16, 1, 'D');
    }
    if (!hasS) {
      surf.rect(ox, oy + 14, 16, 2, 'L');
      surf.rect(ox, oy + 13, 16, 1, 'D');
    }
    if (!hasW) {
      surf.rect(ox, oy, 2, 16, 'L');
      surf.rect(ox + 2, oy, 1, 16, 'D');
    }
    if (!hasE) {
      surf.rect(ox + 14, oy, 2, 16, 'L');
      surf.rect(ox + 13, oy, 1, 16, 'D');
    }
  } else {
    // ------------------------------------------------------------------------
    // AREA 5 (ABYSS): Menacing Crimson-Obsidian Biomechanical Ribbed Walls!
    // Chunky crimson carapace plating with clean rib grooves & bone-white rivets.
    // ------------------------------------------------------------------------
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dist = edgeDistance(x, y, hasN, hasE, hasS, hasW);
        if (dist <= 2) {
          surf.px(ox + x, oy + y, 'M');
        }
      }
    }
    // Horizontal abyssal rib plates & bone-white armor rivets
    surf.rect(ox + 3, oy + 4, 10, 1, 'M');
    surf.rect(ox + 3, oy + 11, 10, 1, 'M');
    surf.rect(ox + 5, oy + 6, 2, 2, 'L');
    surf.rect(ox + 9, oy + 8, 2, 2, 'M');
    if (!hasW) {
      surf.px(ox, oy + 3, 'L');
      surf.px(ox, oy + 11, 'L');
      surf.px(ox + 1, oy + 7, 'D');
    }
    if (!hasE) {
      surf.px(ox + 15, oy + 3, 'L');
      surf.px(ox + 15, oy + 11, 'L');
      surf.px(ox + 14, oy + 7, 'D');
    }
  }

  // Softly round exposed outer corners (authentic tactile pixel-art charm!)
  const cornerCh: SemanticChannel = area === 3 ? 'S' : area === 5 ? 'M' : 'L';
  if (!hasN && !hasW) {
    surf.clearPx(ox, oy);
    surf.px(ox + 1, oy + 1, cornerCh);
  }
  if (!hasN && !hasE) {
    surf.clearPx(ox + 15, oy);
    surf.px(ox + 14, oy + 1, cornerCh);
  }
  if (!hasS && !hasW) {
    surf.clearPx(ox, oy + 15);
    surf.px(ox + 1, oy + 14, cornerCh);
  }
  if (!hasS && !hasE) {
    surf.clearPx(ox + 15, oy + 15);
    surf.px(ox + 14, oy + 14, cornerCh);
  }
}

export function drawSpecialTiles(surf: PixelSurface, packer: ShelfPacker): void {
  // --------------------------------------------------------------------------
  // 1. Breakable Cracked Red Blocks (4 handcrafted pixel variants for organic variety!)
  // --------------------------------------------------------------------------
  {
    const { x, y } = packer.alloc('sprBreakable', 16, 16, 4, 0, 0);
    const variants: readonly (readonly string[])[] = [
      [
        '.MMMMMMMMMMMMMM.',
        'MLLMMMMMMMMMMMMM',
        'MLMMMMMDMMMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMDMMMMMMMMMM',
        'MMDDDDMMMMMMMMMM',
        'MMMMMMDMMMDDMMMM',
        'MMMMMMDDDDMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMDDMMMDMMMM',
        'MMMDMMMMMMMDDMMM',
        'MMMDDMMMMMMMMMMM',
        'MMMMMMMMMMMMMDMM',
        'MMMMMMMMMMMMDDMM',
        '.MMMMMMMMMMMMMM.',
      ],
      [
        '.MMMMMMMMMMMMMM.',
        'MLLMMMMMMMMMMMMM',
        'MLMMMMMMMMDMMMMM',
        'MMMMMMMMMMDMMMMM',
        'MMMMMMMMDDMMMMMM',
        'MMMMMMDDMMMMMMMM',
        'MMDDDDMMMMMDMMMM',
        'MMMMMMMDMMMDDMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMMDDMMMMMMM',
        'MMMMMMMMMDMMMMMM',
        'MMMMDMMMMDDMMMMM',
        'MMMDMMMMMMMMMMMM',
        'MMMMMMMMMMMMMDMM',
        'MMMMMMMMMMMMDDMM',
        '.MMMMMMMMMMMMMM.',
      ],
      [
        '.MMMMMMMMMMMMMM.',
        'MLLMMMMMMMMMMMMM',
        'MLMMDMMMMMMMMMMM',
        'MMMMDDMMMMMMMMMM',
        'MMMMMMDMMMMMMMMM',
        'MMMMMMDDDDDMMMMM',
        'MMMMMMDMMMMMMMMM',
        'MMMMDDMMMMMMMMMM',
        'MMMDMMMMMMMDMMMM',
        'MMMMMMMMMMMDDMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMDDMMMMMMMM',
        'MMMMMMMMMMMMMDMM',
        'MMMMMMMMMMMMDDMM',
        '.MMMMMMMMMMMMMM.',
      ],
      [
        '.MMMMMMMMMMMMMM.',
        'MLLMMMMMMMMMMMMM',
        'MLMMMMMMMDDMMMMM',
        'MMMMMMMMDMMMMMMM',
        'MMMMMMDDMMMMMMMM',
        'MMMMMDMMMMMMMMMM',
        'MMMMMDMMMMMMMDMM',
        'MMDDDDDDDDDDDDMM',
        'MMMMMMMMDMMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMMDMMMMMMMM',
        'MMMMMMDMMMDDMMMM',
        'MMMDMMMMMMMMMMMM',
        'MMMMMMMMMMMMMDMM',
        'MMMMMMMMMMMMDDMM',
        '.MMMMMMMMMMMMMM.',
      ],
    ];
    for (let f = 0; f < 4; f++) {
      surf.stampGrid(x + f * 16, y, variants[f]!);
      surf.rect(x + f * 16 + 1, y + 15, 14, 1, 'D');
      surf.rect(x + f * 16 + 15, y + 1, 1, 14, 'D');
    }
  }

  // --------------------------------------------------------------------------
  // 2. Thin Platform (Crisp 2px solid white walking top + retro truss cross-bracing!)
  // --------------------------------------------------------------------------
  {
    const { x, y } = packer.alloc('sprThinPlatform', 16, 16, 1, 0, 0);
    surf.stampGrid(x, y, [
      'LLLLLLLLLLLLLLLL',
      'LLLLLLLLLLLLLLLL',
      'DLDDDDDLDDDDDDLD',
      '.LL...LLL....LL.',
      '..L....L......L.',
    ]);
  }

  // --------------------------------------------------------------------------
  // 3. Directional Razor Spikes (3 overlapping hand-pixeled crimson blades + white gleam!)
  // --------------------------------------------------------------------------
  {
    const up = packer.alloc('sprSpikeUp', 16, 16, 1, 0, 0);
    surf.stampGrid(up.x, up.y + 7, [
      '.......M........',
      '..M...MLM....M..',
      '.MLM..MLM...MLM.',
      '.MLM.MMLMM..MLM.',
      'MMLMMMMLMMMMLMM.',
      'MMMMMMMMMMMMMMM.',
      'MMMMMDMMMDMMMMMM',
      'DDDDDDDDDDDDDDDD',
      'LLLLLLLLLLLLLLLL',
    ]);

    const dn = packer.alloc('sprSpikeDown', 16, 16, 1, 0, 0);
    surf.stampGrid(dn.x, dn.y, [
      'LLLLLLLLLLLLLLLL',
      'DDDDDDDDDDDDDDDD',
      'MMMMMDMMMDMMMMMM',
      'MMMMMMMMMMMMMMM.',
      'MMLMMMMLMMMMLMM.',
      '.MLM.MMLMM..MLM.',
      '.MLM..MLM...MLM.',
      '..M...MLM....M..',
      '.......M........',
    ]);

    const lt = packer.alloc('sprSpikeLeft', 16, 16, 1, 0, 0);
    surf.stampGrid(lt.x + 7, lt.y, [
      '.......DL',
      '....MMMDL',
      '..MLMMMDL',
      '...MMMMDL',
      '.....MMDL',
      '...MMMMDL',
      '.MLMMMMDL',
      'MMLMMMMDL',
      '.MMMMMMDL',
      '...MMMMDL',
      '.....MMDL',
      '...MMMMDL',
      '..MLMMMDL',
      '....MMMDL',
      '......MDL',
      '.......DL',
    ]);

    const rt = packer.alloc('sprSpikeRight', 16, 16, 1, 0, 0);
    surf.stampGrid(rt.x, rt.y, [
      'LD.......',
      'LDMMM....',
      'LDMMMLM..',
      'LDMMMM...',
      'LDMM.....',
      'LDMMMM...',
      'LDMMMMML.',
      'LDMMMMLMM',
      'LDMMMMMM.',
      'LDMMMM...',
      'LDMM.....',
      'LDMMMM...',
      'LDMMMLM..',
      'LDMMM....',
      'LDM......',
      'LD.......',
    ]);
  }

  // --------------------------------------------------------------------------
  // 4. Spike Trap (Retracted & Extended)
  // --------------------------------------------------------------------------
  {
    const ret = packer.alloc('sprSpikeTrapRetracted', 16, 16, 1, 0, 0);
    surf.stampGrid(ret.x, ret.y + 10, [
      '...M....M....M..',
      '..MMM..MMM..MMM.',
      'LLLLLLLLLLLLLLLL',
      'LDLLLDLLLLDLLLDL',
      'LDDDDDDDDDDDDDDL',
      'LLLLLLLLLLLLLLLL',
    ]);

    const ext = packer.alloc('sprSpikeTrapExtended', 16, 16, 1, 0, 0);
    surf.stampGrid(ext.x, ext.y + 4, [
      '...M....M....M..',
      '..MLM..MLM..MLM.',
      '..MLM..MLM..MLM.',
      '.MMLMMMMLMMMMLM.',
      '.MMLMMMMLMMMMLM.',
      '.MMMMMMMMMMMMMM.',
      '.MMMMMMMMMMMMMM.',
      'DDDDDDDDDDDDDDDD',
      'LLLLLLLLLLLLLLLL',
      'LDLLLDLLLLDLLLDL',
      'LDDDDDDDDDDDDDDL',
      'LLLLLLLLLLLLLLLL',
    ]);
  }

  // --------------------------------------------------------------------------
  // 5. Bubble Block (Lush Overlapping Pixel Bubbles with White Highlights)
  // --------------------------------------------------------------------------
  {
    const { x, y } = packer.alloc('sprBubbleBlock', 16, 16, 1, 0, 0);
    surf.stampGrid(x, y, [
      '...SSSSS........',
      '..SDDDDDS..SSS..',
      '.SDLDDDDDSDDDDSS',
      '.SDDDDDDDSDLDDDS',
      '.SDDDDDDSDDDDDDS',
      '..SDDDDDSDDDDDS.',
      '..SSSSSSSDDDDS..',
      '.SDDDDDSS.SSS...',
      'SDDLDDDDSSSS....',
      'SDDDDDDSDDDDSS..',
      'SDDDDDDSDLDDDDS.',
      '.SDDDDDSDDDDDDS.',
      '..SSSSSSDDDDDDS.',
      '.......SDDDDDDS.',
      '........SDDDDS..',
      '.........SSSS...',
    ]);
  }

  // --------------------------------------------------------------------------
  // 6. Ghost Wall (Solid Crystal Rune Block vs Phased Dotted Outline)
  // --------------------------------------------------------------------------
  {
    const solid = packer.alloc('sprGhostWallSolid', 16, 16, 1, 0, 0);
    surf.stampGrid(solid.x, solid.y, [
      '.SSSSSSSSSSSSSS.',
      'SDLLLLLLLLLLLLDS',
      'SLDDDDDDDDDDDDLS',
      'SLDSSSSSSSSSSDLS',
      'SLDSDDLLLLDDSDLS',
      'SLDSDLSSSSLDSDLS',
      'SLDSLSSLLSSLSDLS',
      'SLDSLSLDDLSLSDLS',
      'SLDSLSLDDLSLSDLS',
      'SLDSLSSLLSSLSDLS',
      'SLDSDLSSSSLDSDLS',
      'SLDSDDLLLLDDSDLS',
      'SLDSSSSSSSSSSDLS',
      'SLDDDDDDDDDDDDLS',
      'SDLLLLLLLLLLLLDS',
      '.SSSSSSSSSSSSSS.',
    ]);

    const phased = packer.alloc('sprGhostWallPhased', 16, 16, 1, 0, 0);
    surf.stampGrid(phased.x, phased.y, [
      '.SS..SS..SS..SS.',
      'S..............S',
      'S..............S',
      '................',
      'S.....SSSS.....S',
      'S....S....S....S',
      '....S..SS..S....',
      'S...S.S..S.S...S',
      'S...S.S..S.S...S',
      '....S..SS..S....',
      'S....S....S....S',
      'S.....SSSS.....S',
      '................',
      'S..............S',
      'S..............S',
      '.SS..SS..SS..SS.',
    ]);
  }

  // --------------------------------------------------------------------------
  // 7. Shop Floor (Clean Temple Stone Tiles with Solid Dark Rim for Price Tags)
  // --------------------------------------------------------------------------
  {
    const { x, y } = packer.alloc('sprShopFloor', 16, 16, 1, 0, 0);
    surf.stampGrid(x, y, [
      'LLLLLLLLLLLLLLLL',
      'LLLLLLLLLLLLLLLL',
      'DDDDDDDDDDDDDDDD',
      'DLDDDDDLLDDDDDLD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DLDDDDDLLDDDDDLD',
      'DDDDDDDDDDDDDDDD',
      'LLLLLLLLLLLLLLLL',
      'LLLLLLLLLLLLLLLL',
    ]);
  }

  // --------------------------------------------------------------------------
  // 8. Stage Exit Portal (2 Animated Descending Pixel Chevrons)
  // --------------------------------------------------------------------------
  {
    const { x, y } = packer.alloc('sprStageExit', 16, 16, 2, 0, 0);
    surf.stampGrid(x, y, [
      '................',
      '.LL..........LL.',
      '..LL........LL..',
      '...LL......LL...',
      '....LL....LL....',
      '.....LL..LL.....',
      '......LLLL......',
      '.MM....LL....MM.',
      '..MM........MM..',
      '...MM......MM...',
      '....MM....MM....',
      '.....MM..MM.....',
      '......MMMM......',
      '.......MM.......',
      '................',
      '................',
    ]);
    surf.stampGrid(x + 16, y, [
      '................',
      '................',
      '................',
      '.LL..........LL.',
      '..LL........LL..',
      '...LL......LL...',
      '....LL....LL....',
      '.....LL..LL.....',
      '......LLLL......',
      '.MM....LL....MM.',
      '..MM........MM..',
      '...MM......MM...',
      '....MM....MM....',
      '.....MM..MM.....',
      '......MMMM......',
      '.......MM.......',
    ]);
  }
}
