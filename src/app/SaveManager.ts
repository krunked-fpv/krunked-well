import {
  WELL_CONSTANTS,
  type ArtPackMode,
  type DisplayScaleMode,
  type FpsCap,
  type KeybindMap,
  type RenderSettings,
  type SaveData,
  type SimState,
  type StyleId,
  type TateMode,
  type TouchButtonSize,
  type TouchControlMode,
} from '../contracts/index.ts';
import { PALETTES } from '../data/palettes.ts';
import { computeUnlockedFromGems } from '../sim/progression.ts';

export const DEFAULT_KEYBINDS: KeybindMap = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  action: ['Space', 'KeyZ', 'KeyJ', 'Enter'],
  pause: ['Escape', 'KeyP'],
  cancel: ['Escape', 'KeyX', 'Backspace'],
  retry: ['KeyR'],
};

export function createDefaultSettings(): RenderSettings {
  return {
    fpsCap: 120,
    pixelSnap60: false,
    displayScale: 'fit',
    tateMode: 0,
    sfxVolume: 0.75,
    bgmVolume: 0.6,
    screenshake: true,
    rumble: true,
    touchMode: 'auto',
    touchOpacity: 0.38,
    touchSize: 'standard',
    artPack: 'builtin',
    keybinds: {
      left: [...DEFAULT_KEYBINDS.left],
      right: [...DEFAULT_KEYBINDS.right],
      up: [...DEFAULT_KEYBINDS.up],
      down: [...DEFAULT_KEYBINDS.down],
      action: [...DEFAULT_KEYBINDS.action],
      pause: [...DEFAULT_KEYBINDS.pause],
      cancel: [...DEFAULT_KEYBINDS.cancel],
      retry: [...DEFAULT_KEYBINDS.retry],
    },
  };
}

export function createDefaultSaveData(): SaveData {
  return {
    version: 1,
    totalGems: 0,
    highScore: 0,
    bestDepth: 0,
    runsPlayed: 0,
    victories: 0,
    fastestVictoryTicks: null,
    hardModeUnlocked: false,
    hardModeEnabled: false,
    unlockedStyles: [0],
    unlockedPalettes: [0],
    unlockedTrophies: [],
    selectedStyle: 0,
    selectedPalette: 0,
    settings: createDefaultSettings(),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min;
}

function sanitizeFpsCap(v: unknown): FpsCap {
  return v === 30 || v === 60 || v === 120 ? v : 120;
}

function sanitizeDisplayScale(v: unknown): DisplayScaleMode {
  return v === 'integer' ? 'integer' : 'fit';
}

function sanitizeTateMode(v: unknown): TateMode {
  return v === 90 || v === 270 ? v : 0;
}

function sanitizeTouchMode(v: unknown): TouchControlMode {
  return v === 'off' ? 'off' : 'auto';
}

function sanitizeTouchSize(v: unknown): TouchButtonSize {
  return v === 'compact' || v === 'large' ? v : 'standard';
}

function sanitizeArtPack(v: unknown): ArtPackMode {
  return v === 'custom' ? 'custom' : 'builtin';
}

function sanitizeStringArray(v: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(v)) return [...fallback];
  const filtered = v.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return filtered.length > 0 ? filtered : [...fallback];
}

function sanitizeStyleId(v: unknown): StyleId {
  return v === 0 || v === 1 || v === 2 || v === 3 || v === 4 ? v : 0;
}

