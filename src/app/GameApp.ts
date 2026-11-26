import {
  WELL_CONSTANTS,
  type AreaId,
  type ArtPackMode,
  type DebugBridge,
  type EnemyKind,
  type InputFrame,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type StyleId,
  type UpgradeId,
  type WeaponId,
} from '../contracts/index.ts';
import { AssetRegistry } from '../assets/AssetRegistry.ts';
import { generateProceduralWellAtlas } from '../assets/ProceduralWellAtlas.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { getBgmForState } from '../audio/soundManifest.ts';
import { PALETTES } from '../data/palettes.ts';
import { InputManager } from '../input/InputManager.ts';
import { ParticleSystem } from '../render/ParticleSystem.ts';
import { WebGL2WellRenderer } from '../render/WebGL2WellRenderer.ts';
import { damageBoss } from '../sim/boss.ts';
import { createInitialState, EMPTY_INPUT, startNewRun } from '../sim/createState.ts';
import { spawnEnemy } from '../sim/enemies.ts';
import { hashSimState } from '../sim/hash.ts';
import { advanceToNextStage, stepSim, warpStageWithEntities } from '../sim/step.ts';
import { applyUpgrade, rollUpgradeChoices } from '../sim/upgrades.ts';
import { DebugDrawer } from '../ui/DebugDrawer.ts';
import { MenuSystem } from '../ui/MenuSystem.ts';
import { TouchOverlay } from '../ui/TouchOverlay.ts';
import { ViewportLayout } from '../ui/ViewportLayout.ts';
import { SaveManager } from './SaveManager.ts';

export class GameApp {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly saveManager: SaveManager;
  private readonly registry: AssetRegistry;
  private readonly renderer: WebGL2WellRenderer;
  private readonly particles: ParticleSystem;
  private readonly audio: AudioEngine;
  private readonly input: InputManager;
  private readonly layout: ViewportLayout;
  private readonly touchOverlay: TouchOverlay;
  private readonly menu: MenuSystem;
  private readonly debugDrawer: DebugDrawer;

  private state: SimState;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private lastRenderTime = 0;
  private accumulator = 0;
  private measuredFps = 60;
  private fpsFrameCount = 0;
  private fpsSampleStart = 0;
  private runRecorded = false;
  private lastBgmTrack = '';
  private readonly onFirstGesture: () => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.saveManager = new SaveManager();
    const save = this.saveManager.getData();

    // 1. Canvas & Responsive Viewport Layout
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'krunked-well-canvas';
    this.canvas.width = WELL_CONSTANTS.VIEW_W;
    this.canvas.height = WELL_CONSTANTS.VIEW_H;
    this.layout = new ViewportLayout(this.root, this.canvas, save.settings);

    // 2. Procedural Built-In Atlas & Dual Custom Pack Registry
    const builtinAtlas = generateProceduralWellAtlas();
    this.registry = new AssetRegistry(builtinAtlas.canvas, builtinAtlas.manifest);

    // 3. WebGL2 4-Channel Semantic Palette Renderer & Zero-Alloc Particle System
    this.renderer = new WebGL2WellRenderer(this.canvas);
    this.renderer.setAtlas(builtinAtlas.canvas, builtinAtlas.manifest);
    this.renderer.setPalette(save.selectedPalette);
    this.particles = new ParticleSystem();

    // 4. Web Audio Engine (10 procedural BGM tracks + custom pack OGG/WAV swap)
    this.audio = new AudioEngine();
    this.audio.setVolumes(save.settings.bgmVolume, save.settings.sfxVolume);

    // 5. Initial SimState (starts on Title Screen with animated background Cavern well)
    this.state = createInitialState({
      seed: 1337,
      styleId: save.selectedStyle,
      hardMode: save.hardModeEnabled,
      area: 1,
      level: 1,
      mode: 'title',
    });

    // 6. Universal Input Manager (Keyboard + Xbox/Tesla Gamepad + Touch-Only auto state machine)
    this.input = new InputManager(this.root, save.settings);
    this.touchOverlay = new TouchOverlay(this.root, this.input, save.settings);
    this.touchOverlay.updateSettings(save.settings, save.selectedPalette);

