import { describe, expect, it } from 'vitest';
import { generateProceduralWellAtlas } from '../src/assets/ProceduralWellAtlas.ts';
import {
  BGM_TRACK_IDS,
  SFX_IDS,
  getBgmForState,
  getWeaponShotSfxId,
  isBgmTrackId,
  isSfxId,
} from '../src/audio/soundManifest.ts';
import {
  ALL_SHOP_ITEM_IDS,
  ALL_UPGRADE_IDS,
  AREA_NAMES,
  WELL_CONSTANTS,
  WEAPON_IDS,
  type AreaId,
  type StyleId,
  type UpgradeId,
  type WeaponId,
} from '../src/contracts/index.ts';
import { BIOME_ENEMY_POOLS, ENEMY_DEFS, getEnemyDef } from '../src/data/enemies.ts';
import { PALETTES, getPalette, rgbToHex } from '../src/data/palettes.ts';
import { STYLES, getStyleDef } from '../src/data/styles.ts';
import { TROPHIES, UNLOCK_MILESTONES } from '../src/data/trophies.ts';
import {
  SHOP_ITEMS,
  UPGRADES,
  computeShopPrice,
  getShopItemDef,
  getUpgradeDef,
} from '../src/data/upgrades.ts';
import { WEAPONS, getWeaponDef } from '../src/data/weapons.ts';

// Constructed strictly via array-joins to uphold clean-room branding invariants
const FORBIDDEN_BRAND_TERMS: readonly string[] = [
  ['down', 'well'].join(''),
  ['mop', 'pin'].join(''),
  ['de', 'volver'].join(''),
  ['oji', 'ro', ' ', 'fu', 'moto'].join(''),
  ['fu', 'moto'].join(''),
];

describe('WELL_CONSTANTS & Engine Oracle Invariants', () => {
  it('locks core engine geometry, timing, physics, combo, Gem High, and boss constants', () => {
    expect(WELL_CONSTANTS.BRAND_NAME).toBe('Krunked Well');
    expect(WELL_CONSTANTS.SAVE_KEY).toBe('krunked_well_save_v1');

    expect(WELL_CONSTANTS.SIM_HZ).toBe(60);
    expect(WELL_CONSTANTS.FIXED_DT).toBeCloseTo(1 / 60, 8);
    expect(WELL_CONSTANTS.VIEW_W).toBe(160);
    expect(WELL_CONSTANTS.VIEW_H).toBe(284);
    expect(WELL_CONSTANTS.TILE_SIZE).toBe(16);
    expect(WELL_CONSTANTS.THIN_PLATFORM_H).toBe(2);
    expect(WELL_CONSTANTS.PLAYER_W).toBe(8);
    expect(WELL_CONSTANTS.PLAYER_H).toBe(12);

    expect(WELL_CONSTANTS.GRAV).toBe(0.2);
    expect(WELL_CONSTANTS.MAX_GRAV).toBe(7.0);
    expect(WELL_CONSTANTS.AIR_MAX_SP).toBe(2.5);
    expect(WELL_CONSTANTS.GROUND_MAX_SP).toBe(2.0);
    expect(WELL_CONSTANTS.AIR_MAX_SP).toBeGreaterThan(WELL_CONSTANTS.GROUND_MAX_SP);

    expect(WELL_CONSTANTS.COMBO_TIER_1).toBe(8);
    expect(WELL_CONSTANTS.COMBO_TIER_2).toBe(15);
    expect(WELL_CONSTANTS.COMBO_TIER_3).toBe(25);
    expect(WELL_CONSTANTS.COMBO_GEM_REWARD).toBe(100);

    expect(WELL_CONSTANTS.GEM_HIGH_THRESHOLD).toBe(100);
    expect(WELL_CONSTANTS.GEM_STREAK_TIMER).toBe(300);

    expect(WELL_CONSTANTS.BOSS_OUCH_AMT).toBe(220);
    expect(WELL_CONSTANTS.BOSS_PHASE_THRESHOLD).toBe(880);
    expect(WELL_CONSTANTS.BOSS_PHASES).toBe(4);
    expect(WELL_CONSTANTS.BOSS_TOTAL_HP).toBe(3520);
    expect(WELL_CONSTANTS.BOSS_PHASE_THRESHOLD * WELL_CONSTANTS.BOSS_PHASES).toBe(
      WELL_CONSTANTS.BOSS_TOTAL_HP,
    );
    expect(WELL_CONSTANTS.BOSS_EYE_W).toBe(32);
    expect(WELL_CONSTANTS.BOSS_EYE_H).toBe(80);
    expect(WELL_CONSTANTS.BOSS_TENTACLE_W).toBe(176);
    expect(WELL_CONSTANTS.BOSS_TENTACLE_H).toBe(88);

    expect(Object.keys(AREA_NAMES)).toHaveLength(6);
  });
});

