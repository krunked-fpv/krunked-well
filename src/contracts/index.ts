// ============================================================================
// Krunked Well — Single Source of Truth Contracts (Locked Wave 0)
// ============================================================================

export const WELL_CONSTANTS = {
  BRAND_NAME: 'Krunked Well',
  SAVE_KEY: 'krunked_well_save_v1',
  SIM_HZ: 60,
  FIXED_DT: 1 / 60,

  // Viewport & Pixel Grid
  VIEW_W: 160,
  VIEW_H: 284,
  DEFAULT_SCALE: 2,
  TILE_SIZE: 16,
  SHAFT_COLS: 9,
  SHAFT_LEFT_WALL_COL: 0,
  SHAFT_RIGHT_WALL_COL: 10,
  SHAFT_INTERIOR_MIN_COL: 1,
  SHAFT_INTERIOR_MAX_COL: 9,
  GRID_MIN_COL: -8,
  GRID_MAX_COL: 18,
  GRID_COLS: 27, // cols -8 .. 18 inclusive
  THIN_PLATFORM_H: 2,

  // Player Sprite (24x24, origin 12,12) & Collision Box (bbox 8,8,15,19 => 8x12)
  PLAYER_SPRITE_SIZE: 24,
  PLAYER_ORIGIN_X: 12,
  PLAYER_ORIGIN_Y: 12,
  PLAYER_W: 8,
  PLAYER_H: 12,
  PLAYER_HALF_W: 4,
  PLAYER_TOP_OFFSET: -4,
  PLAYER_BOTTOM_OFFSET: 8,

  // Core Physics (60 Hz per-tick units)
  GRAV: 0.2,
  MAX_GRAV: 7.0,
  LIMBO_MAX_GRAV: 6.0,
  WATER_GRAV: 0.2 / 1.4,
  WATER_MAX_GRAV: 6.0,
  WATER_ENTRY_CLAMP: 0.5,
  LEVITATE_GRAV: 0.2 / 1.5,
  HEART_BALLOON_MAX_GRAV_DELTA: -1.0,

  MOVE_ACCEL: 0.2,
  GROUND_MAX_SP: 2.0,
  AIR_MAX_SP: 2.5,
  WATER_MAX_SP: 2.0,
  WATER_AIR_MAX_SP: 2.3,
  GROUND_REVERSE_SNAP: 2.0,
  AIR_REVERSE_SNAP: 1.0,
  GROUND_DECEL: 0.4,
  AIR_DECEL: 0.1,

  // Jumping & Wall-Kick
  JUMP_SP: 4.4,
  ROCKET_JUMP_SP: 5.0,
  LEVITATE_JUMP_MULT: 0.85,
  WATER_JUMP_SP: 3.8,
  WALL_KICK_SP: 4.0,
  WALL_KICK_LENGTH: 3,
  JUMP_BUFFER_TICKS: 5,
  COYOTE_TICKS: 4,
  JUMP_CUT_MULT: 0.5,
  CORNER_NUDGE_PX: 2,

  // Gunboots & Combat
  EMPTY_FIRE_CLAMP: 3.0,
  STOMP_BOUNCE_SP: 2.5,
  BOULDER_STOMP_BOUNCE_SP: 1.5,
  STOMP_DAMAGE: 100,
  START_AMMO: 8,
  START_HP: 4,
  START_HP_MAX: 4,
  BOULDER_START_HP: 6,
  HEART_PIECE_MAX: 4,

  // Damage, i-frames & Impact Slowdown
  HIT_INVI_TICKS: 90,
  CANDLE_INVI_TICKS: 240,
  FLICKER_AT: 45,
  FLICKER_DUR: 6,
  IMPACT_SLOWDOWN_FACTOR: 40 / 60,
  IMPACT_SLOWDOWN_TICKS: 23,
  BGM_DUCK_MS: 500,
  BGM_DUCK_GAIN: 0.7,
  AFTERIMAGE_COUNT: 8,

  // Underwater Oxygen (Aquifer)
  OXYGEN_MAX: 100,
  OXYGEN_TICK_NORMAL: 13,
  OXYGEN_TICK_HARD: 7,
  OXYGEN_GET_STUN: 7,
  OXYGEN_SUFFOCATE_INTERVAL: 90,

  // Combo & Gem High
  COMBO_TIER_1: 8,
  COMBO_TIER_2: 15,
  COMBO_TIER_3: 25,
  COMBO_GEM_REWARD: 100,
  GEM_HIGH_THRESHOLD: 100,
  GEM_STREAK_TIMER: 300,
  GEM_SICK_BONUS_TIMER: 180,
  GEM_HIGH_WARN_TICKS: 120,

  // Upgrade Specifics
  JETPACK_MAX_TICKS: 90,
  KNIFE_FORK_CORPSES_PER_HP: 10,
  TIMEOUT_VOID_TICKS: 240,
  TIMEOUT_VOID_RADIUS: 48,

  // Camera
  CAM_DAOP_WELL: 24,
  CAM_DAOP_SURFACE: -32,
  CAM_Y_SLOWDOWN: 5,
  CAM_X_AHEAD: 16,
  CAM_X_SLOWDOWN: 10,
  CAM_CENTER_X: 88, // 11 tiles * 16 / 2 => left edge at x=8 shows 8px wall + 144px shaft + 8px wall

  // Final Boss (Area 5 Abyss)
  BOSS_OUCH_AMT: 220,
  BOSS_PHASE_THRESHOLD: 880,
  BOSS_PHASES: 4,
  BOSS_TOTAL_HP: 3520,
  BOSS_EYE_W: 32,
  BOSS_EYE_H: 80,
  BOSS_TENTACLE_W: 176,
  BOSS_TENTACLE_H: 88,

  // Semantic 4-Channel Palette Keys
  KEY_LIGHT: [255, 255, 255] as readonly [number, number, number],
  KEY_MID: [255, 0, 0] as readonly [number, number, number],
  KEY_DARK: [0, 0, 0] as readonly [number, number, number],
  KEY_SPECIAL: [0, 126, 255] as readonly [number, number, number],
} as const;

