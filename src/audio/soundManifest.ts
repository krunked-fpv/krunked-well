import type {
  AreaId,
  GameMode,
  SideRoomKind,
  WeaponId,
} from '../contracts/index.ts';

// ============================================================================
// Krunked Well — Audio Manifest & State-to-BGM Routing
// ============================================================================

export const BGM_TRACK_IDS = [
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
] as const;

export type BgmTrackId = (typeof BGM_TRACK_IDS)[number];

export const SFX_IDS = [
  // Gunboot shots (normal + Gem High 'B' variants)
  'sfxGunM',
  'sfxGunMB',
  'sfxGunS',
  'sfxGunSB',
  'sfxGunL',
  'sfxGunLB',
  'sfxGun3',
  'sfxGun3B',
  'sfxGunP',
  'sfxGunPB',
  'sfxGunB',
  'sfxGunBB',
  'sfxGunN',
  'sfxGunNB',
  // Movement & combat
  'sfxJump',
  'sfxWallKick',
  'sfxLand',
  'sfxStomp',
  'sfxEnemyHit',
  'sfxEnemyKill',
  'sfxBlockBreak',
  'sfxGem',
  'sfxGemHighStart',
  'sfxGemHighEnd',
  'sfxCombo',
  'sfxEmpty',
  'sfxHurt',
  'sfxDie',
  'sfxSplash',
  'sfxOxygen',
  'sfxOxygenWarn',
  'sfxPickupGun',
  'sfxShopBuy',
  'sfxShopDeny',
  'sfxUpgrade',
  'sfxStageClear',
  'sfxExplosion',
  'sfxBossHit',
  'sfxBossStun',
  'sfxBossPhase',
  'sfxBossLaser',
  'sfxBossDie',
  'sfxTrophy',
  'sfxJetpack',
  'sfxCorpseEat',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

const BGM_TRACK_SET: ReadonlySet<string> = new Set(BGM_TRACK_IDS);
const SFX_ID_SET: ReadonlySet<string> = new Set(SFX_IDS);

export function isBgmTrackId(id: string): id is BgmTrackId {
  return BGM_TRACK_SET.has(id);
}

export function isSfxId(id: string): id is SfxId {
  return SFX_ID_SET.has(id);
}

const WEAPON_SHOT_SFX: Readonly<Record<WeaponId, readonly [SfxId, SfxId]>> = {
  0: ['sfxGunM', 'sfxGunMB'],
  1: ['sfxGunS', 'sfxGunSB'],
  2: ['sfxGunL', 'sfxGunLB'],
  3: ['sfxGun3', 'sfxGun3B'],
  4: ['sfxGunP', 'sfxGunPB'],
  5: ['sfxGunB', 'sfxGunBB'],
  6: ['sfxGunN', 'sfxGunNB'],
};

export function getWeaponShotSfxId(weaponId: WeaponId, gemHigh: boolean): SfxId {
  const pair = WEAPON_SHOT_SFX[weaponId] ?? WEAPON_SHOT_SFX[0];
  return gemHigh ? pair[1] : pair[0];
}

/**
 * Optional fallback alias lookup for custom audio packs whose SFX archive uses
 * alternate logical names for standard gameplay events. Exact logicalId is
 * always tried first before consulting this table.
 */
export const CUSTOM_AUDIO_ALIASES: Readonly<Record<string, readonly string[]>> = {
  sfxJump: ['sfxPlayerJump1', 'sndJumpnew'],
  sfxWallKick: ['sfxPlayerJump2', 'sfxPlayerJump1'],
  sfxLand: ['sfxJumpLandRock1', 'sfxFsRock1'],
  sfxStomp: ['sfxStompEnmUni', 'sndJizostomp'],
  sfxEnemyHit: ['sndEnemyhurt', 'sfxBatHit'],
  sfxEnemyKill: ['sfxEnmExplode1', 'sfxBatDeath'],
  sfxBlockBreak: ['sfxBreakRock1', 'sfxGemChunkBreak'],
  sfxGem: ['sfxGemGet', 'sndGem'],
  sfxGemHighStart: ['sfxGemBoostEnter'],
  sfxGemHighEnd: ['sfxGemBoostEnd'],
  sfxCombo: ['sfxCombo1', 'sfxCombo2', 'sfxCombo3'],
  sfxEmpty: ['sfxGunEmpty'],
  sfxHurt: ['sfxPlayerHit1', 'sndPlayerHurt'],
  sfxDie: ['sfxDeath'],
  sfxSplash: ['sfxAquiferSplash', 'sndSplash'],
  sfxOxygen: ['sfxAquiferGetBubble'],
  sfxOxygenWarn: ['sfxAquiferBreathingLowOxygen'],
  sfxPickupGun: ['sfxPickupWeapon'],
  sfxShopBuy: ['sfxShopBuyHeart', 'sfxShopBuyBtry', 'sfxShopSelect'],
  sfxShopDeny: ['sfxSkTooPoor', 'sfxShopBack'],
  sfxUpgrade: ['sfxUiUpgradeSelect'],
  sfxStageClear: ['sfxCongratulations'],
  sfxExplosion: ['sfxEnmExplode2', 'sfxEnmExplode3'],
  sfxBossHit: ['sfxBossFirstHit'],
  sfxBossStun: ['sfxBossClose'],
  sfxBossPhase: ['sfxBossAwake', 'sfxBossOpen'],
  sfxBossLaser: ['sfxBossBeam'],
  sfxBossDie: ['sfxBossDeathExplosion'],
  sfxTrophy: ['sfxUiUnlockNotification'],
  sfxJetpack: ['sfxUpgradeJetpack_Fire_Loop'],
  sfxCorpseEat: ['sfxPlayerEat'],
};

/**
 * Maps current simulation area, game mode, and side-room context to one of
 * the 10 logical BGM track IDs.
 */
export function getBgmForState(
  area: AreaId,
  mode: GameMode,
  inSideRoom: boolean,
  sideRoomKind?: SideRoomKind | null,
): string {
  if (mode === 'victory') {
    return 'bgmCredits';
  }
  if (mode === 'title' || mode === 'surface' || mode === 'gameover') {
    return 'bgmOverworld';
  }

  if (inSideRoom) {
    if (sideRoomKind === 'secret' || sideRoomKind === 'gem_cache') {
      return 'bgmSecret';
    }
    if (area === 3) {
      return 'bgmShopAqua';
    }
    return 'bgmShopCave';
  }

  switch (area) {
    case 0:
      return 'bgmOverworld';
    case 1:
      return 'bgmArea1';
    case 2:
      return 'bgmArea2';
    case 3:
      return 'bgmArea3';
    case 4:
      return 'bgmLimbo';
    case 5:
      return 'bgmBoss';
  }
}