    this.input.onGamepadToast((msg) => {
      this.layout.showToast(msg, 2600);
    });

    // Unlock audio cleanly on first gesture
    this.onFirstGesture = () => {
      this.audio.unlock();
      this.syncBgm();
    };
    window.addEventListener('pointerdown', this.onFirstGesture, { passive: true });
    window.addEventListener('keydown', this.onFirstGesture, { passive: true });
    window.addEventListener('touchstart', this.onFirstGesture, { passive: true });

    // 7. Interactive MenuSystem (Title, Style, Palette, Trophies, Options, Pause, Upgrade, End)
    this.menu = new MenuSystem(this.root, {
      onPlay: () => this.beginNewRun(),
      onResume: () => {
        if (this.state.mode === 'paused') {
          this.state.mode = 'playing';
          this.syncBgm();
        }
      },
      onRetry: () => this.beginNewRun(),
      onReturnToTitle: () => {
        this.state.mode = 'title';
        this.particles.reset();
        this.syncBgm();
      },
      onSelectStyle: (styleId) => {
        this.saveManager.setSelectedStyle(styleId);
        this.state.styleId = styleId;
      },
      onSelectPalette: (paletteIndex) => {
        this.applyPalette(paletteIndex);
      },
      onToggleHardMode: (enabled) => {
        this.saveManager.setHardModeEnabled(enabled);
        this.state.hardMode = enabled;
      },
      onUpdateSettings: (partial) => {
        this.applySettings(partial);
      },
      onPickUpgrade: (index) => {
        this.pickUpgradeByIndex(index);
      },
      onSetArtPack: async (mode) => {
        await this.switchArtPack(mode);
      },
      onLoadCustomPack: async () => {
        const ok = await this.registry.loadCustomPackFromPicker();
        if (ok) {
          this.saveManager.updateSettings({ artPack: 'custom' });
          this.applyActiveAssetPack();
          this.layout.showToast('CUSTOM PACK LOADED!', 2800);
        } else {
          this.layout.showToast('PACK LOAD CANCELLED', 2000);
        }
      },
    });

    // 8. Registry hot-swap listener + background custom pack detection
    this.registry.onChange(() => {
      this.applyActiveAssetPack();
    });

    void this.initCustomPackDetection();

