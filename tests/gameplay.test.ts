import { describe, expect, it } from 'vitest';
import {
  TILE_KIND,
  WELL_CONSTANTS,
  type AreaId,
  type InputFrame,
  type SideRoomState,
  type SimState,
  type StyleId,
  type WeaponId,
} from '../src/contracts/index.ts';
import { computeShopPrice } from '../src/data/upgrades.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { hashSimState } from '../src/sim/hash.ts';
import { seedRng } from '../src/sim/prng.ts';
import {
  colToX,
  completeCombo,
  damagePlayer,
  rowToY,
  setTile,
} from '../src/sim/simUtils.ts';
import { updateBulletsAndCasings, updateWeapons } from '../src/sim/weapons.ts';
import {
  applyUpgrade,
  handleUpgradeSelectInput,
  rollUpgradeChoices,
  triggerExplosion,
  updateUpgradesTick,
} from '../src/sim/upgrades.ts';
import {
  damageEnemy,
  spawnEnemy,
  spawnGems,
  updateEnemies,
  updateGemsAndCorpses,
} from '../src/sim/enemies.ts';
import {
  populateSideRoom,
  spawnBossWallModules,
  updateSideRoomsAndPickups,
} from '../src/sim/shop.ts';
import { damageBoss, initBoss, updateBoss } from '../src/sim/boss.ts';
import {
  computeUnlockedFromGems,
  evaluateLiveTrophies,
  evaluateStageClearTrophies,
} from '../src/sim/progression.ts';

function makeInput(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
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
    ...overrides,
  };
}

function makeTestState(opts?: {
  seed?: number;
  area?: AreaId;
  level?: number;
  hardMode?: boolean;
  styleId?: StyleId;
  rows?: number;
}): SimState {
  const seed = opts?.seed ?? 1337;
  const rows = opts?.rows ?? 30;
  const minCol = WELL_CONSTANTS.GRID_MIN_COL;
  const maxCol = WELL_CONSTANTS.GRID_MAX_COL;
  const cols = maxCol - minCol + 1;
  const tiles = new Array(cols * rows).fill(TILE_KIND.EMPTY);

  // Build standard shaft side walls at col 0 and col 10, floor at bottom row
  for (let r = 0; r < rows; r++) {
    tiles[r * cols + (WELL_CONSTANTS.SHAFT_LEFT_WALL_COL - minCol)] = TILE_KIND.SOLID;
    tiles[r * cols + (WELL_CONSTANTS.SHAFT_RIGHT_WALL_COL - minCol)] = TILE_KIND.SOLID;
  }
  for (let c = minCol; c <= maxCol; c++) {
    tiles[(rows - 1) * cols + (c - minCol)] = TILE_KIND.SOLID;
  }

  return {
    tick: 0,
    seed,
    rngState: seedRng(seed),
    mode: 'playing',
    area: opts?.area ?? 1,
    level: opts?.level ?? 1,
    hardMode: opts?.hardMode ?? false,
    styleId: opts?.styleId ?? 0,
    player: {
      x: 88,
      y: 80,
      prevX: 88,
      prevY: 80,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: false,
      onThinPlatform: false,
      onWall: 0,
      inWater: false,
      wasInWater: false,
      hp: 4,
      hpMax: 4,
      heartPieces: 0,
      ammo: 8,
      ammoMax: 8,
      weaponId: 0,
      gunLevel: 0,
      fireCooldown: 0,
      semiAutoLatch: false,
      burstRemaining: 0,
      burstTimer: 0,
      bootSide: 1,
      jumpShootLock: false,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
      wallKickTicks: 0,
      wallKickDir: 0,
      spinJump: false,
      invulnTicks: 0,
      oxygen: 100,
      oxygenTick: 0,
      oxygenStunTicks: 0,
      suffocateTick: 0,
      jetpackTicks: WELL_CONSTANTS.JETPACK_MAX_TICKS,
      jetpackActive: false,
      corpseCount: 0,
      alive: true,
      animState: 'fall',
      animFrame: 0,
      animTimer: 0,
      muzzleFlashTicks: 0,
      meterJiggleTicks: 0,
      afterimages: [],
      drone: { active: false, x: 0, y: 0, orbitAngle: 0 },
      balloon: { active: false, x: 0, y: 0, hp: 0 },
      timeoutVoid: { active: false, x: 0, y: 0, timer: 0, radius: WELL_CONSTANTS.TIMEOUT_VOID_RADIUS },
    },
    gems: 0,
    runGems: 0,
    gemStreak: 0,
    gemStreakTimer: 0,
    gemHigh: false,
    combo: 0,
    maxCombo: 0,
    comboPopup: null,
    upgrades: [],
    upgradeChoices: [],
    upgradeCursor: 0,
    camera: {
      x: 88,
      y: 80,
      prevX: 88,
      prevY: 80,
      targetX: 88,
      targetY: 80,
      shakeMag: 0,
      shakeTicks: 0,
      sideRoomLocked: false,
      sideRoomX: 0,
      sideRoomY: 0,
    },
    impactSlowdownTicks: 0,
    hitStopTicks: 0,
    world: {
      area: opts?.area ?? 1,
      level: opts?.level ?? 1,
      minCol,
      maxCol,
      cols,
      rows,
      tiles,
      waterStartRow: 999,
      exitRow: rows - 1,
      sideRooms: [],
      airPockets: [],
      spikeTrapTimer: 0,
      spikeTrapExtended: false,
    },
    enemies: [],
    bullets: [],
    enemyBullets: [],
    gemsEntities: [],
    casings: [],
    corpses: [],
    pickups: [],
    boss: null,
    inSideRoom: false,
    activeSideRoomId: null,
    shopPromptText: null,
    runStats: {
      kills: 0,
      stomps: 0,
      shotsFired: 0,
      blocksBroken: 0,
      damageTaken: 0,
      stageDamageTaken: 0,
      areaDamageTaken: 0,
      stageKills: 0,
      stageShotsFired: 0,
      stageGemsSpawned: 0,
      stageGemsCollected: 0,
      stageLandings: 0,
      areaLandings: 0,
      stageSideRoomsVisited: 0,
      stageStartTick: 0,
      elapsedTicks: 0,
      shopsVisited: 0,
      modulesCollected: 0,
      upgradesTaken: 0,
      combo100Hit: false,
      bossDefeated: false,
      noUpgradeRun: true,
      maxDepthMeters: 0,
    },
    unlockedTrophiesInRun: [],
    stageTransitionTicks: 0,
    victoryTimer: 0,
    nextEntityId: 1,
    events: [],
  };
}