export type AreaId = 0 | 1 | 2 | 3 | 4 | 5;

export const AREA_NAMES: Record<AreaId, string> = {
  0: 'SURFACE',
  1: 'CAVERN',
  2: 'CATACOMB',
  3: 'AQUIFER',
  4: 'LIMBO',
  5: 'ABYSS',
};

export type StyleId = 0 | 1 | 2 | 3 | 4;

export type WeaponId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEAPON_IDS = {
  MACHINEGUN: 0 as WeaponId,
  SHOTGUN: 1 as WeaponId,
  LASER: 2 as WeaponId,
  TRIPLE: 3 as WeaponId,
  PUNCHER: 4 as WeaponId,
  BURST: 5 as WeaponId,
  NOPPY: 6 as WeaponId,
} as const;

export type UpgradeId =
  | 0
  | 1
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 20
  | 22;

export const ALL_UPGRADE_IDS: readonly UpgradeId[] = [
  0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22,
] as const;

export type ShopItemId = 100 | 101 | 102 | 103 | 104 | 105;

export const ALL_SHOP_ITEM_IDS: readonly ShopItemId[] = [
  100, 101, 102, 103, 104, 105,
] as const;

export const TILE_KIND = {
  EMPTY: 0,
  SOLID: 1,
  BREAKABLE: 2,
  THIN_PLATFORM: 3,
  SPIKE_UP: 4,
  SPIKE_DOWN: 5,
  SPIKE_LEFT: 6,
  SPIKE_RIGHT: 7,
  BUBBLE_BLOCK: 8,
  GHOST_WALL: 9,
  SHOP_FLOOR: 10,
  STAGE_EXIT: 11,
  SPIKE_TRAP: 12,
} as const;

export type TileKind = (typeof TILE_KIND)[keyof typeof TILE_KIND];

