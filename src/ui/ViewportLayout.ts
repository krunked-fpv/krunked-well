import {
  AREA_NAMES,
  WELL_CONSTANTS,
  type InputSource,
  type RenderSettings,
  type SimState,
} from '../contracts/index.ts';
import { getPalette } from '../data/palettes.ts';
import { getStyleDef } from '../data/styles.ts';
import { getUpgradeDef } from '../data/upgrades.ts';
import { getWeaponDef } from '../data/weapons.ts';
import {
  getPaletteHex,
  renderPixelGemSvg,
  renderPixelHeartSvg,
  renderPixelLogoSvg,
  renderPixelUpgradeIconSvg,
} from './PixelUiIcons.ts';

// ============================================================================
// Krunked Well — Authentic 4-Color Palette-Synced Retro Arcade Viewport Layout
// Supports Mobile Portrait, Desktop Landscape, and Tesla Landscape (1280x720+),
// Integer/Fit pixel scaling, Tate rotation (0/90/270), and razor-sharp pixel
// side panels strictly synced to all 38 unlockable palettes!
// ============================================================================

export type ViewportLayoutMode = 'portrait' | 'landscape' | 'tesla';

export class ViewportLayout {
  private readonly rootEl: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private settings: RenderSettings;
  private paletteIndex = 0;
  private layoutMode: ViewportLayoutMode = 'landscape';

  private readonly stageEl: HTMLDivElement;
  private readonly leftPanel: HTMLElement;
  private readonly centerWell: HTMLDivElement;
  private readonly canvasFrame: HTMLDivElement;
  private readonly rightPanel: HTMLElement;
  private readonly portraitFooterEl: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;

  // Left Panel Live Slots
  private readonly logoSlotEl: HTMLElement;
  private readonly hpValEl: HTMLElement;
  private readonly stageValEl: HTMLElement;
  private readonly biomePipsEl: HTMLElement;
  private readonly weaponValEl: HTMLElement;
  private readonly chargeFillEl: HTMLElement;
  private readonly chargeTextEl: HTMLElement;
  private readonly comboValEl: HTMLElement;
  private readonly paletteBadgeEl: HTMLElement;

  // Right Panel Live Slots
  private readonly gemsValEl: HTMLElement;
  private readonly gemHighEl: HTMLElement;
  private readonly gemStreakFillEl: HTMLElement;
  private readonly styleValEl: HTMLElement;
  private readonly upgradesListEl: HTMLElement;
  private readonly controlsHintEl: HTMLElement;

  private lastHudKey = '';
  private toastTimeout: number | null = null;
  private readonly onResizeBound: () => void;

  constructor(rootEl: HTMLElement, canvas: HTMLCanvasElement, settings: RenderSettings) {
    this.rootEl = rootEl;
    this.canvas = canvas;
    this.settings = settings;

    this.stageEl = document.createElement('div');
    this.stageEl.id = 'krunked-stage';
    Object.assign(this.stageEl.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      boxSizing: 'border-box',
      fontFamily: 'var(--kw-font-pixel)',
    });

    const panelBaseStyle: Partial<CSSStyleDeclaration> = {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      width: '236px',
      maxWidth: '24vw',
      padding: '14px',
      gap: '10px',
      border: '2px solid #ffffff',
      borderRadius: '0px',
      boxSizing: 'border-box',
      flexShrink: '0',
      overflow: 'hidden',
    };

    // ---- Left Retro Arcade Panel ----
    this.leftPanel = document.createElement('aside');
    this.leftPanel.id = 'krunked-panel-left';
    Object.assign(this.leftPanel.style, panelBaseStyle);