describe('Weapons: velocity-clamp recoil, dry-fire, and all 7 weapons (Normal vs Gem High)', () => {
  it('enforces exact velocity-clamp recoil (never additive) and airborne/jumpShootLock rules', () => {
    const state = makeTestState();
    state.player.weaponId = 1; // Shotgun: recoil -1.4 normal
    state.player.ammo = 20;

    // Grounded: must NOT fire
    state.player.onGround = true;
    state.player.vy = 5.0;
    updateWeapons(state, makeInput({ action: true, actionPressed: true }));
    expect(state.bullets.length).toBe(0);
    expect(state.player.ammo).toBe(20);

    // Jump-shoot lock: must NOT fire until lock clears
    state.player.onGround = false;
    state.player.jumpShootLock = true;
    updateWeapons(state, makeInput({ action: true, actionPressed: true }));
    expect(state.bullets.length).toBe(0);
    expect(state.player.ammo).toBe(20);

    // Airborne falling fast (vy = 5.0): clamps to exact -1.4
    state.player.jumpShootLock = false;
    state.player.vy = 5.0;
    updateWeapons(state, makeInput({ action: true, actionPressed: true }));
    expect(state.player.vy).toBe(-1.4);
    expect(state.bullets.length).toBe(7);
    expect(state.casings.length).toBe(1);

    // Semi-auto latch prevents firing while held even after cooldown expires
    state.player.fireCooldown = 0;
    updateWeapons(state, makeInput({ action: true, actionPressed: false }));
    expect(state.bullets.length).toBe(7);

    // Release unlatches, then firing while already rising faster (-3.5 < -1.4) keeps -3.5 (NEVER additive!)
    updateWeapons(state, makeInput({ action: false, actionReleased: true }));
    state.player.vy = -3.5;
    updateWeapons(state, makeInput({ action: true, actionPressed: true }));
    expect(state.player.vy).toBe(-3.5);
    expect(state.bullets.length).toBe(14);
  });

  it('applies exact dry-fire clamp 3.0 and emits empty_click + EMPTY! floating text', () => {
    const state = makeTestState();
    state.player.weaponId = 0;
    state.player.ammo = 0;
    state.player.vy = 6.5;

    updateWeapons(state, makeInput({ action: true, actionPressed: true }));

    expect(state.player.vy).toBe(WELL_CONSTANTS.EMPTY_FIRE_CLAMP);
    expect(state.player.vy).toBe(3.0);
    expect(state.events.some((e) => e.type === 'empty_click')).toBe(true);
    expect(
      state.events.some((e) => e.type === 'floating_text' && e.text === 'EMPTY!'),
    ).toBe(true);
    expect(state.bullets.length).toBe(0);
  });

  it('supports all 7 weapons in Normal (Lv0) and Gem High (Lv1)', () => {
    // 0: Machinegun (bootSide alternation + Normal vs Gem High stats + Laser Sight)
    {
      const state = makeTestState();
      state.player.weaponId = 0;
      state.player.ammo = 20;
      state.player.bootSide = 1;
      updateWeapons(state, makeInput({ action: true }));
      const b1 = state.bullets[0]!;
      expect(b1.damage).toBe(WEAPONS[0]!.normal.damage);
      expect(b1.x).toBe(state.player.x - 3);
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true }));
      const b2 = state.bullets[1]!;
      expect(b2.x).toBe(state.player.x + 3);

      // Gem High + Laser Sight (centered shot, +50% range)
      state.player.gunLevel = 1;
      applyUpgrade(state, 12);
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true }));
      const b3 = state.bullets[2]!;
      expect(b3.damage).toBe(WEAPONS[0]!.gemHigh.damage);
      expect(b3.x).toBe(state.player.x);
      expect(b3.remainingRange).toBe(Math.round(WEAPONS[0]!.gemHigh.rangePx * 1.5));
    }

    // 1: Shotgun (7 pellets Normal, 15 pellets Gem High, recoil -1.4 vs -2.0)
    {
      const state = makeTestState();
      state.player.weaponId = 1;
      state.player.ammo = 20;
      state.player.vy = 4.0;
      updateWeapons(state, makeInput({ action: true, actionPressed: true }));
      expect(state.bullets.length).toBe(7);
      expect(state.player.vy).toBe(-1.4);

      state.bullets = [];
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      state.player.semiAutoLatch = false;
      state.player.vy = 4.0;
      updateWeapons(state, makeInput({ action: true, actionPressed: true }));
      expect(state.bullets.length).toBe(15);
      expect(state.player.vy).toBe(-2.0);
    }

    // 2: Laser (piercing instant vertical beam breaks multiple breakable blocks, hits multiple enemies, stops at solid wall)
    {
      const state = makeTestState();
      state.player.weaponId = 2;
      state.player.ammo = 20;
      state.player.x = colToX(5) + 8;
      state.player.y = rowToY(2);

      // Place two breakable blocks and a solid stop wall below
      setTile(state.world, 5, 4, TILE_KIND.BREAKABLE);
      setTile(state.world, 5, 6, TILE_KIND.BREAKABLE);
      setTile(state.world, 5, 10, TILE_KIND.SOLID);

      const e1 = spawnEnemy(state, 'frog', colToX(5) + 8, rowToY(5) + 8); // 35 HP
      const e2 = spawnEnemy(state, 'frog', colToX(5) + 8, rowToY(8) + 8); // 35 HP
      const eBelowWall = spawnEnemy(state, 'frog', colToX(5) + 8, rowToY(12) + 8);

      updateWeapons(state, makeInput({ action: true, actionPressed: true }));

      expect(state.bullets.length).toBe(1);
      expect(state.bullets[0]!.isLaser).toBe(true);
      expect(state.bullets[0]!.laserEndY).toBe(rowToY(10));
      expect(state.runStats.blocksBroken).toBe(2);
      expect(e1.hp).toBe(35 - 25); // Normal laser dmg 25
      expect(e2.hp).toBe(35 - 25);
      expect(eBelowWall.hp).toBe(35); // Shielded behind solid wall

      // Gem High laser deals 35 dmg and finishes e1/e2
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      state.player.semiAutoLatch = false;
      updateWeapons(state, makeInput({ action: true, actionPressed: true }));
      expect(e1.alive).toBe(false);
      expect(e2.alive).toBe(false);
    }

    // 3: Triple (3-way fan -14, 0, +14 deg)
    {
      const state = makeTestState();
      state.player.weaponId = 3;
      state.player.ammo = 20;
      updateWeapons(state, makeInput({ action: true }));
      expect(state.bullets.length).toBe(3);
      expect(state.bullets[0]!.vx).toBeGreaterThan(0); // 90 - 14 = 76 deg => cos > 0
      expect(Math.abs(state.bullets[1]!.vx)).toBeLessThan(0.5);
      expect(state.bullets[2]!.vx).toBeLessThan(0); // 90 + 14 = 104 deg => cos < 0
      expect(state.bullets[0]!.damage).toBe(WEAPONS[3]!.normal.damage);

      state.bullets = [];
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true }));
      expect(state.bullets[0]!.damage).toBe(WEAPONS[3]!.gemHigh.damage);
      expect(state.bullets[0]!.remainingRange).toBe(WEAPONS[3]!.gemHigh.rangePx);
    }

    // 4: Puncher (3 parallel columns +/-5px Normal, +/-6px Gem High)
    {
      const state = makeTestState();
      state.player.weaponId = 4;
      state.player.ammo = 20;
      updateWeapons(state, makeInput({ action: true }));
      expect(state.bullets.length).toBe(3);
      expect(state.bullets.map((b) => b.x)).toEqual([
        state.player.x - 5,
        state.player.x,
        state.player.x + 5,
      ]);

      state.bullets = [];
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true }));
      expect(state.bullets.map((b) => b.x)).toEqual([
        state.player.x - 6,
        state.player.x,
        state.player.x + 6,
      ]);
      expect(state.bullets[0]!.damage).toBe(WEAPONS[4]!.gemHigh.damage);
    }

    // 5: Burst (initial + 2 follow-ups at 5-tick intervals)
    {
      const state = makeTestState();
      state.player.weaponId = 5;
      state.player.ammo = 20;
      updateWeapons(state, makeInput({ action: true, actionPressed: true }));
      expect(state.bullets.length).toBe(1);
      expect(state.player.ammo).toBe(17); // cost 3 paid once
      expect(state.player.burstRemaining).toBe(2);

      for (let i = 0; i < 4; i++) {
        updateWeapons(state, makeInput());
      }
      expect(state.bullets.length).toBe(1);
      updateWeapons(state, makeInput()); // 5th tick fires 2nd burst shot
      expect(state.bullets.length).toBe(2);
      expect(state.player.ammo).toBe(17);

      for (let i = 0; i < 5; i++) {
        updateWeapons(state, makeInput()); // 10th tick fires 3rd burst shot
      }
      expect(state.bullets.length).toBe(3);
      expect(state.player.burstRemaining).toBe(0);

      // Gem High damage check
      state.bullets = [];
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      state.player.semiAutoLatch = false;
      updateWeapons(state, makeInput({ action: true, actionPressed: true }));
      expect(state.bullets[0]!.damage).toBe(WEAPONS[5]!.gemHigh.damage);
    }

    // 6: Noppy (tilts +/- 25 deg opposite horizontal input)
    {
      const state = makeTestState();
      state.player.weaponId = 6;
      state.player.ammo = 20;

      // Holding RIGHT -> tilts LEFT (vx < 0)
      updateWeapons(state, makeInput({ action: true, right: true }));
      expect(state.bullets[0]!.vx).toBeLessThan(-2.0);

      // Holding LEFT -> tilts RIGHT (vx > 0)
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true, left: true }));
      expect(state.bullets[1]!.vx).toBeGreaterThan(2.0);

      // Gem High check
      state.player.gunLevel = 1;
      state.player.fireCooldown = 0;
      updateWeapons(state, makeInput({ action: true }));
      expect(state.bullets[2]!.damage).toBe(WEAPONS[6]!.gemHigh.damage);
    }
  });
});

