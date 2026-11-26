import { AREA_NAMES, WELL_CONSTANTS, type SimState } from '../contracts/index.ts';
import { getWeaponDef } from '../data/weapons.ts';
import { drawBitmapText, drawBitmapTextOutlined } from '../render/BitmapFont.ts';

// ============================================================================
// Krunked Well — In-Well Semantic Pixel HUD Renderer (160 x 284)
// Draws strictly in the 4 semantic RGB keys (L=#FFFFFF, M=#FF0000, D=#000000,
// S=#007EFF) so the WebGL2 palette shader remaps the HUD across all 38 palettes.
// ============================================================================

const COL_L = '#FFFFFF';
const COL_M = '#FF0000';
const COL_D = '#000000';
const COL_S = '#007EFF';

function drawMiniHeart(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean): void {
  // 7x6 crisp pixel heart with dark 1px backing
  ctx.fillStyle = COL_D;
  ctx.fillRect(x, y, 9, 8);
  const ch = filled ? COL_M : COL_L;
  ctx.fillStyle = ch;
  ctx.fillRect(x + 2, y + 1, 2, 1);
  ctx.fillRect(x + 5, y + 1, 2, 1);
  ctx.fillRect(x + 1, y + 2, 7, 2);
  ctx.fillRect(x + 2, y + 4, 5, 1);
  ctx.fillRect(x + 3, y + 5, 3, 1);
  ctx.fillRect(x + 4, y + 6, 1, 1);
  if (filled) {
    ctx.fillStyle = COL_L;
    ctx.fillRect(x + 2, y + 2, 1, 1);
  } else {
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

export function drawWellHud(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  paletteIndex: number,
  tick: number,
): void {
  // Keep paletteIndex cleanly referenced; actual colors pass through shader remap.
  void paletteIndex;

  if (state.mode === 'title') {
    return;
  }

  const p = state.player;
  const viewW = WELL_CONSTANTS.VIEW_W;
  const viewH = WELL_CONSTANTS.VIEW_H;

  // --------------------------------------------------------------------------
  // 1. Top-Left: HP Hearts + Heart Pieces
  // --------------------------------------------------------------------------
  const hpX = 3;
  const hpY = 3;
  if (p.hpMax <= 7) {
    for (let i = 0; i < p.hpMax; i++) {
      drawMiniHeart(ctx, hpX + i * 9, hpY, i < p.hp);
    }
  } else {
    drawMiniHeart(ctx, hpX, hpY, p.hp > 0);
    drawBitmapTextOutlined(ctx, `${p.hp}/${p.hpMax}`, hpX + 11, hpY + 1, COL_L, COL_D, 1, 'left');
  }

  // Heart piece progress bar (4 pips)
  if (p.heartPieces > 0) {
    const py = hpY + 10;
    ctx.fillStyle = COL_D;
    ctx.fillRect(hpX, py, 21, 5);
    ctx.fillStyle = COL_L;
    ctx.fillRect(hpX, py, 21, 1);
    ctx.fillRect(hpX, py + 4, 21, 1);
    ctx.fillRect(hpX, py, 1, 5);
    ctx.fillRect(hpX + 20, py, 1, 5);
    for (let i = 0; i < WELL_CONSTANTS.HEART_PIECE_MAX; i++) {
      ctx.fillStyle = i < p.heartPieces ? COL_M : COL_D;
      ctx.fillRect(hpX + 2 + i * 4 + i, py + 1, 3, 3);
    }
  }

  // --------------------------------------------------------------------------
  // 2. Top-Right: Gems & Gem High Streak Bar
  // --------------------------------------------------------------------------
  const gemRightX = viewW - 11;
  const gemStr = String(state.gems);
  drawBitmapTextOutlined(ctx, gemStr, gemRightX, 4, COL_L, COL_D, 1, 'right');
  const gemIconX = gemRightX - gemStr.length * 6 - 7;
  drawMiniGem(ctx, Math.max(76, gemIconX), 4);

  // Gem High streak bar (width 42px)
  const barW = 42;
  const barX = gemRightX - barW;
  const barY = 13;
  if (state.gemStreak > 0 || state.gemHigh) {
    const warnBlink = state.gemHigh && state.gemStreakTimer <= WELL_CONSTANTS.GEM_HIGH_WARN_TICKS;
    const flash = state.gemHigh && ((tick >> (warnBlink ? 1 : 2)) & 1) === 0;
    ctx.fillStyle = COL_D;
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    ctx.fillStyle = flash ? COL_M : COL_L;
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 1);
    ctx.fillRect(barX - 1, barY + 3, barW + 2, 1);
    ctx.fillRect(barX - 1, barY - 1, 1, 5);
    ctx.fillRect(barX + barW, barY - 1, 1, 5);

    const ratio = state.gemHigh
      ? Math.max(0, Math.min(1, state.gemStreakTimer / WELL_CONSTANTS.GEM_STREAK_TIMER))
      : Math.max(0, Math.min(1, state.gemStreak / WELL_CONSTANTS.GEM_HIGH_THRESHOLD));
    const fillW = Math.round(barW * ratio);
    ctx.fillStyle = flash ? COL_L : COL_M;
    ctx.fillRect(barX, barY, fillW, 3);
  }

  // --------------------------------------------------------------------------
  // 3. Right Shaft Edge: Vertical Gunboot Charge Bar with Jiggle Feedback
  // --------------------------------------------------------------------------
  const jiggleX =
    p.meterJiggleTicks > 0 ? Math.round(Math.sin(tick * 2.3) * Math.min(2, p.meterJiggleTicks * 0.35)) : 0;
  const jiggleY =
    p.meterJiggleTicks > 0 ? Math.round(Math.cos(tick * 1.9) * Math.min(1, p.meterJiggleTicks * 0.25)) : 0;

  const chgW = 6;
  const chgH = 72;
  const chgX = viewW - 8 + jiggleX;
  const chgY = 28 + jiggleY;
  const emptyBlink = p.ammo <= 0 && ((tick >> 2) & 1) === 0;

  ctx.fillStyle = COL_D;
  ctx.fillRect(chgX - 1, chgY - 1, chgW + 2, chgH + 2);
  ctx.fillStyle = emptyBlink ? COL_M : COL_L;
  ctx.fillRect(chgX - 1, chgY - 1, chgW + 2, 1);
  ctx.fillRect(chgX - 1, chgY + chgH, chgW + 2, 1);
  ctx.fillRect(chgX - 1, chgY - 1, 1, chgH + 2);
  ctx.fillRect(chgX + chgW, chgY - 1, 1, chgH + 2);

  const ammoMax = Math.max(1, p.ammoMax);
  const ammoRatio = Math.max(0, Math.min(1, p.ammo / ammoMax));
  const fillH = Math.round(chgH * ammoRatio);
  const fillCol = p.jetpackActive ? COL_S : state.gemHigh ? COL_M : COL_L;
  if (fillH > 0) {
    ctx.fillStyle = fillCol;
    ctx.fillRect(chgX + 1, chgY + chgH - fillH, chgW - 2, fillH);
    // Crisp segment ticks when ammoMax <= 16
    if (ammoMax <= 16 && ammoMax > 1) {
      ctx.fillStyle = COL_D;
      for (let s = 1; s < ammoMax; s++) {
        const sy = Math.round(chgY + chgH - (s / ammoMax) * chgH);
        ctx.fillRect(chgX + 1, sy, chgW - 2, 1);
      }
    }
  }

  // Weapon short badge & numeric charge bottom-right
  const weapon = getWeaponDef(p.weaponId);
  drawBitmapTextOutlined(
    ctx,
    weapon.shortName,
    viewW - 3,
    viewH - 18,
    state.gemHigh ? COL_M : COL_L,
    COL_D,
    1,
    'right',
  );
  drawBitmapTextOutlined(
    ctx,
    `${p.ammo}/${p.ammoMax}`,
    viewW - 3,
    viewH - 9,
    p.ammo <= 0 ? COL_M : COL_L,
    COL_D,
    1,
    'right',
  );

  // --------------------------------------------------------------------------
  // 4. Aquifer Oxygen Bar (when underwater or oxygen < 100)
  // --------------------------------------------------------------------------
  if (p.inWater || p.oxygen < WELL_CONSTANTS.OXYGEN_MAX) {
    const oxW = 64;
    const oxH = 5;
    const oxX = Math.floor((viewW - oxW) / 2);
    const oxY = viewH - 13;
    const lowOx = p.oxygen <= 25;
    const lowFlash = lowOx && ((tick >> 2) & 1) === 0;

    drawBitmapTextOutlined(ctx, 'O2', oxX - 14, oxY - 1, lowFlash ? COL_M : COL_S, COL_D, 1, 'left');
    ctx.fillStyle = COL_D;
    ctx.fillRect(oxX - 1, oxY - 1, oxW + 2, oxH + 2);
    ctx.fillStyle = lowFlash ? COL_M : COL_L;
    ctx.fillRect(oxX - 1, oxY - 1, oxW + 2, 1);
    ctx.fillRect(oxX - 1, oxY + oxH, oxW + 2, 1);
    ctx.fillRect(oxX - 1, oxY - 1, 1, oxH + 2);
    ctx.fillRect(oxX + oxW, oxY - 1, 1, oxH + 2);

    const oFill = Math.round(oxW * Math.max(0, Math.min(1, p.oxygen / WELL_CONSTANTS.OXYGEN_MAX)));
    ctx.fillStyle = lowFlash ? COL_M : COL_S;
    ctx.fillRect(oxX, oxY, oFill, oxH);
  }

  // --------------------------------------------------------------------------
  // 5. Combo Counter Badge & Combo Cashout Popup
  // --------------------------------------------------------------------------
  if (state.combo >= 2) {
    const tierHit = state.combo >= WELL_CONSTANTS.COMBO_TIER_1;
    const cx = 4;
    const cy = 24;
    const label = `${state.combo}X`;
    const bw = label.length * 6 + 6;
    ctx.fillStyle = COL_D;
    ctx.fillRect(cx, cy, bw, 11);
    ctx.fillStyle = tierHit ? COL_M : COL_L;
    ctx.fillRect(cx, cy, bw, 1);
    ctx.fillRect(cx, cy + 10, bw, 1);
    ctx.fillRect(cx, cy, 1, 11);
    ctx.fillRect(cx + bw - 1, cy, 1, 11);
    drawBitmapText(ctx, label, cx + 3, cy + 2, tierHit ? COL_M : COL_L, 1, 'left');
  }

  if (state.comboPopup && state.comboPopup.timer > 0) {
    const popup = state.comboPopup;
    const py = 44;
    const mainText = `${popup.count} COMBO!`;
    drawBitmapTextOutlined(
      ctx,
      mainText,
      viewW / 2,
      py,
      popup.count >= WELL_CONSTANTS.COMBO_TIER_1 ? COL_M : COL_L,
      COL_D,
      1,
      'center',
    );
    if (popup.rewardText) {
      drawBitmapTextOutlined(ctx, popup.rewardText, viewW / 2, py + 10, COL_L, COL_D, 1, 'center');
    }
  }

  // --------------------------------------------------------------------------
  // 6. Stage Banner (Start of Stage or Surface)
  // --------------------------------------------------------------------------
  const ticksIntoStage = state.runStats.elapsedTicks - state.runStats.stageStartTick;
  if (state.mode === 'surface') {
    drawBitmapTextOutlined(ctx, 'SURFACE', viewW / 2, 30, COL_L, COL_D, 1, 'center');
    drawBitmapTextOutlined(ctx, 'DROP INTO WELL', viewW / 2, 41, COL_M, COL_D, 1, 'center');
  } else if (
    (ticksIntoStage >= 0 && ticksIntoStage < 140) ||
    state.stageTransitionTicks > 0
  ) {
    const areaName = AREA_NAMES[state.area] ?? 'WELL';
    const stageCode = state.area === 5 ? '5-1' : `${state.area}-${state.level}`;
    const banner = state.hardMode ? `${stageCode} ${areaName} [H]` : `${stageCode} ${areaName}`;
    const boxW = Math.min(viewW - 12, banner.length * 6 + 10);
    const bx = Math.floor((viewW - boxW) / 2);
    const by = 32;
    ctx.fillStyle = COL_D;
    ctx.fillRect(bx, by, boxW, 13);
    ctx.fillStyle = COL_L;
    ctx.fillRect(bx, by, boxW, 1);
    ctx.fillRect(bx, by + 12, boxW, 1);
    ctx.fillRect(bx, by, 1, 13);
    ctx.fillRect(bx + boxW - 1, by, 1, 13);
    drawBitmapText(ctx, banner, viewW / 2, by + 3, COL_L, 1, 'center');
  }

  // --------------------------------------------------------------------------
  // 7. Boss HP Bar (Area 5 Abyss)
  // --------------------------------------------------------------------------
  if (state.boss && state.boss.active && !state.boss.defeated) {
    const b = state.boss;
    const bW = 108;
    const bH = 6;
    const bX = Math.floor((viewW - bW) / 2);
    const bY = 23;
    drawBitmapTextOutlined(ctx, 'ABYSSAL LEVIATHAN', viewW / 2, bY - 9, COL_M, COL_D, 1, 'center');
    ctx.fillStyle = COL_D;
    ctx.fillRect(bX - 1, bY - 1, bW + 2, bH + 2);
    ctx.fillStyle = COL_L;
    ctx.fillRect(bX - 1, bY - 1, bW + 2, 1);
    ctx.fillRect(bX - 1, bY + bH, bW + 2, 1);
    ctx.fillRect(bX - 1, bY - 1, 1, bH + 2);
    ctx.fillRect(bX + bW, bY - 1, 1, bH + 2);

    const ratio = Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp)));
    const fill = Math.round(bW * ratio);
    ctx.fillStyle = b.hitFlashTicks > 0 ? COL_L : COL_M;
    ctx.fillRect(bX, bY, fill, bH);

    // 4-phase divider ticks
    ctx.fillStyle = COL_D;
    for (let ph = 1; ph < WELL_CONSTANTS.BOSS_PHASES; ph++) {
      const tx = bX + Math.round((bW * ph) / WELL_CONSTANTS.BOSS_PHASES);
      ctx.fillRect(tx, bY, 1, bH);
    }
  }

  // --------------------------------------------------------------------------
  // 8. Shop Prompt Banner
  // --------------------------------------------------------------------------
  if (state.shopPromptText) {
    const txt = state.shopPromptText;
    const bw = Math.min(viewW - 8, txt.length * 6 + 10);
    const bx = Math.floor((viewW - bw) / 2);
    const by = viewH - 34;
    ctx.fillStyle = COL_D;
    ctx.fillRect(bx, by, bw, 13);
    ctx.fillStyle = COL_L;
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillRect(bx, by + 12, bw, 1);
    ctx.fillRect(bx, by, 1, 13);
    ctx.fillRect(bx + bw - 1, by, 1, 13);
    drawBitmapText(ctx, txt, viewW / 2, by + 3, COL_L, 1, 'center');
  }

  // --------------------------------------------------------------------------
  // 9. Compact Stage Indicator Bottom-Left
  // --------------------------------------------------------------------------
  const stageTag = state.area === 0 ? '0-0' : `${state.area}-${state.level}`;
  drawBitmapTextOutlined(ctx, stageTag, 4, viewH - 9, COL_L, COL_D, 1, 'left');
}
