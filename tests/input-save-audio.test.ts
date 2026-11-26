import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WELL_CONSTANTS,
  type AreaId,
  type GameMode,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type WeaponId,
} from '../src/contracts/index.ts';
import {
  createDefaultSaveData,
  createDefaultSettings,
  sanitizeSaveData,
  SaveManager,
  type StorageLike,
} from '../src/app/SaveManager.ts';
import { AudioEngine } from '../src/audio/AudioEngine.ts';
import { ProceduralSynth } from '../src/audio/ProceduralSynth.ts';
import {
  BGM_TRACK_IDS,
  CUSTOM_AUDIO_ALIASES,
  getBgmForState,
  getWeaponShotSfxId,
  isBgmTrackId,
  isSfxId,
  SFX_IDS,
} from '../src/audio/soundManifest.ts';
import { PALETTES } from '../src/data/palettes.ts';
import { InputManager } from '../src/input/InputManager.ts';
import { createInitialState } from '../src/sim/createState.ts';
import { TouchOverlay } from '../src/ui/TouchOverlay.ts';

// ============================================================================
// Self-Contained Headless Mocks (DOM / EventTarget / Gamepad / Storage / WebAudio)
// ============================================================================

function stubGlobalProperty(key: string, value: unknown): () => void {
  const target = globalThis as Record<string, unknown>;
  const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
  const origDesc = Object.getOwnPropertyDescriptor(target, key);

  Object.defineProperty(target, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });

  return () => {
    if (hadOwn && origDesc) {
      Object.defineProperty(target, key, origDesc);
    } else {
      delete target[key];
    }
  };
}

type EventListenerFn = (ev: unknown) => void;

class MockEventTarget {
  private readonly listeners = new Map<string, Set<EventListenerFn>>();

  addEventListener(type: string, cb: EventListenerFn, _opts?: unknown): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
  }

  removeEventListener(type: string, cb: EventListenerFn, _opts?: unknown): void {
    this.listeners.get(type)?.delete(cb);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...event,
    };
    const set = this.listeners.get(type);
    if (set) {
      for (const cb of [...set]) {
        cb(payload);
      }
    }
    return payload;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class MockElement extends MockEventTarget {
  readonly tagName: string;
  id = '';
  type = '';
  textContent = '';
  innerHTML = '';
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: MockElement[] = [];
  parentNode: MockElement | null = null;
  readonly capturedPointers: number[] = [];
  private rect = { left: 0, top: 0, width: 164, height: 76, right: 164, bottom: 76 };

  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    const str = String(value);
    this.attributes.set(name, str);
    if (name.startsWith('data-')) {
      const camel = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
      this.dataset[camel] = str;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) {
      this.parentNode.children.splice(idx, 1);
    }
    this.parentNode = null;
  }

  setRect(rect: { left: number; top: number; width: number; height: number }): void {
    this.rect = {
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    };
  }

  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  } {
    return { ...this.rect };
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.push(pointerId);
  }

  findByControl(control: string): MockElement | undefined {
    if (this.dataset.control === control) return this;
    for (const child of this.children) {
      const found = child.findByControl(control);
      if (found) return found;
    }
    return undefined;
  }
}

class MockDocument {
  readonly createdElements: MockElement[] = [];

  createElement(tag: string): MockElement {
    const el = new MockElement(tag);
    this.createdElements.push(el);
    return el;
  }
}

interface MockGamepadButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

interface MockGamepad {
  id: string;
  index: number;
  connected: boolean;
  mapping: GamepadMappingType;
  timestamp: number;
  axes: number[];
  buttons: MockGamepadButton[];
  vibrationActuator: {
    playEffect: ReturnType<typeof vi.fn>;
  };
}

function createMockGamepad(overrides?: {
  id?: string;
  connected?: boolean;
  mapping?: GamepadMappingType;
  axes?: number[];
  pressedButtons?: number[];
  buttonValues?: Record<number, number>;
}): MockGamepad {
  const buttons: MockGamepadButton[] = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  for (const idx of overrides?.pressedButtons ?? []) {
    const btn = buttons[idx];
    if (btn) {
      btn.pressed = true;
      btn.touched = true;
      btn.value = 1;
    }
  }
  for (const [idxStr, val] of Object.entries(overrides?.buttonValues ?? {})) {
    const btn = buttons[Number(idxStr)];
    if (btn) {
      btn.value = val;
      btn.touched = val > 0;
    }
  }
  return {
    id: overrides?.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    index: 0,
    connected: overrides?.connected ?? true,
    mapping: overrides?.mapping ?? 'standard',
    timestamp: 1000,
    axes: overrides?.axes ?? [0, 0, 0, 0],
    buttons,
    vibrationActuator: {
      playEffect: vi.fn().mockResolvedValue('complete'),
    },
  };
}

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// --- Lightweight Web Audio API Mock ---

interface AudioParamCall {
  method: string;
  args: number[];
}

class MockAudioParam {
  value: number;
  readonly calls: AudioParamCall[] = [];

  constructor(initialValue = 1) {
    this.value = initialValue;
  }

  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push({ method: 'setValueAtTime', args: [v, t] });
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ method: 'linearRampToValueAtTime', args: [v, t] });
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.calls.push({ method: 'exponentialRampToValueAtTime', args: [v, t] });
    return this;
  }

  setTargetAtTime(v: number, t: number, tc: number): this {
    this.value = v;
    this.calls.push({ method: 'setTargetAtTime', args: [v, t, tc] });
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.calls.push({ method: 'cancelScheduledValues', args: [t] });
    return this;
  }
}

class MockAudioNode {
  readonly connections: MockAudioNode[] = [];
  disconnected = false;

  connect(dest: MockAudioNode): MockAudioNode {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
}

class MockScheduledSourceNode extends MockAudioNode {
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  stopped = false;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
    this.stopped = true;
  }

  triggerEnded(): void {
    const cb = this.onended;
    this.onended = null;
    cb?.();
  }
}

class MockOscillatorNode extends MockScheduledSourceNode {
  type: OscillatorType = 'sine';
  readonly frequency = new MockAudioParam(440);
  periodicWave: unknown = null;

  setPeriodicWave(wave: unknown): void {
    this.periodicWave = wave;
  }
}

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? new Float32Array(this.length);
  }
}

class MockAudioBufferSourceNode extends MockScheduledSourceNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  readonly playbackRate = new MockAudioParam(1);
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MockAudioParam(1000);
  readonly Q = new MockAudioParam(1);
}

class MockStereoPannerNode extends MockAudioNode {
  readonly pan = new MockAudioParam(0);
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  static initialState: AudioContextState = 'running';
  static decodeImpl: ((buf: ArrayBuffer) => Promise<MockAudioBuffer>) | null = null;

  state: AudioContextState;
  currentTime = 1.0;
  sampleRate = 44100;
  readonly destination = new MockAudioNode();
  onstatechange: (() => void) | null = null;

  readonly gains: MockGainNode[] = [];
  readonly oscillators: MockOscillatorNode[] = [];
  readonly bufferSources: MockAudioBufferSourceNode[] = [];
  readonly filters: MockBiquadFilterNode[] = [];
  readonly panners: MockStereoPannerNode[] = [];
  readonly periodicWaves: Array<{ real: Float32Array; imag: Float32Array }> = [];
  readonly decodeCalls: ArrayBuffer[] = [];

  readonly resume = vi.fn(async (): Promise<void> => {
    this.state = 'running';
    this.onstatechange?.();
  });

