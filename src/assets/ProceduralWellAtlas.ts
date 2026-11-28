import { PALETTES } from '../data/palettes.ts';
import type { AssetManifest, StyleId } from '../contracts/index.ts';
import {
  drawBossEyeFrame,
  drawBossTentacleFrame,
  drawWeaponsShopAndItems,
} from './pixelArtBossAndItems.ts';
import { drawPlayerFrame, packAllEnemies } from './pixelArtEntities.ts';
import { drawBiomeWallTile, drawSpecialTiles } from './pixelArtTiles.ts';
import { ATLAS_H, ATLAS_W, PixelSurface, ShelfPacker } from './pixelSurface.ts';

// ============================================================================
// Krunked Well — Masterclass Built-In 4-Channel Semantic Pixel Atlas (1024x512)
// 100% original clean-room pixel art strictly adhering to the 4 semantic RGB
// keys (L=#FFFFFF, M=#FF0000, D=#000000, S=#007EFF) for zero-cost GPU palette
// swapping across all 38 unlockable palettes.
// ============================================================================

export function generateProceduralWellAtlas(): {
  canvas: HTMLCanvasElement;
  manifest: AssetManifest;
} {
  const surf = new PixelSurface(ATLAS_W, ATLAS_H);
  const packer = new ShelfPacker();

  // 1. Player sprites for all 5 Play Styles (0..4) x 10 anim states
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

  // 3. Special tiles ('sprThinPlatform', breakables, spikes, bubbles, ghost walls, etc.)
  drawSpecialTiles(surf, packer);

  // 4. All 40 hand-pixeled enemies (2 expressive frames each)
  packAllEnemies(surf, packer);

  // 5. Weapons, Shop Items, Shopkeeper, Glass Cases, Collectibles & 20 Upgrade Icons
  drawWeaponsShopAndItems(surf, packer);

  // 6. Final Boss ('sprBossEye' 32x80 x2, 'sprTentacle' 176x88 x2)
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
