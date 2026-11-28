import { AREA_NAMES, WELL_CONSTANTS, type SimState } from '../contracts/index.ts';
import { getWeaponDef } from '../data/weapons.ts';
import { drawBitmapTextOutlined, measureBitmapText } from '../render/BitmapFont.ts';

// ============================================================================
// Krunked Well — Authentic 160x284 4-Channel Semantic Pixel HUD
// Drawn strictly in semantic channels (L=#FFFFFF, M=#FF0000, D=#000000,
// S=#007EFF) BEFORE the WebGL2 palette-swap shader so the HUD matches all 38
// unlockable palettes identically for Built-In and Owned Custom Packs.
// Guaranteed zero-overlap layout across all 5 biomes, Boss Arena & Shop!
// ============================================================================

const COL_L = '#FFFFFF';
const COL_M = '#FF0000';
const COL_D = '#000000';
const COL_S = '#007EFF';

function drawMiniHeart(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean): void {
  // Crisp black silhouette backing for instant contrast over any rock wall
  ctx.fillStyle = COL_D;
  ctx.fillRect(x, y, 9, 8);

  if (filled) {
    ctx.fillStyle = COL_M;
    ctx.fillRect(x + 2, y + 1, 2, 1);
    ctx.fillRect(x + 5, y + 1, 2, 1);
    ctx.fillRect(x + 1, y + 2, 7, 2);
    ctx.fillRect(x + 2, y + 4, 5, 1);
    ctx.fillRect(x + 3, y + 5, 3, 1);
    ctx.fillRect(x + 4, y + 6, 1, 1);
    ctx.fillStyle = COL_L;
    ctx.fillRect(x + 2, y + 2, 1, 1);
  } else {
    ctx.fillStyle = COL_L;
    ctx.fillRect(x + 2, y + 1, 2, 1);
    ctx.fillRect(x + 5, y + 1, 2, 1);
    ctx.fillRect(x + 1, y + 2, 7, 2);
    ctx.fillRect(x + 2, y + 4, 5, 1);
    ctx.fillRect(x + 3, y + 5, 3, 1);
    ctx.fillRect(x + 4, y + 6, 1, 1);
    ctx.fillStyle = COL_D;
    ctx.fillRect(x + 2, y + 2, 2, 2);
    ctx.fillRect(x + 5, y + 2, 2, 2);
    ctx.fillRect(x + 3, y + 4, 3, 1);
    ctx.fillRect(x + 4, y + 5, 1, 1);
  }
}

function drawMiniGem(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = COL_D;
  ctx.fillRect(x - 1, y - 1, 7, 9);
  ctx.fillStyle = COL_M;
  ctx.fillRect(x + 2, y, 1, 1);
  ctx.fillRect(x + 1, y + 1, 3, 1);
  ctx.fillRect(x, y + 2, 5, 3);
  ctx.fillRect(x + 1, y + 5, 3, 1);
  ctx.fillRect(x + 2, y + 6, 1, 1);
  ctx.fillStyle = COL_L;
  ctx.fillRect(x + 1, y + 2, 1, 1);
}

function drawPixelBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  borderCol = COL_L,
): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const iw = Math.round(w);
  const ih = Math.round(h);
  ctx.fillStyle = COL_D;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = borderCol;
  ctx.fillRect(ix, iy, iw, 1);
  ctx.fillRect(ix, iy + ih - 1, iw, 1);
  ctx.fillRect(ix, iy, 1, ih);
  ctx.fillRect(ix + iw - 1, iy, 1, ih);
}