  readonly close = vi.fn(async (): Promise<void> => {
    this.state = 'closed';
    this.onstatechange?.();
  });

  readonly decodeAudioData = vi.fn(async (buf: ArrayBuffer): Promise<MockAudioBuffer> => {
    this.decodeCalls.push(buf);
    if (MockAudioContext.decodeImpl) {
      return MockAudioContext.decodeImpl(buf);
    }
    return new MockAudioBuffer(1, 4410, this.sampleRate);
  });

  constructor() {
    this.state = MockAudioContext.initialState;
    MockAudioContext.instances.push(this);
  }

  createGain(): MockGainNode {
    const node = new MockGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    return new MockAudioBuffer(channels, length, sampleRate);
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createStereoPanner(): MockStereoPannerNode {
    const node = new MockStereoPannerNode();
    this.panners.push(node);
    return node;
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } {
    const wave = { real, imag };
    this.periodicWaves.push(wave);
    return wave;
  }

  flushEndedNodes(): void {
    for (const osc of this.oscillators) {
      if (osc.onended) osc.triggerEnded();
    }
    for (const src of this.bufferSources) {
      if (src.onended) src.triggerEnded();
    }
  }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

function makeRunState(overrides: {
  runGems?: number;
  maxDepthMeters?: number;
  elapsedTicks?: number;
  unlockedTrophiesInRun?: string[];
} = {}): SimState {
  const state = createInitialState({ seed: 1337, area: 1, styleId: 0, hardMode: false });
  state.runGems = overrides.runGems ?? 0;
  state.runStats.maxDepthMeters = overrides.maxDepthMeters ?? 0;
  state.runStats.elapsedTicks = overrides.elapsedTicks ?? 1800;
  state.unlockedTrophiesInRun = [...(overrides.unlockedTrophiesInRun ?? [])];
  return state;
}

// ============================================================================
// 1. InputManager — TASTE_NOTES & Universal Controls (Keyboard / Gamepad / Touch)
// ============================================================================

describe('InputManager — TASTE_NOTES & Universal Controls', () => {
  let mockWindow: MockEventTarget;
  let mockTarget: MockElement;
  let activeGamepads: Array<MockGamepad | null>;
  let restores: Array<() => void>;
  let settings: RenderSettings;
  let input: InputManager;

  beforeEach(() => {
    mockWindow = new MockEventTarget();
    mockTarget = new MockElement('canvas');
    activeGamepads = [];
    restores = [
      stubGlobalProperty('window', mockWindow),
      stubGlobalProperty('navigator', {
        getGamepads: () => activeGamepads,
      }),
    ];
    settings = createDefaultSettings();
    input = new InputManager(mockTarget as unknown as HTMLElement, settings);
  });

  afterEach(() => {
    input.destroy();
    while (restores.length > 0) {
      restores.pop()!();
    }
  });

  it('initializes with touchActive === false and lastSource === "keyboard"', () => {
    const snap = input.getDebugSnapshot();
    expect(snap.touchActive).toBe(false);
    expect(snap.lastSource).toBe('keyboard');
    expect(snap.gamepadConnected).toBe(false);
    expect(snap.gamepadName).toBeNull();
    expect(snap.frame.inputSource).toBe('keyboard');

    const frame = input.pollFrame();
    expect(frame.inputSource).toBe('keyboard');
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(false);
    expect(frame.action).toBe(false);
  });

  it('does NOT activate touch on mouse or pen pointerdown', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    mockTarget.dispatch('pointerdown', { pointerType: 'mouse' });
    mockTarget.dispatch('pointerdown', { pointerType: 'pen' });

    const snap = input.getDebugSnapshot();
    expect(snap.touchActive).toBe(false);
    expect(snap.lastSource).toBe('keyboard');
    expect(onTouch).not.toHaveBeenCalled();
  });

  it('activates touchActive on genuine touchstart and fires onTouchVisibilityChange(true) once', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    mockTarget.dispatch('touchstart');

    expect(input.getDebugSnapshot().touchActive).toBe(true);
    expect(input.getDebugSnapshot().lastSource).toBe('touch');
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(true);

    // Second touchstart while already active does not duplicate callback
    mockTarget.dispatch('touchstart');
    expect(onTouch).toHaveBeenCalledTimes(1);
  });

  it('activates touchActive on PointerEvent with pointerType === "touch"', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    mockTarget.dispatch('pointerdown', { pointerType: 'touch' });

    expect(input.getDebugSnapshot().touchActive).toBe(true);
    expect(input.getDebugSnapshot().lastSource).toBe('touch');
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(true);
  });