describe('Combat: stomp vs non-stompable red enemies, combo 8/15/25 cashout, Gem High 100/300t/480t', () => {
  it('stomps stompable enemies (bounces, recharges, increments combo) and hurts player on red enemies or side hits', () => {
    const state = makeTestState();
    state.player.ammo = 2;
    state.player.vy = 3.0;
    state.player.x = 80;
    state.player.y = 80;
    state.player.prevY = 74;

    const bat = spawnEnemy(state, 'bat', 80, 90);
    updateEnemies(state);

    expect(bat.alive).toBe(false);
    expect(state.player.vy).toBe(-WELL_CONSTANTS.STOMP_BOUNCE_SP);
    expect(state.player.ammo).toBe(state.player.ammoMax);
    expect(state.combo).toBe(1);
    expect(state.runStats.stomps).toBe(1);
    expect(state.events.some((e) => e.type === 'stomp')).toBe(true);

    // Non-stompable red enemy (red_ball) hurts player even when descending from above!
    const state2 = makeTestState();
    state2.player.x = 80;
    state2.player.y = 80;
    state2.player.prevY = 74;
    state2.player.vy = 3.0;
    spawnEnemy(state2, 'red_ball', 80, 90);
    updateEnemies(state2);

    expect(state2.player.hp).toBe(3);
    expect(state2.events.some((e) => e.type === 'player_hurt')).toBe(true);

    // Side collision with stompable enemy hurts player
    const state3 = makeTestState();
    state3.player.x = 80;
    state3.player.y = 80;
    state3.player.prevY = 80;
    state3.player.vy = 0;
    spawnEnemy(state3, 'snake', 86, 80);
    updateEnemies(state3);
    expect(state3.player.hp).toBe(3);
  });

  it('cashes out combo tiers 8 (+100G), 15 (+100G +1CHG), and 25 (+100G +1CHG +1HP)', () => {
    // Tier 1: combo 8
    const s1 = makeTestState();
    s1.combo = 8;
    completeCombo(s1);
    expect(s1.gems).toBe(100);
    expect(s1.player.ammoMax).toBe(8);
    expect(s1.player.hp).toBe(4);
    expect(s1.combo).toBe(0);

    // Tier 2: combo 15
    const s2 = makeTestState();
    s2.combo = 15;
    completeCombo(s2);
    expect(s2.gems).toBe(100);
    expect(s2.player.ammoMax).toBe(9);
    expect(s2.player.hp).toBe(4);

    // Tier 3: combo 25
    const s3 = makeTestState();
    s3.player.hp = 3;
    s3.combo = 25;
    completeCombo(s3);
    expect(s3.gems).toBe(100);
    expect(s3.player.ammoMax).toBe(9);
    expect(s3.player.hp).toBe(4);
    expect(s3.comboPopup?.rewardText).toBe('+100G +1CHG +1HP');
  });

  it('activates Gem High at 100 streak, lasts 300t normal / 480t with Gem Sick, pauses in side rooms', () => {
    const state = makeTestState();
    state.player.x = 88;
    state.player.y = 80;

    // Spawn 100 gems right on player
    spawnGems(state, 88, 80, 100);
    updateGemsAndCorpses(state);

    expect(state.gems).toBe(100);
    expect(state.gemStreak).toBe(100);
    expect(state.gemHigh).toBe(true);
    expect(state.player.gunLevel).toBe(1);
    expect(state.gemStreakTimer).toBe(300);
    expect(state.events.some((e) => e.type === 'gem_high_start')).toBe(true);

    // Side room pauses timer
    state.inSideRoom = true;
    for (let i = 0; i < 20; i++) {
      updateGemsAndCorpses(state);
    }
    expect(state.gemStreakTimer).toBe(300);

    // Outside side room, ticks down 300 frames and expires
    state.inSideRoom = false;
    for (let i = 0; i < 299; i++) {
      updateGemsAndCorpses(state);
    }
    expect(state.gemHigh).toBe(true);
    expect(state.gemStreakTimer).toBe(1);

    updateGemsAndCorpses(state);
    expect(state.gemHigh).toBe(false);
    expect(state.player.gunLevel).toBe(0);
    expect(state.gemStreak).toBe(0);
    expect(state.events.some((e) => e.type === 'gem_high_end')).toBe(true);

    // Gem Sick (ug 20) gives 480t timer
    applyUpgrade(state, 20);
    spawnGems(state, 88, 80, 100);
    updateGemsAndCorpses(state);
    expect(state.gemHigh).toBe(true);
    expect(state.gemStreakTimer).toBe(480);
  });

  it('slows enemies by 50% inside Timeout Void and ticks all biome enemy behaviors cleanly', () => {
    const state = makeTestState();
    applyUpgrade(state, 17); // Timeout
    damagePlayer(state, 120, 80); // Spawns timeoutVoid centered at player
    expect(state.player.timeoutVoid.active).toBe(true);
    expect(state.player.timeoutVoid.timer).toBe(WELL_CONSTANTS.TIMEOUT_VOID_TICKS);

    // Compare phase_ghost movement inside vs outside void
    const ghostIn = spawnEnemy(state, 'obake', state.player.x + 20, state.player.y);
    const ghostOut = spawnEnemy(state, 'obake', state.player.x + 100, state.player.y);
    const startInX = ghostIn.x;
    const startOutX = ghostOut.x;
    updateEnemies(state);
    const deltaIn = Math.abs(ghostIn.x - startInX);
    const deltaOut = Math.abs(ghostOut.x - startOutX);
    expect(deltaIn).toBeCloseTo(deltaOut * 0.5, 4);

    // Spawn representative enemies across all 4 biomes and step 10 ticks
    const biomeState = makeTestState();
    biomeState.player.invulnTicks = 999;
    const kinds = [
      'bat', 'snake', 'frog', 'snail', 'ground_turtle', 'white_jelly', 'red_ball', 'crawler',
      'skeleton', 'obake', 'gas_wander', 'eyefish', 'squid', 'dodger', 'poofer',
      'spore_spawner', 'lunger', 'guntle',
    ] as const;
    kinds.forEach((k, i) => {
      spawnEnemy(biomeState, k, 40 + (i % 5) * 20, 60 + Math.floor(i / 5) * 32);
    });
    for (let t = 0; t < 10; t++) {
      updateEnemies(biomeState);
    }
    for (const e of biomeState.enemies) {
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.y)).toBe(true);
    }
  });
});