    // 9. Debug Bridge & F9 Debug Drawer
    const bridge = this.createDebugBridge();
    window.__KRUNKED_DEBUG__ = bridge;
    this.debugDrawer = new DebugDrawer(this.root, bridge);
  }

  private async initCustomPackDetection(): Promise<void> {
    const found = await this.registry.detectAvailableCustomPack();
    const save = this.saveManager.getData();
    if (found && save.settings.artPack === 'custom') {
      await this.registry.setActiveMode('custom');
    }
    this.applyActiveAssetPack();
  }

  private async switchArtPack(mode: ArtPackMode): Promise<boolean> {
    const ok = await this.registry.setActiveMode(mode);
    const active = this.registry.getActiveMode();
    this.saveManager.updateSettings({ artPack: active });
    this.applyActiveAssetPack();
    this.layout.showToast(
      active === 'custom' ? 'ART PACK: OWNED CUSTOM PACK' : 'ART PACK: BUILT-IN KRUNKED',
      2200,
    );
    return ok;
  }

  private applyActiveAssetPack(): void {
    const { canvas, manifest } = this.registry.getActiveAtlas();
    this.renderer.setAtlas(canvas, manifest);
    this.audio.setCustomAudioProvider(this.registry.getActiveAudioFetcher());
    const snap = this.registry.getDebugSnapshot();
    this.menu.setPackStatus(snap.customPackAvailable, snap.activePack);
  }

  private applyPalette(paletteIndex: number): void {
    const safe = ((paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length;
    this.saveManager.setSelectedPalette(safe);
    this.renderer.setPalette(safe);
    const save = this.saveManager.getData();
    this.layout.updateSettings(save.settings, safe);
    this.touchOverlay.updateSettings(save.settings, safe);
  }

  private applySettings(partial: Partial<RenderSettings>): void {
    const save = this.saveManager.updateSettings(partial);
    this.audio.setVolumes(save.settings.bgmVolume, save.settings.sfxVolume);
    this.input.updateSettings(save.settings);
    this.layout.updateSettings(save.settings, save.selectedPalette);
    this.touchOverlay.updateSettings(save.settings, save.selectedPalette);
    if (partial.artPack !== undefined) {
      void this.switchArtPack(partial.artPack);
    }
  }

  private beginNewRun(opts?: {
    seed?: number;
    styleId?: StyleId;
    hardMode?: boolean;
    area?: AreaId;
    level?: number;
  }): void {
    this.audio.unlock();
    const save = this.saveManager.getData();
    const seed = opts?.seed ?? ((Date.now() ^ Math.imul(save.runsPlayed + 1, 2654435761)) >>> 0);
    const styleId = opts?.styleId ?? save.selectedStyle;
    const hardMode = opts?.hardMode ?? save.hardModeEnabled;
    const area = opts?.area ?? 1;
    const level = opts?.level ?? 1;

    startNewRun(this.state, { seed, styleId, hardMode, area, level });
    if (area === 5) {
      warpStageWithEntities(this.state, 5, 1);
    }
    this.particles.reset();
    this.runRecorded = false;
    this.syncBgm();
  }

  private pickUpgradeByIndex(index: number): void {
    if (this.state.mode !== 'upgrade_select') return;
    const id = this.state.upgradeChoices[index];
    if (id === undefined) return;
    applyUpgrade(this.state, id);
    this.audio.handleSimEvents(this.state.events);
    this.particles.handleEvents(this.state.events);
    advanceToNextStage(this.state);
    this.syncBgm();
  }

  private syncBgm(): void {
    const activeSideRoom =
      this.state.activeSideRoomId !== null
        ? this.state.world.sideRooms.find((r) => r.id === this.state.activeSideRoomId)
        : null;
    const desired = getBgmForState(
      this.state.area,
      this.state.mode,
      this.state.inSideRoom,
      activeSideRoom?.kind ?? null,
    );
    if (desired !== this.lastBgmTrack) {
      this.lastBgmTrack = desired;
      this.audio.playBgm(desired);
    }
  }

  private handleEvents(events: readonly SimEvent[]): void {
    if (events.length === 0) return;
    this.particles.handleEvents(events);
    this.audio.handleSimEvents(events);

    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          this.input.rumble(ev.gemHigh ? 0.28 : 0.16, 35);
          break;
        case 'stomp':
          this.input.rumble(0.45, 70);
          break;
        case 'player_hurt':
          this.input.rumble(0.85, 180);
          break;
        case 'boss_stun':
        case 'boss_phase':
          this.input.rumble(0.75, 220);
          break;
        case 'boss_defeat':
          this.input.rumble(1.0, 380);
          break;
        case 'explosion':
          this.input.rumble(0.55, 110);
          break;
        case 'trophy_unlock':
          this.layout.showToast(`TROPHY: ${ev.name}`, 3000);
          break;
      }
    }
  }

  private stepOneTick(input: InputFrame): void {
    const save = this.saveManager.getData();

    // Pause toggle during active gameplay
    if (input.pausePressed) {
      if (this.state.mode === 'playing' || this.state.mode === 'surface') {
        this.state.mode = 'paused';
        return;
      }
      if (this.state.mode === 'paused' && this.menu.getScreen() === 'pause') {
        this.state.mode = 'playing';
        return;
      }
    }

    // Quick retry on pause or game over
    if (input.retryPressed && (this.state.mode === 'paused' || this.state.mode === 'gameover')) {
      this.beginNewRun();
      return;
    }

    // Menu navigation intercepts input when an overlay screen is open
    const menuActive = this.menu.getScreen() !== 'none';
    if (menuActive) {
      this.menu.handleInput(input, this.state, save);
      return;
    }

    const prevMode = this.state.mode;
    stepSim(this.state, input, save.unlockedTrophies);
    this.handleEvents(this.state.events);
    this.particles.update();
    this.saveManager.syncTrophiesFromState(this.state);

    // Record end-of-run stats & gem milestones once per run
    if (
      !this.runRecorded &&
      prevMode !== this.state.mode &&
      (this.state.mode === 'gameover' || this.state.mode === 'victory')
    ) {
      this.runRecorded = true;
      const unlocks = this.saveManager.recordRunEnd(this.state, this.state.mode === 'victory');
      if (unlocks.newlyUnlockedStyles.length > 0) {
        this.layout.showToast('NEW STYLE UNLOCKED!', 3200);
      } else if (unlocks.newlyUnlockedPalettes.length > 0) {
        this.layout.showToast('NEW PALETTE UNLOCKED!', 3200);
      }
    }

    this.syncBgm();
  }

  private loop = (now: number): void => {
    this.rafId = window.requestAnimationFrame(this.loop);

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = now;
      this.lastRenderTime = now;
      this.fpsSampleStart = now;
    }

    const rawDtSec = Math.min(0.1, Math.max(0, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Impact slowdown scales simulation advance smoothly (40/60 = 0.667x for 23t on hit!)
    const timeScale =
      this.state.impactSlowdownTicks > 0 ? WELL_CONSTANTS.IMPACT_SLOWDOWN_FACTOR : 1.0;
    this.accumulator += rawDtSec * timeScale;

    const fixedDt = WELL_CONSTANTS.FIXED_DT;
    let steps = 0;
    const maxSteps = 4;
    let latestInput: InputFrame | null = null;

    while (this.accumulator >= fixedDt && steps < maxSteps) {
      const frame = this.input.pollFrame();
      latestInput = frame;
      this.stepOneTick(frame);
      this.accumulator -= fixedDt;
      steps++;
    }

    if (steps === 0) {
      // Keep gamepad/menu responsiveness snappy even between ticks
      latestInput = this.input.getDebugSnapshot().frame;
    }

    // Frame-paced 30 / 60 / 120 FPS rendering
    const save = this.saveManager.getData();
    const minRenderIntervalMs = 1000 / save.settings.fpsCap - 0.5;
    if (now - this.lastRenderTime >= minRenderIntervalMs) {
      this.lastRenderTime = now;
      const interpAlpha = Math.max(0, Math.min(1, this.accumulator / fixedDt));
      this.renderer.render(this.state, interpAlpha, save.settings, this.particles);

      const packSnap = this.registry.getDebugSnapshot();
      this.menu.sync(this.state, save, {
        customPackAvailable: packSnap.customPackAvailable,
        activePack: packSnap.activePack,
      });

      const inputSource = latestInput?.inputSource ?? this.input.getDebugSnapshot().lastSource;
      this.layout.updateHud(this.state, inputSource, save.selectedPalette);

      this.fpsFrameCount++;
      if (now - this.fpsSampleStart >= 500) {
        this.measuredFps = (this.fpsFrameCount * 1000) / (now - this.fpsSampleStart);
        this.fpsFrameCount = 0;
        this.fpsSampleStart = now;
      }
      this.debugDrawer.update(this.measuredFps);
    }
  };

  start(): void {
    if (this.rafId !== null) return;
    const save = this.saveManager.getData();
    const packSnap = this.registry.getDebugSnapshot();
    this.menu.sync(this.state, save, {
      customPackAvailable: packSnap.customPackAvailable,
      activePack: packSnap.activePack,
    });
    this.renderer.render(this.state, 1, save.settings, this.particles);
    this.layout.updateHud(this.state, 'keyboard', save.selectedPalette);
    this.rafId = window.requestAnimationFrame(this.loop);
  }

  destroy(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('pointerdown', this.onFirstGesture);
    window.removeEventListener('keydown', this.onFirstGesture);
    window.removeEventListener('touchstart', this.onFirstGesture);
    this.debugDrawer.destroy();
    this.menu.destroy();
    this.touchOverlay.destroy();
    this.input.destroy();
    this.layout.destroy();
    this.audio.destroy();
    this.renderer.destroy();
  }

  private createDebugBridge(): DebugBridge {
    return {
      getState: () => this.state,
      getHash: () => hashSimState(this.state),
      getInputState: () => this.input.getDebugSnapshot(),
      getAudioState: () => this.audio.getDebugSnapshot(),
      getPackState: () => this.registry.getDebugSnapshot(),
      getPaletteId: () => this.saveManager.getData().selectedPalette,
      getSaveData: () => this.saveManager.getData(),
      startRun: (opts) => this.beginNewRun(opts),
      warpTo: (area: AreaId, level = 1) => {
        if (this.state.mode === 'title' || this.state.mode === 'gameover' || this.state.mode === 'victory') {
          this.beginNewRun({ area, level });
          return;
        }
        warpStageWithEntities(this.state, area, level);
        this.particles.reset();
        this.syncBgm();
      },
      setWeapon: (weaponId: WeaponId, gemHigh?: boolean) => {
        this.state.player.weaponId = weaponId;
        this.state.player.ammo = this.state.player.ammoMax;
        if (gemHigh !== undefined) {
          this.state.gemHigh = gemHigh;
          this.state.player.gunLevel = gemHigh ? 1 : 0;
          if (gemHigh) {
            this.state.gemStreak = Math.max(100, this.state.gemStreak);
            this.state.gemStreakTimer = Math.max(300, this.state.gemStreakTimer);
          }
        }
      },
      grantUpgrade: (upgradeId: UpgradeId) => {
        applyUpgrade(this.state, upgradeId);
      },
      setHp: (hp: number, hpMax?: number) => {
        if (hpMax !== undefined) {
          this.state.player.hpMax = Math.max(1, Math.floor(hpMax));
        }
        this.state.player.hp = Math.max(0, Math.min(this.state.player.hpMax, Math.floor(hp)));
        if (this.state.player.hp > 0) {
          this.state.player.alive = true;
        }
      },
      setGems: (gems: number, streak?: number) => {
        const val = Math.max(0, Math.floor(gems));
        this.state.gems = val;
        this.state.runGems = Math.max(this.state.runGems, val);
        if (streak !== undefined) {
          this.state.gemStreak = Math.max(0, Math.floor(streak));
          this.state.gemStreakTimer = WELL_CONSTANTS.GEM_STREAK_TIMER;
          if (this.state.gemStreak >= WELL_CONSTANTS.GEM_HIGH_THRESHOLD) {
            this.state.gemHigh = true;
            this.state.player.gunLevel = 1;
          }
        }
      },
      setPalette: (paletteIndex: number) => this.applyPalette(paletteIndex),
      setStyle: (styleId: StyleId) => {
        this.saveManager.setSelectedStyle(styleId);
        this.state.styleId = styleId;
      },
      setHardMode: (enabled: boolean) => {
        this.saveManager.setHardModeEnabled(enabled);
        this.state.hardMode = enabled;
      },
      setArtPack: (mode: ArtPackMode) => this.switchArtPack(mode),
      damageBoss: (amount: number) => {
        if (this.state.boss) {
          damageBoss(this.state, amount, this.state.boss.x, this.state.boss.y);
          this.handleEvents(this.state.events);
        }
      },
      spawnEnemy: (kind: EnemyKind, dx = 0, dy = 48) => {
        spawnEnemy(this.state, kind, this.state.player.x + dx, this.state.player.y + dy);
      },
      triggerTouch: (active: boolean) => {
        this.input.setTouchActive(active);
      },
      openUpgradeSelect: () => {
        const choices = rollUpgradeChoices(this.state);
        if (choices.length > 0) {
          this.state.upgradeChoices = choices;
          this.state.upgradeCursor = 0;
          this.state.mode = 'upgrade_select';
        }
      },
      stepTicks: (count: number, partialInput?: Partial<InputFrame>) => {
        const frame: InputFrame = { ...EMPTY_INPUT, ...partialInput };
        const n = Math.max(0, Math.min(6000, Math.floor(count)));
        for (let i = 0; i < n; i++) {
          stepSim(this.state, frame, this.saveManager.getData().unlockedTrophies);
          this.handleEvents(this.state.events);
          this.particles.update();
        }
        const save = this.saveManager.getData();
        this.renderer.render(this.state, 1, save.settings, this.particles);
      },
    };
  }
}
