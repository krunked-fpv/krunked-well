import {
  AREA_NAMES,
  type ArtPackMode,
  type DisplayScaleMode,
  type FpsCap,
  type InputFrame,
  type RenderSettings,
  type SaveData,
  type SimState,
  type StyleId,
  type TateMode,
  type TouchButtonSize,
  type TouchControlMode,
} from '../contracts/index.ts';
import { getPalette, PALETTES, rgbToHex } from '../data/palettes.ts';
import { STYLES } from '../data/styles.ts';
import { TROPHIES, UNLOCK_MILESTONES } from '../data/trophies.ts';
import { getUpgradeDef } from '../data/upgrades.ts';

// ============================================================================
// Krunked Well — Full Palette-Themed Menu & Overlay System
// Accessible via Keyboard, Gamepad, Mouse Click, AND Direct Touch Tap!
// Screens: Title, Style Select, Palette Select (live 38-palette preview),
// Trophies & Stats (all 23), Options, Pause, Upgrade Select, Game Over, Victory
// ============================================================================

export type MenuScreen =
  | 'none'
  | 'title'
  | 'style_select'
  | 'palette_select'
  | 'trophies'
  | 'options'
  | 'pause'
  | 'upgrade_select'
  | 'gameover'
  | 'victory';

export interface MenuCallbacks {
  onPlay: () => void;
  onResume: () => void;
  onRetry: () => void;
  onReturnToTitle: () => void;
  onSelectStyle: (styleId: StyleId) => void;
  onSelectPalette: (paletteIndex: number) => void;
  onToggleHardMode: (enabled: boolean) => void;
  onUpdateSettings: (partial: Partial<RenderSettings>) => void;
  onPickUpgrade: (index: number) => void;
  onSetArtPack: (mode: ArtPackMode) => void | Promise<void>;
  onLoadCustomPack: () => void | Promise<void>;
}

interface PackStatus {
  customPackAvailable: boolean;
  activePack: ArtPackMode;
}

const FPS_CAPS: readonly FpsCap[] = [30, 60, 120];
const SCALE_MODES: readonly DisplayScaleMode[] = ['fit', 'integer'];
const TATE_MODES: readonly TateMode[] = [0, 90, 270];
const TOUCH_MODES: readonly TouchControlMode[] = ['auto', 'off'];
const TOUCH_SIZES: readonly TouchButtonSize[] = ['compact', 'standard', 'large'];