describe('Shop & Side Rooms: price scaling, side room entry/pause, gun modules', () => {
  it('computes shop prices accurately across Normal, Hard, Ascetic, and Member Card', () => {
    // Base 200 (Rice Ball)
    expect(computeShopPrice(200, 1, false, false, false)).toBe(200);
    expect(computeShopPrice(200, 2, false, false, false)).toBe(400);
    expect(computeShopPrice(200, 3, false, false, false)).toBe(600);
    // Hard mode 2x
    expect(computeShopPrice(200, 1, true, false, false)).toBe(400);
    expect(computeShopPrice(200, 2, true, false, false)).toBe(800);
    // Ascetic 0.7x
    expect(computeShopPrice(200, 1, false, true, false)).toBe(140);
    // Member's Card 0.9x
    expect(computeShopPrice(200, 1, false, false, true)).toBe(180);
    // Hard + Ascetic + Member's Card combined
    expect(computeShopPrice(500, 2, true, true, true)).toBe(
      Math.round(Math.round((500 + 200) * 2 * 0.7) * 0.9),
    );
  });

  it('populates shop with 3 distinct items, handles purchase vs TOO POOR, and locks camera on entry', () => {
    const state = makeTestState({ area: 1 });
    const room: SideRoomState = {
      id: 1,
      side: 'right',
      doorRow: 4,
      minCol: 11,
      maxCol: 17,
      minRow: 2,
      maxRow: 6,
      centerX: colToX(14) + 8,
      centerY: rowToY(4) + 8,
      kind: 'shop',
      visited: false,
    };
    for (let c = 11; c <= 17; c++) {
      setTile(state.world, c, 6, TILE_KIND.SHOP_FLOOR);
    }
    state.world.sideRooms.push(room);

    populateSideRoom(state, room);
    const shopPickups = state.pickups.filter((pk) => pk.kind === 'shop_item');
    expect(shopPickups.length).toBe(3);
    const distinctIds = new Set(shopPickups.map((pk) => pk.shopItemId));
    expect(distinctIds.size).toBe(3);

    // Move player onto first shop item inside side room
    const firstItem = shopPickups[0]!;
    state.player.x = firstItem.x;
    state.player.y = firstItem.y;
    state.gems = 0;

    // Attempt buy while poor -> shop_deny + TOO POOR!
    updateSideRoomsAndPickups(state, makeInput({ up: true }));
    expect(state.inSideRoom).toBe(true);
    expect(state.activeSideRoomId).toBe(room.id);
    expect(state.camera.sideRoomLocked).toBe(true);
    expect(state.events.some((e) => e.type === 'shop_deny')).toBe(true);
    expect(state.events.some((e) => e.type === 'floating_text' && e.text === 'TOO POOR!')).toBe(true);
    expect(state.pickups.length).toBe(3);

    // Give enough gems and buy with actionPressed
    state.gems = 1000;
    updateSideRoomsAndPickups(state, makeInput({ actionPressed: true }));
    expect(state.events.some((e) => e.type === 'pickup_shop')).toBe(true);
    expect(state.gems).toBe(1000 - (firstItem.price ?? 0));
    expect(state.pickups.length).toBe(2);
  });

  it('rolls gun module weapon != current weapon, 100% HP in Abyss, and supports Reverse Engineering reroll', () => {
    const state = makeTestState({ area: 5 });
    state.player.weaponId = 2; // Laser
    spawnBossWallModules(state);

    const mod = state.pickups.find((pk) => pk.kind === 'gun_module')!;
    expect(mod).toBeDefined();
    expect(mod.weaponId).not.toBe(2);
    expect(mod.bonusType).toBe('hp');

    // Reverse Engineering (ug 1): shooting gun module rerolls once
    applyUpgrade(state, 1);
    const prevWeapon = mod.weaponId;
    state.player.x = mod.x;
    state.player.y = mod.y - 24;
    state.player.weaponId = 0;
    state.player.ammo = 10;
    applyUpgrade(state, 12); // Center shot
    updateWeapons(state, makeInput({ action: true }));
    for (let i = 0; i < 6; i++) {
      updateBulletsAndCasings(state);
    }
    expect(mod.rerolled).toBe(true);
    expect(mod.weaponId).not.toBe(prevWeapon);
    expect(mod.bonusType).toBe('hp'); // Still HP in Area 5 Abyss

    // Shooting a second time must NOT reroll again
    const rerolledWeapon = mod.weaponId;
    state.player.fireCooldown = 0;
    updateWeapons(state, makeInput({ action: true }));
    for (let i = 0; i < 6; i++) {
      updateBulletsAndCasings(state);
    }
    expect(mod.weaponId).toBe(rerolledWeapon);
  });
});

