import type { PixelSurface, ShelfPacker } from './pixelSurface.ts';

// ============================================================================
// Krunked Well — Masterclass Pixel-Art Final Boss, Weapons, Shop & 20 Upgrades
//   * Abyssal Leviathan (32x80 Eye Pod x2 + 176x88 Pixel-Dithered Tentacles x2)
//   * 7 Distinct Gun Module Icons (16x16)
//   * 6 Shop Consumables + Glass Case + Hooded Pixel Shopkeeper (24x24 x2)
//   * 20 Unique Hand-Pixeled Upgrade Icons (14x14 framed medallions!)
//   * Crisp Arcade Bullets, Big Punchy Muzzle Flashes, Gems, Hearts & Companions
// ============================================================================

export function drawBossEyeFrame(surf: PixelSurface, ox: number, oy: number, closed: boolean): void {
  // Sculpted jagged horned abyssal colossus carapace (32x80) with pixel-dithered shading!
  for (let y = 4; y < 76; y++) {
    const ny = (y - 40) / 36;
    const baseW = Math.round(14 * Math.sqrt(Math.max(0, 1 - ny * ny)));
    // Serrated armored rib-notches along silhouette
    const notch = (y % 8 < 2 && Math.abs(ny) > 0.35) ? 1 : 0;
    const halfW = Math.max(2, baseW + notch);
    for (let x = 16 - halfW; x <= 16 + halfW; x++) {
      const distEdge = Math.min(x - (16 - halfW), 16 + halfW - x);
      const checker = ((x + y) & 1) === 0;
      if (distEdge === 0) {
        surf.px(ox + x, oy + y, 'M');
      } else if (distEdge <= 2) {
        surf.px(ox + x, oy + y, checker ? 'M' : 'D');
      } else {
        surf.px(ox + x, oy + y, 'D');
      }
    }
  }

  // Sweeping jagged bone-white crown horns at top & mandible fangs at bottom!
  surf.stampGrid(ox + 2, oy + 0, [
    '.LL......................LL.',
    '.LLL....................LLL.',
    '..LLML................LMLL..',
    '...MMMM..............MMMM...',
    '....MMMMM..LLLLLL..MMMMM....',
  ]);
  surf.stampGrid(ox + 2, oy + 75, [
    '....MMMMM..LLLLLL..MMMMM....',
    '...MMMM..............MMMM...',
    '..LLML................LMLL..',
    '.LLL....................LLL.',
    '.LL......................LL.',
  ]);

  // Carved bone-white thoracic chevron ribs above & below eye!
  for (let i = 0; i < 3; i++) {
    const ry = 10 + i * 5;
    const w = 8 + i * 2;
    surf.rect(ox + 16 - w, oy + ry, w * 2, 1, 'L');
    surf.rect(ox + 16 - w + 2, oy + ry + 1, (w - 2) * 2, 1, 'M');

    const by = 69 - i * 5;
    surf.rect(ox + 16 - w, oy + by, w * 2, 1, 'L');
    surf.rect(ox + 16 - w + 2, oy + by - 1, (w - 2) * 2, 1, 'M');
  }

  // Deep orbital rim socket
  surf.circle(ox + 16, oy + 40, 12.5, 'M');
  surf.circle(ox + 16, oy + 40, 11.2, 'D');

  if (!closed) {
    // Open glaring Leviathan eye with pixel-dithered sclera shadow, concentric iris & sharp slit pupil!
    surf.circle(ox + 16, oy + 40, 10, 'L');
    // Angry overhanging top brow shadow
    for (let x = 6; x <= 26; x++) {
      const browY = 30 + Math.floor(Math.abs(x - 16) * 0.25);
      for (let y = 29; y <= browY; y++) {
        surf.px(ox + x, oy + y, 'D');
      }
      surf.px(ox + x, oy + browY + 1, 'M');
    }
    // Fiery crimson iris + dark vertical slit pupil
    surf.circle(ox + 16, oy + 41, 6, 'M');
    surf.circle(ox + 16, oy + 41, 4.2, 'D');
    surf.circle(ox + 16, oy + 41, 3.2, 'M');
    surf.rect(ox + 15, oy + 36, 2, 10, 'D');
    // Wet bright specular pixel glints
    surf.rect(ox + 11, oy + 36, 2, 2, 'L');
    surf.px(ox + 19, oy + 44, 'L');
  } else {
    // Clenched jagged spiked eyelid seam (stunned state!)
    surf.circle(ox + 16, oy + 40, 10, 'D');
    surf.ditherRect(ox + 8, oy + 33, 16, 14, 'M', 'D', 0.25);
    // Jagged clenched seam line
    surf.stampGrid(ox + 6, oy + 38, [
      '....MM......MM......',
      'LLLLLLLLLLLLLLLLLLLL',
      'DDDDMMDDDDDDMMDDDDDD',
      '....LL......LL......',
    ]);
  }
}

