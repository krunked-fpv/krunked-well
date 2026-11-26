import {
  AREA_NAMES,
  WELL_CONSTANTS,
  type InputSource,
  type RenderSettings,
  type SimState,
} from '../contracts/index.ts';
import { getPalette, rgbToHex } from '../data/palettes.ts';
import { getStyleDef } from '../data/styles.ts';
import { getUpgradeDef } from '../data/upgrades.ts';
import { getWeaponDef } from '../data/weapons.ts';

// ============================================================================
// Krunked Well — Responsive Multi-Form-Factor Viewport & Side-Panel Layout
// Supports Mobile Portrait (aspect < 0.85), Desktop Landscape, and Tesla
// Landscape (1280x720+), Integer/Fit scaling, and Tate rotation (0/90/270).
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
  private readonly toastEl: HTMLDivElement;

  // Left Panel Live Slots
  private readonly hpValEl: HTMLElement;
  private readonly stageValEl: HTMLElement;
  private readonly weaponValEl: HTMLElement;
  private readonly chargeFillEl: HTMLElement;
  private readonly chargeTextEl: HTMLElement;
  private readonly comboValEl: HTMLElement;

  // Right Panel Live Slots
  private readonly gemsValEl: HTMLElement;
  private readonly gemHighEl: HTMLElement;
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
      fontFamily: "'Courier New', Courier, monospace",
    });

    // ---- Left Side Panel (Landscape / Tesla) ----
    this.leftPanel = document.createElement('aside');
    this.leftPanel.id = 'krunked-panel-left';
    Object.assign(this.leftPanel.style, {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: '220px',
      maxWidth: '24vw',
      padding: '14px 16px',
      gap: '12px',
      border: '2px solid rgba(250,250,250,0.22)',
      borderRadius: '6px',
      boxSizing: 'border-box',
      flexShrink: '0',
    });

    this.leftPanel.innerHTML = `
      <div style="border-bottom:2px solid currentColor;padding-bottom:8px;">
        <div style="font-size:16px;font-weight:700;letter-spacing:0.1em;">KRUNKED WELL</div>
        <div style="font-size:10px;opacity:0.72;letter-spacing:0.08em;margin-top:2px;">GUNBOOT DESCENT</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <div style="font-size:10px;opacity:0.65;">HEALTH</div>
          <div data-slot="hp" style="font-size:15px;font-weight:700;margin-top:2px;">♥♥♥♥</div>
        </div>
        <div>
          <div style="font-size:10px;opacity:0.65;">DEPTH / BIOME</div>
          <div data-slot="stage" style="font-size:13px;font-weight:700;margin-top:2px;">1-1 CAVERN</div>
        </div>
        <div>
          <div style="font-size:10px;opacity:0.65;">GUNBOOTS</div>
          <div data-slot="weapon" style="font-size:13px;font-weight:700;margin-top:2px;">MACHINEGUN</div>
          <div style="margin-top:4px;height:10px;border:1px solid currentColor;padding:1px;">
            <div data-slot="charge-fill" style="height:100%;width:100%;background:currentColor;"></div>
          </div>
          <div data-slot="charge-text" style="font-size:11px;margin-top:2px;text-align:right;">8 / 8</div>
        </div>
        <div>
          <div style="font-size:10px;opacity:0.65;">COMBO</div>
          <div data-slot="combo" style="font-size:14px;font-weight:700;margin-top:2px;">--</div>
        </div>
      </div>
      <div style="font-size:10px;opacity:0.55;border-top:1px solid rgba(255,255,255,0.2);padding-top:6px;">
        60 HZ DETERMINISTIC
      </div>
    `;

    this.hpValEl = this.leftPanel.querySelector('[data-slot="hp"]') as HTMLElement;
    this.stageValEl = this.leftPanel.querySelector('[data-slot="stage"]') as HTMLElement;
    this.weaponValEl = this.leftPanel.querySelector('[data-slot="weapon"]') as HTMLElement;
    this.chargeFillEl = this.leftPanel.querySelector('[data-slot="charge-fill"]') as HTMLElement;
    this.chargeTextEl = this.leftPanel.querySelector('[data-slot="charge-text"]') as HTMLElement;
    this.comboValEl = this.leftPanel.querySelector('[data-slot="combo"]') as HTMLElement;

    // ---- Center Well Frame ----
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
      border: '2px solid #fafafa',
      boxShadow: '0 0 28px rgba(0, 0, 0, 0.7)',
      overflow: 'hidden',
    });

    Object.assign(this.canvas.style, {
      display: 'block',
      imageRendering: 'pixelated',
      transformOrigin: 'center center',
    });

    this.canvasFrame.appendChild(this.canvas);
    this.centerWell.appendChild(this.canvasFrame);

    // ---- Right Side Panel (Landscape / Tesla) ----
    this.rightPanel = document.createElement('aside');
    this.rightPanel.id = 'krunked-panel-right';
    Object.assign(this.rightPanel.style, {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: '220px',
      maxWidth: '24vw',
      padding: '14px 16px',
      gap: '12px',
      border: '2px solid rgba(250,250,250,0.22)',
      borderRadius: '6px',
      boxSizing: 'border-box',
      flexShrink: '0',
    });

    this.rightPanel.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <div style="font-size:10px;opacity:0.65;">GEMS</div>
          <div data-slot="gems" style="font-size:16px;font-weight:700;margin-top:2px;">0</div>
          <div data-slot="gemhigh" style="font-size:11px;font-weight:700;margin-top:2px;min-height:14px;"></div>
        </div>
        <div>
          <div style="font-size:10px;opacity:0.65;">STYLE</div>
          <div data-slot="style" style="font-size:12px;font-weight:700;margin-top:2px;">STANDARD</div>
        </div>
        <div>
          <div style="font-size:10px;opacity:0.65;">UPGRADES</div>
          <div data-slot="upgrades" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;font-size:10px;max-height:132px;overflow-y:auto;"></div>
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:8px;">
        <div style="font-size:10px;opacity:0.65;margin-bottom:4px;">CONTROLS</div>
        <div data-slot="controls" style="font-size:10px;line-height:1.5;opacity:0.88;"></div>
      </div>
    `;

    this.gemsValEl = this.rightPanel.querySelector('[data-slot="gems"]') as HTMLElement;
    this.gemHighEl = this.rightPanel.querySelector('[data-slot="gemhigh"]') as HTMLElement;
    this.styleValEl = this.rightPanel.querySelector('[data-slot="style"]') as HTMLElement;
    this.upgradesListEl = this.rightPanel.querySelector('[data-slot="upgrades"]') as HTMLElement;
    this.controlsHintEl = this.rightPanel.querySelector('[data-slot="controls"]') as HTMLElement;

    // ---- Top-Center Non-Blocking Toast Notification Pill ----
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'krunked-toast';
    Object.assign(this.toastEl.style, {
      position: 'fixed',
      top: '14px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '70',
      padding: '6px 14px',
      border: '2px solid #fafafa',
      borderRadius: '4px',
      background: '#050505',
      color: '#fafafa',
      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '0.06em',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 160ms ease',
      whiteSpace: 'nowrap',
    });

    this.stageEl.appendChild(this.leftPanel);
    this.stageEl.appendChild(this.centerWell);
    this.stageEl.appendChild(this.rightPanel);
    this.stageEl.appendChild(this.toastEl);
    this.rootEl.appendChild(this.stageEl);

    this.onResizeBound = () => this.resize();
    window.addEventListener('resize', this.onResizeBound);

    this.applyPaletteTheme();
    this.resize();
  }

  private applyPaletteTheme(): void {
    const pal = getPalette(this.paletteIndex);
    const light = rgbToHex(pal.light);
    const mid = rgbToHex(pal.mid);
    const dark = rgbToHex(pal.dark);
    const special = rgbToHex(pal.special);

    document.body.style.background = dark;
    document.body.style.color = light;
    this.stageEl.style.background = dark;
    this.stageEl.style.color = light;

    this.canvasFrame.style.borderColor = light;
    this.leftPanel.style.borderColor = light;
    this.leftPanel.style.background = dark;
    this.rightPanel.style.borderColor = light;
    this.rightPanel.style.background = dark;
    this.toastEl.style.background = dark;
    this.toastEl.style.borderColor = mid;
    this.toastEl.style.color = light;
    this.gemHighEl.style.color = mid;
    this.chargeFillEl.style.background = special;
  }

  updateSettings(settings: RenderSettings, paletteIndex: number): void {
    this.settings = settings;
    this.paletteIndex = paletteIndex;
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

    // Clean thumb margins on left/right bezels in landscape/Tesla
    const bezelPadX = this.layoutMode === 'tesla' ? 42 : showSidePanels ? 18 : 6;
    const bezelPadY = this.layoutMode === 'portrait' ? 6 : 16;
    const panelGap = this.layoutMode === 'tesla' ? 28 : 16;

    this.stageEl.style.padding = `${bezelPadY}px ${bezelPadX}px`;
    this.stageEl.style.gap = `${panelGap}px`;

    const sidePanelW = showSidePanels ? Math.min(230, Math.max(168, Math.floor(vw * 0.2))) : 0;
    if (showSidePanels) {
      this.leftPanel.style.width = `${sidePanelW}px`;
      this.rightPanel.style.width = `${sidePanelW}px`;
    }

    const availW = Math.max(
      160,
      vw - bezelPadX * 2 - (showSidePanels ? sidePanelW * 2 + panelGap * 2 : 0) - 8,
    );
    const availH = Math.max(160, vh - bezelPadY * 2 - 8);

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
      const panelH = Math.min(availH, Math.max(380, frameH));
      this.leftPanel.style.height = `${panelH}px`;
      this.rightPanel.style.height = `${panelH}px`;
    }
  }

  updateHud(state: SimState, inputSource: InputSource, paletteIndex: number): void {
    if (paletteIndex !== this.paletteIndex) {
      this.paletteIndex = paletteIndex;
      this.applyPaletteTheme();
    }
    if (this.layoutMode === 'portrait') return;

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
    ].join('|');

    if (hudKey === this.lastHudKey) return;
    this.lastHudKey = hudKey;

    const pal = getPalette(this.paletteIndex);
    const midHex = rgbToHex(pal.mid);
    const lightHex = rgbToHex(pal.light);

    // Health hearts
    const filled = '♥'.repeat(Math.max(0, Math.min(12, p.hp)));
    const empty = '♡'.repeat(Math.max(0, Math.min(12, p.hpMax - p.hp)));
    const pieceStr = p.heartPieces > 0 ? ` [${p.heartPieces}/4]` : '';
    this.hpValEl.textContent =
      p.hpMax <= 8 ? `${filled}${empty}${pieceStr}` : `♥ ${p.hp}/${p.hpMax}${pieceStr}`;
    this.hpValEl.style.color = p.hp <= 1 ? midHex : lightHex;

    // Stage + depth
    const areaName = AREA_NAMES[state.area] ?? 'WELL';
    const stageStr = state.area === 0 ? 'SURFACE' : `${state.area}-${state.level} ${areaName}`;
    this.stageValEl.textContent = `${stageStr} (${state.runStats.maxDepthMeters}M)`;

    // Weapon + charge
    const wDef = getWeaponDef(p.weaponId);
    this.weaponValEl.textContent = state.gemHigh ? `${wDef.name} +` : wDef.name;
    const pct = Math.max(0, Math.min(100, Math.round((p.ammo / Math.max(1, p.ammoMax)) * 100)));
    this.chargeFillEl.style.width = `${pct}%`;
    this.chargeFillEl.style.background = state.gemHigh ? midHex : lightHex;
    this.chargeTextEl.textContent = `${p.ammo} / ${p.ammoMax}`;

    // Combo
    this.comboValEl.textContent = state.combo >= 2 ? `${state.combo}X CHAIN` : '--';
    this.comboValEl.style.color = state.combo >= WELL_CONSTANTS.COMBO_TIER_1 ? midHex : lightHex;

    // Gems & Gem High
    this.gemsValEl.textContent = `◆ ${state.gems}`;
    this.gemHighEl.textContent = state.gemHigh
      ? '★ GEM HIGH ACTIVE!'
      : state.gemStreak > 0
        ? `STREAK: ${state.gemStreak}/100`
        : '';

    // Style & Hard Mode
    const style = getStyleDef(state.styleId);
    this.styleValEl.textContent = state.hardMode ? `${style.name} [HARD]` : style.name;

    // Upgrades
    if (state.upgrades.length === 0) {
      this.upgradesListEl.innerHTML = '<span style="opacity:0.5;">NONE YET</span>';
    } else {
      const chips: string[] = [];
      for (let i = 0; i < state.upgrades.length; i++) {
        const ug = getUpgradeDef(state.upgrades[i]!);
        chips.push(
          `<span style="border:1px solid currentColor;padding:1px 4px;border-radius:2px;">${ug.name}</span>`,
        );
      }
      this.upgradesListEl.innerHTML = chips.join('');
    }

    // Dynamic Input Glyph Hints
    if (inputSource === 'gamepad') {
      this.controlsHintEl.innerHTML =
        'MOVE: L-STICK / D-PAD<br/>JUMP & FIRE: A / B / X / RT<br/>PAUSE: START &nbsp; RETRY: Y';
    } else if (inputSource === 'touch') {
      this.controlsHintEl.innerHTML =
        'MOVE: SLIDE LEFT PAD<br/>JUMP & FIRE: RIGHT BTN<br/>PAUSE: TOP-RIGHT II';
    } else {
      this.controlsHintEl.innerHTML =
        'MOVE: A/D or ◀/▶<br/>JUMP & FIRE: SPACE / Z<br/>PAUSE: ESC / P &nbsp; RETRY: R';
    }
  }

  showToast(message: string, durationMs = 2600): void {
    this.toastEl.textContent = message;
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
