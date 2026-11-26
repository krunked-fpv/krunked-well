import type { EnemyDef, EnemyKind } from '../contracts/index.ts';

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  // Area 1 — Cavern
  bat: { kind: 'bat', name: 'Bat', area: 1, hp: 15, gems: 12, stompable: true, width: 12, height: 10, behavior: 'fly_bat', spriteId: 'sprBat' },
  snake: { kind: 'snake', name: 'Snake', area: 1, hp: 5, gems: 6, stompable: true, width: 12, height: 10, behavior: 'patrol_floor', spriteId: 'sprSnake' },
  frog: { kind: 'frog', name: 'Frog', area: 1, hp: 35, gems: 20, stompable: true, width: 14, height: 12, behavior: 'hop_frog', spriteId: 'sprFrog' },
  snail: { kind: 'snail', name: 'Snail', area: 1, hp: 20, gems: 24, stompable: false, width: 12, height: 12, behavior: 'crawl_wall', spriteId: 'sprSnail' },
  ground_turtle: { kind: 'ground_turtle', name: 'Shell Turtle', area: 1, hp: 5, gems: 14, stompable: false, width: 14, height: 10, behavior: 'patrol_floor', spriteId: 'sprTurtle' },
  white_jelly: { kind: 'white_jelly', name: 'White Jelly', area: 1, hp: 25, gems: 6, stompable: true, width: 12, height: 12, behavior: 'float_jelly', spriteId: 'sprWhiteJelly' },
  red_ball: { kind: 'red_ball', name: 'Spike Orb', area: 1, hp: 30, gems: 20, stompable: false, width: 12, height: 12, behavior: 'hover_hazard', spriteId: 'sprRedBall' },
  crawler: { kind: 'crawler', name: 'Crawler', area: 1, hp: 3, gems: 6, stompable: true, width: 10, height: 10, behavior: 'crawl_wall', spriteId: 'sprCrawler' },

  // Area 2 — Catacomb
  skeleton: { kind: 'skeleton', name: 'Skeleton', area: 2, hp: 60, gems: 10, stompable: true, width: 12, height: 14, behavior: 'throw_skeleton', spriteId: 'sprSkeleton' },
  obake: { kind: 'obake', name: 'Obake Ghost', area: 2, hp: 70, gems: 20, stompable: false, width: 14, height: 14, behavior: 'phase_ghost', spriteId: 'sprObake' },
  gas_wander: { kind: 'gas_wander', name: 'Wisp', area: 2, hp: 10, gems: 8, stompable: true, width: 12, height: 12, behavior: 'gas_float', spriteId: 'sprGasWander' },
  gas_chaser: { kind: 'gas_chaser', name: 'Chaser Wisp', area: 2, hp: 10, gems: 10, stompable: false, width: 12, height: 12, behavior: 'phase_ghost', spriteId: 'sprGasChaser' },
  wander_skull: { kind: 'wander_skull', name: 'Red Skull', area: 2, hp: 50, gems: 20, stompable: false, width: 14, height: 14, behavior: 'hover_hazard', spriteId: 'sprWanderSkull' },
  jumpy_skull: { kind: 'jumpy_skull', name: 'Jumpy Skull', area: 2, hp: 10, gems: 4, stompable: true, width: 12, height: 12, behavior: 'hop_frog', spriteId: 'sprJumpySkull' },
  rat: { kind: 'rat', name: 'Crypt Rat', area: 2, hp: 15, gems: 6, stompable: true, width: 12, height: 10, behavior: 'patrol_floor', spriteId: 'sprRat' },
  spider: { kind: 'spider', name: 'Spider', area: 2, hp: 15, gems: 8, stompable: true, width: 12, height: 12, behavior: 'crawl_wall', spriteId: 'sprSpider' },
  firebat: { kind: 'firebat', name: 'Firebat', area: 2, hp: 20, gems: 14, stompable: false, width: 12, height: 10, behavior: 'fly_bat', hardOnly: true, spriteId: 'sprFirebat' },

  // Area 3 — Aquifer
  eyefish: { kind: 'eyefish', name: 'Eyefish', area: 3, hp: 15, gems: 6, stompable: true, width: 12, height: 10, behavior: 'swim_fish', spriteId: 'sprEyefish' },
  red_fish: { kind: 'red_fish', name: 'Crimson Fish', area: 3, hp: 50, gems: 4, stompable: false, width: 14, height: 12, behavior: 'swim_fish', spriteId: 'sprRedFish' },
  squid: { kind: 'squid', name: 'Ink Squid', area: 3, hp: 15, gems: 10, stompable: true, width: 12, height: 14, behavior: 'jet_squid', spriteId: 'sprSquid' },
  aquatic_turtle: { kind: 'aquatic_turtle', name: 'Reef Turtle', area: 3, hp: 50, gems: 4, stompable: false, width: 14, height: 12, behavior: 'swim_fish', spriteId: 'sprAquaTurtle' },
  red_jelly: { kind: 'red_jelly', name: 'Crimson Jelly', area: 3, hp: 25, gems: 6, stompable: false, width: 12, height: 12, behavior: 'float_jelly', spriteId: 'sprRedJelly' },
  jellofish: { kind: 'jellofish', name: 'Jellofish', area: 3, hp: 100, gems: 6, stompable: true, width: 16, height: 14, behavior: 'float_jelly', spriteId: 'sprJellofish' },
  mohawkmon: { kind: 'mohawkmon', name: 'Fin Stalker', area: 3, hp: 10, gems: 10, stompable: false, width: 12, height: 12, behavior: 'patrol_floor', spriteId: 'sprMohawkmon' },
  unichan: { kind: 'unichan', name: 'Sea Urchin', area: 3, hp: 10, gems: 8, stompable: false, width: 12, height: 12, behavior: 'hover_hazard', spriteId: 'sprUnichan' },
  tadpole: { kind: 'tadpole', name: 'Tadpole', area: 3, hp: 10, gems: 6, stompable: true, width: 10, height: 10, behavior: 'swim_fish', spriteId: 'sprTadpole' },

  // Area 4 — Limbo
  crawlbot: { kind: 'crawlbot', name: 'Crawlbot', area: 4, hp: 15, gems: 8, stompable: true, width: 12, height: 12, behavior: 'crawl_wall', spriteId: 'sprCrawlbot' },
  dodger: { kind: 'dodger', name: 'Dodger', area: 4, hp: 50, gems: 14, stompable: true, width: 12, height: 12, behavior: 'dodge_bot', spriteId: 'sprDodger' },
  leapon: { kind: 'leapon', name: 'Leapon', area: 4, hp: 15, gems: 10, stompable: true, width: 12, height: 12, behavior: 'hop_frog', spriteId: 'sprLeapon' },
  twinbot: { kind: 'twinbot', name: 'Twinbot', area: 4, hp: 10, gems: 12, stompable: true, width: 12, height: 12, behavior: 'fly_bat', spriteId: 'sprTwinbot' },
  poofer: { kind: 'poofer', name: 'Poofer', area: 4, hp: 60, gems: 18, stompable: false, width: 14, height: 14, behavior: 'ring_poofer', spriteId: 'sprPoofer' },
  spore_spawner: { kind: 'spore_spawner', name: 'Spore Node', area: 4, hp: 110, gems: 22, stompable: false, width: 16, height: 16, behavior: 'spawner', spriteId: 'sprSporeSpawner' },
  angry_face: { kind: 'angry_face', name: 'Void Mask', area: 4, hp: 30, gems: 14, stompable: false, width: 14, height: 14, behavior: 'hover_hazard', spriteId: 'sprAngryFace' },
  lunger: { kind: 'lunger', name: 'Lunger', area: 4, hp: 30, gems: 14, stompable: true, width: 12, height: 12, behavior: 'lunger', spriteId: 'sprLunger' },
  upshoot: { kind: 'upshoot', name: 'Upshoot', area: 4, hp: 30, gems: 14, stompable: false, width: 12, height: 12, behavior: 'ring_poofer', spriteId: 'sprUpshoot' },
  gas_ascend: { kind: 'gas_ascend', name: 'Rising Wisp', area: 4, hp: 10, gems: 8, stompable: true, width: 12, height: 12, behavior: 'gas_float', spriteId: 'sprGasAscend' },
  gas_descend: { kind: 'gas_descend', name: 'Sinking Wisp', area: 4, hp: 10, gems: 8, stompable: true, width: 12, height: 12, behavior: 'gas_float', spriteId: 'sprGasDescend' },
  gas_bounce: { kind: 'gas_bounce', name: 'Bounce Wisp', area: 4, hp: 10, gems: 8, stompable: false, width: 12, height: 12, behavior: 'gas_float', spriteId: 'sprGasBounce' },
  gas_spin: { kind: 'gas_spin', name: 'Orbit Wisp', area: 4, hp: 10, gems: 10, stompable: false, width: 12, height: 12, behavior: 'gas_float', spriteId: 'sprGasSpin' },
  guntle: { kind: 'guntle', name: 'Guntle', area: 4, hp: 150, gems: 30, stompable: false, width: 16, height: 14, behavior: 'turret_guntle', spriteId: 'sprGuntle' },
};