export type EnemyKind =
  // Area 1 — Cavern
  | 'bat'
  | 'snake'
  | 'frog'
  | 'snail'
  | 'ground_turtle'
  | 'white_jelly'
  | 'red_ball'
  | 'crawler'
  // Area 2 — Catacomb
  | 'skeleton'
  | 'obake'
  | 'gas_wander'
  | 'gas_chaser'
  | 'wander_skull'
  | 'jumpy_skull'
  | 'rat'
  | 'spider'
  | 'firebat'
  // Area 3 — Aquifer
  | 'eyefish'
  | 'red_fish'
  | 'squid'
  | 'aquatic_turtle'
  | 'red_jelly'
  | 'jellofish'
  | 'mohawkmon'
  | 'unichan'
  | 'tadpole'
  // Area 4 — Limbo
  | 'crawlbot'
  | 'dodger'
  | 'leapon'
  | 'twinbot'
  | 'poofer'
  | 'spore_spawner'
  | 'angry_face'
  | 'lunger'
  | 'upshoot'
  | 'gas_ascend'
  | 'gas_descend'
  | 'gas_bounce'
  | 'gas_spin'
  | 'guntle';

export type GameMode =
  | 'title'
  | 'surface'
  | 'playing'
  | 'paused'
  | 'upgrade_select'
  | 'gameover'
  | 'victory';

export type InputSource = 'keyboard' | 'gamepad' | 'touch';

export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  actionPressed: boolean;
  actionReleased: boolean;
  pausePressed: boolean;
  cancelPressed: boolean;
  retryPressed: boolean;
  inputSource: InputSource;
}

export interface WeaponLevelStats {
  /** Positive = auto-fire ticks; Negative = semi-auto tap-required with abs(rof) cooldown */
  rof: number;
  recoil: number;
  damage: number;
  /** 0 indicates instant hitscan laser */
  speed: number;
  spreadDeg: number;
  pelletCount: number;
  rangePx: number;
  /** 0 = single/pellet, 1 = 3-way fan +/-14deg, 2 = 3 parallel columns, 3 = burst, 4 = hitscan laser, 5 = tilted noppy */
  spType: 0 | 1 | 2 | 3 | 4 | 5;
  parallelOffsetPx?: number;
  burstRate?: number;
  burstAmount?: number;
  tiltDeg?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shortName: string;
  cost: number;
  normal: WeaponLevelStats;
  gemHigh: WeaponLevelStats;
  spriteId: string;
  sfxId: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  iconSpriteId: string;
}

export interface ShopItemDef {
  id: ShopItemId;
  name: string;
  description: string;
  basePrice: number;
  hpGain: number;
  maxHpGain: number;
  ammoMaxGain: number;
  spriteId: string;
}

export interface StyleDef {
  id: StyleId;
  name: string;
  description: string;
  startHp: number;
  upgradeChoices: number;
  stompBounce: number;
  gravMultiplier: number;
  jumpMultiplier: number;
  shopDiscount: number;
  gunModulesOnlyInSiderooms: boolean;
  spritePrefix: string;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  area: 1 | 2 | 3 | 4;
  hp: number;
  gems: number;
  stompable: boolean;
  width: number;
  height: number;
  behavior:
    | 'fly_bat'
    | 'patrol_floor'
    | 'hop_frog'
    | 'crawl_wall'
    | 'float_jelly'
    | 'hover_hazard'
    | 'throw_skeleton'
    | 'phase_ghost'
    | 'gas_float'
    | 'swim_fish'
    | 'jet_squid'
    | 'dodge_bot'
    | 'ring_poofer'
    | 'spawner'
    | 'lunger'
    | 'turret_guntle';
  hardOnly?: boolean;
  spriteId: string;
}

export type RgbTuple = readonly [number, number, number];

export interface PaletteDef {
  id: number;
  name: string;
  light: RgbTuple;
  mid: RgbTuple;
  dark: RgbTuple;
  special: RgbTuple;
}

export interface TrophyDef {
  id: string;
  name: string;
  description: string;
}

export interface UnlockMilestoneDef {
  gems: number;
  kind: 'style' | 'palette';
  targetId: number;
  label: string;
}

export type PlayerAnimState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'spin_jump'
  | 'fall'
  | 'shoot'
  | 'hurt'
  | 'dead'
  | 'swim'
  | 'jetpack';

export interface AfterimageSnapshot {
  x: number;
  y: number;
  facing: -1 | 1;
  animState: PlayerAnimState;
  alpha: number;
}

export interface DroneState {
  active: boolean;
  x: number;
  y: number;
  orbitAngle: number;
}

export interface HeartBalloonState {
  active: boolean;
  x: number;
  y: number;
  hp: number;
}

