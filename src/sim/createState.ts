import {
  WELL_CONSTANTS,
  WEAPON_IDS,
  type AreaId,
  type EnemyEntity,
  type GameMode,
  type InputFrame,
  type PickupEntity,
  type PlayerState,
  type RunStats,
  type SideRoomState,
  type SimState,
  type StyleId,
  type WeaponId,
} from '../contracts/index.ts';
import { getEnemyDef } from '../data/enemies.ts';
import { getStyleDef } from '../data/styles.ts';
import { computeShopPrice, SHOP_ITEMS } from '../data/upgrades.ts';
import { WEAPONS } from '../data/weapons.ts';
import { nextRandom, randInt, randPick, seedRng } from './prng.ts';
import { allocId, hasUpgrade, rechargeGunboots } from './simUtils.ts';
import { generateStage } from './worldgen.ts';

export const EMPTY_INPUT: InputFrame = Object.freeze({
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
});

export interface CreateStateOptions {
  seed?: number;
  styleId?: StyleId;
  hardMode?: boolean;
  area?: AreaId;
  level?: number;
  mode?: GameMode;
}

export interface StartRunOptions {
  seed?: number;
  styleId?: StyleId;
  hardMode?: boolean;
  area?: AreaId;
  level?: number;
}

function createEmptyRunStats(): RunStats {
  return {
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
  };
}

function createFreshPlayer(styleId: StyleId): PlayerState {
  const style = getStyleDef(styleId);
  const startX = WELL_CONSTANTS.CAM_CENTER_X;
  const startY = 36;

  return {
    x: startX,
    y: startY,
    prevX: startX,
    prevY: startY,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    onThinPlatform: false,
    onWall: 0,
    inWater: false,
    wasInWater: false,
    hp: style.startHp,
    hpMax: style.startHp,
    heartPieces: 0,
    ammo: WELL_CONSTANTS.START_AMMO,
    ammoMax: WELL_CONSTANTS.START_AMMO,
    weaponId: WEAPON_IDS.MACHINEGUN,
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
    oxygen: WELL_CONSTANTS.OXYGEN_MAX,
    oxygenTick: 0,
    oxygenStunTicks: 0,
    suffocateTick: 0,
    jetpackTicks: WELL_CONSTANTS.JETPACK_MAX_TICKS,
    jetpackActive: false,
    corpseCount: 0,
    alive: true,
    animState: 'idle',
    animFrame: 0,
    animTimer: 0,
    muzzleFlashTicks: 0,
    meterJiggleTicks: 0,
    afterimages: [],
    drone: {
      active: false,
      x: startX + 14,
      y: startY - 6,
      orbitAngle: 0,
    },
    balloon: {
      active: false,
      x: startX,
      y: startY - 16,
      hp: 1,
    },
    timeoutVoid: {
      active: false,
      x: 0,
      y: 0,
      timer: 0,
      radius: WELL_CONSTANTS.TIMEOUT_VOID_RADIUS,
    },
  };
}

function populateSideRoomPickups(state: SimState, room: SideRoomState): void {
  const floorY = (room.maxRow + 1) * WELL_CONSTANTS.TILE_SIZE - 8;

  if (room.kind === 'gun_module') {
    const candidateWeapons: WeaponId[] = [];
    for (const w of WEAPONS) {
      if (w.id !== state.player.weaponId) {
        candidateWeapons.push(w.id);
      }
    }
    const weaponId = randPick(state, candidateWeapons.length > 0 ? candidateWeapons : [WEAPON_IDS.SHOTGUN]);
    let bonusType: 'ammo' | 'hp';
    if (state.area === 5) {
      bonusType = 'hp';
    } else if (state.player.hp <= 2) {
      bonusType = nextRandom(state) < 6 / 7 ? 'hp' : 'ammo';
    } else {
      bonusType = nextRandom(state) < 0.5 ? 'hp' : 'ammo';
    }

    const pickup: PickupEntity = {
      id: allocId(state),
      kind: 'gun_module',
      x: room.centerX,
      y: floorY,
      weaponId,
      bonusType,
      rerolled: false,
      sideRoomId: room.id,
      alive: true,
    };
    state.pickups.push(pickup);
    return;
  }

  if (room.kind === 'shop') {
    const pool = [...SHOP_ITEMS];
    const chosen: typeof pool = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = randInt(state, 0, pool.length - 1);
      chosen.push(pool.splice(idx, 1)[0]!);
    }

    const offsets = [-24, 0, 24];
    const isAscetic = state.styleId === 4;
    const hasMembers = hasUpgrade(state, 14);

    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i]!;
      const price = computeShopPrice(
        item.basePrice,
        state.area,
        state.hardMode,
        isAscetic,
        hasMembers,
      );
      state.pickups.push({
        id: allocId(state),
        kind: 'shop_item',
        x: room.centerX + (offsets[i] ?? 0),
        y: floorY,
        shopItemId: item.id,
        price,
        sideRoomId: room.id,
        alive: true,
      });
    }
  }
}

