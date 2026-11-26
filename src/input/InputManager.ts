import type {
  InputDebugSnapshot,
  InputFrame,
  InputSource,
  KeybindMap,
  RenderSettings,
} from '../contracts/index.ts';

// ============================================================================
// Krunked Well — Unified Keyboard + Gamepad (Xbox/Tesla/Standard) + Touch Input
// TASTE_NOTES invariants:
//   - touchActive initializes to false!
//   - touchActive becomes true ONLY on genuine touchstart or touch PointerEvent
//     (unless settings.touchMode === 'off').
//   - Any keyboard keydown OR gamepad press/stick > deadzone IMMEDIATELY sets
//     touchActive = false!
// ============================================================================

const STICK_X_DEADZONE = 0.22;
const STICK_Y_DEADZONE = 0.35;
const TRIGGER_THRESHOLD = 0.35;

const DEFAULT_KEYBINDS: KeybindMap = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  action: ['Space', 'KeyZ', 'KeyJ', 'Enter'],
  pause: ['Escape', 'KeyP'],
  cancel: ['Escape', 'Backspace', 'KeyX'],
  retry: ['KeyR'],
};

interface TouchDigitalState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  pause: boolean;
}

interface GamepadActuator {
  playEffect?: (
    type: string,
    params: {
      startDelay: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<string> | void;
}

type ExtendedGamepad = Gamepad & {
  vibrationActuator?: GamepadActuator;
};

export class InputManager {
  private readonly targetEl: HTMLElement;
  private settings: RenderSettings;

  private readonly keysDown = new Set<string>();
  private readonly touchState: TouchDigitalState = {
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    pause: false,
  };

  // Latched single-frame tap triggers so fast taps between pollFrame() calls are never lost
  private bufferedActionPress = false;
  private bufferedPausePress = false;
  private bufferedCancelPress = false;
  private bufferedRetryPress = false;

  // Previous polled digital states for clean rising/falling edge detection
  private prevAction = false;
  private prevPause = false;
  private prevCancel = false;
  private prevRetry = false;

  // CRITICAL: MUST initialize to false!
  private touchActive = false;
  private lastSource: InputSource = 'keyboard';
  private gamepadConnected = false;
  private gamepadName: string | null = null;
  private lastFrame: InputFrame = {
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    actionPressed: false,
    actionReleased: false,
    pausePressed: false,
    cancelPressed: false,
    retryPressed: false,
    inputSource: 'keyboard',
  };

  private readonly touchListeners = new Set<(active: boolean) => void>();
  private readonly toastListeners = new Set<(msg: string) => void>();

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onWindowBlurBound: () => void;
  private readonly onTouchStartBound: (e: TouchEvent) => void;
  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onGamepadConnectedBound: (e: GamepadEvent) => void;
  private readonly onGamepadDisconnectedBound: (e: GamepadEvent) => void;

  constructor(targetEl: HTMLElement, settings: RenderSettings) {
    this.targetEl = targetEl;
    this.settings = settings;

    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onWindowBlurBound = () => this.handleBlur();
    this.onTouchStartBound = () => this.activateTouchFromHardware();
    this.onPointerDownBound = (e) => {
      if (e.pointerType === 'touch') {
        this.activateTouchFromHardware();
      }
    };
    this.onGamepadConnectedBound = (e) => {
      this.gamepadConnected = true;
      this.gamepadName = e.gamepad?.id || 'Gamepad';
      this.emitToast(`GAMEPAD CONNECTED: ${this.shortPadName(this.gamepadName)}`);
    };
    this.onGamepadDisconnectedBound = () => {
      this.syncConnectedGamepadMetadata();
      if (!this.gamepadConnected) {
        this.emitToast('GAMEPAD DISCONNECTED');
      }
    };

    window.addEventListener('keydown', this.onKeyDownBound, { passive: false });
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onWindowBlurBound);
    window.addEventListener('gamepadconnected', this.onGamepadConnectedBound);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnectedBound);
    this.targetEl.addEventListener('touchstart', this.onTouchStartBound, { passive: true });
    this.targetEl.addEventListener('pointerdown', this.onPointerDownBound, { passive: true });

    this.syncConnectedGamepadMetadata();
  }

  private shortPadName(raw: string): string {
    const clean = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    return (clean || 'GAMEPAD').slice(0, 28).toUpperCase();
  }

  private emitToast(msg: string): void {
    for (const cb of this.toastListeners) {
      cb(msg);
    }
  }