  it('keeps touchActive === true when pressing F9 (or F12) debug function keys', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    mockTarget.dispatch('touchstart');
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    mockWindow.dispatch('keydown', { code: 'F9', key: 'F9' });
    mockWindow.dispatch('keydown', { code: 'F12', key: 'F12' });

    expect(input.getDebugSnapshot().touchActive).toBe(true);
    expect(input.getDebugSnapshot().lastSource).toBe('touch');
    expect(onTouch).not.toHaveBeenCalled();
  });

  it('immediately hides touch and fires onTouchVisibilityChange(false) on ArrowRight or Space keydown', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    // Case 1: ArrowRight
    mockTarget.dispatch('touchstart');
    input.setTouchInput({ left: true, action: true });
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    const arrowEv = mockWindow.dispatch('keydown', { code: 'ArrowRight', key: 'ArrowRight' });
    // Immediate — checked BEFORE pollFrame()
    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(input.getDebugSnapshot().lastSource).toBe('keyboard');
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(false);
    expect(arrowEv.preventDefault).toHaveBeenCalledTimes(1);

    const f1 = input.pollFrame();
    expect(f1.right).toBe(true);
    expect(f1.left).toBe(false); // stale touch input cleared
    expect(f1.inputSource).toBe('keyboard');
    mockWindow.dispatch('keyup', { code: 'ArrowRight', key: 'ArrowRight' });

    // Case 2: Space
    mockTarget.dispatch('pointerdown', { pointerType: 'touch' });
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    const spaceEv = mockWindow.dispatch('keydown', { code: 'Space', key: ' ' });
    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(input.getDebugSnapshot().lastSource).toBe('keyboard');
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(false);
    expect(spaceEv.preventDefault).toHaveBeenCalledTimes(1);

    const f2 = input.pollFrame();
    expect(f2.action).toBe(true);
    expect(f2.actionPressed).toBe(true);
    expect(f2.inputSource).toBe('keyboard');

    mockWindow.dispatch('keyup', { code: 'Space', key: ' ' });
    const f3 = input.pollFrame();
    expect(f3.action).toBe(false);
    expect(f3.actionReleased).toBe(true);
  });

  it('immediately hides touch and ignores future touchstart when settings.touchMode === "off"', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    mockTarget.dispatch('touchstart');
    input.setTouchInput({ right: true });
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    input.updateSettings({ ...settings, touchMode: 'off' });
    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(false);
    expect(input.pollFrame().right).toBe(false);

    onTouch.mockClear();
    mockTarget.dispatch('touchstart');
    mockTarget.dispatch('pointerdown', { pointerType: 'touch' });
    input.setTouchActive(true);

    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(onTouch).not.toHaveBeenCalled();
  });

  it('enforces left stick X deadzone (0.15 ignored, 0.5 -> right, -0.5 -> left) and Y deadzone (0.2 ignored, -0.6 -> up, 0.6 -> down)', () => {
    // Inside X & Y deadzones: ignored
    activeGamepads = [createMockGamepad({ axes: [0.15, 0.2, 0, 0] })];
    let frame = input.pollFrame();
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(false);
    expect(frame.up).toBe(false);
    expect(frame.down).toBe(false);

    activeGamepads = [createMockGamepad({ axes: [-0.15, -0.2, 0, 0] })];
    frame = input.pollFrame();
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(false);
    expect(frame.up).toBe(false);
    expect(frame.down).toBe(false);

    // X = +0.5 -> right
    activeGamepads = [createMockGamepad({ axes: [0.5, 0, 0, 0] })];
    frame = input.pollFrame();
    expect(frame.right).toBe(true);
    expect(frame.left).toBe(false);
    expect(frame.inputSource).toBe('gamepad');

    // X = -0.5 -> left
    activeGamepads = [createMockGamepad({ axes: [-0.5, 0, 0, 0] })];
    frame = input.pollFrame();
    expect(frame.left).toBe(true);
    expect(frame.right).toBe(false);
    expect(frame.inputSource).toBe('gamepad');

    // Y = -0.6 -> up
    activeGamepads = [createMockGamepad({ axes: [0, -0.6, 0, 0] })];
    frame = input.pollFrame();
    expect(frame.up).toBe(true);
    expect(frame.down).toBe(false);
    expect(frame.inputSource).toBe('gamepad');

    // Y = +0.6 -> down
    activeGamepads = [createMockGamepad({ axes: [0, 0.6, 0, 0] })];
    frame = input.pollFrame();
    expect(frame.down).toBe(true);
    expect(frame.up).toBe(false);
    expect(frame.inputSource).toBe('gamepad');
  });

  it('polls D-Pad buttons 12/13/14/15 as up/down/left/right', () => {
    activeGamepads = [createMockGamepad({ pressedButtons: [12] })];
    expect(input.pollFrame()).toMatchObject({ up: true, down: false, left: false, right: false });

    activeGamepads = [createMockGamepad({ pressedButtons: [13] })];
    expect(input.pollFrame()).toMatchObject({ up: false, down: true, left: false, right: false });

    activeGamepads = [createMockGamepad({ pressedButtons: [14] })];
    expect(input.pollFrame()).toMatchObject({ up: false, down: false, left: true, right: false });

    activeGamepads = [createMockGamepad({ pressedButtons: [15] })];
    expect(input.pollFrame()).toMatchObject({ up: false, down: false, left: false, right: true });
  });

  it('polls Xbox / Standard / Tesla action, pause, retry, and cancel buttons accurately', () => {
    const clearPad = () => {
      activeGamepads = [createMockGamepad()];
      input.pollFrame();
    };

    // A(0) -> action
    activeGamepads = [createMockGamepad({ pressedButtons: [0] })];
    expect(input.pollFrame()).toMatchObject({ action: true, actionPressed: true, cancelPressed: false });
    clearPad();

    // B(1) -> action AND cancel
    activeGamepads = [createMockGamepad({ pressedButtons: [1] })];
    expect(input.pollFrame()).toMatchObject({ action: true, actionPressed: true, cancelPressed: true });
    clearPad();

    // X(2) -> action
    activeGamepads = [createMockGamepad({ pressedButtons: [2] })];
    expect(input.pollFrame()).toMatchObject({ action: true, actionPressed: true });
    clearPad();

    // RB(5) -> action
    activeGamepads = [createMockGamepad({ pressedButtons: [5] })];
    expect(input.pollFrame()).toMatchObject({ action: true, actionPressed: true });
    clearPad();

    // RT(7) analog threshold (> 0.35 triggers action; <= 0.35 ignored)
    activeGamepads = [createMockGamepad({ buttonValues: { 7: 0.35 } })];
    expect(input.pollFrame().action).toBe(false);

    activeGamepads = [createMockGamepad({ buttonValues: { 7: 0.36 } })];
    expect(input.pollFrame()).toMatchObject({ action: true, actionPressed: true });
    clearPad();

    // Start(9) -> pause
    activeGamepads = [createMockGamepad({ pressedButtons: [9] })];
    expect(input.pollFrame()).toMatchObject({ pausePressed: true, action: false });
    clearPad();

    // Select(8) -> retry
    activeGamepads = [createMockGamepad({ pressedButtons: [8] })];
    expect(input.pollFrame()).toMatchObject({ retryPressed: true });
    clearPad();

    // Y(3) -> retry
    activeGamepads = [createMockGamepad({ pressedButtons: [3] })];
    expect(input.pollFrame()).toMatchObject({ retryPressed: true });
  });

  it('auto-hides touchActive immediately on any gamepad button press or stick movement > deadzone', () => {
    const onTouch = vi.fn();
    input.onTouchVisibilityChange(onTouch);

    // 1. Stick inside deadzone does NOT hide touch
    mockTarget.dispatch('touchstart');
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    activeGamepads = [createMockGamepad({ axes: [0.15, 0.2, 0, 0] })];
    input.pollFrame();
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    expect(onTouch).not.toHaveBeenCalled();

    // 2. Stick X > deadzone hides touch immediately
    activeGamepads = [createMockGamepad({ axes: [0.5, 0, 0, 0] })];
    const stickFrame = input.pollFrame();
    expect(stickFrame.right).toBe(true);
    expect(stickFrame.inputSource).toBe('gamepad');
    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(input.getDebugSnapshot().lastSource).toBe('gamepad');
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(false);

    // 3. Re-activate touch, then press gamepad button -> hides touch immediately
    activeGamepads = [createMockGamepad()];
    input.pollFrame();
    mockTarget.dispatch('touchstart');
    expect(input.getDebugSnapshot().touchActive).toBe(true);
    onTouch.mockClear();

    activeGamepads = [createMockGamepad({ pressedButtons: [0] })];
    const btnFrame = input.pollFrame();
    expect(btnFrame.action).toBe(true);
    expect(btnFrame.inputSource).toBe('gamepad');
    expect(input.getDebugSnapshot().touchActive).toBe(false);
    expect(onTouch).toHaveBeenCalledTimes(1);
    expect(onTouch).toHaveBeenCalledWith(false);
  });

  it('invokes vibrationActuator.playEffect("dual-rumble", ...) only when settings.rumble === true', () => {
    const pad = createMockGamepad();
    activeGamepads = [pad];

    // settings.rumble is true by default
    input.rumble(0.5, 80);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      startDelay: 0,
      duration: 80,
      weakMagnitude: 0.5,
      strongMagnitude: 0.425,
    });

    // Disable rumble -> skipped
    pad.vibrationActuator.playEffect.mockClear();
    input.updateSettings({ ...settings, rumble: false });
    input.rumble(0.5, 80);
    expect(pad.vibrationActuator.playEffect).not.toHaveBeenCalled();
  });

  it('emits gamepad connect/disconnect toasts and cleans up listeners on destroy()', () => {
    const onToast = vi.fn();
    input.onGamepadToast(onToast);

    const pad = createMockGamepad({ id: 'Tesla Gamepad (Standard)' });
    activeGamepads = [pad];
    mockWindow.dispatch('gamepadconnected', { gamepad: pad });
    expect(onToast).toHaveBeenCalledWith('GAMEPAD CONNECTED: TESLA GAMEPAD');

    activeGamepads = [];
    mockWindow.dispatch('gamepaddisconnected', { gamepad: pad });
    expect(onToast).toHaveBeenCalledWith('GAMEPAD DISCONNECTED');

    input.destroy();
    expect(mockWindow.listenerCount('keydown')).toBe(0);
    expect(mockTarget.listenerCount('touchstart')).toBe(0);
    expect(mockTarget.listenerCount('pointerdown')).toBe(0);
  });
});

