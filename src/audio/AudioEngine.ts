import {
  WELL_CONSTANTS,
  type AudioDebugSnapshot,
  type SimEvent,
} from '../contracts/index.ts';
import { ProceduralSynth } from './ProceduralSynth.ts';
import {
  CUSTOM_AUDIO_ALIASES,
  getWeaponShotSfxId,
} from './soundManifest.ts';

// ============================================================================
// Krunked Well — AudioEngine (Web Audio + Custom Pack Decode + Synth Fallback)
// ============================================================================

export type CustomAudioFetcher = (logicalId: string) => Promise<ArrayBuffer | null>;

export interface PlaySfxOptions {
  worldX?: number;
  combo?: number;
}

const MAX_POLYPHONY = 12;
const DEFAULT_COOLDOWN_MS = 25;
const JETPACK_COOLDOWN_MS = 70;
const PITCH_JITTER_RANGE = 0.04; // +/- 4%
const SHAFT_HALF_WIDTH_PX = 72;
const MAX_PAN = 0.75;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return typeof Ctor === 'function' ? Ctor : null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmDuckGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private readonly synth = new ProceduralSynth();

  private unlocked = false;
  private destroyed = false;
  private bgmVolume = 0.7;
  private sfxVolume = 0.85;

  private currentTrack: string | null = null;
  private bgmPlaying = false;
  private bgmRequestGen = 0;

  private customProvider: CustomAudioFetcher | null = null;
  private customProviderGen = 0;
  private customBgmSource: AudioBufferSourceNode | null = null;
  private customBgmActive = false;
  private customAttemptedAny = false;
  private customDecodedCount = 0;

  private readonly customBuffers = new Map<string, AudioBuffer | null>();
  private readonly customPending = new Map<string, Promise<AudioBuffer | null>>();

  private activeVoices = 0;
  private readonly activeCustomSfxNodes = new Set<AudioBufferSourceNode>();
  private readonly lastPlayedMs = new Map<string, number>();

  // Deterministic lightweight jitter PRNG (perceptual pitch variation only)
  private jitterState = 0x9e3779b9;

  public constructor() {
    // Lazy initialization on unlock() so headless/non-WebAudio environments never fail.
  }

  public unlock(): void {
    if (this.destroyed) {
      return;
    }

    if (!this.ctx) {
      const Ctor = getAudioContextConstructor();
      if (!Ctor) {
        return;
      }
      try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        const bgmGain = ctx.createGain();
        const bgmDuckGain = ctx.createGain();
        const sfxGain = ctx.createGain();

        const t = ctx.currentTime;
        master.gain.setValueAtTime(1.0, t);
        bgmGain.gain.setValueAtTime(this.bgmVolume, t);
        bgmDuckGain.gain.setValueAtTime(1.0, t);
        sfxGain.gain.setValueAtTime(this.sfxVolume, t);

        bgmGain.connect(bgmDuckGain);
        bgmDuckGain.connect(master);
        sfxGain.connect(master);
        master.connect(ctx.destination);

        this.ctx = ctx;
        this.masterGain = master;
        this.bgmGain = bgmGain;
        this.bgmDuckGain = bgmDuckGain;
        this.sfxGain = sfxGain;

        ctx.onstatechange = () => {
          if (this.destroyed || !this.ctx) return;
          if (this.ctx.state === 'running') {
            this.unlocked = true;
            this.ensurePendingBgmStarted();
          }
        };
      } catch {
        return;
      }
    }

    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    if (ctx.state === 'running') {
      this.unlocked = true;
      this.ensurePendingBgmStarted();
      return;
    }

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (!this.destroyed && this.ctx && this.ctx.state === 'running') {
              this.unlocked = true;
              this.ensurePendingBgmStarted();
            }
          }).catch(() => {
            // Ignore autoplay restriction rejections until next gesture
          });
        }
      } catch {
        // Ignore resume failure
      }
    }
  }

  public setVolumes(bgmVolume: number, sfxVolume: number): void {
    this.bgmVolume = Number.isFinite(bgmVolume) ? clamp(bgmVolume, 0, 1) : this.bgmVolume;
    this.sfxVolume = Number.isFinite(sfxVolume) ? clamp(sfxVolume, 0, 1) : this.sfxVolume;

    if (!this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    if (this.bgmGain) {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(this.bgmVolume, now, 0.015);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.015);
    }
  }

  public setCustomAudioProvider(fetcher: CustomAudioFetcher | null): void {
    if (this.customProvider === fetcher) {
      return;
    }
    this.customProvider = fetcher;
    this.customProviderGen += 1;
    this.customBuffers.clear();
    this.customPending.clear();
    this.customAttemptedAny = false;
    this.customDecodedCount = 0;

    if (this.destroyed || !this.currentTrack || !this.ctx) {
      if (!fetcher) {
        this.stopCustomBgmSource();
      }
      return;
    }

    // Hot-swap active BGM to/from custom audio provider
    const track = this.currentTrack;
    this.bgmPlaying = false;
    this.startBgmInternal(track);
  }

  public playBgm(trackId: string): void {
    if (this.destroyed || !trackId) {
      return;
    }

    if (this.currentTrack === trackId && this.bgmPlaying) {
      return;
    }

    this.currentTrack = trackId;
    if (!this.ctx || !this.bgmGain) {
      this.bgmPlaying = false;
      return;
    }

    this.startBgmInternal(trackId);
  }

  public stopBgm(): void {
    this.bgmRequestGen += 1;
    this.currentTrack = null;
    this.bgmPlaying = false;
    this.stopCustomBgmSource();
    this.synth.stopBgm();
  }

  public duckBgm(
    durationMs: number = WELL_CONSTANTS.BGM_DUCK_MS,
    targetGain: number = WELL_CONSTANTS.BGM_DUCK_GAIN,
  ): void {
    if (this.destroyed || !this.ctx || !this.bgmDuckGain) {
      return;
    }

    const durSec = clamp(Number.isFinite(durationMs) ? durationMs : WELL_CONSTANTS.BGM_DUCK_MS, 20, 5000) / 1000;
    const target = clamp(Number.isFinite(targetGain) ? targetGain : WELL_CONSTANTS.BGM_DUCK_GAIN, 0.05, 1.0);
    const now = this.ctx.currentTime;
    const attackSec = Math.min(0.025, durSec * 0.2);

    const param = this.bgmDuckGain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + attackSec);
    param.linearRampToValueAtTime(1.0, now + durSec);
  }

  public playSfx(sfxId: string, opts?: PlaySfxOptions): void {
    if (this.destroyed || !sfxId || this.sfxVolume <= 0) {
      return;
    }
    const ctx = this.ctx;
    const sfxDest = this.sfxGain;
    if (!ctx || !sfxDest || ctx.state === 'closed') {
      return;
    }

    // Per-SFX micro-cooldown (25ms default; slightly wider for continuous jetpack ticks)
    const now = nowMs();
    const cooldownMs = sfxId === 'sfxJetpack' ? JETPACK_COOLDOWN_MS : DEFAULT_COOLDOWN_MS;
    const lastTime = this.lastPlayedMs.get(sfxId);
    if (lastTime !== undefined && now - lastTime < cooldownMs) {
      return;
    }
    this.lastPlayedMs.set(sfxId, now);

    // Strict polyphony cap <= 12
    if (this.activeVoices >= MAX_POLYPHONY) {
      return;
    }

    const pitchJitter = this.nextPitchJitter();
    const comboPitch =
      opts?.combo !== undefined && opts.combo > 0
        ? Math.pow(2, Math.min(opts.combo, 20) / 16)
        : 1.0;
    const pan =
      opts?.worldX !== undefined && Number.isFinite(opts.worldX)
        ? clamp(((opts.worldX - WELL_CONSTANTS.CAM_CENTER_X) / SHAFT_HALF_WIDTH_PX) * MAX_PAN, -MAX_PAN, MAX_PAN)
        : 0;

    // Try cached custom audio buffer if a custom provider is active
    if (this.customProvider) {
      const cached = this.customBuffers.get(sfxId);
      if (cached) {
        this.playCustomSfxBuffer(ctx, sfxDest, cached, pitchJitter * comboPitch, pan);
        return;
      }
      if (cached === undefined) {
        // Trigger lazy background decode for subsequent triggers; play synth right now for zero latency
        void this.resolveCustomBuffer(sfxId);
      }
    }

    this.activeVoices += 1;
    let decremented = false;
    const releaseVoice = (): void => {
      if (decremented) return;
      decremented = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };

    try {
      this.synth.playSfx(sfxId, ctx, sfxDest, {
        pitchJitter,
        comboPitch,
        pan,
        onEnded: releaseVoice,
      });
    } catch {
      releaseVoice();
    }
  }

  public handleSimEvents(events: readonly SimEvent[]): void {
    if (this.destroyed || events.length === 0) {
      return;
    }

    for (const ev of events) {
      switch (ev.type) {
        case 'shoot':
          this.playSfx(getWeaponShotSfxId(ev.weaponId, ev.gemHigh), { worldX: ev.x });
          break;
        case 'empty_click':
          this.playSfx('sfxEmpty', { worldX: ev.x });
          break;
        case 'jump':
          this.playSfx('sfxJump', { worldX: ev.x });
          if (ev.rocket) {
            this.playSfx('sfxJetpack', { worldX: ev.x });
          }
          break;
        case 'wall_kick':
          this.playSfx('sfxWallKick', { worldX: ev.x });
          break;
        case 'land':
          this.playSfx('sfxLand', { worldX: ev.x });
          break;
        case 'stomp':
          this.playSfx('sfxStomp', { worldX: ev.x, combo: ev.combo });
          break;
        case 'enemy_hit':
          this.playSfx('sfxEnemyHit', { worldX: ev.x });
          break;
        case 'enemy_kill':
          this.playSfx('sfxEnemyKill', { worldX: ev.x });
          break;
        case 'block_break':
          this.playSfx('sfxBlockBreak', { worldX: ev.x });
          break;
        case 'gem_pickup':
          this.playSfx('sfxGem', {
            worldX: ev.x,
            combo: Math.min(16, Math.floor(ev.streak / 8)),
          });
          break;
        case 'gem_high_start':
          this.playSfx('sfxGemHighStart', { worldX: ev.x });
          break;
        case 'gem_high_end':
          this.playSfx('sfxGemHighEnd');
          break;
        case 'combo_done':
          if (ev.rewardTier > 0 || ev.count >= 2) {
            this.playSfx('sfxCombo', {
              worldX: ev.x,
              combo: ev.rewardTier * 4 + Math.min(ev.count, 10),
            });
          }
          break;
        case 'player_hurt':
          this.playSfx('sfxHurt', { worldX: ev.x });
          this.duckBgm(WELL_CONSTANTS.BGM_DUCK_MS, WELL_CONSTANTS.BGM_DUCK_GAIN);
          break;
        case 'player_die':
          this.playSfx('sfxDie', { worldX: ev.x });
          this.duckBgm(1200, 0.25);
          break;
        case 'splash':
          this.playSfx('sfxSplash', { worldX: ev.x });
          break;
        case 'oxygen_restore':
          this.playSfx('sfxOxygen', { worldX: ev.x });
          break;
        case 'oxygen_warn':
          this.playSfx('sfxOxygenWarn');
          break;
        case 'pickup_gun':
          this.playSfx('sfxPickupGun', { worldX: ev.x });
          break;
        case 'pickup_shop':
          this.playSfx('sfxShopBuy', { worldX: ev.x });
          break;
        case 'shop_deny':
          this.playSfx('sfxShopDeny', { worldX: ev.x });
          break;
        case 'upgrade_pick':
          this.playSfx('sfxUpgrade');
          break;
        case 'stage_clear':
          this.playSfx('sfxStageClear');
          break;
        case 'side_room_enter':
        case 'side_room_exit':
        case 'floating_text':
          // Visual or BGM-state transitions handled outside one-shot SFX dispatch
          break;
        case 'boss_hit':
          this.playSfx('sfxBossHit', { worldX: ev.x });
          break;
        case 'boss_stun':
          this.playSfx('sfxBossStun', { worldX: ev.x });
          break;
        case 'boss_phase':
          this.playSfx('sfxBossPhase');
          this.duckBgm(450, 0.65);
          break;
        case 'boss_laser':
          this.playSfx('sfxBossLaser', { worldX: ev.x });
          break;
        case 'boss_defeat':
          this.playSfx('sfxBossDie', { worldX: ev.x });
          this.duckBgm(1000, 0.3);
          break;
        case 'explosion':
          this.playSfx('sfxExplosion', { worldX: ev.x });
          break;
        case 'trophy_unlock':
          this.playSfx('sfxTrophy');
          break;
        case 'jetpack_tick':
          this.playSfx('sfxJetpack', { worldX: ev.x });
          break;
        case 'corpse_eat':
          this.playSfx('sfxCorpseEat', { worldX: ev.x, combo: ev.healed ? 6 : 0 });
          break;
        default: {
          const _exhaustive: never = ev;
          void _exhaustive;
          break;
        }
      }
    }
  }

  public getDebugSnapshot(): AudioDebugSnapshot {
    const usingCustomAudio =
      this.customProvider !== null &&
      (this.customBgmActive || this.customDecodedCount > 0 || !this.customAttemptedAny);

    return {
      unlocked: this.unlocked && this.ctx !== null && this.ctx.state === 'running',
      muted: this.destroyed || (this.bgmVolume <= 0 && this.sfxVolume <= 0),
      currentTrack: this.currentTrack,
      activeVoices: this.activeVoices,
      usingCustomAudio,
    };
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.unlocked = false;

    this.stopBgm();

    for (const src of this.activeCustomSfxNodes) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeCustomSfxNodes.clear();
    this.activeVoices = 0;

    this.customProvider = null;
    this.customProviderGen += 1;
    this.customBuffers.clear();
    this.customPending.clear();
    this.lastPlayedMs.clear();

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.masterGain = null;
      this.bgmGain = null;
      this.bgmDuckGain = null;
      this.sfxGain = null;
      try {
        ctx.onstatechange = null;
        if (ctx.state !== 'closed' && typeof ctx.close === 'function') {
          void ctx.close().catch(() => {});
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private ensurePendingBgmStarted(): void {
    if (this.currentTrack && !this.bgmPlaying && this.ctx && this.bgmGain) {
      this.startBgmInternal(this.currentTrack);
    }
  }

  private startBgmInternal(trackId: string): void {
    const ctx = this.ctx;
    const bgmDest = this.bgmGain;
    if (!ctx || !bgmDest || this.destroyed) {
      return;
    }

    const reqGen = ++this.bgmRequestGen;
    this.bgmPlaying = true;
    this.stopCustomBgmSource();
    this.synth.stopBgm();

    if (!this.customProvider) {
      this.synth.startBgm(trackId, ctx, bgmDest);
      return;
    }

    const cached = this.customBuffers.get(trackId);
    if (cached) {
      this.startCustomBgmBuffer(ctx, bgmDest, cached);
      return;
    }
    if (cached === null) {
      // Confirmed absent in custom pack -> immediate procedural synth fallback
      this.synth.startBgm(trackId, ctx, bgmDest);
      return;
    }

    // Lazily fetch & decode custom track; fall back seamlessly to ProceduralSynth on null/error
    void this.resolveCustomBuffer(trackId).then((buf) => {
      if (
        this.destroyed ||
        reqGen !== this.bgmRequestGen ||
        this.currentTrack !== trackId ||
        !this.ctx ||
        !this.bgmGain
      ) {
        return;
      }

      if (buf) {
        this.synth.stopBgm();
        this.startCustomBgmBuffer(this.ctx, this.bgmGain, buf);
      } else {
        this.stopCustomBgmSource();
        this.synth.startBgm(trackId, this.ctx, this.bgmGain);
      }
    });
  }

  private startCustomBgmBuffer(
    ctx: AudioContext,
    dest: AudioNode,
    buffer: AudioBuffer,
  ): void {
    this.stopCustomBgmSource();
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(dest);
      src.start(ctx.currentTime);
      this.customBgmSource = src;
      this.customBgmActive = true;
    } catch {
      this.customBgmSource = null;
      this.customBgmActive = false;
      if (this.currentTrack) {
        this.synth.startBgm(this.currentTrack, ctx, dest);
      }
    }
  }

  private stopCustomBgmSource(): void {
    if (this.customBgmSource) {
      try {
        this.customBgmSource.onended = null;
        this.customBgmSource.stop();
        this.customBgmSource.disconnect();
      } catch {
        // Ignore already-stopped source
      }
      this.customBgmSource = null;
    }
    this.customBgmActive = false;
  }

  private playCustomSfxBuffer(
    ctx: AudioContext,
    dest: AudioNode,
    buffer: AudioBuffer,
    playbackRate: number,
    pan: number,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(clamp(playbackRate, 0.5, 2.5), ctx.currentTime);

    let panner: StereoPannerNode | null = null;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      try {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, ctx.currentTime);
        src.connect(panner);
        panner.connect(dest);
      } catch {
        panner = null;
        src.connect(dest);
      }
    } else {
      src.connect(dest);
    }

    this.activeVoices += 1;
    this.activeCustomSfxNodes.add(src);

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.activeCustomSfxNodes.delete(src);
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try {
        src.disconnect();
        panner?.disconnect();
      } catch {
        // Ignore disconnect error
      }
    };

    const estDurationMs = Math.max(40, Math.ceil((buffer.duration / Math.max(0.5, playbackRate)) * 1000) + 60);
    const safetyTimer = globalThis.setTimeout(release, estDurationMs);

    src.onended = () => {
      globalThis.clearTimeout(safetyTimer);
      release();
    };

    try {
      src.start(ctx.currentTime);
    } catch {
      globalThis.clearTimeout(safetyTimer);
      release();
    }
  }

  private resolveCustomBuffer(logicalId: string): Promise<AudioBuffer | null> {
    if (this.customBuffers.has(logicalId)) {
      return Promise.resolve(this.customBuffers.get(logicalId) ?? null);
    }

    const existingPromise = this.customPending.get(logicalId);
    if (existingPromise) {
      return existingPromise;
    }

    const provider = this.customProvider;
    const providerGen = this.customProviderGen;
    const ctx = this.ctx;
    if (!provider || !ctx || this.destroyed) {
      return Promise.resolve(null);
    }

    this.customAttemptedAny = true;

    const candidates: string[] = [logicalId];
    const aliases = CUSTOM_AUDIO_ALIASES[logicalId];
    if (aliases) {
      for (const alias of aliases) {
        if (!candidates.includes(alias)) {
          candidates.push(alias);
        }
      }
    }

    const task = (async (): Promise<AudioBuffer | null> => {
      for (const candidateId of candidates) {
        if (this.destroyed || providerGen !== this.customProviderGen || !this.ctx) {
          return null;
        }
        try {
          const raw = await provider(candidateId);
          if (!raw || raw.byteLength === 0) {
            continue;
          }
          if (this.destroyed || providerGen !== this.customProviderGen || !this.ctx) {
            return null;
          }
          const decoded = await this.ctx.decodeAudioData(raw.slice(0));
          if (this.destroyed || providerGen !== this.customProviderGen) {
            return null;
          }
          this.customBuffers.set(logicalId, decoded);
          this.customDecodedCount += 1;
          return decoded;
        } catch {
          // Decode failed or fetch rejected; try next alias or fall back cleanly to ProceduralSynth
          continue;
        }
      }

      if (!this.destroyed && providerGen === this.customProviderGen) {
        this.customBuffers.set(logicalId, null);
      }
      return null;
    })();

    this.customPending.set(logicalId, task);
    void task.finally(() => {
      if (providerGen === this.customProviderGen) {
        this.customPending.delete(logicalId);
      }
    });

    return task;
  }

  private nextPitchJitter(): number {
    // Fast xorshift32 in [-1, 1] scaled to +/- 4%
    let x = this.jitterState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.jitterState = x >>> 0;
    const norm = (this.jitterState / 0xffffffff) * 2 - 1;
    return 1 + norm * PITCH_JITTER_RANGE;
  }
}