    this.leftPanel.innerHTML = `
      <div style="text-align:center;padding-bottom:10px;border-bottom:2px solid currentColor;">
        <div data-slot="logo"></div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;flex:1;">
        <div class="kw-px-cell">
          <div class="kw-px-label">HP</div>
          <div data-slot="hp" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:18px;margin-top:4px;"></div>
        </div>

        <div class="kw-px-cell">
          <div class="kw-px-label">DEPTH</div>
          <div data-slot="stage" style="font-size:12px;font-weight:800;letter-spacing:0.06em;margin-top:3px;">1-1 CAVERN</div>
          <div data-slot="biome-pips" style="display:flex;gap:4px;margin-top:6px;"></div>
        </div>

        <div class="kw-px-cell">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="kw-px-label">GUNBOOTS</span>
            <span data-slot="charge-text" style="font-size:11px;font-weight:800;">8/8</span>
          </div>
          <div data-slot="weapon" style="font-size:12px;font-weight:800;letter-spacing:0.06em;margin-top:3px;">MACHINEGUN</div>
          <div style="margin-top:6px;height:10px;border:2px solid currentColor;padding:1px;box-sizing:border-box;">
            <div data-slot="charge-fill" style="height:100%;width:100%;"></div>
          </div>
        </div>

        <div class="kw-px-cell">
          <div class="kw-px-label">COMBO</div>
          <div data-slot="combo" style="font-size:15px;font-weight:900;margin-top:2px;">--</div>
          <div style="font-size:9px;opacity:0.7;margin-top:3px;letter-spacing:0.05em;">8:GEMS 15:CHG 25:HP</div>
        </div>
      </div>

      <div data-slot="palette-badge" style="margin-top:auto;text-align:center;font-size:10px;font-weight:800;letter-spacing:0.08em;padding-top:8px;border-top:2px solid currentColor;opacity:0.85;">
        PAL #0 KRUNKED
      </div>
    `;

    this.logoSlotEl = this.leftPanel.querySelector('[data-slot="logo"]') as HTMLElement;
    this.hpValEl = this.leftPanel.querySelector('[data-slot="hp"]') as HTMLElement;
    this.stageValEl = this.leftPanel.querySelector('[data-slot="stage"]') as HTMLElement;
    this.biomePipsEl = this.leftPanel.querySelector('[data-slot="biome-pips"]') as HTMLElement;
    this.weaponValEl = this.leftPanel.querySelector('[data-slot="weapon"]') as HTMLElement;
    this.chargeFillEl = this.leftPanel.querySelector('[data-slot="charge-fill"]') as HTMLElement;
    this.chargeTextEl = this.leftPanel.querySelector('[data-slot="charge-text"]') as HTMLElement;
    this.comboValEl = this.leftPanel.querySelector('[data-slot="combo"]') as HTMLElement;
    this.paletteBadgeEl = this.leftPanel.querySelector('[data-slot="palette-badge"]') as HTMLElement;

    // ---- Center Native Pixel Well Bezel ----
    this.centerWell = document.createElement('div');
    this.centerWell.id = 'krunked-center-well';
    Object.assign(this.centerWell.style, {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    });

    this.canvasFrame = document.createElement('div');
    this.canvasFrame.id = 'krunked-canvas-frame';
    Object.assign(this.canvasFrame.style, {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'content-box',
      border: '3px solid #ffffff',
      borderRadius: '0px',
      overflow: 'hidden',
    });

    Object.assign(this.canvas.style, {
      display: 'block',
      imageRendering: 'pixelated',
      transformOrigin: 'center center',
    });

    this.canvasFrame.appendChild(this.canvas);
    this.centerWell.appendChild(this.canvasFrame);

    // ---- Right Retro Arcade Panel ----
    this.rightPanel = document.createElement('aside');
    this.rightPanel.id = 'krunked-panel-right';
    Object.assign(this.rightPanel.style, panelBaseStyle);

    this.rightPanel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;">
        <div class="kw-px-cell">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="kw-px-label">GEMS</span>
            <span data-slot="gemhigh" style="font-size:10px;font-weight:900;"></span>
          </div>
          <div data-slot="gems" style="display:flex;align-items:center;gap:6px;font-size:18px;font-weight:900;margin-top:4px;">0</div>
          <div style="margin-top:6px;height:8px;border:2px solid currentColor;padding:1px;box-sizing:border-box;">
            <div data-slot="gem-streak-fill" style="height:100%;width:0%;"></div>
          </div>
        </div>

