import type { StyleDef, StyleId } from '../contracts/index.ts';
import { WELL_CONSTANTS } from '../contracts/index.ts';

export const STYLES: readonly StyleDef[] = [
  {
    id: 0,
    name: 'STANDARD',
    description: 'Balanced 4 HP, 3 upgrade choices',
    startHp: WELL_CONSTANTS.START_HP,
    upgradeChoices: 3,
    stompBounce: WELL_CONSTANTS.STOMP_BOUNCE_SP,
    gravMultiplier: 1.0,
    jumpMultiplier: 1.0,
    shopDiscount: 0,
    gunModulesOnlyInSiderooms: false,
    spritePrefix: 'style0',
  },
  {
    id: 1,
    name: 'SPIN STYLE',
    description: 'Siderooms hold gun modules only, shops rare',
    startHp: WELL_CONSTANTS.START_HP,
    upgradeChoices: 3,
    stompBounce: WELL_CONSTANTS.STOMP_BOUNCE_SP,
    gravMultiplier: 1.0,
    jumpMultiplier: 1.0,
    shopDiscount: 0,
    gunModulesOnlyInSiderooms: true,
    spritePrefix: 'style1',
  },
  {
    id: 2,
    name: 'HEAVY STYLE',
    description: '6 starting HP, 2 upgrade choices, lower stomp bounce',
    startHp: WELL_CONSTANTS.BOULDER_START_HP,
    upgradeChoices: 2,
    stompBounce: WELL_CONSTANTS.BOULDER_STOMP_BOUNCE_SP,
    gravMultiplier: 1.0,
    jumpMultiplier: 1.0,
    shopDiscount: 0,
    gunModulesOnlyInSiderooms: false,
    spritePrefix: 'style2',
  },
  {
    id: 3,
    name: 'FLOAT STYLE',
    description: 'Low gravity descent, floatier air control',
    startHp: WELL_CONSTANTS.START_HP,
    upgradeChoices: 3,
    stompBounce: WELL_CONSTANTS.STOMP_BOUNCE_SP,
    gravMultiplier: 1 / 1.5,
    jumpMultiplier: WELL_CONSTANTS.LEVITATE_JUMP_MULT,
    shopDiscount: 0,
    gunModulesOnlyInSiderooms: false,
    spritePrefix: 'style3',
  },
  {
    id: 4,
    name: 'ASCETIC STYLE',
    description: 'No post-stage upgrades, 30% cheaper shops',
    startHp: WELL_CONSTANTS.START_HP,
    upgradeChoices: 0,
    stompBounce: WELL_CONSTANTS.STOMP_BOUNCE_SP,
    gravMultiplier: 1.0,
    jumpMultiplier: 1.0,
    shopDiscount: 0.3,
    gunModulesOnlyInSiderooms: false,
    spritePrefix: 'style4',
  },
] as const;

export function getStyleDef(id: StyleId): StyleDef {
  return STYLES[id] ?? STYLES[0]!;
}