/**
 * Generates and loads a stage into an existing SimState, spawning its enemies,
 * populating side room pickups, placing the player at the shaft entry, and
 * framing the camera.
 */
export function buildStageIntoState(state: SimState, area: AreaId, level: number): void {
  state.area = area;
  state.level = level;

  state.enemies = [];
  state.bullets = [];
  state.enemyBullets = [];
  state.gemsEntities = [];
  state.casings = [];
  state.corpses = [];
  state.pickups = [];
  state.boss = null;
  state.inSideRoom = false;
  state.activeSideRoomId = null;
  state.shopPromptText = null;
  state.stageTransitionTicks = 0;

  // Reset per-stage run stats
  state.runStats.stageDamageTaken = 0;
  state.runStats.stageKills = 0;
  state.runStats.stageShotsFired = 0;
  state.runStats.stageGemsSpawned = 0;
  state.runStats.stageGemsCollected = 0;
  state.runStats.stageLandings = 0;
  state.runStats.stageSideRoomsVisited = 0;
  state.runStats.stageStartTick = state.tick;
  if (level === 1) {
    state.runStats.areaDamageTaken = 0;
    state.runStats.areaLandings = 0;
  }

  const { enemySpawns, sideRooms } = generateStage(state, area, level);

  // Materialize enemies from stage spawns
  for (const sp of enemySpawns) {
    const def = getEnemyDef(sp.kind);
    const enemy: EnemyEntity = {
      id: allocId(state),
      kind: sp.kind,
      x: sp.x,
      y: sp.y,
      prevX: sp.x,
      prevY: sp.y,
      vx: 0,
      vy: 0,
      w: def.width,
      h: def.height,
      hp: def.hp,
      maxHp: def.hp,
      gems: def.gems,
      stompable: def.stompable,
      facing: nextRandom(state) < 0.5 ? -1 : 1,
      state: 0,
      timer: randInt(state, 0, 60),
      hitFlashTicks: 0,
      wallDir: 1,
      anchorX: sp.x,
      anchorY: sp.y,
      alive: true,
    };
    state.enemies.push(enemy);
  }

  // Populate side room pickups
  for (const room of sideRooms) {
    populateSideRoomPickups(state, room);
  }

  // Position player cleanly inside open shaft top
  const p = state.player;
  p.x = WELL_CONSTANTS.CAM_CENTER_X;
  p.y = area === 0 ? 48 : 36;
  p.prevX = p.x;
  p.prevY = p.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.onThinPlatform = false;
  p.onWall = 0;
  p.inWater = false;
  p.wasInWater = false;
  p.oxygen = WELL_CONSTANTS.OXYGEN_MAX;
  p.oxygenTick = 0;
  p.oxygenStunTicks = 0;
  p.suffocateTick = 0;
  p.jumpShootLock = false;
  p.coyoteTicks = 0;
  p.jumpBufferTicks = 0;
  p.wallKickTicks = 0;
  p.wallKickDir = 0;
  p.spinJump = false;
  p.afterimages = [];
  rechargeGunboots(state);

  p.drone.x = p.x + 14;
  p.drone.y = p.y - 6;
  p.balloon.x = p.x;
  p.balloon.y = p.y - 16;

  // Frame camera on shaft entry
  const cam = state.camera;
  cam.x = WELL_CONSTANTS.CAM_CENTER_X;
  cam.y =
    area === 0
      ? p.y + WELL_CONSTANTS.CAM_DAOP_SURFACE
      : WELL_CONSTANTS.VIEW_H * 0.5;
  cam.prevX = cam.x;
  cam.prevY = cam.y;
  cam.targetX = cam.x;
  cam.targetY = cam.y;
  cam.shakeMag = 0;
  cam.shakeTicks = 0;
  cam.sideRoomLocked = false;
  cam.sideRoomX = cam.x;
  cam.sideRoomY = cam.y;
}