// ============================================================================
// 2. TouchOverlay — TASTE_NOTES DOM Visibility & Multi-Touch Slide-Across Pad
// ============================================================================

describe('TouchOverlay — TASTE_NOTES DOM & Multi-Touch', () => {
  let mockWindow: MockEventTarget;
  let mockDoc: MockDocument;
  let container: MockElement;
  let targetCanvas: MockElement;
  let restores: Array<() => void>;
  let settings: RenderSettings;
  let input: InputManager;
  let overlay: TouchOverlay;

  beforeEach(() => {
    mockWindow = new MockEventTarget();
    mockDoc = new MockDocument();
    container = new MockElement('div');
    targetCanvas = new MockElement('canvas');
    restores = [
      stubGlobalProperty('window', mockWindow),
      stubGlobalProperty('document', mockDoc),
      stubGlobalProperty('navigator', { getGamepads: () => [] }),
    ];
    settings = createDefaultSettings();
    input = new InputManager(targetCanvas as unknown as HTMLElement, settings);
    overlay = new TouchOverlay(
      container as unknown as HTMLElement,
      input,
      settings,
    );
  });

  afterEach(() => {
    overlay.destroy();
    input.destroy();
    while (restores.length > 0) {
      restores.pop()!();
    }
  });

  it('initializes #krunked-touch-overlay hidden with zero pointer interception', () => {
    const root = overlay.getElement() as unknown as MockElement;
    const movePad = root.findByControl('move-pad');
    const actionBtn = root.findByControl('action-btn');
    const pauseBtn = root.findByControl('pause-btn');

    expect(root.id).toBe('krunked-touch-overlay');
    expect(container.children).toContain(root);
    expect(root.getAttribute('data-touch-active')).toBe('false');
    expect(root.style.visibility).toBe('hidden');
    expect(root.style.opacity).toBe('0');
    expect(root.style.pointerEvents).toBe('none');

    expect(movePad).toBeDefined();
    expect(actionBtn).toBeDefined();
    expect(pauseBtn).toBeDefined();
    expect(movePad!.style.pointerEvents).toBe('none');
    expect(actionBtn!.style.pointerEvents).toBe('none');
    expect(pauseBtn!.style.pointerEvents).toBe('none');
  });

  it('flips DOM visibility on setVisible(true) while keeping root pointerEvents="none" and enabling pointerEvents="auto" ONLY on control clusters', () => {
    const root = overlay.getElement() as unknown as MockElement;
    const movePad = root.findByControl('move-pad')!;
    const actionBtn = root.findByControl('action-btn')!;
    const pauseBtn = root.findByControl('pause-btn')!;
    const [leftHalf, rightHalf] = movePad.children;

    overlay.setVisible(true);

    expect(root.getAttribute('data-touch-active')).toBe('true');
    expect(root.style.visibility).toBe('visible');
    expect(root.style.opacity).toBe('1');
    // Root NEVER blocks center screen!
    expect(root.style.pointerEvents).toBe('none');

    // Control clusters ONLY receive pointers
    expect(movePad.style.pointerEvents).toBe('auto');
    expect(actionBtn.style.pointerEvents).toBe('auto');
    expect(pauseBtn.style.pointerEvents).toBe('auto');

    // Inner visual halves of movePad stay pointerEvents: none so movePad captures slide smoothly
    expect(leftHalf!.style.pointerEvents).toBe('none');
    expect(rightHalf!.style.pointerEvents).toBe('none');

    // Hiding restores everything back to hidden + pointerEvents: none
    overlay.setVisible(false);
    expect(root.getAttribute('data-touch-active')).toBe('false');
    expect(root.style.visibility).toBe('hidden');
    expect(root.style.opacity).toBe('0');
    expect(root.style.pointerEvents).toBe('none');
    expect(movePad.style.pointerEvents).toBe('none');
    expect(actionBtn.style.pointerEvents).toBe('none');
    expect(pauseBtn.style.pointerEvents).toBe('none');
  });

  it('supports smooth slide-across Left->Right pad on pointermove with same pointerId while simultaneously holding action on a second pointerId', () => {
    const root = overlay.getElement() as unknown as MockElement;
    const movePad = root.findByControl('move-pad')!;
    const actionBtn = root.findByControl('action-btn')!;
    const pauseBtn = root.findByControl('pause-btn')!;

    // Position movePad at x=[20..184] -> midpoint = 102
    movePad.setRect({ left: 20, top: 420, width: 164, height: 76 });

    // Activate touch mode via genuine touchstart (automatically invokes overlay.setVisible(true))
    targetCanvas.dispatch('touchstart');
    expect(root.getAttribute('data-touch-active')).toBe('true');
    expect(root.style.visibility).toBe('visible');

    // Finger 1 (pointerId=1) touches left half (clientX=55 < 102)
    movePad.dispatch('pointerdown', { pointerId: 1, clientX: 55, clientY: 455 });
    let frame = input.pollFrame();
    expect(frame.left).toBe(true);
    expect(frame.right).toBe(false);
    expect(frame.action).toBe(false);
    expect(frame.inputSource).toBe('touch');

    // Finger 2 (pointerId=2) simultaneously presses Action button
    actionBtn.dispatch('pointerdown', { pointerId: 2, clientX: 340, clientY: 450 });
    frame = input.pollFrame();
    expect(frame.left).toBe(true);
    expect(frame.right).toBe(false);
    expect(frame.action).toBe(true);
    expect(frame.actionPressed).toBe(true);

    // Finger 1 (same pointerId=1) slides across to right half (clientX=155 > 102) while Finger 2 stays held
    movePad.dispatch('pointermove', { pointerId: 1, clientX: 155, clientY: 455 });
    frame = input.pollFrame();
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(true);
    expect(frame.action).toBe(true);
    expect(frame.actionPressed).toBe(false); // still held, not re-triggered

    // Unrelated pointerId=99 moving over movePad is ignored
    movePad.dispatch('pointermove', { pointerId: 99, clientX: 30, clientY: 455 });
    frame = input.pollFrame();
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(true);
    expect(frame.action).toBe(true);

    // Finger 1 slides smoothly back to left half (clientX=45 < 102)
    movePad.dispatch('pointermove', { pointerId: 1, clientX: 45, clientY: 455 });
    frame = input.pollFrame();
    expect(frame.left).toBe(true);
    expect(frame.right).toBe(false);
    expect(frame.action).toBe(true);

    // Release Finger 2 (action), Finger 1 (left) remains active
    actionBtn.dispatch('pointerup', { pointerId: 2, clientX: 340, clientY: 450 });
    frame = input.pollFrame();
    expect(frame.left).toBe(true);
    expect(frame.action).toBe(false);
    expect(frame.actionReleased).toBe(true);

    // Release Finger 1 (movePad)
    movePad.dispatch('pointerup', { pointerId: 1, clientX: 45, clientY: 455 });
    frame = input.pollFrame();
    expect(frame.left).toBe(false);
    expect(frame.right).toBe(false);
    expect(frame.action).toBe(false);

    // Finger 3 (pointerId=3) taps Pause button
    pauseBtn.dispatch('pointerdown', { pointerId: 3, clientX: 360, clientY: 20 });
    frame = input.pollFrame();
    expect(frame.pausePressed).toBe(true);
    pauseBtn.dispatch('pointerup', { pointerId: 3, clientX: 360, clientY: 20 });

    // Keyboard press immediately hides TouchOverlay via InputManager subscription
    mockWindow.dispatch('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' });
    expect(root.getAttribute('data-touch-active')).toBe('false');
    expect(root.style.visibility).toBe('hidden');
    expect(root.style.opacity).toBe('0');
    expect(movePad.style.pointerEvents).toBe('none');
  });

  it('applies touchSize presets and hides cleanly when touchMode switches to "off"', () => {
    const root = overlay.getElement() as unknown as MockElement;
    const movePad = root.findByControl('move-pad')!;
    const actionBtn = root.findByControl('action-btn')!;

    overlay.updateSettings({ ...settings, touchSize: 'compact' }, 1);
    expect(movePad.style.width).toBe('136px');
    expect(actionBtn.style.width).toBe('74px');

    overlay.updateSettings({ ...settings, touchSize: 'large' }, 2);
    expect(movePad.style.width).toBe('196px');
    expect(actionBtn.style.width).toBe('108px');

    overlay.setVisible(true);
    expect(root.getAttribute('data-touch-active')).toBe('true');

    overlay.updateSettings({ ...settings, touchMode: 'off' }, 2);
    expect(root.getAttribute('data-touch-active')).toBe('false');
    expect(root.style.visibility).toBe('hidden');
  });
});