export function drawWellHud(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  paletteIndex: number,
  tick: number,
): void {
  void paletteIndex;
  if (state.mode === 'title') return;

  const p = state.player;
  const viewW = WELL_CONSTANTS.VIEW_W;
  const viewH = WELL_CONSTANTS.VIEW_H;
  const bossActive = Boolean(state.boss && state.boss.active && !state.boss.defeated);

  // --------------------------------------------------------------------------
  // 1. Top-Left: Crisp Pixel Hearts + Heart Piece Pips
  // --------------------------------------------------------------------------
  const hpX = 3;
  const hpY = 3;
  const lowHpBlink = p.hp <= 1 && ((tick >> 3) & 1) === 0;

  if (p.hpMax <= 7) {
    for (let i = 0; i < p.hpMax; i++) {
      const filled = i < p.hp;
      if (filled && lowHpBlink && i === 0) {
        // Subtle 1px pulse bounce on last heart
        drawMiniHeart(ctx, hpX + i * 9, hpY - 1, true);
      } else {
        drawMiniHeart(ctx, hpX + i * 9, hpY, filled);
      }
    }
  } else {
    drawMiniHeart(ctx, hpX, hpY, p.hp > 0);
    drawBitmapTextOutlined(
      ctx,
      `${p.hp}/${p.hpMax}`,
      hpX + 11,
      hpY + 1,
      lowHpBlink ? COL_M : COL_L,
      COL_D,
      1,
      'left',
    );
  }

  if (p.heartPieces > 0) {
    for (let i = 0; i < WELL_CONSTANTS.HEART_PIECE_MAX; i++) {
      const px = hpX + i * 6;
      const py = hpY + 10;
      ctx.fillStyle = COL_D;
      ctx.fillRect(px - 1, py - 1, 6, 5);
      ctx.fillStyle = i < p.heartPieces ? COL_M : COL_L;
      ctx.fillRect(px, py, 4, 3);
      if (i >= p.heartPieces) {
        ctx.fillStyle = COL_D;
        ctx.fillRect(px + 1, py + 1, 2, 1);
      }
    }
  }

  // Active live combo counter badge below hearts (never collides with top-center banners!)
  if (state.combo >= 2) {
    const cy = p.heartPieces > 0 ? 19 : 14;
    const comboCol = state.combo >= WELL_CONSTANTS.COMBO_TIER_1 ? COL_M : COL_L;
    drawBitmapTextOutlined(ctx, `${state.combo}X`, 4, cy, comboCol, COL_D, 1, 'left');
  }

  // --------------------------------------------------------------------------
  // 2. Top-Right: Faceted Gem Counter + Gem High Streak Bar
  // --------------------------------------------------------------------------
  const gemRightX = viewW - 4;
  const gemStr = String(state.gems);
  const gemTextW = measureBitmapText(gemStr, 1);
  const gemIconX = Math.max(82, gemRightX - gemTextW - 8);
  ctx.fillStyle = COL_D;
  ctx.fillRect(gemIconX - 2, 2, gemRightX - gemIconX + 4, 10);
  drawBitmapTextOutlined(
    ctx,
    gemStr,
    gemRightX,
    4,
    state.gemHigh && ((tick >> 2) & 1) === 0 ? COL_M : COL_L,
    COL_D,
    1,
    'right',
  );
  drawMiniGem(ctx, gemIconX, 4);

  // Gem High progress / active timer bar neatly tucked right under gem readout
  if (state.gemStreak > 0 || state.gemHigh) {
    const barW = 44;
    const barH = 5;
    const barX = viewW - barW - 4;
    const barY = 14;
    const ratio = state.gemHigh
      ? Math.max(0, Math.min(1, state.gemStreakTimer / WELL_CONSTANTS.GEM_STREAK_TIMER))
      : Math.max(0, Math.min(1, state.gemStreak / WELL_CONSTANTS.GEM_HIGH_THRESHOLD));
    const fillW = Math.round((barW - 2) * ratio);
    const borderCol = state.gemHigh && ((tick >> 2) & 1) === 0 ? COL_M : COL_L;
    drawPixelBox(ctx, barX, barY, barW, barH, borderCol);
    if (fillW > 0) {
      ctx.fillStyle = state.gemHigh ? COL_M : COL_L;
      ctx.fillRect(barX + 1, barY + 1, fillW, barH - 2);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Right-Edge Vertical Segmented Gunboot Charge Meter (with recoil jiggle!)
  // --------------------------------------------------------------------------
  const jiggleX = p.meterJiggleTicks > 0 ? ((p.meterJiggleTicks & 1) === 0 ? -1 : 1) : 0;
  const chgW = 6;
  const chgH = 72;
  const chgX = viewW - 8 + jiggleX;
  const chgY = 34;

  const emptyFlash = p.ammo <= 0 && ((tick >> 2) & 1) === 0;
  drawPixelBox(ctx, chgX - 1, chgY - 1, chgW + 2, chgH + 2, emptyFlash ? COL_M : COL_L);

  const ammoRatio = Math.max(0, Math.min(1, p.ammo / Math.max(1, p.ammoMax)));
  const fillH = Math.round(chgH * ammoRatio);
  if (fillH > 0) {
    ctx.fillStyle = p.jetpackActive ? COL_S : state.gemHigh ? COL_M : COL_L;
    ctx.fillRect(chgX + 1, chgY + chgH - fillH, chgW - 2, fillH);
    // Crisp horizontal arcade charge segment notches
    ctx.fillStyle = COL_D;
    for (let ny = chgY + chgH - 8; ny > chgY + chgH - fillH; ny -= 8) {
      ctx.fillRect(chgX + 1, ny, chgW - 2, 1);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Bottom Strip: Stage Tag (Left) | O2 Bar (Center) | Weapon & Ammo (Right)
  // --------------------------------------------------------------------------
  const stageShort = state.area === 0 ? 'SURF' : `${state.area}-${state.level}`;
  const stageW = measureBitmapText(stageShort, 1) + 6;
  ctx.fillStyle = COL_D;
  ctx.fillRect(2, viewH - 11, stageW, 9);
  drawBitmapTextOutlined(ctx, stageShort, 5, viewH - 10, COL_L, COL_D, 1, 'left');

  const weapon = getWeaponDef(p.weaponId);
  const wShortW = measureBitmapText(weapon.shortName, 1);
  const ammoStr = `${p.ammo}/${p.ammoMax}`;
  const ammoW = measureBitmapText(ammoStr, 1);
  const rightPillW = Math.max(wShortW, ammoW) + 6;
  ctx.fillStyle = COL_D;
  ctx.fillRect(viewW - rightPillW - 1, viewH - 21, rightPillW + 1, 20);
  drawBitmapTextOutlined(
    ctx,
    weapon.shortName,
    viewW - 3,
    viewH - 19,
    state.gemHigh ? COL_M : COL_L,
    COL_D,
    1,
    'right',
  );
  drawBitmapTextOutlined(
    ctx,
    ammoStr,
    viewW - 3,
    viewH - 10,
    p.ammo <= 0 ? COL_M : COL_L,
    COL_D,
    1,
    'right',
  );

  // Aquifer Oxygen Gauge — centered cleanly between Stage Tag and Weapon/Ammo!
  if (p.inWater || p.oxygen < WELL_CONSTANTS.OXYGEN_MAX) {
    const oxW = 54;
    const oxH = 6;
    const oxX = 56;
    const oxY = viewH - 10;
    const lowOx = p.oxygen <= 25;
    const flash = lowOx && ((tick >> 2) & 1) === 0;
    drawBitmapTextOutlined(ctx, 'O2', oxX - 3, oxY - 1, flash ? COL_M : COL_S, COL_D, 1, 'right');
    drawPixelBox(ctx, oxX, oxY, oxW, oxH, flash ? COL_M : COL_L);
    const oFill = Math.round((oxW - 2) * Math.max(0, Math.min(1, p.oxygen / WELL_CONSTANTS.OXYGEN_MAX)));
    if (oFill > 0) {
      ctx.fillStyle = flash ? COL_M : COL_S;
      ctx.fillRect(oxX + 1, oxY + 1, oFill, oxH - 2);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Boss HP Bar Anchored Cleanly at Bottom-Center (Zero Player/Combo Overlap!)
  // --------------------------------------------------------------------------
  if (bossActive && state.boss) {
    const boss = state.boss;
    const bw = 114;
    const bx = Math.floor((viewW - bw) * 0.5);
    const labelY = viewH - 36;
    const barY = viewH - 27;
    ctx.fillStyle = COL_D;
    ctx.fillRect(bx - 2, labelY - 2, bw + 4, 18);
    drawBitmapTextOutlined(ctx, 'ABYSSAL LEVIATHAN', viewW * 0.5, labelY, COL_M, COL_D, 1, 'center');
    drawPixelBox(ctx, bx, barY, bw, 7, COL_L);
    const hpRatio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
    const hpFill = Math.round((bw - 2) * hpRatio);
    if (hpFill > 0) {
      ctx.fillStyle = boss.state === 2 ? COL_L : COL_M;
      ctx.fillRect(bx + 1, barY + 1, hpFill, 5);
    }
    // 4-phase milestone notch dividers
    ctx.fillStyle = COL_D;
    for (let ph = 1; ph < 4; ph++) {
      const divX = bx + Math.round((bw * ph) / 4);
      ctx.fillRect(divX, barY + 1, 1, 5);
    }
  }

  // --------------------------------------------------------------------------
  // 6. Strict Non-Overlapping Top-Center Stack: Stage Banner -> Combo Popup
  // --------------------------------------------------------------------------
  let centerStackY = 23;

  const ticksIntoStage = state.runStats.elapsedTicks - state.runStats.stageStartTick;
  if (state.mode === 'surface') {
    const bw = 116;
    const bx = Math.floor((viewW - bw) * 0.5);
    drawPixelBox(ctx, bx, 18, bw, 15, COL_L);
    drawBitmapTextOutlined(ctx, 'JUMP IN THE WELL', viewW * 0.5, 22, COL_M, COL_D, 1, 'center');
    centerStackY = 38;
  } else if (
    !bossActive &&
    ((ticksIntoStage >= 0 && ticksIntoStage < 130) || state.stageTransitionTicks > 0)
  ) {
    const areaName = AREA_NAMES[state.area] ?? 'WELL';
    const stageCode = state.area === 5 ? '5-1' : `${state.area}-${state.level}`;
    const banner = state.hardMode ? `${stageCode} ${areaName}!` : `${stageCode} ${areaName}`;
    const bw = Math.min(144, measureBitmapText(banner, 1) + 14);
    const bx = Math.floor((viewW - bw) * 0.5);
    drawPixelBox(ctx, bx, centerStackY, bw, 15, COL_L);
    drawBitmapTextOutlined(ctx, banner, viewW * 0.5, centerStackY + 4, COL_L, COL_D, 1, 'center');
    centerStackY += 19;
  }

  // Combo Cashout Popup (Always stacked below Boss / Stage Banner — Zero Overlap!)
  if (state.comboPopup && state.comboPopup.timer > 0) {
    const popup = state.comboPopup;
    const tierCol = popup.count >= WELL_CONSTANTS.COMBO_TIER_1 ? COL_M : COL_L;
    drawBitmapTextOutlined(
      ctx,
      `${popup.count} COMBO!`,
      viewW * 0.5,
      centerStackY + 2,
      tierCol,
      COL_D,
      1,
      'center',
    );
    if (popup.rewardText) {
      drawBitmapTextOutlined(
        ctx,
        popup.rewardText,
        viewW * 0.5,
        centerStackY + 12,
        COL_L,
        COL_D,
        1,
        'center',
      );
    }
  }

  // Shop / Interaction Prompt Banner (Well above bottom HUD row!)
  if (state.shopPromptText) {
    const bw = Math.min(viewW - 12, measureBitmapText(state.shopPromptText, 1) + 12);
    const bx = Math.floor((viewW - bw) * 0.5);
    const by = viewH - 36;
    drawPixelBox(ctx, bx, by, bw, 14, COL_L);
    drawBitmapTextOutlined(ctx, state.shopPromptText, viewW * 0.5, by + 4, COL_L, COL_D, 1, 'center');
  }
}