describe('WEAPONS Declarative Matrix', () => {
  it('defines all 7 weapons with exact Normal and Gem High stats and valid sprites/SFX', () => {
    expect(WEAPONS).toHaveLength(7);
    expect(Object.values(WEAPON_IDS)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const expected: Array<{
      id: WeaponId;
      name: string;
      cost: number;
      nDmg: number;
      nRof: number;
      nRec: number;
      nSpd: number;
      ghDmg: number;
      ghRof: number;
      ghRec: number;
      ghSpd: number;
    }> = [
      { id: 0, name: 'MACHINEGUN', cost: 1, nDmg: 9, nRof: 7, nRec: 0, nSpd: 8, ghDmg: 15, ghRof: 6, ghRec: 0, ghSpd: 8 },
      { id: 1, name: 'SHOTGUN', cost: 5, nDmg: 6, nRof: -20, nRec: -1.4, nSpd: 15, ghDmg: 6, ghRof: -15, ghRec: -2.0, ghSpd: 18 },
      { id: 2, name: 'LASER', cost: 4, nDmg: 25, nRof: -5, nRec: -1.0, nSpd: 0, ghDmg: 35, ghRof: -12, ghRec: -1.5, ghSpd: 0 },
      { id: 3, name: 'TRIPLE', cost: 2, nDmg: 5, nRof: 8, nRec: -0.3, nSpd: 6, ghDmg: 8, ghRof: 7, ghRec: -0.4, ghSpd: 6 },
      { id: 4, name: 'PUNCHER', cost: 2, nDmg: 7, nRof: 11, nRec: -0.5, nSpd: 7, ghDmg: 9, ghRof: 10, ghRec: -0.5, ghSpd: 7 },
      { id: 5, name: 'BURST', cost: 3, nDmg: 7, nRof: -13, nRec: 0, nSpd: 8, ghDmg: 14, ghRof: -10, ghRec: 0, ghSpd: 8 },
      { id: 6, name: 'NOPPY', cost: 1, nDmg: 8, nRof: 5, nRec: 0, nSpd: 8, ghDmg: 12, ghRof: 5, ghRec: 0, ghSpd: 9 },
    ];

    for (const row of expected) {
      const def = getWeaponDef(row.id);
      expect(def.id).toBe(row.id);
      expect(def.name).toBe(row.name);
      expect(def.cost).toBe(row.cost);
      expect(def.normal.damage).toBe(row.nDmg);
      expect(def.normal.rof).toBe(row.nRof);
      expect(def.normal.recoil).toBe(row.nRec);
      expect(def.normal.speed).toBe(row.nSpd);
      expect(def.gemHigh.damage).toBe(row.ghDmg);
      expect(def.gemHigh.rof).toBe(row.ghRof);
      expect(def.gemHigh.recoil).toBe(row.ghRec);
      expect(def.gemHigh.speed).toBe(row.ghSpd);
      expect(def.spriteId).toMatch(/^sprGun[A-Z]/);
      expect(isSfxId(def.sfxId)).toBe(true);
      expect(getWeaponShotSfxId(def.id, false)).toBe(def.sfxId);
      expect(isSfxId(getWeaponShotSfxId(def.id, true))).toBe(true);
    }
  });
});

describe('UPGRADES & SHOP_ITEMS Tables', () => {
  it('defines 20 unique upgrades matching ALL_UPGRADE_IDS', () => {
    expect(UPGRADES).toHaveLength(20);
    expect(UPGRADES.map((u) => u.id)).toEqual([...ALL_UPGRADE_IDS]);
    expect(new Set(UPGRADES.map((u) => u.name)).size).toBe(20);
    for (const u of UPGRADES) {
      expect(u.iconSpriteId).toBe(`sprUg${u.id}`);
      expect(u.description.length).toBeGreaterThan(0);
      expect(getUpgradeDef(u.id).id).toBe(u.id);
    }
    expect(getUpgradeDef(999 as UpgradeId).id).toBe(UPGRADES[0]!.id);
  });

  it('defines 6 unique shop items matching ALL_SHOP_ITEM_IDS and scales prices correctly', () => {
    expect(SHOP_ITEMS).toHaveLength(6);
    expect(SHOP_ITEMS.map((s) => s.id)).toEqual([...ALL_SHOP_ITEM_IDS]);
    expect(new Set(SHOP_ITEMS.map((s) => s.name)).size).toBe(6);
    for (const s of SHOP_ITEMS) {
      expect(s.spriteId).toBe(`sprShop${s.id}`);
      expect(s.basePrice).toBeGreaterThanOrEqual(200);
      expect(getShopItemDef(s.id).id).toBe(s.id);
    }
    // Area scaling (+200 per area), Hard Mode (2x), Ascetic (0.7x), Member's Card (0.9x)
    expect(computeShopPrice(200, 1, false, false, false)).toBe(200);
    expect(computeShopPrice(200, 3, false, false, false)).toBe(600);
    expect(computeShopPrice(200, 2, true, false, false)).toBe(800);
    expect(computeShopPrice(200, 1, false, true, false)).toBe(140);
    expect(computeShopPrice(200, 1, false, false, true)).toBe(180);
  });
});

describe('STYLES & ENEMY_DEFS Tables', () => {
  it('defines all 5 play styles with exact gameplay modifiers', () => {
    expect(STYLES).toHaveLength(5);
    expect(STYLES.map((s) => s.id)).toEqual([0, 1, 2, 3, 4]);
    expect(getStyleDef(0).startHp).toBe(4);
    expect(getStyleDef(1).gunModulesOnlyInSiderooms).toBe(true);
    expect(getStyleDef(2).startHp).toBe(6);
    expect(getStyleDef(2).upgradeChoices).toBe(2);
    expect(getStyleDef(3).gravMultiplier).toBeLessThan(1);
    expect(getStyleDef(4).upgradeChoices).toBe(0);
    expect(getStyleDef(4).shopDiscount).toBeCloseTo(0.3, 6);
    for (const s of STYLES) {
      expect(s.spritePrefix).toBe(`style${s.id}`);
    }
    expect(getStyleDef(99 as StyleId).id).toBe(0);
  });

  it('defines 40 enemies across Areas 1..4 with complete biome pools', () => {
    const allEnemies = Object.values(ENEMY_DEFS);
    expect(allEnemies).toHaveLength(40);
    expect(new Set(allEnemies.map((e) => e.spriteId)).size).toBe(40);

    const byArea = new Map<number, number>();
    for (const e of allEnemies) {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.gems).toBeGreaterThan(0);
      expect(e.width).toBeGreaterThan(0);
      expect(e.height).toBeGreaterThan(0);
      expect(e.spriteId).toMatch(/^spr[A-Z]/);
      expect(getEnemyDef(e.kind)).toBe(e);
      byArea.set(e.area, (byArea.get(e.area) ?? 0) + 1);
    }
    expect(byArea.get(1)).toBe(8);
    expect(byArea.get(2)).toBe(9);
    expect(byArea.get(3)).toBe(9);
    expect(byArea.get(4)).toBe(14);

    for (const area of [1, 2, 3, 4] as const) {
      expect(BIOME_ENEMY_POOLS[area].normal.length).toBeGreaterThan(0);
      expect(BIOME_ENEMY_POOLS[area].hard.length).toBeGreaterThan(0);
      for (const kind of [...BIOME_ENEMY_POOLS[area].normal, ...BIOME_ENEMY_POOLS[area].hard]) {
        expect(ENEMY_DEFS[kind]).toBeDefined();
      }
    }
  });
});