        <div class="kw-px-cell">
          <div class="kw-px-label">STYLE</div>
          <div data-slot="style" style="font-size:12px;font-weight:800;margin-top:3px;letter-spacing:0.06em;">STANDARD</div>
        </div>

        <div class="kw-px-cell" style="flex:1;display:flex;flex-direction:column;min-height:0;">
          <div class="kw-px-label" style="margin-bottom:6px;">UPGRADES</div>
          <div data-slot="upgrades" style="display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1;"></div>
        </div>
      </div>

      <div style="border-top:2px solid currentColor;padding-top:8px;">
        <div class="kw-px-label" style="margin-bottom:5px;">CONTROLS</div>
        <div data-slot="controls" style="font-size:10px;line-height:1.65;"></div>
      </div>
    `;

    this.gemsValEl = this.rightPanel.querySelector('[data-slot="gems"]') as HTMLElement;
    this.gemHighEl = this.rightPanel.querySelector('[data-slot="gemhigh"]') as HTMLElement;
    this.gemStreakFillEl = this.rightPanel.querySelector('[data-slot="gem-streak-fill"]') as HTMLElement;
    this.styleValEl = this.rightPanel.querySelector('[data-slot="style"]') as HTMLElement;
    this.upgradesListEl = this.rightPanel.querySelector('[data-slot="upgrades"]') as HTMLElement;
    this.controlsHintEl = this.rightPanel.querySelector('[data-slot="controls"]') as HTMLElement;

    // ---- Top-Center Retro Arcade Toast ----
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'krunked-toast';
    Object.assign(this.toastEl.style, {
      position: 'fixed',
      top: '14px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '70',
      padding: '6px 14px',
      border: '2px solid #ffffff',
      borderRadius: '0px',
      background: '#000000',
      color: '#ffffff',
      fontFamily: 'var(--kw-font-pixel)',
      fontSize: '12px',
      fontWeight: '800',
      letterSpacing: '0.1em',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 140ms steps(4)',
      whiteSpace: 'nowrap',
    });

    // ---- Mobile Portrait Lower Console Bezel ----
    this.portraitFooterEl = document.createElement('div');
    this.portraitFooterEl.id = 'krunked-portrait-crest';
    Object.assign(this.portraitFooterEl.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      height: '108px',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      pointerEvents: 'none',
      zIndex: '10',
    });

    this.stageEl.appendChild(this.leftPanel);
    this.stageEl.appendChild(this.centerWell);
    this.stageEl.appendChild(this.rightPanel);
    this.stageEl.appendChild(this.portraitFooterEl);
    this.stageEl.appendChild(this.toastEl);
    this.rootEl.appendChild(this.stageEl);

    this.onResizeBound = () => this.resize();
    window.addEventListener('resize', this.onResizeBound);

    this.applyPaletteTheme();
    this.resize();
  }

  private applyPaletteTheme(): void {
    const pal = getPaletteHex(this.paletteIndex);
    const palDef = getPalette(this.paletteIndex);

    document.body.style.background = pal.dark;
    document.body.style.color = pal.light;

    this.stageEl.style.background = pal.dark;
    this.stageEl.style.color = pal.light;
    this.stageEl.style.setProperty('--kw-light', pal.light);
    this.stageEl.style.setProperty('--kw-mid', pal.mid);
    this.stageEl.style.setProperty('--kw-dark', pal.dark);
    this.stageEl.style.setProperty('--kw-special', pal.special);

    this.leftPanel.style.background = pal.dark;
    this.leftPanel.style.borderColor = pal.light;
    this.leftPanel.style.color = pal.light;

    this.rightPanel.style.background = pal.dark;
    this.rightPanel.style.borderColor = pal.light;
    this.rightPanel.style.color = pal.light;

    this.canvasFrame.style.borderColor = pal.light;
    this.canvasFrame.style.boxShadow = `0 0 0 3px ${pal.dark}, 0 0 0 5px ${pal.mid}`;

    this.toastEl.style.background = pal.dark;
    this.toastEl.style.borderColor = pal.light;
    this.toastEl.style.color = pal.light;
    this.gemHighEl.style.color = pal.mid;

    this.logoSlotEl.innerHTML = renderPixelLogoSvg(pal, 174);
    this.paletteBadgeEl.textContent = `PAL #${palDef.id} ${palDef.name}`;
    this.portraitFooterEl.innerHTML = `
      ${renderPixelLogoSvg(pal, 148)}
      <div style="font-size:10px;font-weight:800;letter-spacing:0.14em;color:${pal.light};opacity:0.75;">TAP FOR TOUCH CONTROLS</div>
    `;
  }

  updateSettings(settings: RenderSettings, paletteIndex: number): void {
    this.settings = settings;
    this.paletteIndex = paletteIndex;
    this.lastHudKey = '';
    this.applyPaletteTheme();
    this.resize();
  }

  resize(): void {
    const vw = Math.max(240, window.innerWidth || 1280);
    const vh = Math.max(240, window.innerHeight || 720);
    const aspect = vw / vh;

    if (aspect < 0.85) {
      this.layoutMode = 'portrait';
    } else if (vw >= 1200 && vh >= 660) {
      this.layoutMode = 'tesla';
    } else {
      this.layoutMode = 'landscape';
    }

    const showSidePanels = this.layoutMode !== 'portrait' && vw >= 720;
    this.leftPanel.style.display = showSidePanels ? 'flex' : 'none';
    this.rightPanel.style.display = showSidePanels ? 'flex' : 'none';
    this.portraitFooterEl.style.display = this.layoutMode === 'portrait' ? 'flex' : 'none';

    const bezelPadX = this.layoutMode === 'tesla' ? 36 : showSidePanels ? 16 : 6;
    const bezelPadTop = this.layoutMode === 'portrait' ? 8 : 16;
    const bezelPadBottom = this.layoutMode === 'portrait' ? 114 : 16;
    const panelGap = this.layoutMode === 'tesla' ? 24 : 14;

    this.stageEl.style.alignItems = this.layoutMode === 'portrait' ? 'flex-start' : 'center';
    this.stageEl.style.padding = `${bezelPadTop}px ${bezelPadX}px ${bezelPadBottom}px ${bezelPadX}px`;
    this.stageEl.style.gap = `${panelGap}px`;

    const sidePanelW = showSidePanels ? Math.min(248, Math.max(186, Math.floor(vw * 0.2))) : 0;
    if (showSidePanels) {
      this.leftPanel.style.width = `${sidePanelW}px`;
      this.rightPanel.style.width = `${sidePanelW}px`;
    }

    const availW = Math.max(
      160,
      vw - bezelPadX * 2 - (showSidePanels ? sidePanelW * 2 + panelGap * 2 : 0) - 12,
    );
    const availH = Math.max(160, vh - bezelPadTop - bezelPadBottom - 12);

    const rotated = this.settings.tateMode === 90 || this.settings.tateMode === 270;
    const logicalW = WELL_CONSTANTS.VIEW_W;
    const logicalH = WELL_CONSTANTS.VIEW_H;
    const boundW = rotated ? logicalH : logicalW;
    const boundH = rotated ? logicalW : logicalH;

    let scale = Math.min(availW / boundW, availH / boundH);
    if (this.settings.displayScale === 'integer') {
      scale = Math.max(1, Math.floor(scale));
    }

    const drawW = Math.max(logicalW, Math.floor(logicalW * scale));
    const drawH = Math.max(logicalH, Math.floor(logicalH * scale));
    const frameW = rotated ? drawH : drawW;
    const frameH = rotated ? drawW : drawH;

    this.canvasFrame.style.width = `${frameW}px`;
    this.canvasFrame.style.height = `${frameH}px`;

    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;
    this.canvas.style.transform =
      this.settings.tateMode === 0 ? 'none' : `rotate(${this.settings.tateMode}deg)`;

    if (showSidePanels) {
      const panelH = Math.min(availH, Math.max(420, frameH));
      this.leftPanel.style.height = `${panelH}px`;
      this.rightPanel.style.height = `${panelH}px`;
    }
  }

  updateHud(state: SimState, inputSource: InputSource, paletteIndex: number): void {
    if (paletteIndex !== this.paletteIndex) {
      this.paletteIndex = paletteIndex;
      this.lastHudKey = '';
      this.applyPaletteTheme();
    }

    const pal = getPaletteHex(this.paletteIndex);
    this.canvasFrame.style.borderColor = state.gemHigh ? pal.mid : pal.light;

    if (this.layoutMode === 'portrait') {
      this.portraitFooterEl.style.opacity = inputSource === 'touch' ? '0' : '1';
      return;
    }

    const p = state.player;
    const hudKey = [
      p.hp,
      p.hpMax,
      p.heartPieces,
      state.area,
      state.level,
      state.runStats.maxDepthMeters,
      p.weaponId,
      p.ammo,
      p.ammoMax,
      state.combo,
      state.gems,
      state.gemHigh ? 1 : 0,
      Math.floor(state.gemStreak / 5),
      state.styleId,
      state.hardMode ? 1 : 0,
      state.upgrades.length,
      inputSource,
      this.paletteIndex,
    ].join('|');

    if (hudKey === this.lastHudKey) return;
    this.lastHudKey = hudKey;

    // 1. Crisp Pixel Hearts
    if (p.hpMax <= 8) {
      let heartsHtml = '';
      for (let i = 0; i < p.hpMax; i++) {
        heartsHtml += renderPixelHeartSvg(i < p.hp, pal, 16);
      }
      if (p.heartPieces > 0) {
        heartsHtml += `<span style="font-size:10px;margin-left:4px;color:${pal.mid};">+${p.heartPieces}/4</span>`;
      }
      this.hpValEl.innerHTML = heartsHtml;
    } else {
      this.hpValEl.innerHTML = `${renderPixelHeartSvg(p.hp > 0, pal, 16)} <span style="font-size:13px;font-weight:900;">${p.hp}/${p.hpMax}</span>`;
    }

    // 2. Stage & 5-Area Pixel Depth Pips
    const areaName = AREA_NAMES[state.area] ?? 'WELL';
    const stageStr = state.area === 0 ? 'SURFACE' : `${state.area}-${state.level} ${areaName}`;
    this.stageValEl.textContent = `${stageStr}  ${state.runStats.maxDepthMeters}M`;
    let pipsHtml = '';
    for (let a = 1; a <= 5; a++) {
      const active = state.area === a;
      const cleared = state.area > a;
      const fill = active ? pal.mid : cleared ? pal.light : 'transparent';
      pipsHtml += `<span style="flex:1;height:6px;border:1px solid ${pal.light};background:${fill};"></span>`;
    }
    this.biomePipsEl.innerHTML = pipsHtml;

    // 3. Weapon & Gunboot Charge Bar
    const wDef = getWeaponDef(p.weaponId);
    this.weaponValEl.textContent = state.gemHigh ? `${wDef.name}!` : wDef.name;
    this.weaponValEl.style.color = state.gemHigh ? pal.mid : pal.light;
    const pct = Math.max(0, Math.min(100, Math.round((p.ammo / Math.max(1, p.ammoMax)) * 100)));
    this.chargeFillEl.style.width = `${pct}%`;
    this.chargeFillEl.style.background = p.jetpackActive
      ? pal.special
      : state.gemHigh
        ? pal.mid
        : pal.light;
    this.chargeTextEl.textContent = `${p.ammo}/${p.ammoMax}`;

    // 4. Combo
    this.comboValEl.textContent = state.combo >= 2 ? `${state.combo}X` : '--';
    this.comboValEl.style.color =
      state.combo >= WELL_CONSTANTS.COMBO_TIER_1 ? pal.mid : pal.light;

    // 5. Gems & Gem High Bar
    this.gemsValEl.innerHTML = `${renderPixelGemSvg(pal, 16)}<span>${state.gems}</span>`;
    this.gemsValEl.style.color = state.gemHigh ? pal.mid : pal.light;
    this.gemHighEl.textContent = state.gemHigh
      ? 'GEM HIGH!'
      : state.gemStreak > 0
        ? `${state.gemStreak}/100`
        : '';
    const streakPct = state.gemHigh
      ? Math.max(0, Math.min(100, Math.round((state.gemStreakTimer / WELL_CONSTANTS.GEM_STREAK_TIMER) * 100)))
      : Math.max(0, Math.min(100, Math.round((state.gemStreak / WELL_CONSTANTS.GEM_HIGH_THRESHOLD) * 100)));
    this.gemStreakFillEl.style.width = `${streakPct}%`;
    this.gemStreakFillEl.style.background = state.gemHigh ? pal.mid : pal.light;

    // 6. Style
    const style = getStyleDef(state.styleId);
    this.styleValEl.textContent = state.hardMode ? `${style.name} [HARD]` : style.name;

    // 7. Equipped Upgrades with Razor-Sharp Palette-Synced Pixel Icons!
    if (state.upgrades.length === 0) {
      this.upgradesListEl.innerHTML =
        `<div style="font-size:10px;opacity:0.55;">NONE YET</div>`;
    } else {
      const chips: string[] = [];
      for (let i = 0; i < state.upgrades.length; i++) {
        const ug = getUpgradeDef(state.upgrades[i]!);
        chips.push(
          `<div style="display:flex;align-items:center;gap:8px;padding:3px 5px;border:1px solid ${pal.light};">
            ${renderPixelUpgradeIconSvg(ug.id, pal, 24)}
            <span style="font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ug.name}</span>
          </div>`,
        );
      }
      this.upgradesListEl.innerHTML = chips.join('');
    }

    // 8. Sharp Arcade Keycap Prompts
    const keycap = (txt: string): string =>
      `<span style="display:inline-block;padding:0 4px;border:1px solid ${pal.light};font-size:9px;font-weight:800;">${txt}</span>`;
    if (inputSource === 'gamepad') {
      this.controlsHintEl.innerHTML = `
        <div>MOVE ${keycap('STICK')} ${keycap('DPAD')}</div>
        <div style="margin-top:3px;">FIRE ${keycap('A')} ${keycap('B')} ${keycap('RT')}</div>
        <div style="margin-top:3px;">PAUSE ${keycap('START')}</div>
      `;
    } else if (inputSource === 'touch') {
      this.controlsHintEl.innerHTML = `
        <div>MOVE ${keycap('L-PAD')}</div>
        <div style="margin-top:3px;">FIRE ${keycap('BTN')}</div>
        <div style="margin-top:3px;">PAUSE ${keycap('II')}</div>
      `;
    } else {
      this.controlsHintEl.innerHTML = `
        <div>MOVE ${keycap('A')}${keycap('D')} ${keycap('◄')}${keycap('►')}</div>
        <div style="margin-top:3px;">FIRE ${keycap('SPACE')} ${keycap('Z')}</div>
        <div style="margin-top:3px;">PAUSE ${keycap('ESC')} RETRY ${keycap('R')}</div>
      `;
    }
  }

  showToast(message: string, durationMs = 2600): void {
    this.toastEl.textContent = `[ ${message} ]`;
    this.toastEl.style.opacity = '1';
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
      this.toastTimeout = null;
    }, durationMs);
  }

  getStageElement(): HTMLElement {
    return this.stageEl;
  }

  getCanvasWrapper(): HTMLElement {
    return this.canvasFrame;
  }

  getLayoutMode(): ViewportLayoutMode {
    return this.layoutMode;
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResizeBound);
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.stageEl.remove();
  }
}
