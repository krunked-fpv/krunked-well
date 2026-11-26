import type { RenderSettings, TouchButtonSize } from '../contracts/index.ts';
import { getPalette, rgbToHex } from '../data/palettes.ts';
import type { InputManager } from '../input/InputManager.ts';

// ============================================================================
// Krunked Well — Touch-Activated Ergonomic Overlay (TASTE_NOTES)
// - Hidden by default (data-touch-active="false", visibility:hidden, opacity:0,
//   pointer-events:none).
// - Zero center-screen blocking; only active control clusters receive pointers.
// - Seamless slide-across Left/Right thumb pad + independent multi-touch Action
//   button + subtle top-right Pause button.
// ============================================================================

const SIZE_METRICS: Record<
  TouchButtonSize,
  { padW: number; padH: number; actionSize: number; pauseSize: number; font: number }
> = {
  compact: { padW: 136, padH: 64, actionSize: 74, pauseSize: 38, font: 12 },
  standard: { padW: 164, padH: 76, actionSize: 90, pauseSize: 44, font: 14 },
  large: { padW: 196, padH: 88, actionSize: 108, pauseSize: 50, font: 16 },
};

export class TouchOverlay {
  private readonly container: HTMLElement;
  private readonly input: InputManager;
  private settings: RenderSettings;
  private paletteIndex = 0;
  private visible = false;

  private readonly root: HTMLDivElement;
  private readonly movePad: HTMLDivElement;
  private readonly leftHalf: HTMLDivElement;
  private readonly rightHalf: HTMLDivElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;

  private movePointerId: number | null = null;
  private actionPointerId: number | null = null;
  private pausePointerId: number | null = null;
  private leftPressed = false;
  private rightPressed = false;
  private actionPressed = false;
  private pausePressed = false;

  private readonly unsubscribeTouch: () => void;
  private readonly onResizeBound: () => void;