export interface TimeoutVoidState {
  active: boolean;
  x: number;
  y: number;
  timer: number;
  radius: number;
}

export interface PlayerState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  onGround: boolean;
  onThinPlatform: boolean;
  onWall: -1 | 0 | 1;
  inWater: boolean;
  wasInWater: boolean;
  hp: number;
  hpMax: number;
  heartPieces: number;
  ammo: number;
  ammoMax: number;
  weaponId: WeaponId;
  gunLevel: 0 | 1;
  fireCooldown: number;
  semiAutoLatch: boolean;
  burstRemaining: number;
  burstTimer: number;
  bootSide: -1 | 1;
  jumpShootLock: boolean;
  coyoteTicks: number;
  jumpBufferTicks: number;
  wallKickTicks: number;
  wallKickDir: -1 | 0 | 1;
  spinJump: boolean;
  invulnTicks: number;
  oxygen: number;
  oxygenTick: number;
  oxygenStunTicks: number;
  suffocateTick: number;
  jetpackTicks: number;
  jetpackActive: boolean;
  corpseCount: number;
  alive: boolean;
  animState: PlayerAnimState;
  animFrame: number;
  animTimer: number;
  muzzleFlashTicks: number;
  meterJiggleTicks: number;
  afterimages: AfterimageSnapshot[];
  drone: DroneState;
  balloon: HeartBalloonState;
  timeoutVoid: TimeoutVoidState;
}

export type SideRoomKind = 'shop' | 'gun_module' | 'gem_cache' | 'secret';

export interface SideRoomState {
  id: number;
  side: 'left' | 'right';
  doorRow: number;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  centerX: number;
  centerY: number;
  kind: SideRoomKind;
  visited: boolean;
}

export interface AirPocket {
  id: number;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  respawnTicks: number;
}

export interface WorldState {
  area: AreaId;
  level: number;
  minCol: number;
  maxCol: number;
  cols: number;
  rows: number;
  tiles: TileKind[];
  waterStartRow: number;
  exitRow: number;
  sideRooms: SideRoomState[];
  airPockets: AirPocket[];
  spikeTrapTimer: number;
  spikeTrapExtended: boolean;
}

export interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  gems: number;
  stompable: boolean;
  facing: -1 | 1;
  state: number;
  timer: number;
  hitFlashTicks: number;
  wallDir: number;
  anchorX: number;
  anchorY: number;
  alive: boolean;
}

export interface BulletEntity {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  remainingRange: number;
  piercing: boolean;
  isLaser: boolean;
  laserEndY: number;
  weaponId: WeaponId;
  fromDrone: boolean;
  alive: boolean;
}

export interface EnemyBulletEntity {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  ttl: number;
  kind: 'bone' | 'ink' | 'spore' | 'orb' | 'boss_orb';
  alive: boolean;
}

export interface GemEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  ttl: number;
  alive: boolean;
}

export interface CasingEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hot: boolean;
  ttl: number;
  alive: boolean;
}

export interface CorpseEntity {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  ttl: number;
  alive: boolean;
}

export interface PickupEntity {
  id: number;
  kind: 'gun_module' | 'shop_item' | 'air_bubble' | 'heart_drop';
  x: number;
  y: number;
  weaponId?: WeaponId;
  bonusType?: 'ammo' | 'hp';
  rerolled?: boolean;
  shopItemId?: ShopItemId;
  price?: number;
  sideRoomId?: number;
  alive: boolean;
}

export interface BossState {
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetY: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3 | 4;
  /** 0=EYE_OPEN, 1=PHASE_TRANSITION, 2=EYE_CLOSED_STUN, 3=DEFEATED_EXPLODING */
  state: 0 | 1 | 2 | 3;
  stateTimer: number;
  ouchAccum: number;
  phaseAccum: number;
  bulletImmune: boolean;
  tentacleAngle: number;
  tentacleSweepDir: -1 | 1;
  attackTimer: number;
  summonTimer: number;
  laserCharge: number;
  laserActiveTicks: number;
  laserX: number;
  hitFlashTicks: number;
  defeated: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  shakeMag: number;
  shakeTicks: number;
  sideRoomLocked: boolean;
  sideRoomX: number;
  sideRoomY: number;
}

