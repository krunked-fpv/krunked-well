import {
  WELL_CONSTANTS,
  type SimState,
} from '../contracts/index.ts';
import { BIOME_ENEMY_POOLS } from '../data/enemies.ts';
import { getStyleDef } from '../data/styles.ts';
import { randPick, randRange } from './prng.ts';
import {
  addShake,
  allocId,
  damagePlayer,
  emitEvent,
  rechargeGunboots,
} from './simUtils.ts';
import { spawnEnemy, spawnGems } from './enemies.ts';
import { spawnBossWallModules } from './shop.ts';

export function initBoss(state: SimState): void {
  const startX = WELL_CONSTANTS.CAM_CENTER_X;
  const startY = state.player.y + 132;

  state.boss = {
    active: true,
    x: startX,
    y: startY,
    prevX: startX,
    prevY: startY,
    targetY: startY,
    hp: WELL_CONSTANTS.BOSS_TOTAL_HP,
    maxHp: WELL_CONSTANTS.BOSS_TOTAL_HP,
    phase: 1,
    state: 0, // EYE_OPEN
    stateTimer: 0,
    ouchAccum: 0,
    phaseAccum: 0,
    bulletImmune: false,
    tentacleAngle: 0,
    tentacleSweepDir: 1,
    attackTimer: 90,
    summonTimer: 120,
    laserCharge: 0,
    laserActiveTicks: 0,
    laserX: startX,
    hitFlashTicks: 0,
    defeated: false,
  };
}

export function damageBoss(state: SimState, amount: number, hitX: number, hitY: number): void {
  const boss = state.boss;
  if (!boss || !boss.active || boss.defeated || boss.state === 3 || amount <= 0) {
    return;
  }

  boss.hp = Math.max(0, boss.hp - amount);
  boss.ouchAccum += amount;
  boss.phaseAccum += amount;
  boss.hitFlashTicks = 5;

  emitEvent(state, {
    type: 'boss_hit',
    x: hitX,
    y: hitY,
    phase: boss.phase,
  });

  // 1. Defeat check (0 HP -> state 3 DEFEATED_EXPLODING)
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.state = 3;
    boss.stateTimer = 120;
    boss.bulletImmune = true;
    boss.laserCharge = 0;
    boss.laserActiveTicks = 0;
    boss.ouchAccum = 0;
    boss.phaseAccum = 0;
    state.runStats.bossDefeated = true;
    addShake(state, 6, 40);
    emitEvent(state, { type: 'boss_defeat', x: boss.x, y: boss.y });
    return;
  }

  // 2. Phase transition check (every 880 HP across 4 phases)
  const expectedPhase = Math.min(
    WELL_CONSTANTS.BOSS_PHASES,
    Math.floor((boss.maxHp - boss.hp) / WELL_CONSTANTS.BOSS_PHASE_THRESHOLD) + 1,
  ) as 1 | 2 | 3 | 4;

  if (expectedPhase > boss.phase || (boss.phase < 4 && boss.phaseAccum >= WELL_CONSTANTS.BOSS_PHASE_THRESHOLD)) {
    boss.phase = Math.min(4, Math.max(boss.phase + 1, expectedPhase)) as 1 | 2 | 3 | 4;
    boss.phaseAccum = (boss.maxHp - boss.hp) % WELL_CONSTANTS.BOSS_PHASE_THRESHOLD;
    boss.ouchAccum = 0;
    boss.state = 1; // PHASE_TRANSITION
    boss.stateTimer = 90;
    boss.bulletImmune = true;
    boss.laserCharge = 0;
    boss.laserActiveTicks = 0;

    addShake(state, 5, 24);
    emitEvent(state, { type: 'boss_phase', phase: boss.phase });
    emitEvent(state, {
      type: 'floating_text',
      x: boss.x,
      y: boss.y - 36,
      text: `PHASE ${boss.phase}`,
      channel: 'M',
    });

    spawnBossWallModules(state);
    return;
  }

  // 3. Ouch stun check (every 220 damage -> state 2 EYE_CLOSED_STUN)
  if (boss.ouchAccum >= WELL_CONSTANTS.BOSS_OUCH_AMT) {
    boss.ouchAccum = 0;
    boss.state = 2; // EYE_CLOSED_STUN
    boss.stateTimer = 75;
    boss.bulletImmune = true;
    boss.laserCharge = 0;
    boss.laserActiveTicks = 0;

    addShake(state, 3, 14);
    emitEvent(state, {
      type: 'boss_stun',
      x: boss.x,
      y: boss.y,
      phase: boss.phase,
    });
  }
}