describe('PALETTES, TROPHIES & UNLOCK_MILESTONES Tables', () => {
  it('defines all 38 4-channel palettes with Palette #0 branded KRUNKED', () => {
    expect(PALETTES).toHaveLength(38);
    expect(PALETTES[0]?.name).toBe('KRUNKED');
    expect(PALETTES[0]?.light).toEqual([250, 250, 250]);
    expect(PALETTES[0]?.mid).toEqual([250, 0, 0]);
    expect(PALETTES[0]?.dark).toEqual([5, 5, 5]);
    expect(PALETTES[0]?.special).toEqual([0, 126, 250]);

    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(38);
    for (let i = 0; i < PALETTES.length; i++) {
      const p = PALETTES[i]!;
      expect(p.id).toBe(i);
      for (const ch of [p.light, p.mid, p.dark, p.special]) {
        expect(ch).toHaveLength(3);
        for (const v of ch) {
          expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true);
        }
      }
    }
    expect(getPalette(-1).id).toBe(37);
    expect(getPalette(38).id).toBe(0);
    expect(rgbToHex([250, 0, 126])).toBe('#fa007e');
  });

  it('defines 23 trophies with Trophy #0 named KRUNKED MASTER and 41 milestones 1000..500000', () => {
    expect(TROPHIES).toHaveLength(23);
    expect(TROPHIES[0]?.id).toBe('trophy_0');
    expect(TROPHIES[0]?.name).toBe('KRUNKED MASTER');
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(23);
    expect(new Set(TROPHIES.map((t) => t.name)).size).toBe(23);

    expect(UNLOCK_MILESTONES).toHaveLength(41);
    expect(UNLOCK_MILESTONES[0]?.gems).toBe(1000);
    expect(UNLOCK_MILESTONES[UNLOCK_MILESTONES.length - 1]?.gems).toBe(500000);

    const unlockedStyles = new Set<number>();
    const unlockedPalettes = new Set<number>();
    for (let i = 0; i < UNLOCK_MILESTONES.length; i++) {
      const m = UNLOCK_MILESTONES[i]!;
      if (i > 0) {
        expect(m.gems).toBeGreaterThan(UNLOCK_MILESTONES[i - 1]!.gems);
      }
      if (m.kind === 'style') {
        unlockedStyles.add(m.targetId);
        expect(STYLES[m.targetId]?.name).toBe(m.label);
      } else {
        unlockedPalettes.add(m.targetId);
        expect(PALETTES[m.targetId]?.name).toBe(m.label);
      }
    }
    expect([...unlockedStyles].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(unlockedPalettes.size).toBe(37);
    for (let id = 1; id <= 37; id++) {
      expect(unlockedPalettes.has(id)).toBe(true);
    }
  });
});