  constructor(container: HTMLElement, input: InputManager, settings: RenderSettings) {
    this.container = container;
    this.input = input;
    this.settings = settings;

    this.root = document.createElement('div');
    this.root.id = 'krunked-touch-overlay';
    this.root.setAttribute('data-touch-active', 'false');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '40',
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      touchAction: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
      transition: 'opacity 140ms ease',
    });

    // Bottom-Left: Wide Ergonomic LEFT / RIGHT Slide-Across Thumb Pad
    this.movePad = document.createElement('div');
    this.movePad.dataset.control = 'move-pad';
    Object.assign(this.movePad.style, {
      position: 'absolute',
      left: 'max(14px, env(safe-area-inset-left, 14px))',
      bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
      display: 'flex',
      alignItems: 'stretch',
      borderRadius: '10px',
      border: '2px solid #fafafa',
      background: 'rgba(5, 5, 5, 0.55)',
      overflow: 'hidden',
      pointerEvents: 'none',
      touchAction: 'none',
      boxSizing: 'border-box',
    });

    this.leftHalf = document.createElement('div');
    this.leftHalf.textContent = '◀';
    Object.assign(this.leftHalf.style, {
      flex: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '700',
      borderRight: '1px solid rgba(255,255,255,0.28)',
      pointerEvents: 'none',
    });

    this.rightHalf = document.createElement('div');
    this.rightHalf.textContent = '▶';
    Object.assign(this.rightHalf.style, {
      flex: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '700',
      pointerEvents: 'none',
    });

    this.movePad.appendChild(this.leftHalf);
    this.movePad.appendChild(this.rightHalf);

    // Bottom-Right: Large Independent JUMP / SHOOT Button
    this.actionBtn = document.createElement('button');
    this.actionBtn.type = 'button';
    this.actionBtn.dataset.control = 'action-btn';
    this.actionBtn.setAttribute('aria-label', 'Jump and Shoot');
    this.actionBtn.innerHTML = '<span style="display:block;line-height:1.1">JUMP<br/>FIRE</span>';
    Object.assign(this.actionBtn.style, {
      position: 'absolute',
      right: 'max(14px, env(safe-area-inset-right, 14px))',
      bottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
      borderRadius: '50%',
      border: '2px solid #fafafa',
      background: 'rgba(5, 5, 5, 0.55)',
      color: '#fafafa',
      fontFamily: "'Courier New', Courier, monospace",
      fontWeight: '700',
      letterSpacing: '0.04em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '0',
      pointerEvents: 'none',
      touchAction: 'none',
      cursor: 'pointer',
      outline: 'none',
    });

    // Top-Right: Subtle Transparent PAUSE Button
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.dataset.control = 'pause-btn';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.textContent = 'II';
    Object.assign(this.pauseBtn.style, {
      position: 'absolute',
      right: 'max(14px, env(safe-area-inset-right, 14px))',
      top: 'max(12px, env(safe-area-inset-top, 12px))',
      borderRadius: '8px',
      border: '2px solid #fafafa',
      background: 'rgba(5, 5, 5, 0.55)',
      color: '#fafafa',
      fontFamily: "'Courier New', Courier, monospace",
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      pointerEvents: 'none',
      touchAction: 'none',
      cursor: 'pointer',
      outline: 'none',
    });

    this.root.appendChild(this.movePad);
    this.root.appendChild(this.actionBtn);
    this.root.appendChild(this.pauseBtn);
    this.container.appendChild(this.root);

    this.bindControls();
    this.onResizeBound = () => this.updatePausePosition();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', this.onResizeBound);
    }
    this.updateSettings(settings, 0);
    this.updatePausePosition();

    this.unsubscribeTouch = this.input.onTouchVisibilityChange((active) => {
      this.setVisible(active);
    });
  }

  private updatePausePosition(): void {
    const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
    const isPortrait = vw / Math.max(1, vh) < 0.85;
    if (isPortrait) {
      // Portrait: dock Pause neatly between Left/Right pad and Jump/Fire button (zero HUD overlap!)
      this.pauseBtn.style.top = 'auto';
      this.pauseBtn.style.right = 'auto';
      this.pauseBtn.style.left = '54%';
      this.pauseBtn.style.bottom = 'max(30px, env(safe-area-inset-bottom, 30px))';
      this.pauseBtn.style.transform = 'translateX(-50%)';
    } else {
      // Landscape / Tesla: dock Pause cleanly in far top-right bezel corner
      this.pauseBtn.style.left = 'auto';
      this.pauseBtn.style.bottom = 'auto';
      this.pauseBtn.style.transform = 'none';
      this.pauseBtn.style.right = 'max(14px, env(safe-area-inset-right, 14px))';
      this.pauseBtn.style.top = 'max(12px, env(safe-area-inset-top, 12px))';
    }
  }

  private bindControls(): void {
    const updateMoveFromClientX = (clientX: number): void => {
      const rect = this.movePad.getBoundingClientRect();
      const mid = rect.left + rect.width * 0.5;
      const isLeft = clientX < mid;
      this.leftPressed = isLeft;
      this.rightPressed = !isLeft;
      this.input.setTouchInput({ left: this.leftPressed, right: this.rightPressed });
      this.refreshVisualStates();
    };

    const releaseMove = (): void => {
      this.movePointerId = null;
      this.leftPressed = false;
      this.rightPressed = false;
      this.input.setTouchInput({ left: false, right: false });
      this.refreshVisualStates();
    };

    this.movePad.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.movePointerId = e.pointerId;
      try {
        this.movePad.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure on synthetic events
      }
      updateMoveFromClientX(e.clientX);
    });

    this.movePad.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.movePointerId !== e.pointerId) return;
      e.preventDefault();
      updateMoveFromClientX(e.clientX);
    });

    this.movePad.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.movePointerId !== e.pointerId) return;
      e.preventDefault();
      releaseMove();
    });

    this.movePad.addEventListener('pointercancel', (e: PointerEvent) => {
      if (this.movePointerId !== e.pointerId) return;
      releaseMove();
    });

    this.movePad.addEventListener('lostpointercapture', () => {
      if (this.movePointerId !== null) {
        releaseMove();
      }
    });

    // Action Button (independent pointerId for full multi-touch)
    const releaseAction = (): void => {
      this.actionPointerId = null;
      this.actionPressed = false;
      this.input.setTouchInput({ action: false });
      this.refreshVisualStates();
    };

    this.actionBtn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.actionPointerId = e.pointerId;
      try {
        this.actionBtn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure on synthetic events
      }
      this.actionPressed = true;
      this.input.setTouchInput({ action: true });
      this.refreshVisualStates();
    });

    this.actionBtn.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.actionPointerId !== e.pointerId) return;
      e.preventDefault();
      releaseAction();
    });

    this.actionBtn.addEventListener('pointercancel', (e: PointerEvent) => {
      if (this.actionPointerId !== e.pointerId) return;
      releaseAction();
    });

    this.actionBtn.addEventListener('lostpointercapture', () => {
      if (this.actionPointerId !== null) {
        releaseAction();
      }
    });

    // Pause Button
    const releasePause = (): void => {
      this.pausePointerId = null;
      this.pausePressed = false;
      this.input.setTouchInput({ pause: false });
      this.refreshVisualStates();
    };

    this.pauseBtn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.pausePointerId = e.pointerId;
      try {
        this.pauseBtn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure on synthetic events
      }
      this.pausePressed = true;
      this.input.setTouchInput({ pause: true });
      this.refreshVisualStates();
    });

    this.pauseBtn.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.pausePointerId !== e.pointerId) return;
      e.preventDefault();
      releasePause();
    });

    this.pauseBtn.addEventListener('pointercancel', (e: PointerEvent) => {
      if (this.pausePointerId !== e.pointerId) return;
      releasePause();
    });

    this.pauseBtn.addEventListener('lostpointercapture', () => {
      if (this.pausePointerId !== null) {
        releasePause();
      }
    });
  }

  private refreshVisualStates(): void {
    const pal = getPalette(this.paletteIndex);
    const light = rgbToHex(pal.light);
    const mid = rgbToHex(pal.mid);
    const dark = rgbToHex(pal.dark);

    const idleOpacity = Math.max(0.2, Math.min(0.8, this.settings.touchOpacity));
    const activeOpacity = Math.min(0.95, idleOpacity + 0.35);

    this.movePad.style.opacity = String(this.leftPressed || this.rightPressed ? activeOpacity : idleOpacity);
    this.movePad.style.borderColor = this.leftPressed || this.rightPressed ? mid : light;
    this.movePad.style.color = light;
    this.movePad.style.background = dark;

    this.leftHalf.style.background = this.leftPressed ? mid : 'transparent';
    this.leftHalf.style.color = this.leftPressed ? dark : light;
    this.rightHalf.style.background = this.rightPressed ? mid : 'transparent';
    this.rightHalf.style.color = this.rightPressed ? dark : light;

    this.actionBtn.style.opacity = String(this.actionPressed ? activeOpacity : idleOpacity);
    this.actionBtn.style.borderColor = this.actionPressed ? mid : light;
    this.actionBtn.style.background = this.actionPressed ? mid : dark;
    this.actionBtn.style.color = this.actionPressed ? dark : light;

    this.pauseBtn.style.opacity = String(this.pausePressed ? activeOpacity : Math.max(0.22, idleOpacity * 0.9));
    this.pauseBtn.style.borderColor = this.pausePressed ? mid : light;
    this.pauseBtn.style.background = this.pausePressed ? mid : dark;
    this.pauseBtn.style.color = this.pausePressed ? dark : light;
  }

  setVisible(active: boolean): void {
    const show = Boolean(active) && this.settings.touchMode !== 'off';
    this.visible = show;
    this.root.setAttribute('data-touch-active', show ? 'true' : 'false');
    this.root.style.visibility = show ? 'visible' : 'hidden';
    this.root.style.opacity = show ? '1' : '0';

    // Root stays pointer-events: none so center screen NEVER blocks taps;
    // ONLY the 3 control clusters accept pointers when visible!
    const clusterPtr = show ? 'auto' : 'none';
    this.movePad.style.pointerEvents = clusterPtr;
    this.actionBtn.style.pointerEvents = clusterPtr;
    this.pauseBtn.style.pointerEvents = clusterPtr;

    if (!show) {
      this.movePointerId = null;
      this.actionPointerId = null;
      this.pausePointerId = null;
      this.leftPressed = false;
      this.rightPressed = false;
      this.actionPressed = false;
      this.pausePressed = false;
      this.input.setTouchInput({ left: false, right: false, action: false, pause: false });
      this.refreshVisualStates();
    }
  }

  updateSettings(settings: RenderSettings, paletteIndex: number): void {
    this.settings = settings;
    this.paletteIndex = paletteIndex;

    const m = SIZE_METRICS[settings.touchSize] ?? SIZE_METRICS.standard;
    this.movePad.style.width = `${m.padW}px`;
    this.movePad.style.height = `${m.padH}px`;
    this.leftHalf.style.fontSize = `${m.font + 6}px`;
    this.rightHalf.style.fontSize = `${m.font + 6}px`;

    this.actionBtn.style.width = `${m.actionSize}px`;
    this.actionBtn.style.height = `${m.actionSize}px`;
    this.actionBtn.style.fontSize = `${m.font}px`;

    this.pauseBtn.style.width = `${m.pauseSize}px`;
    this.pauseBtn.style.height = `${m.pauseSize}px`;
    this.pauseBtn.style.fontSize = `${m.font}px`;

    if (settings.touchMode === 'off' && this.visible) {
      this.setVisible(false);
    }
    this.refreshVisualStates();
  }

  getElement(): HTMLElement {
    return this.root;
  }

  destroy(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.onResizeBound);
    }
    this.unsubscribeTouch();
    this.setVisible(false);
    this.root.remove();
  }
}