function formatTime(ticks: number): string {
  const totalSec = Math.floor(Math.max(0, ticks) / 60);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findUnlockGems(kind: 'style' | 'palette', targetId: number): number | null {
  for (let i = 0; i < UNLOCK_MILESTONES.length; i++) {
    const m = UNLOCK_MILESTONES[i]!;
    if (m.kind === kind && m.targetId === targetId) return m.gems;
  }
  return null;
}

export class MenuSystem {
  private readonly container: HTMLElement;
  private readonly callbacks: MenuCallbacks;
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;

  private screen: MenuScreen = 'title';
  private returnScreen: MenuScreen = 'title';
  private cursor = 0;
  private packStatus: PackStatus = { customPackAvailable: false, activePack: 'builtin' };

  // Input repeat timers for smooth keyboard/gamepad navigation
  private navHoldDirY: -1 | 0 | 1 = 0;
  private navHoldDirX: -1 | 0 | 1 = 0;
  private navRepeatTimerY = 0;
  private navRepeatTimerX = 0;

  private lastMode: SimState['mode'] = 'title';
  private lastRenderKey = '';

  constructor(container: HTMLElement, callbacks: MenuCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.id = 'krunked-menu-overlay';
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '55',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'rgba(5, 5, 5, 0.78)',
      fontFamily: "'Courier New', Courier, monospace",
      boxSizing: 'border-box',
    });

    this.panel = document.createElement('div');
    this.panel.id = 'krunked-menu-panel';
    Object.assign(this.panel.style, {
      width: 'min(430px, 94vw)',
      maxHeight: '90vh',
      overflowY: 'auto',
      border: '2px solid #fafafa',
      borderRadius: '6px',
      padding: '18px 18px 16px',
      background: '#050505',
      color: '#fafafa',
      boxSizing: 'border-box',
      boxShadow: '0 10px 36px rgba(0, 0, 0, 0.85)',
    });

    this.root.appendChild(this.panel);
    this.container.appendChild(this.root);
  }

  getScreen(): MenuScreen {
    return this.screen;
  }

  setScreen(screen: MenuScreen): void {
    this.screen = screen;
    this.cursor = 0;
    this.lastRenderKey = '';
  }

  setPackStatus(customPackAvailable: boolean, activePack: ArtPackMode): void {
    this.packStatus = { customPackAvailable, activePack };
    this.lastRenderKey = '';
  }

  sync(state: SimState, save: SaveData, packStatus?: PackStatus): void {
    if (packStatus) {
      this.packStatus = packStatus;
    }

    // Track state.mode transitions cleanly
    if (state.mode !== this.lastMode) {
      this.lastMode = state.mode;
      switch (state.mode) {
        case 'title':
          this.screen = 'title';
          this.cursor = 0;
          break;
        case 'paused':
          this.screen = 'pause';
          this.cursor = 0;
          break;
        case 'upgrade_select':
          this.screen = 'upgrade_select';
          this.cursor = state.upgradeCursor;
          break;
        case 'gameover':
          this.screen = 'gameover';
          this.cursor = 0;
          break;
        case 'victory':
          this.screen = 'victory';
          this.cursor = 0;
          break;
        case 'playing':
        case 'surface':
          this.screen = 'none';
          break;
      }
      this.lastRenderKey = '';
    }

    if (this.screen === 'upgrade_select') {
      const maxIdx = Math.max(0, state.upgradeChoices.length - 1);
      this.cursor = Math.max(0, Math.min(maxIdx, this.cursor));
    }

    if (this.screen === 'none') {
      if (this.root.style.display !== 'none') {
        this.root.style.display = 'none';
      }
      return;
    }

    if (this.root.style.display !== 'flex') {
      this.root.style.display = 'flex';
    }

    const renderKey = [
      this.screen,
      this.cursor,
      save.selectedStyle,
      save.selectedPalette,
      save.hardModeEnabled ? 1 : 0,
      save.hardModeUnlocked ? 1 : 0,
      save.totalGems,
      save.unlockedTrophies.length,
      this.packStatus.activePack,
      this.packStatus.customPackAvailable ? 1 : 0,
      JSON.stringify(save.settings),
      this.screen === 'upgrade_select' ? state.upgradeChoices.join(',') : '',
      this.screen === 'gameover' || this.screen === 'victory'
        ? `${state.area}-${state.level}-${state.runGems}-${state.runStats.kills}-${state.maxCombo}`
        : '',
    ].join('|');

    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;
    this.renderScreen(state, save);
  }

  handleInput(input: InputFrame, state: SimState, save: SaveData): boolean {
    if (this.screen === 'none') return false;

    const dirY: -1 | 0 | 1 = input.up ? -1 : input.down ? 1 : 0;
    const dirX: -1 | 0 | 1 = input.left ? -1 : input.right ? 1 : 0;

    let stepY = 0;
    if (dirY === 0) {
      this.navHoldDirY = 0;
      this.navRepeatTimerY = 0;
    } else if (dirY !== this.navHoldDirY) {
      this.navHoldDirY = dirY;
      this.navRepeatTimerY = 18;
      stepY = dirY;
    } else {
      this.navRepeatTimerY--;
      if (this.navRepeatTimerY <= 0) {
        this.navRepeatTimerY = 6;
        stepY = dirY;
      }
    }

    let stepX = 0;
    if (dirX === 0) {
      this.navHoldDirX = 0;
      this.navRepeatTimerX = 0;
    } else if (dirX !== this.navHoldDirX) {
      this.navHoldDirX = dirX;
      this.navRepeatTimerX = 18;
      stepX = dirX;
    } else {
      this.navRepeatTimerX--;
      if (this.navRepeatTimerX <= 0) {
        this.navRepeatTimerX = 6;
        stepX = dirX;
      }
    }

    // Check cancel BEFORE action so Gamepad B cleanly goes back in menus
    if (input.cancelPressed) {
      this.handleCancel();
      return true;
    }

    if (input.pausePressed && this.screen === 'pause') {
      this.callbacks.onResume();
      return true;
    }

    const itemCount = this.getItemCount(state);
    if (stepY !== 0 && itemCount > 0) {
      this.cursor = ((this.cursor + stepY) % itemCount + itemCount) % itemCount;
      if (this.screen === 'palette_select') {
        this.previewPaletteAtCursor(save);
      }
      this.lastRenderKey = '';
    }

    if (stepX !== 0) {
      if (this.screen === 'options') {
        this.adjustOption(this.cursor, stepX, save);
        this.lastRenderKey = '';
      } else if (this.screen === 'palette_select') {
        const count = PALETTES.length;
        this.cursor = ((this.cursor + stepX) % count + count) % count;
        this.previewPaletteAtCursor(save);
        this.lastRenderKey = '';
      } else if (this.screen === 'upgrade_select' && itemCount > 0) {
        this.cursor = ((this.cursor + stepX) % itemCount + itemCount) % itemCount;
        this.lastRenderKey = '';
      } else if (this.screen === 'title') {
        if (this.cursor === 5) this.toggleHardMode(save);
        else if (this.cursor === 6) this.toggleArtPack();
      }
    }

    if (input.actionPressed) {
      this.activateCurrentItem(state, save);
      return true;
    }

    return true;
  }

  private getItemCount(state: SimState): number {
    switch (this.screen) {
      case 'title':
        return 8;
      case 'style_select':
        return STYLES.length + 1;
      case 'palette_select':
        return PALETTES.length;
      case 'trophies':
        return 1;
      case 'options':
        return 12;
      case 'pause':
        return 4;
      case 'upgrade_select':
        return Math.max(1, state.upgradeChoices.length);
      case 'gameover':
      case 'victory':
        return 2;
      default:
        return 0;
    }
  }

  private handleCancel(): void {
    if (this.screen === 'pause') {
      this.callbacks.onResume();
    } else if (
      this.screen === 'style_select' ||
      this.screen === 'palette_select' ||
      this.screen === 'trophies'
    ) {
      this.setScreen('title');
    } else if (this.screen === 'options') {
      this.setScreen(this.returnScreen);
    } else if (this.screen === 'gameover' || this.screen === 'victory') {
      this.callbacks.onReturnToTitle();
    }
  }

  private previewPaletteAtCursor(save: SaveData): void {
    const idx = Math.max(0, Math.min(PALETTES.length - 1, this.cursor));
    if (save.unlockedPalettes.includes(idx) || idx === 0) {
      this.callbacks.onSelectPalette(idx);
    } else {
      // Live preview still applies palette visually while browsing!
      this.callbacks.onSelectPalette(idx);
    }
  }

  private toggleHardMode(save: SaveData): void {
    if (!save.hardModeUnlocked && !save.hardModeEnabled) return;
    this.callbacks.onToggleHardMode(!save.hardModeEnabled);
    this.lastRenderKey = '';
  }

  private toggleArtPack(): void {
    const next: ArtPackMode = this.packStatus.activePack === 'builtin' ? 'custom' : 'builtin';
    void this.callbacks.onSetArtPack(next);
    this.lastRenderKey = '';
  }

  private adjustOption(idx: number, dir: number, save: SaveData): void {
    const s = save.settings;
    switch (idx) {
      case 0: {
        const cur = FPS_CAPS.indexOf(s.fpsCap);
        const next = FPS_CAPS[((cur + dir) % FPS_CAPS.length + FPS_CAPS.length) % FPS_CAPS.length]!;
        this.callbacks.onUpdateSettings({ fpsCap: next });
        break;
      }
      case 1:
        this.callbacks.onUpdateSettings({ pixelSnap60: !s.pixelSnap60 });
        break;
      case 2: {
        const cur = SCALE_MODES.indexOf(s.displayScale);
        const next =
          SCALE_MODES[((cur + dir) % SCALE_MODES.length + SCALE_MODES.length) % SCALE_MODES.length]!;
        this.callbacks.onUpdateSettings({ displayScale: next });
        break;
      }
      case 3: {
        const cur = TATE_MODES.indexOf(s.tateMode);
        const next =
          TATE_MODES[((cur + dir) % TATE_MODES.length + TATE_MODES.length) % TATE_MODES.length]!;
        this.callbacks.onUpdateSettings({ tateMode: next });
        break;
      }
      case 4: {
        const next = Math.round(Math.max(0, Math.min(1, s.sfxVolume + dir * 0.1)) * 10) / 10;
        this.callbacks.onUpdateSettings({ sfxVolume: next });
        break;
      }
      case 5: {
        const next = Math.round(Math.max(0, Math.min(1, s.bgmVolume + dir * 0.1)) * 10) / 10;
        this.callbacks.onUpdateSettings({ bgmVolume: next });
        break;
      }
      case 6:
        this.callbacks.onUpdateSettings({ screenshake: !s.screenshake });
        break;
      case 7:
        this.callbacks.onUpdateSettings({ rumble: !s.rumble });
        break;
      case 8: {
        const cur = TOUCH_MODES.indexOf(s.touchMode);
        const next =
          TOUCH_MODES[((cur + dir) % TOUCH_MODES.length + TOUCH_MODES.length) % TOUCH_MODES.length]!;
        this.callbacks.onUpdateSettings({ touchMode: next });
        break;
      }
      case 9: {
        const next = Math.round(Math.max(0.2, Math.min(0.8, s.touchOpacity + dir * 0.1)) * 10) / 10;
        this.callbacks.onUpdateSettings({ touchOpacity: next });
        break;
      }
      case 10: {
        const cur = TOUCH_SIZES.indexOf(s.touchSize);
        const next =
          TOUCH_SIZES[((cur + dir) % TOUCH_SIZES.length + TOUCH_SIZES.length) % TOUCH_SIZES.length]!;
        this.callbacks.onUpdateSettings({ touchSize: next });
        break;
      }
      default:
        break;
    }
  }

  private activateCurrentItem(state: SimState, save: SaveData): void {
    switch (this.screen) {
      case 'title': {
        switch (this.cursor) {
          case 0:
            this.callbacks.onPlay();
            break;
          case 1:
            this.setScreen('style_select');
            this.cursor = save.selectedStyle;
            break;
          case 2:
            this.setScreen('palette_select');
            this.cursor = save.selectedPalette;
            break;
          case 3:
            this.setScreen('trophies');
            break;
          case 4:
            this.returnScreen = 'title';
            this.setScreen('options');
            break;
          case 5:
            this.toggleHardMode(save);
            break;
          case 6:
            this.toggleArtPack();
            break;
          case 7:
            void this.callbacks.onLoadCustomPack();
            break;
        }
        break;
      }
      case 'style_select': {
        if (this.cursor >= STYLES.length) {
          this.setScreen('title');
          return;
        }
        const style = STYLES[this.cursor];
        if (style && (save.unlockedStyles.includes(style.id) || style.id === 0)) {
          this.callbacks.onSelectStyle(style.id);
          this.setScreen('title');
        }
        break;
      }
      case 'palette_select': {
        const idx = Math.max(0, Math.min(PALETTES.length - 1, this.cursor));
        this.callbacks.onSelectPalette(idx);
        this.setScreen('title');
        break;
      }
      case 'trophies':
        this.setScreen('title');
        break;
      case 'options': {
        if (this.cursor === 11) {
          this.setScreen(this.returnScreen);
        } else {
          this.adjustOption(this.cursor, 1, save);
        }
        break;
      }
      case 'pause': {
        switch (this.cursor) {
          case 0:
            this.callbacks.onResume();
            break;
          case 1:
            this.callbacks.onRetry();
            break;
          case 2:
            this.returnScreen = 'pause';
            this.setScreen('options');
            break;
          case 3:
            this.callbacks.onReturnToTitle();
            break;
        }
        break;
      }
      case 'upgrade_select': {
        if (state.upgradeChoices.length > 0) {
          const idx = Math.max(0, Math.min(state.upgradeChoices.length - 1, this.cursor));
          this.callbacks.onPickUpgrade(idx);
        }
        break;
      }
      case 'gameover':
      case 'victory': {
        if (this.cursor === 0) {
          this.callbacks.onRetry();
        } else {
          this.callbacks.onReturnToTitle();
        }
        break;
      }
      default:
        break;
    }
  }

  private renderScreen(state: SimState, save: SaveData): void {
    const pal = getPalette(save.selectedPalette);
    const light = rgbToHex(pal.light);
    const mid = rgbToHex(pal.mid);
    const dark = rgbToHex(pal.dark);
    const special = rgbToHex(pal.special);

    this.panel.style.background = dark;
    this.panel.style.color = light;
    this.panel.style.borderColor = light;

    const btnStyle = (selected: boolean, disabled = false): string =>
      [
        'width:100%',
        'min-height:36px',
        'padding:8px 12px',
        'margin-bottom:6px',
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'text-align:left',
        'font-family:inherit',
        'font-size:13px',
        'font-weight:700',
        'letter-spacing:0.05em',
        'border-radius:4px',
        'cursor:' + (disabled ? 'not-allowed' : 'pointer'),
        'opacity:' + (disabled ? '0.48' : '1'),
        'border:2px solid ' + (selected ? mid : light),
        'background:' + (selected ? mid : 'transparent'),
        'color:' + (selected ? dark : light),
      ].join(';');

    let html = '';

    if (this.screen === 'title') {
      const styleDef = STYLES[save.selectedStyle] ?? STYLES[0]!;
      const palDef = getPalette(save.selectedPalette);
      const hardLabel = save.hardModeUnlocked
        ? save.hardModeEnabled
          ? 'ON'
          : 'OFF'
        : 'LOCKED';
      const packLabel = this.packStatus.activePack === 'custom' ? 'CUSTOM' : 'BUILT-IN';

      html = `
        <div style="text-align:center;margin-bottom:14px;border-bottom:2px solid ${light};padding-bottom:10px;">
          <div style="font-size:24px;font-weight:900;letter-spacing:0.12em;color:${light};">KRUNKED WELL</div>
          <div style="font-size:11px;letter-spacing:0.14em;color:${mid};margin-top:3px;">VERTICAL GUNBOOT DESCENT</div>
        </div>
        <button type="button" data-idx="0" style="${btnStyle(this.cursor === 0)}"><span>▶ PLAY</span><span>DESCEND</span></button>
        <button type="button" data-idx="1" style="${btnStyle(this.cursor === 1)}"><span>STYLE SELECT</span><span>${escapeHtml(styleDef.name)}</span></button>
        <button type="button" data-idx="2" style="${btnStyle(this.cursor === 2)}"><span>PALETTE</span><span>#${palDef.id} ${escapeHtml(palDef.name)}</span></button>
        <button type="button" data-idx="3" style="${btnStyle(this.cursor === 3)}"><span>TROPHIES &amp; STATS</span><span>${save.unlockedTrophies.length}/${TROPHIES.length}</span></button>
        <button type="button" data-idx="4" style="${btnStyle(this.cursor === 4)}"><span>OPTIONS</span><span>VIDEO / INPUT</span></button>
        <button type="button" data-idx="5" style="${btnStyle(this.cursor === 5, !save.hardModeUnlocked)}"><span>HARD MODE</span><span>${hardLabel}</span></button>
        <button type="button" data-idx="6" style="${btnStyle(this.cursor === 6)}"><span>ART PACK</span><span>${packLabel}</span></button>
        <button type="button" data-idx="7" style="${btnStyle(this.cursor === 7)}"><span>LOAD CUSTOM PACK</span><span>FOLDER</span></button>
        <div style="margin-top:8px;font-size:10px;opacity:0.7;text-align:center;">
          TOTAL GEMS: ◆ ${save.totalGems} &nbsp;|&nbsp; BEST DEPTH: ${save.bestDepth}M
        </div>
      `;
    } else if (this.screen === 'style_select') {
      const items = STYLES.map((st, idx) => {
        const unlocked = save.unlockedStyles.includes(st.id) || st.id === 0;
        const active = save.selectedStyle === st.id;
        const req = findUnlockGems('style', st.id);
        const badge = active ? 'ACTIVE' : unlocked ? 'UNLOCKED' : `LOCKED (${req ?? 0}G)`;
        return `
          <button type="button" data-idx="${idx}" style="${btnStyle(this.cursor === idx, !unlocked)};flex-direction:column;align-items:flex-start;gap:4px;">
            <div style="width:100%;display:flex;justify-content:space-between;">
              <span>${escapeHtml(st.name)}</span>
              <span style="font-size:11px;">${badge}</span>
            </div>
            <div style="font-size:11px;font-weight:400;opacity:0.9;">${escapeHtml(st.description)}</div>
          </button>
        `;
      }).join('');
      html = `
        <div style="font-size:16px;font-weight:700;margin-bottom:10px;border-bottom:2px solid ${light};padding-bottom:6px;">STYLE SELECT</div>
        ${items}
        <button type="button" data-idx="${STYLES.length}" style="${btnStyle(this.cursor === STYLES.length)}"><span>◀ BACK</span><span></span></button>
      `;
    } else if (this.screen === 'palette_select') {
      const curPal = getPalette(this.cursor);
      const unlocked = save.unlockedPalettes.includes(curPal.id) || curPal.id === 0;
      const req = findUnlockGems('palette', curPal.id);
      const grid = PALETTES.map((p, idx) => {
        const isSel = idx === this.cursor;
        const isUnl = save.unlockedPalettes.includes(p.id) || p.id === 0;
        return `
          <button type="button" data-pal="${idx}" style="
            padding:6px 4px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;
            border:2px solid ${isSel ? mid : light};
            background:${rgbToHex(p.dark)};color:${rgbToHex(p.light)};
            opacity:${isUnl ? '1' : '0.62'};display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="display:flex;gap:2px;">
              <span style="width:9px;height:9px;background:${rgbToHex(p.light)};border:1px solid #888;"></span>
              <span style="width:9px;height:9px;background:${rgbToHex(p.mid)};border:1px solid #888;"></span>
              <span style="width:9px;height:9px;background:${rgbToHex(p.special)};border:1px solid #888;"></span>
            </div>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${p.id} ${escapeHtml(p.name)}</span>
          </button>
        `;
      }).join('');

      html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:2px solid ${light};padding-bottom:6px;">
          <span style="font-size:15px;font-weight:700;">PALETTES (${PALETTES.length})</span>
          <span style="font-size:11px;color:${mid};">#${curPal.id} ${escapeHtml(curPal.name)} ${unlocked ? '' : `(${req ?? 0}G)`}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;max-height:54vh;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
          ${grid}
        </div>
        <button type="button" data-action="back" style="${btnStyle(true)}"><span>CONFIRM &amp; BACK</span><span>ESC / B</span></button>
      `;
    } else if (this.screen === 'trophies') {
      const fastest =
        save.fastestVictoryTicks !== null ? formatTime(save.fastestVictoryTicks) : '--:--';
      const rows = TROPHIES.map((t) => {
        const earned = save.unlockedTrophies.includes(t.id);
        return `
          <div style="padding:6px 8px;margin-bottom:5px;border:1px solid ${earned ? mid : light};border-radius:4px;opacity:${earned ? '1' : '0.52'};">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;">
              <span>${earned ? '★' : '☆'} ${escapeHtml(t.name)}</span>
              <span style="color:${earned ? mid : light};">${earned ? 'EARNED' : 'LOCKED'}</span>
            </div>
            <div style="font-size:10px;margin-top:2px;opacity:0.86;">${escapeHtml(t.description)}</div>
          </div>
        `;
      }).join('');

      html = `
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;border-bottom:2px solid ${light};padding-bottom:6px;">
          TROPHIES &amp; STATS (${save.unlockedTrophies.length}/${TROPHIES.length})
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:10px;padding:8px;border:1px solid ${light};border-radius:4px;">
          <div>BEST DEPTH: <b>${save.bestDepth}M</b></div>
          <div>HIGH SCORE: <b>${save.highScore}</b></div>
          <div>TOTAL GEMS: <b>◆ ${save.totalGems}</b></div>
          <div>RUNS PLAYED: <b>${save.runsPlayed}</b></div>
          <div>VICTORIES: <b>${save.victories}</b></div>
          <div>FASTEST WIN: <b>${fastest}</b></div>
        </div>
        <div style="max-height:46vh;overflow-y:auto;padding-right:4px;margin-bottom:10px;">
          ${rows}
        </div>
        <button type="button" data-idx="0" style="${btnStyle(true)}"><span>◀ BACK</span><span>ESC / B</span></button>
      `;
    } else if (this.screen === 'options') {
      const s = save.settings;
      const rows: ReadonlyArray<[string, string]> = [
        ['FPS CAP', `${s.fpsCap}`],
        ['60HZ PIXEL SNAP', s.pixelSnap60 ? 'ON' : 'OFF'],
        ['DISPLAY SCALE', s.displayScale.toUpperCase()],
        ['TATE MODE', `${s.tateMode}°`],
        ['SFX VOL', `${Math.round(s.sfxVolume * 100)}%`],
        ['BGM VOL', `${Math.round(s.bgmVolume * 100)}%`],
        ['SCREENSHAKE', s.screenshake ? 'ON' : 'OFF'],
        ['RUMBLE', s.rumble ? 'ON' : 'OFF'],
        ['TOUCH MODE', s.touchMode.toUpperCase()],
        ['TOUCH OPACITY', `${Math.round(s.touchOpacity * 100)}%`],
        ['TOUCH SIZE', s.touchSize.toUpperCase()],
        ['◀ BACK', ''],
      ];
      const listHtml = rows
        .map(
          ([label, val], idx) => `
          <button type="button" data-idx="${idx}" style="${btnStyle(this.cursor === idx)}">
            <span>${label}</span>
            <span>${val ? `◀ ${val} ▶` : ''}</span>
          </button>`,
        )
        .join('');
      html = `
        <div style="font-size:16px;font-weight:700;margin-bottom:10px;border-bottom:2px solid ${light};padding-bottom:6px;">OPTIONS</div>
        ${listHtml}
      `;
    } else if (this.screen === 'pause') {
      const pauseItems = ['RESUME', 'RETRY', 'OPTIONS', 'TITLE'];
      html = `
        <div style="text-align:center;font-size:18px;font-weight:900;letter-spacing:0.12em;margin-bottom:12px;border-bottom:2px solid ${light};padding-bottom:8px;">
          PAUSED
        </div>
        ${pauseItems
          .map(
            (label, idx) =>
              `<button type="button" data-idx="${idx}" style="${btnStyle(this.cursor === idx)}"><span>${label}</span><span>${this.cursor === idx ? '◀' : ''}</span></button>`,
          )
          .join('')}
      `;
    } else if (this.screen === 'upgrade_select') {
      const cards = state.upgradeChoices
        .map((uid, idx) => {
          const ug = getUpgradeDef(uid);
          const sel = this.cursor === idx;
          return `
            <button type="button" data-upgrade="${idx}" style="${btnStyle(sel)};flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;">
              <div style="width:100%;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:14px;">${sel ? '▶ ' : ''}${escapeHtml(ug.name)}</span>
                <span style="font-size:10px;border:1px solid currentColor;padding:1px 5px;border-radius:3px;">PICK</span>
              </div>
              <div style="font-size:11px;font-weight:400;opacity:0.92;">${escapeHtml(ug.description)}</div>
            </button>
          `;
        })
        .join('');

      html = `
        <div style="text-align:center;margin-bottom:12px;border-bottom:2px solid ${light};padding-bottom:8px;">
          <div style="font-size:16px;font-weight:900;letter-spacing:0.08em;color:${special};">STAGE CLEAR!</div>
          <div style="font-size:12px;margin-top:3px;">CHOOSE AN UPGRADE</div>
        </div>
        ${cards}
      `;
    } else if (this.screen === 'gameover' || this.screen === 'victory') {
      const isWin = this.screen === 'victory';
      const areaName = AREA_NAMES[state.area] ?? 'WELL';
      const heading = isWin ? 'WELL CONQUERED!' : 'GAME OVER';
      const sub = isWin
        ? state.hardMode
          ? 'HARD MODE VICTORY'
          : 'ABYSSAL LEVIATHAN DEFEATED'
        : `FALLEN IN ${state.area}-${state.level} ${areaName}`;

      html = `
        <div style="text-align:center;margin-bottom:12px;border-bottom:2px solid ${light};padding-bottom:8px;">
          <div style="font-size:20px;font-weight:900;letter-spacing:0.1em;color:${isWin ? special : mid};">${heading}</div>
          <div style="font-size:11px;margin-top:3px;opacity:0.85;">${escapeHtml(sub)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:14px;padding:10px;border:1px solid ${light};border-radius:4px;">
          <div>DEPTH: <b>${state.runStats.maxDepthMeters}M</b></div>
          <div>TIME: <b>${formatTime(state.runStats.elapsedTicks)}</b></div>
          <div>GEMS: <b>◆ ${state.runGems}</b></div>
          <div>KILLS: <b>${state.runStats.kills}</b></div>
          <div>MAX COMBO: <b>${state.maxCombo}X</b></div>
          <div>STOMPS: <b>${state.runStats.stomps}</b></div>
        </div>
        <button type="button" data-idx="0" style="${btnStyle(this.cursor === 0)}"><span>▶ ${isWin ? 'PLAY AGAIN' : 'RETRY'}</span><span>R</span></button>
        <button type="button" data-idx="1" style="${btnStyle(this.cursor === 1)}"><span>TITLE SCREEN</span><span>ESC</span></button>
      `;
    }

    this.panel.innerHTML = html;
    this.wirePanelClicks(state, save);
  }

  private wirePanelClicks(state: SimState, save: SaveData): void {
    // Standard indexed buttons (Title, Style Select, Trophies, Options, Pause, Game Over, Victory)
    const buttons = this.panel.querySelectorAll<HTMLButtonElement>('button[data-idx]');
    buttons.forEach((btn) => {
      const idx = Number(btn.dataset.idx);
      btn.addEventListener('mouseenter', () => {
        if (this.cursor !== idx) {
          this.cursor = idx;
          this.lastRenderKey = '';
          this.renderScreen(state, save);
        }
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cursor = idx;
        this.activateCurrentItem(state, save);
        this.lastRenderKey = '';
      });
    });

    // Palette grid buttons (click/tap immediately previews & selects)
    const palButtons = this.panel.querySelectorAll<HTMLButtonElement>('button[data-pal]');
    palButtons.forEach((btn) => {
      const idx = Number(btn.dataset.pal);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cursor = idx;
        this.callbacks.onSelectPalette(idx);
        this.lastRenderKey = '';
        this.renderScreen(state, save);
      });
    });

    const backBtn = this.panel.querySelector<HTMLButtonElement>('button[data-action="back"]');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setScreen('title');
        this.renderScreen(state, save);
      });
    }

    // Upgrade cards (click/tap immediately picks the upgrade)
    const ugButtons = this.panel.querySelectorAll<HTMLButtonElement>('button[data-upgrade]');
    ugButtons.forEach((btn) => {
      const idx = Number(btn.dataset.upgrade);
      btn.addEventListener('mouseenter', () => {
        if (this.cursor !== idx) {
          this.cursor = idx;
          this.lastRenderKey = '';
          this.renderScreen(state, save);
        }
      });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.cursor = idx;
        this.callbacks.onPickUpgrade(idx);
      });
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