export function sanitizeSaveData(raw: unknown): SaveData {
  const base = createDefaultSaveData();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const obj = raw as Record<string, unknown>;
  const rawSettings = (obj.settings && typeof obj.settings === 'object'
    ? obj.settings
    : {}) as Record<string, unknown>;
  const rawKeybinds = (rawSettings.keybinds && typeof rawSettings.keybinds === 'object'
    ? rawSettings.keybinds
    : {}) as Record<string, unknown>;

  const totalGems = Math.max(0, Math.floor(Number(obj.totalGems) || 0));
  const gemUnlocks = computeUnlockedFromGems(totalGems);

  const styleSet = new Set<StyleId>([0, ...gemUnlocks.styles]);
  if (Array.isArray(obj.unlockedStyles)) {
    for (const s of obj.unlockedStyles) {
      styleSet.add(sanitizeStyleId(s));
    }
  }

  const paletteSet = new Set<number>([0, ...gemUnlocks.palettes]);
  if (Array.isArray(obj.unlockedPalettes)) {
    for (const p of obj.unlockedPalettes) {
      const idx = Math.floor(Number(p));
      if (Number.isFinite(idx) && idx >= 0 && idx < PALETTES.length) {
        paletteSet.add(idx);
      }
    }
  }

  const trophySet = new Set<string>();
  if (Array.isArray(obj.unlockedTrophies)) {
    for (const t of obj.unlockedTrophies) {
      if (typeof t === 'string' && t.startsWith('trophy_')) {
        trophySet.add(t);
      }
    }
  }

  const selectedStyle = sanitizeStyleId(obj.selectedStyle);
  const selectedPalette = clamp(Math.floor(Number(obj.selectedPalette) || 0), 0, PALETTES.length - 1);
  const hardModeUnlocked = Boolean(obj.hardModeUnlocked);
  const fastestRaw = obj.fastestVictoryTicks;
  const fastestVictoryTicks =
    typeof fastestRaw === 'number' && Number.isFinite(fastestRaw) && fastestRaw > 0
      ? Math.floor(fastestRaw)
      : null;

  return {
    version: 1,
    totalGems,
    highScore: Math.max(0, Math.floor(Number(obj.highScore) || 0)),
    bestDepth: Math.max(0, Math.floor(Number(obj.bestDepth) || 0)),
    runsPlayed: Math.max(0, Math.floor(Number(obj.runsPlayed) || 0)),
    victories: Math.max(0, Math.floor(Number(obj.victories) || 0)),
    fastestVictoryTicks,
    hardModeUnlocked,
    hardModeEnabled: hardModeUnlocked && Boolean(obj.hardModeEnabled),
    unlockedStyles: Array.from(styleSet).sort((a, b) => a - b),
    unlockedPalettes: Array.from(paletteSet).sort((a, b) => a - b),
    unlockedTrophies: Array.from(trophySet).sort(),
    selectedStyle,
    selectedPalette,
    settings: {
      fpsCap: sanitizeFpsCap(rawSettings.fpsCap),
      pixelSnap60: Boolean(rawSettings.pixelSnap60),
      displayScale: sanitizeDisplayScale(rawSettings.displayScale),
      tateMode: sanitizeTateMode(rawSettings.tateMode),
      sfxVolume: clamp(Number(rawSettings.sfxVolume ?? base.settings.sfxVolume), 0, 1),
      bgmVolume: clamp(Number(rawSettings.bgmVolume ?? base.settings.bgmVolume), 0, 1),
      screenshake: rawSettings.screenshake === undefined ? true : Boolean(rawSettings.screenshake),
      rumble: rawSettings.rumble === undefined ? true : Boolean(rawSettings.rumble),
      touchMode: sanitizeTouchMode(rawSettings.touchMode),
      touchOpacity: clamp(Number(rawSettings.touchOpacity ?? base.settings.touchOpacity), 0.2, 0.8),
      touchSize: sanitizeTouchSize(rawSettings.touchSize),
      artPack: sanitizeArtPack(rawSettings.artPack),
      keybinds: {
        left: sanitizeStringArray(rawKeybinds.left, DEFAULT_KEYBINDS.left),
        right: sanitizeStringArray(rawKeybinds.right, DEFAULT_KEYBINDS.right),
        up: sanitizeStringArray(rawKeybinds.up, DEFAULT_KEYBINDS.up),
        down: sanitizeStringArray(rawKeybinds.down, DEFAULT_KEYBINDS.down),
        action: sanitizeStringArray(rawKeybinds.action, DEFAULT_KEYBINDS.action),
        pause: sanitizeStringArray(rawKeybinds.pause, DEFAULT_KEYBINDS.pause),
        cancel: sanitizeStringArray(rawKeybinds.cancel, DEFAULT_KEYBINDS.cancel),
        retry: sanitizeStringArray(rawKeybinds.retry, DEFAULT_KEYBINDS.retry),
      },
    },
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SaveManager {
  private readonly storage: StorageLike | null;
  private data: SaveData;

  constructor(storage?: StorageLike | null) {
    if (storage !== undefined) {
      this.storage = storage;
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      try {
        this.storage = globalThis.localStorage;
      } catch {
        this.storage = null;
      }
    } else {
      this.storage = null;
    }
    this.data = this.load();
  }

  load(): SaveData {
    if (!this.storage) {
      this.data = createDefaultSaveData();
      return this.data;
    }
    try {
      const raw = this.storage.getItem(WELL_CONSTANTS.SAVE_KEY);
      if (!raw) {
        this.data = createDefaultSaveData();
        return this.data;
      }
      const parsed: unknown = JSON.parse(raw);
      this.data = sanitizeSaveData(parsed);
      return this.data;
    } catch {
      // Corrupt save recovery: reset safely and rewrite clean defaults
      this.data = createDefaultSaveData();
      this.save();
      return this.data;
    }
  }

  getData(): SaveData {
    return this.data;
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(WELL_CONSTANTS.SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore quota / private-browsing storage errors
    }
  }

  updateSettings(patch: Partial<RenderSettings>): SaveData {
    this.data = sanitizeSaveData({
      ...this.data,
      settings: {
        ...this.data.settings,
        ...patch,
      },
    });
    this.save();
    return this.data;
  }

  setSelectedStyle(styleId: StyleId): void {
    this.data.selectedStyle = styleId;
    this.save();
  }

  setSelectedPalette(paletteIndex: number): void {
    this.data.selectedPalette = clamp(Math.floor(paletteIndex), 0, PALETTES.length - 1);
    this.save();
  }

  setHardModeEnabled(enabled: boolean): void {
    this.data.hardModeEnabled = enabled;
    if (enabled) {
      this.data.hardModeUnlocked = true;
    }
    this.save();
  }

  recordRunEnd(state: SimState, isVictory: boolean): { newlyUnlockedPalettes: number[]; newlyUnlockedStyles: StyleId[] } {
    const prevPalettes = new Set(this.data.unlockedPalettes);
    const prevStyles = new Set(this.data.unlockedStyles);

    this.data.runsPlayed += 1;
    this.data.totalGems += Math.max(0, state.runGems);
    if (state.runGems > this.data.highScore) {
      this.data.highScore = state.runGems;
    }
    if (state.runStats.maxDepthMeters > this.data.bestDepth) {
      this.data.bestDepth = state.runStats.maxDepthMeters;
    }

    if (isVictory) {
      this.data.victories += 1;
      this.data.hardModeUnlocked = true;
      const ticks = Math.max(1, state.runStats.elapsedTicks);
      if (this.data.fastestVictoryTicks === null || ticks < this.data.fastestVictoryTicks) {
        this.data.fastestVictoryTicks = ticks;
      }
    }

    const trophySet = new Set(this.data.unlockedTrophies);
    for (const id of state.unlockedTrophiesInRun) {
      trophySet.add(id);
    }
    this.data.unlockedTrophies = Array.from(trophySet).sort();

    const unlocks = computeUnlockedFromGems(this.data.totalGems);
    const mergedStyles = new Set<StyleId>([...this.data.unlockedStyles, ...unlocks.styles]);
    const mergedPalettes = new Set<number>([...this.data.unlockedPalettes, ...unlocks.palettes]);
    this.data.unlockedStyles = Array.from(mergedStyles).sort((a, b) => a - b);
    this.data.unlockedPalettes = Array.from(mergedPalettes).sort((a, b) => a - b);

    this.save();

    return {
      newlyUnlockedPalettes: this.data.unlockedPalettes.filter((p) => !prevPalettes.has(p)),
      newlyUnlockedStyles: this.data.unlockedStyles.filter((s) => !prevStyles.has(s)),
    };
  }

  syncTrophiesFromState(state: SimState): void {
    let changed = false;
    const set = new Set(this.data.unlockedTrophies);
    for (const id of state.unlockedTrophiesInRun) {
      if (!set.has(id)) {
        set.add(id);
        changed = true;
      }
    }
    if (changed) {
      this.data.unlockedTrophies = Array.from(set).sort();
      this.save();
    }
  }

  resetAll(): SaveData {
    this.data = createDefaultSaveData();
    this.save();
    return this.data;
  }
}