export interface ComboPopup {
  count: number;
  rewardText: string;
  timer: number;
}

export interface RunStats {
  kills: number;
  stomps: number;
  shotsFired: number;
  blocksBroken: number;
  damageTaken: number;
  stageDamageTaken: number;
  areaDamageTaken: number;
  stageKills: number;
  stageShotsFired: number;
  stageGemsSpawned: number;
  stageGemsCollected: number;
  stageLandings: number;
  areaLandings: number;
  stageSideRoomsVisited: number;
  stageStartTick: number;
  elapsedTicks: number;
  shopsVisited: number;
  modulesCollected: number;
  upgradesTaken: number;
  combo100Hit: boolean;
  bossDefeated: boolean;
  noUpgradeRun: boolean;
  maxDepthMeters: number;
}

export type SimEvent =
  | { type: 'shoot'; weaponId: WeaponId; x: number; y: number; gemHigh: boolean }
  | { type: 'empty_click'; x: number; y: number }
  | { type: 'jump'; x: number; y: number; rocket: boolean; water: boolean }
  | { type: 'wall_kick'; x: number; y: number; dir: -1 | 1 }
  | { type: 'land'; x: number; y: number; combo: number }
  | { type: 'stomp'; x: number; y: number; combo: number; enemyKind: EnemyKind }
  | { type: 'enemy_hit'; x: number; y: number; enemyKind: EnemyKind }
  | { type: 'enemy_kill'; x: number; y: number; enemyKind: EnemyKind; stomped: boolean }
  | { type: 'block_break'; x: number; y: number; tileKind: TileKind }
  | { type: 'gem_pickup'; x: number; y: number; value: number; streak: number }
  | { type: 'gem_high_start'; x: number; y: number }
  | { type: 'gem_high_end' }
  | { type: 'combo_done'; count: number; rewardTier: 0 | 1 | 2 | 3; x: number; y: number }
  | { type: 'player_hurt'; x: number; y: number; hpRemaining: number }
  | { type: 'player_die'; x: number; y: number }
  | { type: 'splash'; x: number; y: number; entering: boolean }
  | { type: 'oxygen_restore'; x: number; y: number; oxygen: number }
  | { type: 'oxygen_warn'; oxygen: number }
  | { type: 'pickup_gun'; x: number; y: number; weaponId: WeaponId; bonusType: 'ammo' | 'hp' }
  | { type: 'pickup_shop'; x: number; y: number; itemId: ShopItemId; price: number }
  | { type: 'shop_deny'; x: number; y: number }
  | { type: 'upgrade_pick'; upgradeId: UpgradeId }
  | { type: 'stage_clear'; area: AreaId; level: number }
  | { type: 'side_room_enter'; kind: SideRoomKind }
  | { type: 'side_room_exit' }
  | { type: 'boss_hit'; x: number; y: number; phase: number }
  | { type: 'boss_stun'; x: number; y: number; phase: number }
  | { type: 'boss_phase'; phase: number }
  | { type: 'boss_laser'; x: number; y: number }
  | { type: 'boss_defeat'; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'floating_text'; x: number; y: number; text: string; channel: 'L' | 'M' | 'S' }
  | { type: 'trophy_unlock'; trophyId: string; name: string }
  | { type: 'jetpack_tick'; x: number; y: number }
  | { type: 'corpse_eat'; x: number; y: number; healed: boolean };

export interface SimState {
  tick: number;
  seed: number;
  rngState: number;
  mode: GameMode;
  area: AreaId;
  level: number;
  hardMode: boolean;
  styleId: StyleId;
  player: PlayerState;
  gems: number;
  runGems: number;
  gemStreak: number;
  gemStreakTimer: number;
  gemHigh: boolean;
  combo: number;
  maxCombo: number;
  comboPopup: ComboPopup | null;
  upgrades: UpgradeId[];
  upgradeChoices: UpgradeId[];
  upgradeCursor: number;
  camera: CameraState;
  impactSlowdownTicks: number;
  hitStopTicks: number;
  world: WorldState;
  enemies: EnemyEntity[];
  bullets: BulletEntity[];
  enemyBullets: EnemyBulletEntity[];
  gemsEntities: GemEntity[];
  casings: CasingEntity[];
  corpses: CorpseEntity[];
  pickups: PickupEntity[];
  boss: BossState | null;
  inSideRoom: boolean;
  activeSideRoomId: number | null;
  shopPromptText: string | null;
  runStats: RunStats;
  unlockedTrophiesInRun: string[];
  stageTransitionTicks: number;
  victoryTimer: number;
  nextEntityId: number;
  events: SimEvent[];
}