describe('Upgrades: choices, Blast Module, Gem Powered, Drone, Knife & Fork, Rocket Jump, Safety Jetpack', () => {
  it('rolls style.upgradeChoices + Youth bonus, returns 0 in Ascetic style, and navigates selection input', () => {
    const std = makeTestState({ styleId: 0 });
    expect(rollUpgradeChoices(std).length).toBe(3);

    applyUpgrade(std, 6); // Youth (+1 choice, +1 HP)
    expect(rollUpgradeChoices(std).length).toBe(4);
    expect(rollUpgradeChoices(std)).not.toContain(6);

    const heavy = makeTestState({ styleId: 2 });
    expect(rollUpgradeChoices(heavy).length).toBe(2);

    const ascetic = makeTestState({ styleId: 4 });
    expect(rollUpgradeChoices(ascetic)).toEqual([]);

    // Upgrade selection input navigation + confirm
    std.mode = 'upgrade_select';
    std.upgradeChoices = [0, 4, 9];
    std.upgradeCursor = 0;
    expect(handleUpgradeSelectInput(std, makeInput({ right: true }))).toBe(false);
    expect(std.upgradeCursor).toBe(1);
    expect(handleUpgradeSelectInput(std, makeInput({ actionPressed: true }))).toBe(true);
    expect(std.mode).toBe('playing');
    expect(std.upgrades).toContain(4);
  });

  it('triggers Blast Module (ug 0) explosion on stomp and damages nearby foes + breaks blocks', () => {
    const state = makeTestState();
    applyUpgrade(state, 0);
    state.player.x = colToX(5) + 8;
    state.player.y = rowToY(5);
    state.player.prevY = rowToY(5) - 6;
    state.player.vy = 3.0;

    spawnEnemy(state, 'snake', colToX(5) + 8, rowToY(5) + 10);
    const nearby = spawnEnemy(state, 'bat', colToX(5) + 26, rowToY(5) + 10); // 15 HP, within 32px
    setTile(state.world, 6, 5, TILE_KIND.BREAKABLE);

    updateEnemies(state);
    expect(state.events.some((e) => e.type === 'explosion')).toBe(true);
    expect(nearby.alive).toBe(false);
    expect(state.runStats.blocksBroken).toBeGreaterThanOrEqual(1);
  });

  it('restores ammo on Gem Powered (ug 4) and fires upward bullet on Popping Gems (ug 16)', () => {
    const state = makeTestState();
    applyUpgrade(state, 4);
    applyUpgrade(state, 16);
    state.player.ammo = 2;
    state.player.ammoMax = 8;
    state.player.x = 88;
    state.player.y = 80;

    state.gemsEntities.push({
      id: 99,
      x: 88,
      y: 80,
      vx: 0,
      vy: 0,
      value: 6,
      ttl: 100,
      alive: true,
    });
    updateGemsAndCorpses(state);

    expect(state.player.ammo).toBe(5); // 2 + round(6/2)
    expect(state.bullets.some((b) => b.vy < 0)).toBe(true);
  });

  it('orbits Drone (ug 9) and mirrors player shots from drone position', () => {
    const state = makeTestState();
    applyUpgrade(state, 9);
    expect(state.player.drone.active).toBe(true);

    const x0 = state.player.drone.x;
    for (let i = 0; i < 10; i++) {
      updateUpgradesTick(state);
    }
    expect(state.player.drone.x).not.toBe(x0);

    state.player.ammo = 10;
    updateWeapons(state, makeInput({ action: true }));
    expect(state.bullets.length).toBe(2);
    expect(state.bullets.filter((b) => b.fromDrone).length).toBe(1);
  });

  it('eats 10 corpses with Knife & Fork (ug 11) to heal +1 HP and emit OMNOMNOM', () => {
    const state = makeTestState();
    applyUpgrade(state, 11);
    state.player.hp = 2;
    state.player.x = 88;
    state.player.y = 80;

    for (let i = 0; i < 10; i++) {
      state.corpses.push({
        id: 200 + i,
        kind: 'snake',
        x: 88,
        y: 82,
        vx: 0,
        vy: 0,
        onGround: true,
        ttl: 200,
        alive: true,
      });
    }

    updateUpgradesTick(state);

    expect(state.player.hp).toBe(3);
    expect(state.player.corpseCount).toBe(0);
    expect(state.events.some((e) => e.type === 'corpse_eat' && e.healed)).toBe(true);
    expect(
      state.events.some((e) => e.type === 'floating_text' && e.text === 'OMNOMNOM'),
    ).toBe(true);
  });

  it('triggers Rocket Jump (ug 18) downward blast, Safety Jetpack (ug 22) hover, Hot Casing (ug 8), Gunpowder Blocks (ug 5), Rest In Pieces (ug 3), and Gem Attractor (ug 10)', () => {
    // Rocket Jump (ug 18)
    const rj = makeTestState();
    applyUpgrade(rj, 18);
    rj.player.x = colToX(5) + 8;
    rj.player.y = rowToY(5) + 4;
    setTile(rj.world, 5, 6, TILE_KIND.BREAKABLE);
    rj.events.push({ type: 'jump', x: rj.player.x, y: rj.player.y, rocket: true, water: false });
    updateUpgradesTick(rj);
    expect(rj.events.some((e) => e.type === 'explosion')).toBe(true);
    expect(rj.runStats.blocksBroken).toBe(1);

    // Safety Jetpack (ug 22)
    const jp = makeTestState();
    applyUpgrade(jp, 22);
    jp.player.ammo = 0;
    jp.player.vy = 5.0;
    const startTicks = jp.player.jetpackTicks;
    updateWeapons(jp, makeInput({ action: true }));
    expect(jp.player.vy).toBeLessThanOrEqual(-0.4);
    expect(jp.player.jetpackTicks).toBe(startTicks - 1);
    expect(jp.player.jetpackActive).toBe(true);
    expect(jp.events.some((e) => e.type === 'jetpack_tick')).toBe(true);

    // Hot Casing (ug 8): deals 8 dmg to enemies
    const hc = makeTestState();
    applyUpgrade(hc, 8);
    const frog = spawnEnemy(hc, 'frog', 88, 84); // 35 HP
    hc.casings.push({
      id: 500,
      x: 88,
      y: 84,
      vx: 0,
      vy: 0,
      hot: true,
      ttl: 30,
      alive: true,
    });
    updateBulletsAndCasings(hc);
    expect(frog.hp).toBe(27);

    // Gunpowder Blocks (ug 5) + Bubble Block
    const gp = makeTestState();
    applyUpgrade(gp, 5);
    gp.player.inWater = true;
    gp.player.oxygen = 50;
    setTile(gp.world, 5, 6, TILE_KIND.BUBBLE_BLOCK);
    triggerExplosion(gp, colToX(5) + 8, rowToY(6) + 8, 12, 10);
    expect(gp.bullets.filter((b) => b.vy < 0).length).toBe(3);
    expect(gp.pickups.some((pk) => pk.kind === 'air_bubble')).toBe(true);
    expect(gp.player.oxygen).toBe(75);

    // Rest In Pieces (ug 3): shooting corpse triggers explosion
    const rip = makeTestState();
    applyUpgrade(rip, 3);
    rip.corpses.push({
      id: 600,
      kind: 'bat',
      x: 88,
      y: 100,
      vx: 0,
      vy: 0,
      onGround: true,
      ttl: 100,
      alive: true,
    });
    rip.bullets.push({
      id: 601,
      x: 88,
      y: 96,
      prevX: 88,
      prevY: 96,
      vx: 0,
      vy: 6,
      damage: 9,
      radius: 3,
      remainingRange: 40,
      piercing: false,
      isLaser: false,
      laserEndY: 96,
      weaponId: 0,
      fromDrone: false,
      alive: true,
    });
    updateBulletsAndCasings(rip);
    expect(rip.events.some((e) => e.type === 'explosion')).toBe(true);
    expect(rip.corpses[0]!.alive).toBe(false);

    // Gem Attractor (ug 10) pulls gem within 56px toward player
    const ga = makeTestState();
    applyUpgrade(ga, 10);
    ga.player.x = 88;
    ga.player.y = 80;
    ga.gemsEntities.push({
      id: 700,
      x: 128, // 40px right of player
      y: 80,
      vx: 0,
      vy: 0,
      value: 5,
      ttl: 100,
      alive: true,
    });
    updateUpgradesTick(ga);
    expect(ga.gemsEntities[0]!.vx).toBeLessThan(0);

    // Apple (ug 13): +4 HP / heart pieces upgrades Max HP when full
    const ap = makeTestState();
    ap.player.hp = 4;
    ap.player.hpMax = 4;
    applyUpgrade(ap, 13);
    expect(ap.player.hpMax).toBe(5);
    expect(ap.player.hp).toBe(5);
  });
});