  private emitTouchVisibility(active: boolean): void {
    for (const cb of this.touchListeners) {
      cb(active);
    }
  }

  private clearTouchInputs(): void {
    this.touchState.left = false;
    this.touchState.right = false;
    this.touchState.up = false;
    this.touchState.down = false;
    this.touchState.action = false;
    this.touchState.pause = false;
  }

  private activateTouchFromHardware(): void {
    if (this.settings.touchMode === 'off') return;
    this.lastSource = 'touch';
    if (!this.touchActive) {
      this.touchActive = true;
      this.emitTouchVisibility(true);
    }
  }

  updateSettings(settings: RenderSettings): void {
    this.settings = settings;
    if (settings.touchMode === 'off' && this.touchActive) {
      this.touchActive = false;
      this.clearTouchInputs();
      this.emitTouchVisibility(false);
    }
  }

  setTouchInput(
    partial: Partial<{
      left: boolean;
      right: boolean;
      up: boolean;
      down: boolean;
      action: boolean;
      pause: boolean;
    }>,
  ): void {
    if (partial.left !== undefined) this.touchState.left = partial.left;
    if (partial.right !== undefined) this.touchState.right = partial.right;
    if (partial.up !== undefined) this.touchState.up = partial.up;
    if (partial.down !== undefined) this.touchState.down = partial.down;
    if (partial.action !== undefined) {
      if (partial.action && !this.touchState.action) {
        this.bufferedActionPress = true;
      }
      this.touchState.action = partial.action;
    }
    if (partial.pause !== undefined) {
      if (partial.pause && !this.touchState.pause) {
        this.bufferedPausePress = true;
      }
      this.touchState.pause = partial.pause;
    }
    if (
      partial.left ||
      partial.right ||
      partial.up ||
      partial.down ||
      partial.action ||
      partial.pause
    ) {
      this.lastSource = 'touch';
    }
  }

  setTouchActive(active: boolean): void {
    const next = this.settings.touchMode === 'off' ? false : Boolean(active);
    if (!next) {
      this.clearTouchInputs();
    } else {
      this.lastSource = 'touch';
    }
    if (this.touchActive !== next) {
      this.touchActive = next;
      this.emitTouchVisibility(next);
    }
  }