export interface KeybindMap {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  action: string[];
  pause: string[];
  cancel: string[];
  retry: string[];
}

export type FpsCap = 30 | 60 | 120;
export type DisplayScaleMode = 'fit' | 'integer';
export type TateMode = 0 | 90 | 270;
export type TouchControlMode = 'auto' | 'off';
export type TouchButtonSize = 'compact' | 'standard' | 'large';
export type ArtPackMode = 'builtin' | 'custom';

export interface RenderSettings {
  fpsCap: FpsCap;
  pixelSnap60: boolean;
  displayScale: DisplayScaleMode;
  tateMode: TateMode;
  sfxVolume: number;
  bgmVolume: number;
  screenshake: boolean;
  rumble: boolean;
  touchMode: TouchControlMode;
  touchOpacity: number;
  touchSize: TouchButtonSize;
  artPack: ArtPackMode;
  keybinds: KeybindMap;
}

export interface SaveData {
  version: 1;
  totalGems: number;
  highScore: number;
  bestDepth: number;
  runsPlayed: number;
  victories: number;
  fastestVictoryTicks: number | null;
  hardModeUnlocked: boolean;
  hardModeEnabled: boolean;
  unlockedStyles: StyleId[];
  unlockedPalettes: number[];
  unlockedTrophies: string[];
  selectedStyle: StyleId;
  selectedPalette: number;
  settings: RenderSettings;
}

export interface SpriteRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  frames: number;
  frameStrideX: number;
}

export interface AssetManifest {
  packName: string;
  version: number;
  sourceType: ArtPackMode;
  atlasImageUrl?: string;
  sprites: Record<string, SpriteRect>;
  audio: Record<string, string>;
  paletteCount: number;
}

export interface InputDebugSnapshot {
  touchActive: boolean;
  lastSource: InputSource;
  gamepadConnected: boolean;
  gamepadName: string | null;
  frame: InputFrame;
}

export interface AudioDebugSnapshot {
  unlocked: boolean;
  muted: boolean;
  currentTrack: string | null;
  activeVoices: number;
  usingCustomAudio: boolean;
}

export interface PackDebugSnapshot {
  activePack: ArtPackMode;
  customPackAvailable: boolean;
  customPackSource: 'none' | 'dev-middleware' | 'indexeddb';
  spriteCount: number;
}

export interface DebugBridge {
  getState: () => SimState;
  getHash: () => string;
  getInputState: () => InputDebugSnapshot;
  getAudioState: () => AudioDebugSnapshot;
  getPackState: () => PackDebugSnapshot;
  getPaletteId: () => number;
  getSaveData: () => SaveData;
  startRun: (opts?: { seed?: number; styleId?: StyleId; hardMode?: boolean; area?: AreaId; level?: number }) => void;
  warpTo: (area: AreaId, level?: number) => void;
  setWeapon: (weaponId: WeaponId, gemHigh?: boolean) => void;
  grantUpgrade: (upgradeId: UpgradeId) => void;
  setHp: (hp: number, hpMax?: number) => void;
  setGems: (gems: number, streak?: number) => void;
  setPalette: (paletteIndex: number) => void;
  setStyle: (styleId: StyleId) => void;
  setHardMode: (enabled: boolean) => void;
  setArtPack: (mode: ArtPackMode) => Promise<boolean>;
  damageBoss: (amount: number) => void;
  spawnEnemy: (kind: EnemyKind, dx?: number, dy?: number) => void;
  triggerTouch: (active: boolean) => void;
  openUpgradeSelect: () => void;
  stepTicks: (count: number, input?: Partial<InputFrame>) => void;
}

declare global {
  interface Window {
    __KRUNKED_DEBUG__?: DebugBridge;
  }
}
