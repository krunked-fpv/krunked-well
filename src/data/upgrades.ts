import type { ShopItemDef, ShopItemId, UpgradeDef, UpgradeId } from '../contracts/index.ts';

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 0, name: 'BLAST MODULE', description: 'Stomping enemies triggers an explosion', iconSpriteId: 'sprUg0' },
  { id: 1, name: 'REVERSE ENGINEERING', description: 'Shoot a gun module once to reroll it', iconSpriteId: 'sprUg1' },
  { id: 3, name: 'REST IN PIECES', description: 'Shooting corpses causes them to explode', iconSpriteId: 'sprUg3' },
  { id: 4, name: 'GEM POWERED', description: 'Collecting gems recharges gunboots', iconSpriteId: 'sprUg4' },
  { id: 5, name: 'GUNPOWDER BLOCKS', description: 'Destroyed blocks fire bullets', iconSpriteId: 'sprUg5' },
  { id: 6, name: 'YOUTH', description: '+1 upgrade choice and +1 HP', iconSpriteId: 'sprUg6' },
  { id: 7, name: 'CANDLE', description: 'Longer invincibility when damaged', iconSpriteId: 'sprUg7' },
  { id: 8, name: 'HOT CASING', description: 'Ejected shell casings damage enemies', iconSpriteId: 'sprUg8' },
  { id: 9, name: 'DRONE', description: 'Orbiting drone mirrors your shots', iconSpriteId: 'sprUg9' },
  { id: 10, name: 'GEM ATTRACTOR', description: 'Pulls nearby gems toward you', iconSpriteId: 'sprUg10' },
  { id: 11, name: 'KNIFE AND FORK', description: 'Consume 10 corpses to gain +1 HP', iconSpriteId: 'sprUg11' },
  { id: 12, name: 'LASER SIGHT', description: 'Increases range and shot accuracy', iconSpriteId: 'sprUg12' },
  { id: 13, name: 'APPLE', description: 'Gain 4 HP / heart pieces', iconSpriteId: 'sprUg13' },
  { id: 14, name: "MEMBER'S CARD", description: 'Guaranteed start shop + 10% discount', iconSpriteId: 'sprUg14' },
  { id: 15, name: 'HEART BALLOON', description: 'Slows fall speed and decoys foes', iconSpriteId: 'sprUg15' },
  { id: 16, name: 'POPPING GEMS', description: 'Gems shoot an upward bullet', iconSpriteId: 'sprUg16' },
  { id: 17, name: 'TIMEOUT', description: 'Creates a time-slow void when damaged', iconSpriteId: 'sprUg17' },
  { id: 18, name: 'ROCKET JUMP', description: 'Higher jump with a downward blast', iconSpriteId: 'sprUg18' },
  { id: 20, name: 'GEM SICK', description: 'Gem High lasts much longer', iconSpriteId: 'sprUg20' },
  { id: 22, name: 'SAFETY JETPACK', description: 'Hover jetpack when charge hits zero', iconSpriteId: 'sprUg22' },
] as const;

export const SHOP_ITEMS: readonly ShopItemDef[] = [
  { id: 100, name: 'RICE BALL', description: 'Heals 1 HP', basePrice: 200, hpGain: 1, maxHpGain: 0, ammoMaxGain: 0, spriteId: 'sprShop100' },
  { id: 101, name: 'BATTERY', description: '+1 Max Charge', basePrice: 200, hpGain: 0, maxHpGain: 0, ammoMaxGain: 1, spriteId: 'sprShop101' },
  { id: 102, name: 'SUSHI', description: 'Heals 2 HP', basePrice: 350, hpGain: 2, maxHpGain: 0, ammoMaxGain: 0, spriteId: 'sprShop102' },
  { id: 103, name: 'CAR BATTERY', description: '+2 Max Charge', basePrice: 350, hpGain: 0, maxHpGain: 0, ammoMaxGain: 2, spriteId: 'sprShop103' },
  { id: 104, name: 'ENERGY DRINK', description: 'Heals 1 HP + 1 Charge', basePrice: 400, hpGain: 1, maxHpGain: 0, ammoMaxGain: 1, spriteId: 'sprShop104' },
  { id: 105, name: 'CURRY', description: 'Max HP +1', basePrice: 500, hpGain: 1, maxHpGain: 1, ammoMaxGain: 0, spriteId: 'sprShop105' },
] as const;

const UPGRADE_MAP = new Map<UpgradeId, UpgradeDef>(UPGRADES.map((u) => [u.id, u]));
const SHOP_MAP = new Map<ShopItemId, ShopItemDef>(SHOP_ITEMS.map((s) => [s.id, s]));

export function getUpgradeDef(id: UpgradeId): UpgradeDef {
  return UPGRADE_MAP.get(id) ?? UPGRADES[0]!;
}

export function getShopItemDef(id: ShopItemId): ShopItemDef {
  return SHOP_MAP.get(id) ?? SHOP_ITEMS[0]!;
}

export function computeShopPrice(
  basePrice: number,
  area: number,
  hardMode: boolean,
  isAsceticStyle: boolean,
  hasMembersCard: boolean,
): number {
  const effectiveArea = Math.max(1, area);
  let price = basePrice + 200 * (effectiveArea - 1);
  if (hardMode) {
    price *= 2;
  }
  if (isAsceticStyle) {
    price = Math.round(price * 0.7);
  }
  if (hasMembersCard) {
    price = Math.round(price * 0.9);
  }
  return Math.max(10, price);
}