export function drawBossTentacleFrame(
  surf: PixelSurface,
  ox: number,
  oy: number,
  phase: number,
): void {
  // Thick sinuous 176x88 pixel-dithered abyssal tentacle with jagged barbs & white suckers!
  for (let x = 3; x < 173; x++) {
    const t = x / 176;
    const thickness = Math.max(3, Math.round(15 * (1 - t * 0.72)));
    const wave = Math.round(Math.sin(t * Math.PI * 3.0 + phase * Math.PI) * (9 + t * 13));
    const cy = 44 + wave;

    for (let dy = -thickness; dy <= thickness; dy++) {
      const y = cy + dy;
      if (y < 2 || y >= 86) continue;
      const checker = ((x + y) & 1) === 0;
      if (Math.abs(dy) >= thickness - 1) {
        surf.px(ox + x, oy + y, 'M');
      } else if (dy < -thickness + 4) {
        // Upper lit pixel-dithered ridge
        surf.px(ox + x, oy + y, checker ? 'M' : 'D');
      } else if (dy === -Math.floor(thickness * 0.35) && (x % 8 < 4)) {
        // Pulsing bone-white energy vein ticks
        surf.px(ox + x, oy + y, 'L');
      } else {
        surf.px(ox + x, oy + y, 'D');
      }
    }

    // Razor jagged dorsal barbs along top ridge
    if (x % 14 === 0 && x < 156) {
      const tipY = cy - thickness - 4;
      surf.rect(ox + x - 2, oy + tipY + 2, 5, 2, 'M');
      surf.rect(ox + x - 1, oy + tipY + 1, 3, 2, 'M');
      surf.px(ox + x, oy + tipY, 'L');
    }

    // Crisp sculpted white ventral suction cups!
    if (x % 11 === 5 && x < 162) {
      const sy = cy + thickness;
      surf.rect(ox + x - 2, oy + sy - 1, 5, 3, 'L');
      surf.rect(ox + x - 1, oy + sy + 1, 3, 1, 'D');
      surf.px(ox + x, oy + sy, 'D');
    }
  }
}