export const BIOME_ENEMY_POOLS: Record<1 | 2 | 3 | 4, { normal: readonly EnemyKind[]; hard: readonly EnemyKind[] }> = {
  1: {
    normal: ['bat', 'snake', 'frog', 'snail', 'ground_turtle', 'white_jelly', 'red_ball', 'crawler'],
    hard: ['bat', 'frog', 'snail', 'ground_turtle', 'red_ball', 'white_jelly', 'firebat', 'red_ball'],
  },
  2: {
    normal: ['skeleton', 'obake', 'gas_wander', 'gas_chaser', 'wander_skull', 'jumpy_skull', 'rat', 'spider'],
    hard: ['skeleton', 'obake', 'gas_chaser', 'wander_skull', 'firebat', 'spider', 'jumpy_skull', 'obake'],
  },
  3: {
    normal: ['eyefish', 'red_fish', 'squid', 'aquatic_turtle', 'red_jelly', 'jellofish', 'mohawkmon', 'unichan', 'tadpole'],
    hard: ['red_fish', 'squid', 'aquatic_turtle', 'red_jelly', 'jellofish', 'unichan', 'mohawkmon', 'red_fish'],
  },
  4: {
    normal: ['crawlbot', 'dodger', 'leapon', 'twinbot', 'poofer', 'spore_spawner', 'angry_face', 'lunger', 'upshoot', 'gas_ascend', 'gas_descend', 'gas_bounce', 'gas_spin', 'guntle'],
    hard: ['dodger', 'poofer', 'spore_spawner', 'angry_face', 'lunger', 'upshoot', 'gas_bounce', 'gas_spin', 'guntle'],
  },
};

export function getEnemyDef(kind: EnemyKind): EnemyDef {
  return ENEMY_DEFS[kind];
}