// ============================================================================
// 3. SaveManager (krunked_well_save_v1)
// ============================================================================

describe('SaveManager (krunked_well_save_v1)', () => {
  it('persists and reloads settings, selected style/palette, and run stats under krunked_well_save_v1', () => {
    const storage = new MemoryStorage();
    const mgr = new SaveManager(storage);

    expect(WELL_CONSTANTS.SAVE_KEY).toBe('krunked_well_save_v1');

    mgr.updateSettings({
      fpsCap: 60,
      tateMode: 90,
      touchMode: 'off',
      touchOpacity: 0.65,
      touchSize: 'large',
      artPack: 'custom',
      pixelSnap60: true,
      displayScale: 'integer',
      sfxVolume: 0.45,
      bgmVolume: 0.35,
      screenshake: false,
      rumble: false,
    });
    mgr.setSelectedStyle(3);
    mgr.setSelectedPalette(12);
    mgr.recordRunEnd(
      makeRunState({
        runGems: 1450,
        maxDepthMeters: 312,
        elapsedTicks: 5400,
        unlockedTrophiesInRun: ['trophy_1', 'trophy_4'],
      }),
      false,
    );

    const rawStored = storage.getItem('krunked_well_save_v1');
    expect(rawStored).not.toBeNull();

    // Reload from a brand-new SaveManager pointing at the same storage
    const reloaded = new SaveManager(storage).getData();
    expect(reloaded.version).toBe(1);
    expect(reloaded.settings.fpsCap).toBe(60);
    expect(reloaded.settings.tateMode).toBe(90);
    expect(reloaded.settings.touchMode).toBe('off');
    expect(reloaded.settings.touchOpacity).toBe(0.65);
    expect(reloaded.settings.touchSize).toBe('large');
    expect(reloaded.settings.artPack).toBe('custom');
    expect(reloaded.settings.pixelSnap60).toBe(true);
    expect(reloaded.settings.displayScale).toBe('integer');
    expect(reloaded.settings.sfxVolume).toBe(0.45);
    expect(reloaded.settings.bgmVolume).toBe(0.35);
    expect(reloaded.settings.screenshake).toBe(false);
    expect(reloaded.settings.rumble).toBe(false);

    expect(reloaded.selectedStyle).toBe(3);
    expect(reloaded.selectedPalette).toBe(12);
    expect(reloaded.totalGems).toBe(1450);
    expect(reloaded.highScore).toBe(1450);
    expect(reloaded.bestDepth).toBe(312);
    expect(reloaded.runsPlayed).toBe(1);
    expect(reloaded.victories).toBe(0);
    expect(reloaded.unlockedTrophies).toEqual(['trophy_1', 'trophy_4']);
  });

  it('recovers cleanly without throwing from corrupt or malformed JSON in storage', () => {
    const corruptPayloads = [
      '{not valid json!!!',
      '{"version":1,"settings":',
      'undefined',
      'null',
      '12345',
      '"unexpected string"',
    ];

    const defaults = createDefaultSaveData();

    for (const payload of corruptPayloads) {
      const storage = new MemoryStorage();
      storage.setItem(WELL_CONSTANTS.SAVE_KEY, payload);

      let mgr!: SaveManager;
      expect(() => {
        mgr = new SaveManager(storage);
      }).not.toThrow();

      expect(mgr.getData()).toEqual(defaults);
    }

    // Also verifies corrupt JSON is rewritten with clean valid JSON defaults
    const rewriteStorage = new MemoryStorage();
    rewriteStorage.setItem(WELL_CONSTANTS.SAVE_KEY, '{{{broken');
    new SaveManager(rewriteStorage);
    const rewritten = rewriteStorage.getItem(WELL_CONSTANTS.SAVE_KEY);
    expect(rewritten).not.toBeNull();
    expect(() => JSON.parse(rewritten!)).not.toThrow();
    expect(JSON.parse(rewritten!).version).toBe(1);
  });

  it('sanitizes out-of-range fields (invalid fpsCap, out-of-bounds palette, negative gems, volumes, trophies)', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      WELL_CONSTANTS.SAVE_KEY,
      JSON.stringify({
        version: 99,
        totalGems: -5000,
        highScore: -100,
        bestDepth: -42,
        runsPlayed: -7,
        victories: -2,
        fastestVictoryTicks: -10,
        hardModeUnlocked: false,
        hardModeEnabled: true, // invalid when hardModeUnlocked is false
        selectedStyle: 99,
        selectedPalette: 999,
        unlockedStyles: [0, 99, -1, 2],
        unlockedPalettes: [-5, 0, 7, 400, 'nope'],
        unlockedTrophies: ['trophy_1', 'bogus_badge', 'trophy_1', 42],
        settings: {
          fpsCap: 144,
          tateMode: 180,
          displayScale: 'stretch',
          touchMode: 'always',
          touchOpacity: 9.5,
          touchSize: 'xxl',
          artPack: 'unknown',
          sfxVolume: -3,
          bgmVolume: 4,
          keybinds: {
            left: [],
            right: [123, ''],
          },
        },
      }),
    );

    const data = new SaveManager(storage).getData();

    expect(data.version).toBe(1);
    expect(data.totalGems).toBe(0);
    expect(data.highScore).toBe(0);
    expect(data.bestDepth).toBe(0);
    expect(data.runsPlayed).toBe(0);
    expect(data.victories).toBe(0);
    expect(data.fastestVictoryTicks).toBeNull();
    expect(data.hardModeUnlocked).toBe(false);
    expect(data.hardModeEnabled).toBe(false);
    expect(data.selectedStyle).toBe(0);
    expect(data.selectedPalette).toBe(PALETTES.length - 1);
    expect(data.unlockedStyles).toEqual([0, 2]);
    expect(data.unlockedPalettes).toEqual([0, 7]);
    expect(data.unlockedTrophies).toEqual(['trophy_1']);

    expect(data.settings.fpsCap).toBe(120);
    expect(data.settings.tateMode).toBe(0);
    expect(data.settings.displayScale).toBe('fit');
    expect(data.settings.touchMode).toBe('auto');
    expect(data.settings.touchOpacity).toBe(0.8);
    expect(data.settings.touchSize).toBe('standard');
    expect(data.settings.artPack).toBe('builtin');
    expect(data.settings.sfxVolume).toBe(0);
    expect(data.settings.bgmVolume).toBe(1);
    expect(data.settings.keybinds.left).toEqual(['ArrowLeft', 'KeyA']);
    expect(data.settings.keybinds.right).toEqual(['ArrowRight', 'KeyD']);

    // Also verify negative palette & below-minimum touchOpacity clamping
    const lowClamp = sanitizeSaveData({
      selectedPalette: -99,
      settings: { touchOpacity: 0.01, fpsCap: 30, tateMode: 270, touchSize: 'compact' },
    });
    expect(lowClamp.selectedPalette).toBe(0);
    expect(lowClamp.settings.touchOpacity).toBe(0.2);
    expect(lowClamp.settings.fpsCap).toBe(30);
    expect(lowClamp.settings.tateMode).toBe(270);
    expect(lowClamp.settings.touchSize).toBe('compact');
  });

  it('recordRunEnd() unlocks Hard Mode on victory, accumulates totalGems, unlocks styles & palettes at exact milestones (1000, 3000, 10000, 20000, 30000, 500000), and merges trophies without duplicates', () => {
    const storage = new MemoryStorage();
    const mgr = new SaveManager(storage);

    // 999 gems, non-victory: no milestone yet, hard mode still locked
    let diff = mgr.recordRunEnd(
      makeRunState({
        runGems: 999,
        maxDepthMeters: 80,
        unlockedTrophiesInRun: ['trophy_1', 'trophy_4', 'trophy_1'],
      }),
      false,
    );
    expect(mgr.getData().totalGems).toBe(999);
    expect(mgr.getData().hardModeUnlocked).toBe(false);
    expect(mgr.getData().victories).toBe(0);
    expect(mgr.getData().fastestVictoryTicks).toBeNull();
    expect(diff.newlyUnlockedPalettes).toEqual([]);
    expect(diff.newlyUnlockedStyles).toEqual([]);
    expect(mgr.getData().unlockedTrophies).toEqual(['trophy_1', 'trophy_4']);

    // +1 gem -> 1,000 milestone: palette 1 (MATCHA)
    diff = mgr.recordRunEnd(
      makeRunState({
        runGems: 1,
        maxDepthMeters: 50,
        unlockedTrophiesInRun: ['trophy_4', 'trophy_2'],
      }),
      false,
    );
    expect(mgr.getData().totalGems).toBe(1000);
    expect(mgr.getData().bestDepth).toBe(80); // max preserved
    expect(diff.newlyUnlockedPalettes).toEqual([1]);
    expect(diff.newlyUnlockedStyles).toEqual([]);
    expect(mgr.getData().unlockedPalettes).toContain(1);
    expect(mgr.getData().unlockedTrophies).toEqual(['trophy_1', 'trophy_2', 'trophy_4']);

    // +2,000 gems -> 3,000 milestone: style 1 (SPIN) + palette 2 (AQUA)
    diff = mgr.recordRunEnd(makeRunState({ runGems: 2000 }), false);
    expect(mgr.getData().totalGems).toBe(3000);
    expect(diff.newlyUnlockedStyles).toEqual([1]);
    expect(diff.newlyUnlockedPalettes).toEqual([2]);
    expect(mgr.getData().unlockedStyles).toEqual([0, 1]);

    // +7,000 gems -> 10,000 milestone: style 2 (HEAVY) + palettes 3,4,5
    diff = mgr.recordRunEnd(makeRunState({ runGems: 7000 }), false);
    expect(mgr.getData().totalGems).toBe(10000);
    expect(diff.newlyUnlockedStyles).toEqual([2]);
    expect(diff.newlyUnlockedPalettes).toEqual([3, 4, 5]);
    expect(mgr.getData().unlockedStyles).toEqual([0, 1, 2]);

    // +10,000 gems -> 20,000 milestone: style 3 (FLOAT) + palettes 6,7,8 + victory unlocks Hard Mode!
    diff = mgr.recordRunEnd(
      makeRunState({
        runGems: 10000,
        maxDepthMeters: 500,
        elapsedTicks: 18000,
        unlockedTrophiesInRun: ['trophy_11', 'trophy_1'],
      }),
      true,
    );
    expect(mgr.getData().totalGems).toBe(20000);
    expect(mgr.getData().hardModeUnlocked).toBe(true);
    expect(mgr.getData().victories).toBe(1);
    expect(mgr.getData().fastestVictoryTicks).toBe(18000);
    expect(diff.newlyUnlockedStyles).toEqual([3]);
    expect(diff.newlyUnlockedPalettes).toEqual([6, 7, 8]);
    expect(mgr.getData().unlockedTrophies).toEqual(['trophy_1', 'trophy_11', 'trophy_2', 'trophy_4']);

    // +10,000 gems -> 30,000 milestone: style 4 (ASCETIC) + palette 9; faster victory updates fastestVictoryTicks
    diff = mgr.recordRunEnd(
      makeRunState({ runGems: 10000, elapsedTicks: 12000 }),
      true,
    );
    expect(mgr.getData().totalGems).toBe(30000);
    expect(mgr.getData().victories).toBe(2);
    expect(mgr.getData().fastestVictoryTicks).toBe(12000);
    expect(diff.newlyUnlockedStyles).toEqual([4]);
    expect(diff.newlyUnlockedPalettes).toEqual([9]);
    expect(mgr.getData().unlockedStyles).toEqual([0, 1, 2, 3, 4]);

    // Slower victory does NOT overwrite fastestVictoryTicks; +470,000 -> 500,000 milestone unlocks palette 37 (HELL) and all 38 palettes!
    diff = mgr.recordRunEnd(
      makeRunState({ runGems: 470000, elapsedTicks: 24000 }),
      true,
    );
    expect(mgr.getData().totalGems).toBe(500000);
    expect(mgr.getData().fastestVictoryTicks).toBe(12000);
    expect(diff.newlyUnlockedStyles).toEqual([]);
    expect(diff.newlyUnlockedPalettes).toContain(37);
    expect(mgr.getData().unlockedPalettes).toHaveLength(38);
    expect(mgr.getData().unlockedPalettes[0]).toBe(0);
    expect(mgr.getData().unlockedPalettes[37]).toBe(37);

    // Confirm no duplicates even after repeated trophy syncs
    mgr.syncTrophiesFromState(
      makeRunState({ unlockedTrophiesInRun: ['trophy_1', 'trophy_11', 'trophy_21'] }),
    );
    expect(mgr.getData().unlockedTrophies).toEqual([
      'trophy_1',
      'trophy_11',
      'trophy_2',
      'trophy_21',
      'trophy_4',
    ]);
  });
});