function fireBossVolley(state: SimState): void {
  const boss = state.boss;
  if (!boss) return;

  const count = 3 + boss.phase;
  const spreadDeg = 60 + boss.phase * 8;
  const speed = 1.6 + boss.phase * 0.2 + (state.hardMode ? 0.25 : 0);

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    // Fan upward (-90 deg +/- spread/2)
    const angleRad = ((-90 + t * spreadDeg) * Math.PI) / 180;
    if (state.enemyBullets.length >= 60) break;
    state.enemyBullets.push({
      id: allocId(state),
      x: boss.x,
      y: boss.y - 24,
      prevX: boss.x,
      prevY: boss.y - 24,
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
      radius: 4,
      ttl: 180,
      kind: 'boss_orb',
      alive: true,
    });
  }
}

export function updateBoss(state: SimState): void {
  const boss = state.boss;
  if (!boss || !boss.active || state.mode !== 'playing') {
    return;
  }

  const p = state.player;
  boss.prevX = boss.x;
  boss.prevY = boss.y;

  if (boss.hitFlashTicks > 0) {
    boss.hitFlashTicks -= 1;
  }

  // Track vertically beneath the player in the Abyss chute
  boss.targetY = p.y + 124;
  boss.y += (boss.targetY - boss.y) * 0.08;

  // Sweep tentacles smoothly (faster per phase)
  const sweepSpeed = 0.03 + boss.phase * 0.01 + (state.hardMode ? 0.008 : 0);
  boss.tentacleAngle += boss.tentacleSweepDir * sweepSpeed;
  if (boss.tentacleAngle > 0.85) {
    boss.tentacleAngle = 0.85;
    boss.tentacleSweepDir = -1;
  } else if (boss.tentacleAngle < -0.85) {
    boss.tentacleAngle = -0.85;
    boss.tentacleSweepDir = 1;
  }

  switch (boss.state) {
    case 0: {
      // EYE_OPEN: vulnerable, attacks with volleys/lasers and biome summons
      boss.bulletImmune = false;
      const swayRange = 14 + boss.phase * 3;
      const targetX = WELL_CONSTANTS.CAM_CENTER_X + Math.sin(state.tick * 0.025) * swayRange;
      boss.x += (targetX - boss.x) * 0.08;

      // Attack cycle: volley & telegraph laser
      boss.attackTimer -= 1;
      if (boss.attackTimer <= 0) {
        const baseInterval = Math.max(45, 110 - boss.phase * 15 - (state.hardMode ? 12 : 0));
        boss.attackTimer = baseInterval;

        if (boss.laserCharge === 0 && boss.laserActiveTicks === 0 && (state.tick % 2 === 0 || boss.phase >= 3)) {
          boss.laserCharge = Math.max(30, 50 - boss.phase * 4);
          boss.laserX = Math.max(24, Math.min(152, p.x));
        } else {
          fireBossVolley(state);
        }
      }

      // Laser telegraph & beam
      if (boss.laserCharge > 0) {
        boss.laserCharge -= 1;
        if (boss.laserCharge === 0) {
          boss.laserActiveTicks = 28;
          addShake(state, 3, 18);
          emitEvent(state, { type: 'boss_laser', x: boss.laserX, y: boss.y - 40 });
        }
      } else if (boss.laserActiveTicks > 0) {
        boss.laserActiveTicks -= 1;
        if (p.alive && Math.abs(p.x - boss.laserX) <= 10 && p.y < boss.y) {
          damagePlayer(state, boss.laserX, p.y);
        }
      }

      // Biome summon escalation matching boss.phase (1=Cavern -> 4=Limbo)
      boss.summonTimer -= 1;
      if (boss.summonTimer <= 0) {
        boss.summonTimer = Math.max(85, 190 - boss.phase * 24 - (state.hardMode ? 15 : 0));
        if (state.enemies.length < 4 + boss.phase) {
          const pool = BIOME_ENEMY_POOLS[boss.phase];
          const list = state.hardMode ? pool.hard : pool.normal;
          const kind = randPick(state, list);
          const spawnX = randRange(state, 28, 148);
          const spawnY = boss.y - 76;
          spawnEnemy(state, kind, spawnX, spawnY);
        }
      }
      break;
    }

    case 1: {
      // PHASE_TRANSITION
      boss.bulletImmune = true;
      boss.stateTimer -= 1;
      if (boss.stateTimer % 20 === 0) {
        emitEvent(state, {
          type: 'explosion',
          x: boss.x + randRange(state, -24, 24),
          y: boss.y + randRange(state, -24, 24),
          radius: 20,
        });
      }
      if (boss.stateTimer <= 0) {
        boss.state = 0;
        boss.bulletImmune = false;
        boss.attackTimer = 45;
      }
      break;
    }

    case 2: {
      // EYE_CLOSED_STUN
      boss.bulletImmune = true;
      boss.stateTimer -= 1;
      if (boss.stateTimer <= 0) {
        boss.state = 0;
        boss.bulletImmune = false;
      }
      break;
    }

    case 3: {
      // DEFEATED_EXPLODING -> transitions to mode = 'victory'
      boss.bulletImmune = true;
      boss.stateTimer -= 1;
      if (boss.stateTimer % 12 === 0) {
        addShake(state, 4, 10);
        emitEvent(state, {
          type: 'explosion',
          x: boss.x + randRange(state, -36, 36),
          y: boss.y + randRange(state, -36, 36),
          radius: 26,
        });
      }
      // Clear enemy bullets during collapse
      state.enemyBullets = [];

      if (boss.stateTimer <= 0) {
        boss.defeated = true;
        boss.active = false;
        state.runStats.bossDefeated = true;
        state.mode = 'victory';
        state.victoryTimer = 180;
        spawnGems(state, boss.x, boss.y, 100);
        emitEvent(state, {
          type: 'floating_text',
          x: boss.x,
          y: boss.y - 24,
          text: 'WELL CONQUERED!',
          channel: 'L',
        });
      }
      return;
    }
  }

  // Player <-> Boss Eye stomp & Tentacle hazard collision
  if (!p.alive || boss.defeated) {
    return;
  }

  const pLeft = p.x - WELL_CONSTANTS.PLAYER_HALF_W;
  const pRight = p.x + WELL_CONSTANTS.PLAYER_HALF_W;
  const pTop = p.y + WELL_CONSTANTS.PLAYER_TOP_OFFSET;
  const pBottom = p.y + WELL_CONSTANTS.PLAYER_BOTTOM_OFFSET;

  const eyeHalfW = WELL_CONSTANTS.BOSS_EYE_W * 0.5;
  const eyeHalfH = WELL_CONSTANTS.BOSS_EYE_H * 0.5;
  const eyeTop = boss.y - eyeHalfH;

  // Stomp on top of eye
  if (
    p.vy >= 0 &&
    pRight > boss.x - eyeHalfW &&
    pLeft < boss.x + eyeHalfW &&
    pBottom >= eyeTop &&
    pBottom <= eyeTop + 18
  ) {
    const style = getStyleDef(state.styleId);
    p.vy = -style.stompBounce * 1.25;
    p.onGround = false;
    p.spinJump = false;
    rechargeGunboots(state);
    addShake(state, 2, 10);
    if (!boss.bulletImmune) {
      damageBoss(state, WELL_CONSTANTS.STOMP_DAMAGE, p.x, pBottom);
    }
    return;
  }

  // Body collision below top cap
  if (
    pRight > boss.x - eyeHalfW &&
    pLeft < boss.x + eyeHalfW &&
    pBottom > eyeTop + 18 &&
    pTop < boss.y + eyeHalfH
  ) {
    damagePlayer(state, boss.x, boss.y);
    return;
  }

  // Sweeping left/right tentacles
  const tentacleReach = WELL_CONSTANTS.BOSS_TENTACLE_W * 0.45;
  const dx = Math.abs(p.x - boss.x);
  if (dx >= eyeHalfW && dx <= tentacleReach) {
    const sideSign = p.x >= boss.x ? 1 : -1;
    const tentacleY = boss.y + Math.sin(boss.tentacleAngle * sideSign) * 20;
    if (pBottom > tentacleY - 12 && pTop < tentacleY + 12) {
      damagePlayer(state, p.x, tentacleY);
    }
  }
}