  private matchesBinding(code: string, key: string, list: readonly string[]): boolean {
    const lowerKey = key.toLowerCase();
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (b === code || b.toLowerCase() === lowerKey) {
        return true;
      }
    }
    return false;
  }

  private isBoundActionActive(actionKey: keyof KeybindMap): boolean {
    const binds = this.settings.keybinds?.[actionKey] ?? DEFAULT_KEYBINDS[actionKey];
    for (const code of this.keysDown) {
      for (let i = 0; i < binds.length; i++) {
        if (binds[i] === code) return true;
      }
    }
    return false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore DevTools / Debug Drawer function keys so F9/F12 never alter input mode
    if (/^F\d{1,2}$/.test(e.code)) {
      return;
    }
    const kb = this.settings.keybinds ?? DEFAULT_KEYBINDS;
    const isGameKey =
      this.matchesBinding(e.code, e.key, kb.left) ||
      this.matchesBinding(e.code, e.key, kb.right) ||
      this.matchesBinding(e.code, e.key, kb.up) ||
      this.matchesBinding(e.code, e.key, kb.down) ||
      this.matchesBinding(e.code, e.key, kb.action) ||
      this.matchesBinding(e.code, e.key, kb.pause) ||
      this.matchesBinding(e.code, e.key, kb.cancel) ||
      this.matchesBinding(e.code, e.key, kb.retry);

    if (
      isGameKey &&
      (e.code === 'Space' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight')
    ) {
      e.preventDefault();
    }

    const wasDown = this.keysDown.has(e.code);
    this.keysDown.add(e.code);

    if (!wasDown) {
      if (this.matchesBinding(e.code, e.key, kb.action)) this.bufferedActionPress = true;
      if (this.matchesBinding(e.code, e.key, kb.pause)) this.bufferedPausePress = true;
      if (this.matchesBinding(e.code, e.key, kb.cancel)) this.bufferedCancelPress = true;
      if (this.matchesBinding(e.code, e.key, kb.retry)) this.bufferedRetryPress = true;
    }

    // CRITICAL TASTE_NOTES: ANY keyboard keydown IMMEDIATELY hides touch overlay!
    this.lastSource = 'keyboard';
    if (this.touchActive) {
      this.touchActive = false;
      this.clearTouchInputs();
      this.emitTouchVisibility(false);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
  }

  private handleBlur(): void {
    this.keysDown.clear();
    this.clearTouchInputs();
  }

  private syncConnectedGamepadMetadata(): void {
    const pads = this.getConnectedGamepads();
    const first = pads[0];
    if (first) {
      this.gamepadConnected = true;
      this.gamepadName = first.id || 'Gamepad';
    } else {
      this.gamepadConnected = false;
      this.gamepadName = null;
    }
  }

  private getConnectedGamepads(): ExtendedGamepad[] {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return [];
    }
    let raw: (Gamepad | null)[];
    try {
      raw = Array.from(navigator.getGamepads() ?? []);
    } catch {
      return [];
    }
    const result: ExtendedGamepad[] = [];
    for (let i = 0; i < raw.length; i++) {
      const gp = raw[i];
      if (gp && gp.connected) {
        result.push(gp as ExtendedGamepad);
      }
    }
    return result;
  }

  private pollGamepads(): {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    action: boolean;
    pause: boolean;
    cancel: boolean;
    retry: boolean;
    anyActivity: boolean;
  } {
    const pads = this.getConnectedGamepads();
    const wasConnected = this.gamepadConnected;
    if (pads.length > 0) {
      this.gamepadConnected = true;
      this.gamepadName = pads[0]!.id || 'Gamepad';
      if (!wasConnected) {
        this.emitToast(`GAMEPAD CONNECTED: ${this.shortPadName(this.gamepadName)}`);
      }
    } else if (wasConnected) {
      this.gamepadConnected = false;
      this.gamepadName = null;
    }

    let left = false;
    let right = false;
    let up = false;
    let down = false;
    let action = false;
    let pause = false;
    let cancel = false;
    let retry = false;

    for (let p = 0; p < pads.length; p++) {
      const gp = pads[p]!;
      const axes = gp.axes ?? [];
      const btns = gp.buttons ?? [];
      const isStandard = gp.mapping === 'standard';

      const btnDown = (idx: number, threshold = 0.5): boolean => {
        const b = btns[idx];
        if (!b) return false;
        return b.pressed || b.value > threshold;
      };

      // Left Stick X (deadzone 0.22) + D-Pad 14/15 + non-standard D-pad hat axis fallback
      const lx = axes[0] ?? 0;
      const hatX = !isStandard ? (axes[6] ?? 0) : 0;
      if (lx < -STICK_X_DEADZONE || btnDown(14) || hatX < -0.5) left = true;
      if (lx > STICK_X_DEADZONE || btnDown(15) || hatX > 0.5) right = true;

      // Left Stick Y (deadzone 0.35) + D-Pad 12/13 + non-standard D-pad hat axis fallback
      const ly = axes[1] ?? 0;
      const hatY = !isStandard ? (axes[7] ?? 0) : 0;
      if (ly < -STICK_Y_DEADZONE || btnDown(12) || hatY < -0.5) up = true;
      if (ly > STICK_Y_DEADZONE || btnDown(13) || hatY > 0.5) down = true;

      // Non-standard single-axis POV hat fallback (common on some USB controllers at axes[9])
      if (!isStandard && axes.length > 9) {
        const pov = axes[9];
        if (pov !== undefined && Math.abs(pov) <= 1.05) {
          if (pov <= -0.9 && pov >= -1.05) up = true;
          else if (pov >= -0.5 && pov <= -0.3) right = true;
          else if (pov >= 0.05 && pov <= 0.25) down = true;
          else if (pov >= 0.6 && pov <= 0.8) left = true;
        }
      }

      // Action = A(0) | B(1) | X(2) | RB(5) | RT(7 > 0.35) (+ non-standard RT axis[5])
      const rtAxis = !isStandard && axes[5] !== undefined ? (axes[5] + 1) * 0.5 : 0;
      if (
        btnDown(0) ||
        btnDown(1) ||
        btnDown(2) ||
        btnDown(5) ||
        btnDown(7, TRIGGER_THRESHOLD) ||
        rtAxis > TRIGGER_THRESHOLD
      ) {
        action = true;
      }

      // Cancel = B(1)
      if (btnDown(1)) cancel = true;

      // Pause = Start(9)
      if (btnDown(9)) pause = true;

      // Retry = Select(8) | Y(3)
      if (btnDown(8) || btnDown(3)) retry = true;
    }

    const anyActivity = left || right || up || down || action || pause || cancel || retry;
    if (anyActivity) {
      // CRITICAL TASTE_NOTES: ANY gamepad press/stick > deadzone IMMEDIATELY hides touch overlay!
      this.lastSource = 'gamepad';
      if (this.touchActive) {
        this.touchActive = false;
        this.clearTouchInputs();
        this.emitTouchVisibility(false);
      }
    }

    return { left, right, up, down, action, pause, cancel, retry, anyActivity };
  }

  pollFrame(): InputFrame {
    const gp = this.pollGamepads();

    const kbLeft = this.isBoundActionActive('left');
    const kbRight = this.isBoundActionActive('right');
    const kbUp = this.isBoundActionActive('up');
    const kbDown = this.isBoundActionActive('down');
    const kbAction = this.isBoundActionActive('action');
    const kbPause = this.isBoundActionActive('pause');
    const kbCancel = this.isBoundActionActive('cancel');
    const kbRetry = this.isBoundActionActive('retry');

    const tActive = this.touchActive && this.settings.touchMode !== 'off';
    const left = kbLeft || gp.left || (tActive && this.touchState.left);
    const right = kbRight || gp.right || (tActive && this.touchState.right);
    const up = kbUp || gp.up || (tActive && this.touchState.up);
    const down = kbDown || gp.down || (tActive && this.touchState.down);
    const action = kbAction || gp.action || (tActive && this.touchState.action);
    const pause = kbPause || gp.pause || (tActive && this.touchState.pause);
    const cancel = kbCancel || gp.cancel;
    const retry = kbRetry || gp.retry;

    const actionPressed = (action && !this.prevAction) || this.bufferedActionPress;
    const actionReleased = !action && this.prevAction;
    const pausePressed = (pause && !this.prevPause) || this.bufferedPausePress;
    const cancelPressed = (cancel && !this.prevCancel) || this.bufferedCancelPress;
    const retryPressed = (retry && !this.prevRetry) || this.bufferedRetryPress;

    this.prevAction = action;
    this.prevPause = pause;
    this.prevCancel = cancel;
    this.prevRetry = retry;

    this.bufferedActionPress = false;
    this.bufferedPausePress = false;
    this.bufferedCancelPress = false;
    this.bufferedRetryPress = false;

    const frame: InputFrame = {
      left,
      right,
      up,
      down,
      action,
      actionPressed,
      actionReleased,
      pausePressed,
      cancelPressed,
      retryPressed,
      inputSource: this.lastSource,
    };
    this.lastFrame = frame;
    return frame;
  }

  rumble(intensity: number, durationMs: number): void {
    if (!this.settings.rumble) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    const dur = Math.max(10, Math.round(durationMs));
    if (clamped <= 0) return;

    const pads = this.getConnectedGamepads();
    for (let i = 0; i < pads.length; i++) {
      const actuator = pads[i]!.vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        try {
          const res = actuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: dur,
            weakMagnitude: clamped,
            strongMagnitude: Math.min(1, clamped * 0.85),
          });
          if (res && typeof (res as Promise<string>).catch === 'function') {
            (res as Promise<string>).catch(() => {});
          }
        } catch {
          // Ignore unsupported browser rumble actuators
        }
      }
    }
  }

  getDebugSnapshot(): InputDebugSnapshot {
    return {
      touchActive: this.touchActive,
      lastSource: this.lastSource,
      gamepadConnected: this.gamepadConnected,
      gamepadName: this.gamepadName,
      frame: { ...this.lastFrame },
    };
  }

  onTouchVisibilityChange(cb: (active: boolean) => void): () => void {
    this.touchListeners.add(cb);
    return () => {
      this.touchListeners.delete(cb);
    };
  }

  onGamepadToast(cb: (msg: string) => void): () => void {
    this.toastListeners.add(cb);
    return () => {
      this.toastListeners.delete(cb);
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onWindowBlurBound);
    window.removeEventListener('gamepadconnected', this.onGamepadConnectedBound);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnectedBound);
    this.targetEl.removeEventListener('touchstart', this.onTouchStartBound);
    this.targetEl.removeEventListener('pointerdown', this.onPointerDownBound);
    this.touchListeners.clear();
    this.toastListeners.clear();
    this.keysDown.clear();
    this.clearTouchInputs();
  }
}