// ============================================================================
// 4. AudioEngine & ProceduralSynth + soundManifest
// ============================================================================

describe('AudioEngine & ProceduralSynth + soundManifest', () => {
  let restores: Array<() => void>;
  let engine: AudioEngine;
  let fakeClockMs = 1000;

  const useAudioFakeTimers = (): void => {
    fakeClockMs = 1000;
    vi.useFakeTimers();
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeClockMs);
    restores.push(() => perfSpy.mockRestore());
  };

  const advanceAudioMs = (ms: number): void => {
    fakeClockMs += ms;
    vi.advanceTimersByTime(ms);
  };

  beforeEach(() => {
    restores = [];
    fakeClockMs = 1000;
    MockAudioContext.instances = [];
    MockAudioContext.initialState = 'running';
    MockAudioContext.decodeImpl = null;
  });

  afterEach(() => {
    engine?.destroy();
    vi.useRealTimers();
    while (restores.length > 0) {
      restores.pop()!();
    }
  });

  it('runs unlock(), playBgm(), handleSimEvents(), and duckBgm() cleanly in headless Node with zero Web Audio API', () => {
    restores.push(
      stubGlobalProperty('AudioContext', undefined),
      stubGlobalProperty('webkitAudioContext', undefined),
    );

    engine = new AudioEngine();
    expect(() => {
      engine.unlock();
      engine.setVolumes(0.6, 0.8);
      engine.playBgm('bgmArea1');
      engine.duckBgm(500, 0.7);
      engine.playSfx('sfxJump', { worldX: 88 });
      engine.handleSimEvents([
        { type: 'shoot', weaponId: 0, x: 88, y: 120, gemHigh: false },
        { type: 'player_hurt', x: 88, y: 120, hpRemaining: 3 },
        { type: 'boss_defeat', x: 88, y: 200 },
      ]);
      engine.stopBgm();
    }).not.toThrow();

    expect(engine.getDebugSnapshot()).toEqual({
      unlocked: false,
      muted: false,
      currentTrack: null,
      activeVoices: 0,
      usingCustomAudio: false,
    });
  });

  it('validates soundManifest counts, predicates, weapon shot SFX routing, and state-to-BGM routing', () => {
    expect(BGM_TRACK_IDS).toHaveLength(10);
    expect(SFX_IDS).toHaveLength(45);

    for (const id of BGM_TRACK_IDS) {
      expect(isBgmTrackId(id)).toBe(true);
    }
    expect(isBgmTrackId('bgmInvalid')).toBe(false);

    for (const id of SFX_IDS) {
      expect(isSfxId(id)).toBe(true);
    }
    expect(isSfxId('sfxInvalid')).toBe(false);

    const weapons: WeaponId[] = [0, 1, 2, 3, 4, 5, 6];
    for (const w of weapons) {
      expect(isSfxId(getWeaponShotSfxId(w, false))).toBe(true);
      expect(isSfxId(getWeaponShotSfxId(w, true))).toBe(true);
      expect(getWeaponShotSfxId(w, true)).not.toBe(getWeaponShotSfxId(w, false));
    }

    const modeCases: Array<[AreaId, GameMode, boolean, 'shop' | 'secret' | 'gem_cache' | null, string]> = [
      [0, 'title', false, null, 'bgmOverworld'],
      [0, 'surface', false, null, 'bgmOverworld'],
      [1, 'gameover', false, null, 'bgmOverworld'],
      [5, 'victory', false, null, 'bgmCredits'],
      [1, 'playing', false, null, 'bgmArea1'],
      [2, 'playing', false, null, 'bgmArea2'],
      [3, 'playing', false, null, 'bgmArea3'],
      [4, 'playing', false, null, 'bgmLimbo'],
      [5, 'playing', false, null, 'bgmBoss'],
      [1, 'playing', true, 'shop', 'bgmShopCave'],
      [3, 'playing', true, 'shop', 'bgmShopAqua'],
      [2, 'playing', true, 'secret', 'bgmSecret'],
      [2, 'playing', true, 'gem_cache', 'bgmSecret'],
    ];
    for (const [area, mode, inSide, kind, expected] of modeCases) {
      expect(getBgmForState(area, mode, inSide, kind)).toBe(expected);
    }
  });

  it('starts and stops all 10 BGM tracks cleanly with a mocked AudioContext', () => {
    vi.useFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();

    const ctx = MockAudioContext.instances[0]!;
    expect(ctx).toBeDefined();
    expect(engine.getDebugSnapshot().unlocked).toBe(true);

    for (const trackId of BGM_TRACK_IDS) {
      const oscBefore = ctx.oscillators.length;
      const srcBefore = ctx.bufferSources.length;

      engine.playBgm(trackId);
      expect(engine.getDebugSnapshot().currentTrack).toBe(trackId);

      // Advance scheduler slightly so multi-step patterns schedule notes cleanly
      ctx.currentTime += 0.25;
      vi.advanceTimersByTime(40);

      const scheduledNodes =
        (ctx.oscillators.length - oscBefore) + (ctx.bufferSources.length - srcBefore);
      expect(scheduledNodes).toBeGreaterThan(0);

      engine.stopBgm();
      expect(engine.getDebugSnapshot().currentTrack).toBeNull();

      // Verify newly created BGM nodes were cleanly stopped
      const newOscs = ctx.oscillators.slice(oscBefore);
      const newSrcs = ctx.bufferSources.slice(srcBefore);
      for (const n of [...newOscs, ...newSrcs]) {
        expect(n.startedAt).not.toBeNull();
        expect(n.stopped).toBe(true);
      }
    }
  });

  it('resumes a suspended AudioContext on unlock() and starts queued BGM automatically', async () => {
    vi.useFakeTimers();
    MockAudioContext.initialState = 'suspended';
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.playBgm('bgmLimbo');
    expect(engine.getDebugSnapshot().unlocked).toBe(false);
    expect(engine.getDebugSnapshot().currentTrack).toBe('bgmLimbo');

    engine.unlock();
    await flushMicrotasks();

    const ctx = MockAudioContext.instances[0]!;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(engine.getDebugSnapshot().unlocked).toBe(true);
    expect(ctx.oscillators.length).toBeGreaterThan(0);
  });

  it('fires all 45 SFX cleanly with stereo panning and releases voices on completion', () => {
    useAudioFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;

    expect(SFX_IDS).toHaveLength(45);

    for (const sfxId of SFX_IDS) {
      const oscBefore = ctx.oscillators.length;
      const srcBefore = ctx.bufferSources.length;

      engine.playSfx(sfxId, { worldX: 120, combo: 4 });

      const created =
        (ctx.oscillators.length - oscBefore) + (ctx.bufferSources.length - srcBefore);
      expect(created, `expected audio nodes for ${sfxId}`).toBeGreaterThan(0);
      expect(engine.getDebugSnapshot().activeVoices).toBe(1);

      ctx.flushEndedNodes();
      // Ultra-short clicks (e.g. sfxEmpty < 50ms) release via safetyTimer fallback
      if (engine.getDebugSnapshot().activeVoices > 0) {
        advanceAudioMs(120);
      }
      expect(engine.getDebugSnapshot().activeVoices, `voice should release for ${sfxId}`).toBe(0);
    }

    // Confirm stereo panners were engaged for off-center worldX
    expect(ctx.panners.length).toBe(45);
  });

  it('triggers duckBgm(500, 0.7) on player_hurt SimEvent and schedules exact Web Audio gain automation', () => {
    vi.useFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;
    ctx.currentTime = 2.5;

    // gains[0]=master, gains[1]=bgmGain, gains[2]=bgmDuckGain, gains[3]=sfxGain
    const bgmDuckGain = ctx.gains[2]!;
    const duckSpy = vi.spyOn(engine, 'duckBgm');

    const events: SimEvent[] = [
      { type: 'player_hurt', x: 88, y: 140, hpRemaining: 3 },
    ];
    engine.handleSimEvents(events);

    expect(duckSpy).toHaveBeenCalledTimes(1);
    expect(duckSpy).toHaveBeenCalledWith(WELL_CONSTANTS.BGM_DUCK_MS, WELL_CONSTANTS.BGM_DUCK_GAIN);
    expect(duckSpy).toHaveBeenCalledWith(500, 0.7);

    // Verify exact gain automation calls on bgmDuckGain
    const ramps = bgmDuckGain.gain.calls.filter((c) => c.method === 'linearRampToValueAtTime');
    expect(ramps).toHaveLength(2);
    expect(ramps[0]!.args[0]).toBeCloseTo(0.7, 5);
    expect(ramps[0]!.args[1]).toBeCloseTo(2.5 + 0.025, 5);
    expect(ramps[1]!.args[0]).toBeCloseTo(1.0, 5);
    expect(ramps[1]!.args[1]).toBeCloseTo(2.5 + 0.5, 5);
  });

  it('strictly enforces the <= 12 SFX polyphony cap and recovers voices when sounds end', () => {
    vi.useFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;

    // Fire 20 distinct SFX concurrently without ending any voice
    for (let i = 0; i < 20; i++) {
      engine.playSfx(SFX_IDS[i]!, { worldX: 88 });
    }

    expect(engine.getDebugSnapshot().activeVoices).toBe(12);

    // Firing one more distinct SFX is dropped while at cap (12)
    const nodesBeforeCap = ctx.oscillators.length + ctx.bufferSources.length;
    engine.playSfx(SFX_IDS[25]!, { worldX: 88 });
    expect(engine.getDebugSnapshot().activeVoices).toBe(12);
    expect(ctx.oscillators.length + ctx.bufferSources.length).toBe(nodesBeforeCap);

    // Once active voices finish, new SFX can play again
    ctx.flushEndedNodes();
    expect(engine.getDebugSnapshot().activeVoices).toBe(0);

    engine.playSfx(SFX_IDS[26]!, { worldX: 88 });
    expect(engine.getDebugSnapshot().activeVoices).toBe(1);
  });

  it('falls back cleanly to ProceduralSynth when custom audio provider returns null (BGM & SFX)', async () => {
    useAudioFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;

    const synthStartBgmSpy = vi.spyOn(ProceduralSynth.prototype, 'startBgm');
    const synthPlaySfxSpy = vi.spyOn(ProceduralSynth.prototype, 'playSfx');

    const nullProvider = vi.fn(async (_id: string): Promise<ArrayBuffer | null> => null);
    engine.setCustomAudioProvider(nullProvider);

    // 1. BGM fallback when provider returns null
    engine.playBgm('bgmArea2');
    await flushMicrotasks();

    expect(nullProvider).toHaveBeenCalledWith('bgmArea2');
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    expect(synthStartBgmSpy).toHaveBeenCalledWith('bgmArea2', expect.anything(), expect.anything());
    expect(engine.getDebugSnapshot().usingCustomAudio).toBe(false);
    expect(ctx.oscillators.length).toBeGreaterThan(0);

    // 2. SFX fallback when provider returns null (tries exact ID + aliases, caches null, plays synth)
    nullProvider.mockClear();
    engine.playSfx('sfxJump', { worldX: 88 });
    expect(synthPlaySfxSpy).toHaveBeenCalledWith('sfxJump', expect.anything(), expect.anything(), expect.anything());
    await flushMicrotasks();

    const expectedLookups = ['sfxJump', ...(CUSTOM_AUDIO_ALIASES.sfxJump ?? [])];
    expect(nullProvider.mock.calls.map((c) => c[0])).toEqual(expectedLookups);

    // Subsequent trigger (after 25ms cooldown) uses cached null (no redundant fetches) and plays synth cleanly
    ctx.flushEndedNodes();
    advanceAudioMs(50);
    nullProvider.mockClear();
    synthPlaySfxSpy.mockClear();

    engine.playSfx('sfxJump', { worldX: 88 });
    expect(nullProvider).not.toHaveBeenCalled();
    expect(synthPlaySfxSpy).toHaveBeenCalledTimes(1);

    synthStartBgmSpy.mockRestore();
    synthPlaySfxSpy.mockRestore();
  });

  it('falls back cleanly to ProceduralSynth when custom audio provider returns corrupt bytes that fail decodeAudioData', async () => {
    useAudioFakeTimers();
    MockAudioContext.decodeImpl = async () => {
      throw new Error('EncodingError: Unable to decode corrupt audio bytes');
    };
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;

    const synthStartBgmSpy = vi.spyOn(ProceduralSynth.prototype, 'startBgm');
    const synthPlaySfxSpy = vi.spyOn(ProceduralSynth.prototype, 'playSfx');

    const corruptBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11]).buffer;
    const corruptProvider = vi.fn(async (_id: string): Promise<ArrayBuffer | null> => corruptBytes);
    engine.setCustomAudioProvider(corruptProvider);

    // BGM with corrupt bytes -> decode rejects -> clean fallback to ProceduralSynth
    engine.playBgm('bgmBoss');
    await flushMicrotasks();

    expect(corruptProvider).toHaveBeenCalledWith('bgmBoss');
    expect(ctx.decodeAudioData).toHaveBeenCalled();
    expect(synthStartBgmSpy).toHaveBeenCalledWith('bgmBoss', expect.anything(), expect.anything());
    expect(engine.getDebugSnapshot().usingCustomAudio).toBe(false);
    expect(ctx.oscillators.length).toBeGreaterThan(0);

    // SFX with corrupt bytes -> zero-latency synth playback + cached null after decode error
    engine.playSfx('sfxExplosion', { worldX: 100 });
    await flushMicrotasks();
    expect(synthPlaySfxSpy).toHaveBeenCalledWith('sfxExplosion', expect.anything(), expect.anything(), expect.anything());

    ctx.flushEndedNodes();
    advanceAudioMs(50);
    corruptProvider.mockClear();
    synthPlaySfxSpy.mockClear();

    engine.playSfx('sfxExplosion', { worldX: 100 });
    expect(corruptProvider).not.toHaveBeenCalled();
    expect(synthPlaySfxSpy).toHaveBeenCalledTimes(1);

    synthStartBgmSpy.mockRestore();
    synthPlaySfxSpy.mockRestore();
  });

  it('plays decoded custom BGM & SFX buffers when provider succeeds and hot-swaps back to synth when cleared', async () => {
    useAudioFakeTimers();
    restores.push(stubGlobalProperty('AudioContext', MockAudioContext));

    engine = new AudioEngine();
    engine.unlock();
    const ctx = MockAudioContext.instances[0]!;

    const validBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x01, 0x02]).buffer;
    const goodProvider = vi.fn(async (_id: string): Promise<ArrayBuffer | null> => validBytes);
    engine.setCustomAudioProvider(goodProvider);

    engine.playBgm('bgmArea1');
    await flushMicrotasks();

    const loopingBgm = ctx.bufferSources.find((s) => s.loop === true);
    expect(loopingBgm).toBeDefined();
    expect(loopingBgm!.startedAt).not.toBeNull();
    expect(engine.getDebugSnapshot().usingCustomAudio).toBe(true);

    // Prime custom SFX buffer, then play second time (after 25ms cooldown) to hit custom AudioBufferSourceNode path
    engine.playSfx('sfxStomp', { worldX: 110, combo: 2 });
    await flushMicrotasks();
    ctx.flushEndedNodes();
    advanceAudioMs(50);

    const bufSrcBefore = ctx.bufferSources.length;
    engine.playSfx('sfxStomp', { worldX: 110, combo: 2 });
    expect(ctx.bufferSources.length).toBe(bufSrcBefore + 1);
    expect(engine.getDebugSnapshot().activeVoices).toBe(1);

    // Clearing custom provider hot-swaps cleanly back to ProceduralSynth
    engine.setCustomAudioProvider(null);
    expect(loopingBgm!.stopped).toBe(true);
    expect(engine.getDebugSnapshot().usingCustomAudio).toBe(false);
  });
});