describe('BGM_TRACK_IDS, SFX_IDS & Built-In Procedural Atlas Parity', () => {
  it('registers all 10 BGM tracks, 45 unique SFX IDs, and routes every BGM slot', () => {
    expect(BGM_TRACK_IDS).toEqual([
      'bgmOverworld',
      'bgmArea1',
      'bgmArea2',
      'bgmArea3',
      'bgmLimbo',
      'bgmBoss',
      'bgmCredits',
      'bgmShopCave',
      'bgmShopAqua',
      'bgmSecret',
    ]);
    for (const id of BGM_TRACK_IDS) {
      expect(isBgmTrackId(id)).toBe(true);
    }
    expect(isBgmTrackId('bgmInvalid')).toBe(false);

    expect(SFX_IDS).toHaveLength(45);
    expect(new Set(SFX_IDS).size).toBe(45);
    for (const id of SFX_IDS) {
      expect(isSfxId(id)).toBe(true);
    }
    expect(isSfxId('sfxInvalid')).toBe(false);

    // State-to-BGM routing covers all 10 tracks
    const routed = new Set<string>([
      getBgmForState(0 as AreaId, 'title', false),
      getBgmForState(1 as AreaId, 'playing', false),
      getBgmForState(2 as AreaId, 'playing', false),
      getBgmForState(3 as AreaId, 'playing', false),
      getBgmForState(4 as AreaId, 'playing', false),
      getBgmForState(5 as AreaId, 'playing', false),
      getBgmForState(5 as AreaId, 'victory', false),
      getBgmForState(2 as AreaId, 'playing', true, 'shop'),
      getBgmForState(3 as AreaId, 'playing', true, 'shop'),
      getBgmForState(1 as AreaId, 'playing', true, 'secret'),
    ]);
    for (const id of BGM_TRACK_IDS) {
      expect(routed.has(id)).toBe(true);
    }
  });

  it('packs every logical sprite referenced in src/data into ProceduralWellAtlas without overflow', () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          imageSmoothingEnabled: false,
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
        }),
      }),
    };
    try {
      const { manifest } = generateProceduralWellAtlas();
      expect(manifest.sourceType).toBe('builtin');
      expect(manifest.paletteCount).toBe(38);

      const requiredIds = [
        'sprTile1',
        'sprThinPlatform',
        'sprPlayerIdle',
        'sprBossEye',
        'sprTentacle',
        ...WEAPONS.map((w) => w.spriteId),
        ...UPGRADES.map((u) => u.iconSpriteId),
        ...SHOP_ITEMS.map((s) => s.spriteId),
        ...Object.values(ENEMY_DEFS).map((e) => e.spriteId),
      ];

      for (const id of requiredIds) {
        const rect = manifest.sprites[id];
        expect(rect, `missing built-in sprite ${id}`).toBeDefined();
        expect(rect!.w).toBeGreaterThan(0);
        expect(rect!.h).toBeGreaterThan(0);
        expect(rect!.frames).toBeGreaterThanOrEqual(1);
        expect(rect!.x + rect!.w * rect!.frames).toBeLessThanOrEqual(1024);
        expect(rect!.y + rect!.h).toBeLessThanOrEqual(512);
      }
    } finally {
      if (prevDoc === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDoc;
      }
    }
  });
});

describe('Clean-Room Branding Invariants', () => {
  it('contains zero forbidden third-party brand strings across all declarative tables', () => {
    const serialized = JSON.stringify({
      WELL_CONSTANTS,
      AREA_NAMES,
      WEAPONS,
      UPGRADES,
      SHOP_ITEMS,
      STYLES,
      ENEMY_DEFS,
      PALETTES,
      TROPHIES,
      UNLOCK_MILESTONES,
      BGM_TRACK_IDS,
      SFX_IDS,
    }).toLowerCase();

    for (const term of FORBIDDEN_BRAND_TERMS) {
      expect(serialized.includes(term.toLowerCase())).toBe(false);
    }

    expect(PALETTES[0]?.name).toBe('KRUNKED');
    expect(TROPHIES[0]?.name).toBe('KRUNKED MASTER');
    expect(WELL_CONSTANTS.BRAND_NAME).toBe('Krunked Well');
  });
});