describe('Boss: 4-phase Abyssal Leviathan (220 ouch / 880 phase / 3520 total -> victory)', () => {
  it('runs full 220 stun, bulletImmune shielding, 880 phase escalation, and 3520 defeat -> victory', () => {
    const state = makeTestState({ area: 5 });
    initBoss(state);
    const boss = state.boss!;
    expect(boss.hp).toBe(3520);
    expect(boss.phase).toBe(1);
    expect(boss.state).toBe(0);
    expect(boss.bulletImmune).toBe(false);

    // 220 damage -> EYE_CLOSED_STUN (state 2, bulletImmune = true)
    damageBoss(state, 220, boss.x, boss.y);
    expect(boss.hp).toBe(3300);
    expect(boss.state).toBe(2);
    expect(boss.bulletImmune).toBe(true);
    expect(state.events.some((e) => e.type === 'boss_stun')).toBe(true);

    // Firing bullets while bulletImmune MUST deal 0 damage
    state.bullets.push({
      id: 800,
      x: boss.x,
      y: boss.y - 2,
      prevX: boss.x,
      prevY: boss.y - 8,
      vx: 0,
      vy: 6,
      damage: 50,
      radius: 4,
      remainingRange: 40,
      piercing: false,
      isLaser: false,
      laserEndY: boss.y,
      weaponId: 0,
      fromDrone: false,
      alive: true,
    });
    updateBulletsAndCasings(state);
    expect(boss.hp).toBe(3300);

    // Recover from stun back to EYE_OPEN
    for (let t = 0; t < 80; t++) {
      state.tick += 1;
      updateBoss(state);
    }
    expect(boss.state).toBe(0);
    expect(boss.bulletImmune).toBe(false);

    // Remaining 660 dmg completes 880 threshold -> Phase 2 transition
    damageBoss(state, 660, boss.x, boss.y);
    expect(boss.hp).toBe(2640);
    expect(boss.phase).toBe(2);
    expect(boss.state).toBe(1);
    expect(boss.bulletImmune).toBe(true);
    expect(state.events.some((e) => e.type === 'boss_phase' && e.phase === 2)).toBe(true);

    // Phase 3 (1760 HP) & Phase 4 (880 HP)
    damageBoss(state, 880, boss.x, boss.y);
    expect(boss.hp).toBe(1760);
    expect(boss.phase).toBe(3);
    damageBoss(state, 880, boss.x, boss.y);
    expect(boss.hp).toBe(880);
    expect(boss.phase).toBe(4);

    // Final 880 dmg -> DEFEATED_EXPLODING (state 3)
    damageBoss(state, 880, boss.x, boss.y);
    expect(boss.hp).toBe(0);
    expect(boss.state).toBe(3);
    expect(state.events.some((e) => e.type === 'boss_defeat')).toBe(true);

    // Step explosion timer -> transitions to victory
    for (let t = 0; t < 130; t++) {
      state.tick += 1;
      updateBoss(state);
    }
    expect(boss.defeated).toBe(true);
    expect(state.mode).toBe('victory');
    expect(state.runStats.bossDefeated).toBe(true);
  });
});