/**
 * Resets an existing SimState for a fresh run with deterministic PRNG seeding.
 */
export function startNewRun(state: SimState, opts?: StartRunOptions): void {
  const seed = (opts?.seed ?? state.seed ?? 1337) >>> 0;
  const styleId: StyleId = opts?.styleId ?? state.styleId ?? 0;
  const hardMode = opts?.hardMode ?? state.hardMode ?? false;
  const area: AreaId = opts?.area ?? 1;
  const level = opts?.level ?? 1;

  state.tick = 0;
  state.seed = seed;
  state.rngState = seedRng(seed);
  state.mode = area === 0 ? 'surface' : 'playing';
  state.area = area;
  state.level = level;
  state.hardMode = hardMode;
  state.styleId = styleId;

  state.player = createFreshPlayer(styleId);
  state.gems = 0;
  state.runGems = 0;
  state.gemStreak = 0;
  state.gemStreakTimer = 0;
  state.gemHigh = false;
  state.combo = 0;
  state.maxCombo = 0;
  state.comboPopup = null;
  state.upgrades = [];
  state.upgradeChoices = [];
  state.upgradeCursor = 0;
  state.impactSlowdownTicks = 0;
  state.hitStopTicks = 0;
  state.inSideRoom = false;
  state.activeSideRoomId = null;
  state.shopPromptText = null;
  state.runStats = createEmptyRunStats();
  state.unlockedTrophiesInRun = [];
  state.stageTransitionTicks = 0;
  state.victoryTimer = 0;
  state.nextEntityId = 1;
  state.events = [];

  buildStageIntoState(state, area, level);
}

/**
 * Creates a fresh, deterministic SimState ready for simulation.
 */
export function createInitialState(opts?: CreateStateOptions): SimState {
  const seed = (opts?.seed ?? 1337) >>> 0;
  const styleId: StyleId = opts?.styleId ?? 0;
  const hardMode = opts?.hardMode ?? false;
  const area: AreaId = opts?.area ?? 1;
  const level = opts?.level ?? 1;

  const state: SimState = {
    tick: 0,
    seed,
    rngState: seedRng(seed),
    mode: opts?.mode ?? (area === 0 ? 'surface' : 'playing'),
    area,
    level,
    hardMode,
    styleId,
    player: createFreshPlayer(styleId),
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
      x: WELL_CONSTANTS.CAM_CENTER_X,
      y: WELL_CONSTANTS.VIEW_H * 0.5,
      prevX: WELL_CONSTANTS.CAM_CENTER_X,
      prevY: WELL_CONSTANTS.VIEW_H * 0.5,
      targetX: WELL_CONSTANTS.CAM_CENTER_X,
      targetY: WELL_CONSTANTS.VIEW_H * 0.5,
      shakeMag: 0,
      shakeTicks: 0,
      sideRoomLocked: false,
      sideRoomX: WELL_CONSTANTS.CAM_CENTER_X,
      sideRoomY: WELL_CONSTANTS.VIEW_H * 0.5,
    },
    impactSlowdownTicks: 0,
    hitStopTicks: 0,
    world: {
      area,
      level,
      minCol: WELL_CONSTANTS.GRID_MIN_COL,
      maxCol: WELL_CONSTANTS.GRID_MAX_COL,
      cols: WELL_CONSTANTS.GRID_COLS,
      rows: 1,
      tiles: [],
      waterStartRow: -1,
      exitRow: 0,
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
    runStats: createEmptyRunStats(),
    unlockedTrophiesInRun: [],
    stageTransitionTicks: 0,
    victoryTimer: 0,
    nextEntityId: 1,
    events: [],
  };

  startNewRun(state, { seed, styleId, hardMode, area, level });
  if (opts?.mode !== undefined) {
    state.mode = opts.mode;
  }

  return state;
}