export function drawWeaponsShopAndItems(surf: PixelSurface, packer: ShelfPacker): void {
  // --------------------------------------------------------------------------
  // 1. All 7 Gun Module Icons (16x16, origin 8,8 — instantly recognizable!)
  // --------------------------------------------------------------------------
  const gunGlyphs: Record<string, readonly string[]> = {
    sprGunMachinegun: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDLLDDDDDDLLDL.',
      '.LDLLDLLLLDLLDL.',
      '.LDLLDLMMDL.LDL.',
      '.LDLLDLMMDL.LDL.',
      '.LDLLDLLLLDLLDL.',
      '.LDLLDDLLDDLLDL.',
      '.LDLLDDLLDDLLDL.',
      '.LDLLDDMMDDLLDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunShotgun: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDMMMMMMMMMMDL.',
      '.LDMLLDDDDLLMDL.',
      '.LDMLLDDDDLLMDL.',
      '.LDMLLLLLLLLMDL.',
      '.LDMLLDDDDLLMDL.',
      '.LDMLLDDDDLLMDL.',
      '.LDMMLLMMLLMMDL.',
      '.LDMMMMMMMMMMDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunLaser: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSMLLMSSSDL.',
      '.LDSSMLDDLMSSDL.',
      '.LDSSMLDDLMSSDL.',
      '.LDSSSMLLMSSSDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSSLLSSSSDL.',
      '.LDSSSSMMSSSSDL.',
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
      '.LD..MM..MM..DL.',
      '.LD.MM....MM.DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunPuncher: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.MM.MM.MM.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.LL.LL.LL.DL.',
      '.LD.MM.MM.MM.DL.',
      '.LD.MM.MM.MM.DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunBurst: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LD..LLLLLL..DL.',
      '.LD...MLLM...DL.',
      '.LD...DDDD...DL.',
      '.LD..LLLLLL..DL.',
      '.LD...MLLM...DL.',
      '.LD...DDDD...DL.',
      '.LD..LLLLLL..DL.',
      '.LD...MLLM...DL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
    sprGunNoppy: [
      '..LLLLLLLLLLLL..',
      '.LDDDDDDDDDDDDL.',
      '.LDLL......LLDL.',
      '.LD.LL....LL.DL.',
      '.LD..LL..LL..DL.',
      '.LD...MMMM...DL.',
      '.LD..MMLLMM..DL.',
      '.LD.LL....LL.DL.',
      '.LDLL......LLDL.',
      '.LDMM......MMDL.',
      '.LDDDDDDDDDDDDL.',
      '..LLLLLLLLLLLL..',
    ],
  };

  for (const [id, grid] of Object.entries(gunGlyphs)) {
    const { x, y } = packer.alloc(id, 16, 16, 1, 8, 8);
    surf.stampGrid(x, y + 2, grid);
  }

  // --------------------------------------------------------------------------
  // 2. All 6 Shop Consumables + Glass Display Case + Hooded Pixel Shopkeeper
  // --------------------------------------------------------------------------
  const shopGlyphs: Record<string, readonly string[]> = {
    sprShop100: [
      // Onigiri Rice Ball
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
      '....LDMLLMDL....',
      '....LDLLLLDL....',
      '....LDMLLMDL....',
      '....LDMMMMDL....',
      '....LLLLLLLL....',
    ],
    sprShop102: [
      // Nigiri Sushi
      '...MMMMMMMMMM...',
      '..MMLMMMMMLMMM..',
      '..MMMMMMMMMMMM..',
      '..LLLLDDDDLLLL..',
      '..LLLLDDDDLLLL..',
      '...LLLDDDDLLL...',
      '....LLLLLLLL....',
    ],
    sprShop103: [
      // Car Battery
      '...LL......LL...',
      '..LLLLLLLLLLLL..',
      '..LDDDDDDDDDDL..',
      '..LDMMLLDDMMDL..',
      '..LDMLLDDMMLDL..',
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
      '....LSSLMSSL....',
      '....LSSSSSSL....',
      '.....LLLLLL.....',
    ],
    sprShop105: [
      // Steaming Curry Bowl
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
    surf.addOutline(x, y, 16, 16, 'D');
  }

  // Shop Glass Display Case (20x24, origin 10,14)
  {
    const { x, y } = packer.alloc('sprShopCase', 20, 24, 1, 10, 14);
    surf.rect(x + 2, y + 1, 16, 1, 'L');
    surf.px(x + 1, y + 2, 'L');
    surf.px(x + 18, y + 2, 'L');
    surf.rect(x + 1, y + 2, 1, 15, 'L');
    surf.rect(x + 18, y + 2, 1, 15, 'L');
    // Crisp glass diagonal gleam
    surf.px(x + 4, y + 3, 'L');
    surf.px(x + 3, y + 4, 'L');
    surf.px(x + 5, y + 3, 'S');
    surf.px(x + 3, y + 5, 'S');
    // Pedestal base
    surf.rect(x, y + 17, 20, 2, 'L');
    surf.rect(x + 2, y + 19, 16, 4, 'D');
    surf.rect(x + 2, y + 19, 16, 1, 'M');
    surf.rect(x + 1, y + 23, 18, 1, 'L');
  }

  // Hooded Pixel Shopkeeper (24x24, 2f subtle breathing blink!)
  {
    const { x, y } = packer.alloc('sprShopkeeper', 24, 24, 2, 12, 16);
    for (let f = 0; f < 2; f++) {
      const fx = x + f * 24;
      surf.stampGrid(fx + 4, y + 2 + f, [
        '......LLLL......',
        '....LLLLLLLL....',
        '...LLDDDDDDLL...',
        '..LLDDDDDDDDLL..',
        '..LDDLLDDLLDDL..',
        '..LDDDDDDDDDDL..',
        '..LLDDMMMMDDLL..',
        '.LLLDDDDDDDDLLL.',
        '.LLDDDDDDDDDDLL.',
        'LLLDDLLDDLLDDLLL',
        'LLDDDDDDDDDDDDLL',
        'LLDDDDDDDDDDDDLL',
        'LLLLLLLLLLLLLLLL',
      ]);
      if (f === 1) {
        // Blink frame
        surf.rect(fx + 9, y + 7, 2, 1, 'M');
        surf.rect(fx + 13, y + 7, 2, 1, 'M');
      }
      surf.addOutline(fx, y, 24, 24, 'D');
    }
  }

  // --------------------------------------------------------------------------
  // 3. Collectibles, Hearts, Bullets, Muzzle Flash & Companions
  // --------------------------------------------------------------------------
  // Faceted Red Gem (8x10, 2f)
  {
    const { x, y } = packer.alloc('sprGem', 8, 10, 2, 4, 5);
    surf.stampGrid(x, y, [
      '...MM...',
      '..MLLM..',
      '.MLMMMM.',
      'MLMMMMMM',
      'MMMMMMMM',
      'MMMMMDMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
    ]);
    surf.stampGrid(x + 8, y, [
      '...LL...',
      '..MLLM..',
      '.MLMLMM.',
      'MLMMMMMM',
      'MMMMMLMM',
      'MMMMMDMM',
      '.MMMMMM.',
      '..MMMM..',
      '...MM...',
    ]);
    surf.addOutline(x, y, 8, 10, 'D');
    surf.addOutline(x + 8, y, 8, 10, 'D');
  }

  // Shell Casing (4x4, 2f)
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
      surf.circle(cx, cy, f === 0 ? 6.2 : 5.6, 'S', true);
      surf.rect(cx - 3, cy - 3, 2, 1, 'L');
      surf.px(cx - 3, cy - 2, 'L');
      surf.px(cx + 2, cy + 2, 'S');
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
      surf.addOutline(ox, y, 10, 10, 'D');
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
    surf.addOutline(x, y, 12, 16, 'D');
  }

  // Punchy Retro Arcade Muzzle Flash (16x12, 2f: normal / gemHigh!)
  {
    const { x, y } = packer.alloc('sprMuzzleFlash', 16, 12, 2, 8, 2);
    surf.stampGrid(x, y, [
      '..LLLLLLLLLLLL..',
      '.LLLLLMMMMLLLLL.',
      'LLLLLLLLLLLLLLLL',
      '.LLLLLLMMLLLLLL.',
      '..LLLLLLLLLLLL..',
      '...LLLLLLLLLL...',
      '....LLLLLLLL....',
      '.....LLLLLL.....',
      '......LLLL......',
      '.......LL.......',
    ]);
    surf.stampGrid(x + 16, y, [
      '.MMMMMMMMMMMMMM.',
      'MMMLLLLLLLLLLMMM',
      'MMLLLLLLLLLLLLMM',
      '.MMMLLLLLLLLMMM.',
      '..MMMMLLLLMMMM..',
      '...MMMMMMMMMM...',
      '....MMMMMMMM....',
      '.....MMMMMM.....',
      '......MMMM......',
      '.......MM.......',
    ]);
  }

  // Bullet (8x10, 2f: crisp normal white-red pellet / fat gemHigh crimson blast!)
  {
    const { x, y } = packer.alloc('sprBullet', 8, 10, 2, 4, 5);
    surf.stampGrid(x + 1, y + 1, [
      '..LL..',
      '.LLLL.',
      'LLMMLL',
      'LLMMLL',
      'LLMMLL',
      '.LLLL.',
      '..LL..',
    ]);
    surf.addOutline(x, y, 8, 10, 'D');
    surf.stampGrid(x + 9, y, [
      '..MM..',
      '.MMMM.',
      'MMLLMM',
      'MMLLMM',
      'MMLLMM',
      'MMLLMM',
      '.MMMM.',
      '..MM..',
    ]);
    surf.addOutline(x + 8, y, 8, 10, 'D');
  }

  // --------------------------------------------------------------------------
  // 4. ALL 20 UNIQUE HAND-PIXELED UPGRADE ICONS (14x14 framed pixel emblems!)
  // --------------------------------------------------------------------------
  const upgradeArt: Record<number, readonly string[]> = {
    0: [
      // Blast Module — Explosive Starburst
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
      // Reverse Engineering — Reroll Cycle Arrows
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
      // Rest In Pieces — Exploding Skull
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
      // Gem Powered — Lightning Ruby
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
      // Gunpowder Blocks — Cracked Explosive Block
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
      // Youth — Heart + Plus
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
      // Candle — Glowing Flame Candle
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
      // Hot Casing — Blazing Shell
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
      // Drone — Orbiting Gun Drone
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
      // Gem Attractor — Horseshoe Magnet
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
      // Knife and Fork
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
      // Laser Sight — Crosshair Target
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
      // Apple
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
      // Member's Card — VIP Card
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
      // Heart Balloon
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
      // Popping Gems — Upward Shooting Gem
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
      // Timeout — Arcane Clock
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
      // Rocket Jump — Thruster Boot
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
      // Gem Sick — Radiant Gem Burst
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
      // Safety Jetpack — Twin Cyan Tanks
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

  const upgradeIds = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22];
  for (const uid of upgradeIds) {
    const { x, y } = packer.alloc(`sprUg${uid}`, 16, 16, 1, 8, 8);
    // Crisp 1px framed arcade badge
    surf.rect(x, y, 16, 16, 'L');
    surf.rect(x + 1, y + 1, 14, 14, 'D');
    const grid = upgradeArt[uid];
    if (grid) {
      surf.stampGrid(x + 2, y + 3, grid);
    }
  }
}