describe('Progression & Determinism: trophies, gem milestones, and identical replay hash', () => {
  it('evaluates live trophies, stage-clear trophies, KRUNKED MASTER, and gem unlock milestones', () => {
    const state = makeTestState({ area: 1, hardMode: true });
    state.combo = 100;
    state.gems = 5200;

    const live = evaluateLiveTrophies(state, []);
    expect(live).toContain('trophy_4'); // 10 combo
    expect(live).toContain('trophy_5'); // 30 combo
    expect(live).toContain('trophy_14'); // 100 combo
    expect(live).toContain('trophy_15'); // 3000+ gems
    expect(live).toContain('trophy_22'); // 5000+ gems

    const clear = evaluateStageClearTrophies(state, true, live);
    expect(clear).toContain('trophy_1'); // no dmg stage
    expect(clear).toContain('trophy_2'); // no siderooms
    expect(clear).toContain('trophy_3'); // no shooting
    expect(clear).toContain('trophy_6'); // no dmg area
    expect(clear).toContain('trophy_7'); // beat area 1
    expect(clear).toContain('trophy_12'); // pacifist
    expect(clear).toContain('trophy_13'); // ground allergy
    expect(clear).toContain('trophy_16'); // clean boots
    expect(clear).toContain('trophy_17'); // beat area 1 hard

    // Master trophy unlocks when all 22 other trophies are unlocked
    const almostAll = Array.from({ length: 22 }, (_, i) => `trophy_${i + 1}`);
    const masterState = makeTestState();
    const masterUnlock = evaluateLiveTrophies(masterState, almostAll);
    expect(masterUnlock).toEqual(['trophy_0']);

    // Gem milestones
    expect(computeUnlockedFromGems(0)).toEqual({ styles: [0], palettes: [0] });
    expect(computeUnlockedFromGems(3000)).toEqual({ styles: [0, 1], palettes: [0, 1, 2] });
    const full = computeUnlockedFromGems(500000);
    expect(full.styles).toEqual([0, 1, 2, 3, 4]);
    expect(full.palettes.length).toBe(38);
  });

  it('produces identical FNV-1a hashes across deterministic runs', () => {
    const runScenario = (): string => {
      const s = makeTestState({ seed: 424242 });
      applyUpgrade(s, 9); // Drone
      applyUpgrade(s, 0); // Blast Module
      spawnEnemy(s, 'bat', 88, 120);
      spawnEnemy(s, 'frog', 72, 140);
      for (let t = 0; t < 40; t++) {
        s.tick = t;
        const inp = makeInput({ action: t % 8 === 0, actionPressed: t % 8 === 0, right: t < 20 });
        updateWeapons(s, inp);
        updateBulletsAndCasings(s);
        updateEnemies(s);
        updateGemsAndCorpses(s);
        updateUpgradesTick(s);
      }
      return hashSimState(s);
    };

    expect(runScenario()).toBe(runScenario());
  });
});
