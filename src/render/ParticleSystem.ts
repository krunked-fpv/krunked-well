import { TILE_KIND, type SimEvent } from '../contracts/index.ts';

// ============================================================================
// Krunked Well — Zero-Allocation Fixed-Pool Particle, Impact Chroma & Floating
// Text System (512 Particles + 32 Floating Texts pre-allocated once)
// ============================================================================

export type ParticleChannel = 'L' | 'M' | 'S' | 'D';
export type ParticleKind = 'pixel' | 'ring' | 'smoke' | 'spark' | 'bubble' | 'shard';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  channel: ParticleChannel;
  kind: ParticleKind;
  radius: number;
  maxRadius: number;
}

export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  channel: 'L' | 'M' | 'S';
  life: number;
  maxLife: number;
}

const PARTICLE_POOL_SIZE = 512;
const TEXT_POOL_SIZE = 32;

export class ParticleSystem {
  private readonly particles: Particle[];
  private readonly floatingTexts: FloatingText[];
  private particleCursor = 0;
  private textCursor = 0;
  private rng = 0x51a7f3d9;
  private emptyTextCooldown = 0;
  private chromaImpulse = 0;

  constructor() {
    this.particles = new Array<Particle>(PARTICLE_POOL_SIZE);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        gravity: 0,
        drag: 1,
        life: 0,
        maxLife: 1,
        channel: 'L',
        kind: 'pixel',
        radius: 1,
        maxRadius: 1,
      };
    }

    this.floatingTexts = new Array<FloatingText>(TEXT_POOL_SIZE);
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      this.floatingTexts[i] = {
        active: false,
        x: 0,
        y: 0,
        vy: -0.35,
        text: '',
        channel: 'L',
        life: 0,
        maxLife: 1,
      };
    }
  }

  reset(): void {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles[i]!.active = false;
    }
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      this.floatingTexts[i]!.active = false;
    }
    this.particleCursor = 0;
    this.textCursor = 0;
    this.rng = 0x51a7f3d9;
    this.emptyTextCooldown = 0;
    this.chromaImpulse = 0;
  }

  getChromaImpulse(): number {
    return this.chromaImpulse;
  }

  private addChroma(amount: number): void {
    this.chromaImpulse = Math.min(0.016, Math.max(this.chromaImpulse, amount));
  }

  private rand(): number {
    let x = this.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  private allocParticle(): Particle {
    for (let step = 0; step < PARTICLE_POOL_SIZE; step++) {
      const idx = (this.particleCursor + step) % PARTICLE_POOL_SIZE;
      const p = this.particles[idx]!;
      if (!p.active) {
        this.particleCursor = (idx + 1) % PARTICLE_POOL_SIZE;
        return p;
      }
    }
    const idx = this.particleCursor;
    this.particleCursor = (idx + 1) % PARTICLE_POOL_SIZE;
    return this.particles[idx]!;
  }

  private allocText(): FloatingText {
    for (let step = 0; step < TEXT_POOL_SIZE; step++) {
      const idx = (this.textCursor + step) % TEXT_POOL_SIZE;
      const t = this.floatingTexts[idx]!;
      if (!t.active) {
        this.textCursor = (idx + 1) % TEXT_POOL_SIZE;
        return t;
      }
    }
    const idx = this.textCursor;
    this.textCursor = (idx + 1) % TEXT_POOL_SIZE;
    return this.floatingTexts[idx]!;
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    gravity: number,
    drag: number,
    channel: ParticleChannel,
    kind: ParticleKind,
    radius = 1,
    maxRadius = 1,
  ): void {
    const p = this.allocParticle();
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    p.drag = drag;
    p.channel = channel;
    p.kind = kind;
    p.radius = radius;
    p.maxRadius = maxRadius;
  }

  private spawnRing(
    x: number,
    y: number,
    startR: number,
    maxR: number,
    life: number,
    channel: ParticleChannel,
  ): void {
    this.spawnParticle(x, y, 0, 0, life, 1, 0, 1, channel, 'ring', startR, maxR);
  }

  private spawnText(
    x: number,
    y: number,
    text: string,
    channel: 'L' | 'M' | 'S',
    life = 46,
    vy = -0.35,
  ): void {
    const t = this.allocText();
    t.active = true;
    t.x = x;
    t.y = y;
    t.vy = vy;
    t.text = text;
    t.channel = channel;
    t.life = life;
    t.maxLife = life;
  }

  private spawnBurst(
    x: number,
    y: number,
    count: number,
    speedMin: number,
    speedMax: number,
    channelA: ParticleChannel,
    channelB: ParticleChannel,
    kind: ParticleKind,
    gravity: number,
    lifeMin: number,
    lifeMax: number,
    size = 2,
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = this.rand() * Math.PI * 2;
      const spd = this.randRange(speedMin, speedMax);
      const life = Math.round(this.randRange(lifeMin, lifeMax));
      this.spawnParticle(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        life,
        size,
        gravity,
        0.95,
        (i & 1) === 0 ? channelA : channelB,
        kind,
      );
    }
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      switch (ev.type) {
        case 'shoot': {
          const ch: ParticleChannel = ev.gemHigh ? 'M' : ev.weaponId === 2 ? 'S' : 'L';
          const sparkCount = ev.gemHigh ? 9 : ev.weaponId === 1 ? 10 : 6;
          for (let k = 0; k < sparkCount; k++) {
            this.spawnParticle(
              ev.x + this.randRange(-3.5, 3.5),
              ev.y + 6,
              this.randRange(-1.8, 1.8),
              this.randRange(1.4, 3.8),
              Math.round(this.randRange(7, 14)),
              ev.gemHigh ? 2 : 1.4,
              0.04,
              0.92,
              k === 0 ? 'L' : ch,
              'spark',
            );
          }
          // Punchy expanding pixel-circle recoil smoke puffs at boots!
          const puffCount = ev.weaponId === 1 ? 3 : 2;
          for (let k = 0; k < puffCount; k++) {
            this.spawnParticle(
              ev.x + this.randRange(-3, 3),
              ev.y + 7 + k,
              this.randRange(-0.9, 0.9),
              this.randRange(-0.3, 0.6),
              Math.round(this.randRange(11, 17)),
              k === 0 ? 3.2 : 2.1,
              -0.02,
              0.9,
              k === 0 ? 'L' : ch,
              'smoke',
            );
          }
          if (ev.weaponId === 1 || ev.weaponId === 2) {
            this.addChroma(0.004);
          }
          break;
        }

        case 'empty_click': {
          for (let side = -1; side <= 1; side += 2) {
            for (let k = 0; k < 3; k++) {
              this.spawnParticle(
                ev.x + side * (3 + k),
                ev.y + 6,
                side * this.randRange(0.5, 1.3),
                this.randRange(-0.4, 0.2),
                Math.round(this.randRange(14, 20)),
                k === 0 ? 2.6 : 1.8,
                -0.02,
                0.92,
                'L',
                'smoke',
              );
            }
          }
          if (this.emptyTextCooldown <= 0) {
            this.spawnText(ev.x, ev.y - 12, 'EMPTY!', 'L', 30, -0.3);
            this.emptyTextCooldown = 20;
          }
          break;
        }

        case 'jump': {
          const ch: ParticleChannel = ev.rocket ? 'M' : ev.water ? 'S' : 'L';
          const count = ev.rocket ? 14 : 6;
          for (let k = 0; k < count; k++) {
            this.spawnParticle(
              ev.x + this.randRange(-4, 4),
              ev.y + 7,
              this.randRange(-1.6, 1.6),
              ev.rocket ? this.randRange(0.8, 3.0) : this.randRange(-0.6, 0.5),
              Math.round(this.randRange(9, 18)),
              ev.rocket ? 2.2 : 1.4,
              ev.water ? -0.04 : 0.06,
              0.94,
              k % 3 === 0 ? 'L' : ch,
              ev.water ? 'bubble' : 'smoke',
            );
          }
          if (ev.rocket) {
            this.spawnRing(ev.x, ev.y + 7, 2, 14, 12, 'M');
            this.addChroma(0.005);
          }
          break;
        }

        case 'wall_kick': {
          for (let k = 0; k < 7; k++) {
            this.spawnParticle(
              ev.x - ev.dir * 4,
              ev.y + this.randRange(-3, 4),
              ev.dir * this.randRange(0.8, 2.4),
              this.randRange(-1.5, 0.7),
              Math.round(this.randRange(8, 15)),
              1.5,
              0.08,
              0.94,
              k % 2 === 0 ? 'L' : 'M',
              'spark',
            );
          }
          break;
        }

        case 'land': {
          for (let side = -1; side <= 1; side += 2) {
            for (let k = 0; k < 4; k++) {
              this.spawnParticle(
                ev.x + side * this.randRange(1, 4),
                ev.y + 7,
                side * this.randRange(0.4, 1.8),
                this.randRange(-0.9, -0.2),
                Math.round(this.randRange(9, 15)),
                k === 0 ? 2 : 1.3,
                0.08,
                0.9,
                'L',
                'smoke',
              );
            }
          }
          break;
        }

        case 'stomp': {
          this.spawnRing(ev.x, ev.y + 2, 3, 18, 13, 'L');
          this.spawnBurst(ev.x, ev.y + 2, 12, 1.2, 3.2, 'L', 'M', 'spark', 0.1, 10, 18, 2);
          this.addChroma(0.004);
          break;
        }

        case 'enemy_hit': {
          this.spawnBurst(ev.x, ev.y, 7, 0.9, 2.5, 'L', 'M', 'spark', 0.08, 7, 14, 1.4);
          break;
        }

        case 'enemy_kill': {
          this.spawnRing(ev.x, ev.y, 2, ev.stomped ? 20 : 15, 14, ev.stomped ? 'L' : 'M');
          this.spawnBurst(ev.x, ev.y, 5, 0.4, 1.5, 'L', 'M', 'smoke', -0.02, 12, 19, 3.2);
          this.spawnBurst(ev.x, ev.y, 12, 1.0, 3.4, 'M', 'L', 'shard', 0.14, 14, 24, 2);
          this.spawnBurst(ev.x, ev.y, 8, 1.2, 3.6, 'L', 'M', 'spark', 0.05, 8, 16, 1.6);
          break;
        }

        case 'block_break': {
          const ch: ParticleChannel =
            ev.tileKind === TILE_KIND.BUBBLE_BLOCK
              ? 'S'
              : ev.tileKind === TILE_KIND.BREAKABLE
                ? 'M'
                : 'L';
          const kind: ParticleKind = ev.tileKind === TILE_KIND.BUBBLE_BLOCK ? 'bubble' : 'shard';
          this.spawnBurst(ev.x, ev.y, 4, 0.3, 1.2, 'L', ch, 'smoke', -0.02, 10, 16, 2.8);
          this.spawnBurst(ev.x, ev.y, 12, 0.9, 2.9, ch, 'L', kind, ch === 'S' ? -0.05 : 0.16, 14, 26, 2.2);
          this.spawnRing(ev.x, ev.y, 2, 12, 10, ch);
          break;
        }

        case 'gem_pickup': {
          this.spawnBurst(ev.x, ev.y, 6, 0.6, 1.9, 'M', 'L', 'spark', -0.02, 8, 15, 1.3);
          break;
        }

        case 'gem_high_start': {
          this.spawnRing(ev.x, ev.y, 4, 28, 18, 'M');
          this.spawnRing(ev.x, ev.y, 2, 18, 14, 'L');
          this.spawnBurst(ev.x, ev.y, 18, 1.2, 3.6, 'M', 'L', 'spark', 0.04, 14, 24, 2);
          this.spawnText(ev.x, ev.y - 16, 'GEM HIGH!', 'M', 54, -0.35);
          this.addChroma(0.008);
          break;
        }

        case 'gem_high_end': {
          break;
        }

        case 'combo_done': {
          if (ev.count >= 8) {
            const ch: 'L' | 'M' = ev.rewardTier >= 2 ? 'M' : 'L';
            this.spawnRing(ev.x, ev.y, 3, 20, 15, ch);
            this.spawnBurst(ev.x, ev.y, 12, 0.9, 2.8, ch, 'L', 'spark', 0.05, 12, 22, 2);
            this.spawnText(ev.x, ev.y - 14, `${ev.count} COMBO!`, ch, 52, -0.38);
          }
          break;
        }

        case 'player_hurt': {
          this.spawnRing(ev.x, ev.y, 3, 24, 16, 'M');
          this.spawnBurst(ev.x, ev.y, 18, 1.2, 3.6, 'M', 'L', 'shard', 0.1, 14, 26, 2);
          this.addChroma(0.013);
          break;
        }

        case 'player_die': {
          this.spawnRing(ev.x, ev.y, 4, 34, 24, 'M');
          this.spawnRing(ev.x, ev.y, 2, 22, 18, 'L');
          this.spawnBurst(ev.x, ev.y, 28, 1.0, 4.2, 'M', 'L', 'shard', 0.12, 20, 36, 2.2);
          this.addChroma(0.016);
          break;
        }

        case 'splash': {
          for (let k = 0; k < 14; k++) {
            this.spawnParticle(
              ev.x + this.randRange(-7, 7),
              ev.y,
              this.randRange(-2.0, 2.0),
              ev.entering ? this.randRange(-2.8, -0.9) : this.randRange(-2.2, -0.6),
              Math.round(this.randRange(14, 24)),
              k % 3 === 0 ? 2 : 1.3,
              0.12,
              0.96,
              k % 2 === 0 ? 'S' : 'L',
              'bubble',
            );
          }
          break;
        }

        case 'oxygen_restore': {
          this.spawnRing(ev.x, ev.y, 3, 18, 14, 'S');
          for (let k = 0; k < 10; k++) {
            this.spawnParticle(
              ev.x + this.randRange(-6, 6),
              ev.y + this.randRange(-3, 3),
              this.randRange(-0.6, 0.6),
              this.randRange(-1.7, -0.6),
              Math.round(this.randRange(14, 28)),
              k % 2 === 0 ? 2 : 1.2,
              -0.03,
              0.97,
              k % 3 === 0 ? 'L' : 'S',
              'bubble',
            );
          }
          break;
        }

        case 'oxygen_warn':
        case 'stage_clear':
          break;

        case 'pickup_gun': {
          this.spawnRing(ev.x, ev.y, 3, 22, 16, 'S');
          this.spawnBurst(ev.x, ev.y, 14, 0.8, 2.6, 'L', 'S', 'spark', 0.03, 12, 22, 2);
          break;
        }

        case 'pickup_shop': {
          this.spawnRing(ev.x, ev.y, 3, 18, 14, 'M');
          this.spawnBurst(ev.x, ev.y, 12, 0.8, 2.4, 'M', 'L', 'spark', 0.04, 12, 20, 2);
          break;
        }

        case 'shop_deny': {
          this.spawnText(ev.x, ev.y - 12, 'TOO POOR!', 'M', 44, -0.32);
          this.spawnBurst(ev.x, ev.y, 5, 0.6, 1.4, 'M', 'L', 'pixel', 0.08, 10, 16, 1.4);
          break;
        }

        case 'boss_hit': {
          this.spawnBurst(ev.x, ev.y, 12, 1.1, 3.4, 'M', 'L', 'spark', 0.08, 10, 20, 2);
          break;
        }

        case 'boss_stun': {
          this.spawnRing(ev.x, ev.y, 6, 42, 22, 'L');
          this.spawnBurst(ev.x, ev.y, 20, 1.4, 4.0, 'L', 'M', 'shard', 0.1, 16, 28, 2.2);
          this.spawnText(ev.x, ev.y - 20, 'STUNNED!', 'L', 50, -0.3);
          this.addChroma(0.011);
          break;
        }

        case 'boss_phase': {
          this.spawnText(80, 110, `PHASE ${ev.phase}!`, 'M', 56, -0.25);
          this.addChroma(0.01);
          break;
        }

        case 'boss_laser': {
          this.spawnBurst(ev.x, ev.y, 14, 1.0, 3.0, 'M', 'L', 'spark', 0.04, 10, 18, 2);
          this.addChroma(0.008);
          break;
        }

        case 'boss_defeat': {
          this.spawnRing(ev.x, ev.y, 8, 62, 30, 'M');
          this.spawnRing(ev.x, ev.y, 4, 44, 24, 'L');
          this.spawnBurst(ev.x, ev.y, 40, 1.2, 4.8, 'M', 'L', 'shard', 0.08, 24, 42, 3);
          this.spawnText(ev.x, ev.y - 18, 'DEFEATED!', 'L', 70, -0.25);
          this.addChroma(0.016);
          break;
        }

        case 'explosion': {
          this.spawnRing(ev.x, ev.y, 3, Math.max(14, ev.radius), 16, 'M');
          this.spawnRing(ev.x, ev.y, 2, Math.max(9, ev.radius * 0.68), 12, 'L');
          this.spawnBurst(ev.x, ev.y, 20, 1.0, 3.8, 'M', 'L', 'shard', 0.1, 12, 24, 2);
          this.addChroma(0.008);
          break;
        }

        case 'floating_text': {
          this.spawnText(ev.x, ev.y, ev.text, ev.channel, 48, -0.35);
          break;
        }

        case 'trophy_unlock': {
          this.spawnText(80, 72, `TROPHY: ${ev.name}`, 'S', 75, -0.2);
          break;
        }

        case 'jetpack_tick': {
          this.spawnParticle(
            ev.x + this.randRange(-3, 3),
            ev.y + 8,
            this.randRange(-0.5, 0.5),
            this.randRange(1.4, 2.8),
            Math.round(this.randRange(7, 13)),
            2,
            0.03,
            0.94,
            this.rand() < 0.5 ? 'M' : 'L',
            'smoke',
          );
          break;
        }

        case 'corpse_eat': {
          this.spawnBurst(ev.x, ev.y, 8, 0.6, 2.0, 'M', 'L', 'pixel', 0.1, 10, 16, 1.4);
          if (ev.healed) {
            this.spawnText(ev.x, ev.y - 12, 'OMNOMNOM', 'M', 54, -0.35);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  update(): void {
    if (this.emptyTextCooldown > 0) {
      this.emptyTextCooldown--;
    }
    if (this.chromaImpulse > 0) {
      this.chromaImpulse *= 0.84;
      if (this.chromaImpulse < 0.0004) this.chromaImpulse = 0;
    }

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i]!;
      if (!p.active) continue;
      p.life--;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === 'ring') {
        const t = 1 - p.life / p.maxLife;
        p.radius = p.radius + (p.maxRadius - p.radius) * Math.min(1, 0.28 + t * 0.18);
      } else {
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx;
        p.y += p.vy;
      }
    }

    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      const t = this.floatingTexts[i]!;
      if (!t.active) continue;
      t.life--;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy;
      t.vy *= 0.97;
    }
  }

  getParticles(): readonly Particle[] {
    return this.particles;
  }

  getFloatingTexts(): readonly FloatingText[] {
    return this.floatingTexts;
  }
}
