import {
  WELL_CONSTANTS,
  type InputFrame,
  type PickupEntity,
  type SideRoomState,
  type SimState,
  type WeaponId,
} from '../contracts/index.ts';
import {
  SHOP_ITEMS,
  computeShopPrice,
  getShopItemDef,
} from '../data/upgrades.ts';
import { WEAPONS, getWeaponDef } from '../data/weapons.ts';
import { nextRandom, randInt, randPick } from './prng.ts';
import {
  allocId,
  colToX,
  emitEvent,
  getTile,
  hasUpgrade,
  healPlayer,
  isSolidTile,
  rechargeGunboots,
  rowToY,
  xToCol,
  yToRow,
} from './simUtils.ts';
import { spawnGems } from './enemies.ts';

const prevUpStates = new WeakMap<SimState, boolean>();

function findRoomFloorY(state: SimState, room: SideRoomState): number {
  const midCol = Math.round((room.minCol + room.maxCol) * 0.5);
  const startRow = Math.max(room.minRow, yToRow(room.centerY));
  for (let row = startRow; row <= room.maxRow + 1; row++) {
    const tile = getTile(state.world, midCol, row);
    if (isSolidTile(tile, state.world)) {
      return rowToY(row);
    }
  }
  return rowToY(room.maxRow);
}

export function rollWeaponExcluding(state: SimState, excludeIds: readonly WeaponId[]): WeaponId {
  const candidates: WeaponId[] = [];
  for (const w of WEAPONS) {
    if (!excludeIds.includes(w.id)) {
      candidates.push(w.id);
    }
  }
  if (candidates.length === 0) {
    return 0;
  }
  return randPick(state, candidates);
}

function rollModuleBonusType(state: SimState): 'ammo' | 'hp' {
  if (state.area === 5) {
    return 'hp';
  }
  if (state.player.hp <= 2) {
    // 6:1 HP-biased when player is at <= 2 HP
    return nextRandom(state) < 6 / 7 ? 'hp' : 'ammo';
  }
  return nextRandom(state) < 0.5 ? 'ammo' : 'hp';
}

export function rerollGunModule(state: SimState, pickup: PickupEntity): boolean {
  if (pickup.kind !== 'gun_module' || pickup.rerolled || !pickup.alive) {
    return false;
  }
  const excluded: WeaponId[] = [state.player.weaponId];
  if (pickup.weaponId !== undefined) {
    excluded.push(pickup.weaponId);
  }
  pickup.weaponId = rollWeaponExcluding(state, excluded);
  if (state.area === 5) {
    pickup.bonusType = 'hp';
  } else {
    pickup.bonusType = pickup.bonusType === 'hp' ? 'ammo' : 'hp';
  }
  pickup.rerolled = true;
  emitEvent(state, {
    type: 'floating_text',
    x: pickup.x,
    y: pickup.y - 10,
    text: 'REROLL!',
    channel: 'S',
  });
  return true;
}

export function populateSideRoom(state: SimState, room: SideRoomState): void {
  const floorY = findRoomFloorY(state, room);

  switch (room.kind) {
    case 'shop': {
      // Pick 3 distinct shop items
      const pool = [...SHOP_ITEMS];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randInt(state, 0, i);
        const tmp = pool[i]!;
        pool[i] = pool[j]!;
        pool[j] = tmp;
      }
      const chosen = pool.slice(0, 3);
      const offsets = [-24, 0, 24] as const;

      for (let i = 0; i < chosen.length; i++) {
        const def = chosen[i]!;
        const price = computeShopPrice(
          def.basePrice,
          state.area,
          state.hardMode,
          state.styleId === 4,
          hasUpgrade(state, 14),
        );
        state.pickups.push({
          id: allocId(state),
          kind: 'shop_item',
          x: room.centerX + (offsets[i] ?? 0),
          y: floorY - 8,
          shopItemId: def.id,
          price,
          sideRoomId: room.id,
          alive: true,
        });
      }
      break;
    }

    case 'gun_module': {
      const weaponId = rollWeaponExcluding(state, [state.player.weaponId]);
      const bonusType = rollModuleBonusType(state);
      state.pickups.push({
        id: allocId(state),
        kind: 'gun_module',
        x: room.centerX,
        y: floorY - 12,
        weaponId,
        bonusType,
        rerolled: false,
        sideRoomId: room.id,
        alive: true,
      });
      break;
    }

    case 'gem_cache': {
      const cacheValue = 40 + Math.max(1, state.area) * 15;
      spawnGems(state, room.centerX, floorY - 10, cacheValue);
      break;
    }

    case 'secret': {
      state.pickups.push({
        id: allocId(state),
        kind: 'heart_drop',
        x: room.centerX - 10,
        y: floorY - 10,
        sideRoomId: room.id,
        alive: true,
      });
      spawnGems(state, room.centerX + 10, floorY - 10, 40);
      break;
    }
  }
}

export function spawnBossWallModules(state: SimState): void {
  const activeModules = state.pickups.filter((pk) => pk.alive && pk.kind === 'gun_module').length;
  if (activeModules >= 4) {
    return;
  }

  const baseY = state.player.y + 44;
  const positions = [
    { x: colToX(2) + 8, y: baseY },
    { x: colToX(8) + 8, y: baseY + 64 },
  ];

  const usedWeapons: WeaponId[] = [state.player.weaponId];
  for (const pos of positions) {
    if (state.pickups.filter((pk) => pk.alive && pk.kind === 'gun_module').length >= 4) {
      break;
    }
    const weaponId = rollWeaponExcluding(state, usedWeapons);
    usedWeapons.push(weaponId);
    state.pickups.push({
      id: allocId(state),
      kind: 'gun_module',
      x: pos.x,
      y: pos.y,
      weaponId,
      bonusType: 'hp', // 100% HP bonus in Area 5 Abyss
      rerolled: false,
      alive: true,
    });
  }
}

export function updateSideRoomsAndPickups(state: SimState, input: InputFrame): void {
  if (state.mode !== 'playing' || !state.player.alive) {
    return;
  }

  const p = state.player;
  const prevUp = prevUpStates.get(state) ?? false;
  const upPressed = input.up && !prevUp;
  prevUpStates.set(state, input.up);

  // 1. Side room entry / exit detection
  let matchedRoom: SideRoomState | null = null;
  for (const room of state.world.sideRooms) {
    const minX = colToX(room.minCol);
    const maxX = colToX(room.maxCol + 1);
    const minY = rowToY(room.minRow);
    const maxY = rowToY(room.maxRow + 1);
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
      matchedRoom = room;
      break;
    }
  }

  if (matchedRoom) {
    if (!state.inSideRoom || state.activeSideRoomId !== matchedRoom.id) {
      state.inSideRoom = true;
      state.activeSideRoomId = matchedRoom.id;
      state.camera.sideRoomLocked = true;
      state.camera.sideRoomX = matchedRoom.centerX;
      state.camera.sideRoomY = matchedRoom.centerY;

      if (!matchedRoom.visited) {
        matchedRoom.visited = true;
        state.runStats.stageSideRoomsVisited += 1;
        if (matchedRoom.kind === 'shop') {
          state.runStats.shopsVisited += 1;
        }
      }
      emitEvent(state, { type: 'side_room_enter', kind: matchedRoom.kind });
    }
  } else if (state.inSideRoom) {
    state.inSideRoom = false;
    state.activeSideRoomId = null;
    state.camera.sideRoomLocked = false;
    state.shopPromptText = null;
    emitEvent(state, { type: 'side_room_exit' });
  }

  // 2. Aquifer air pockets
  for (const pocket of state.world.airPockets) {
    if (!pocket.active) {
      if (pocket.respawnTicks > 0) {
        pocket.respawnTicks -= 1;
        if (pocket.respawnTicks <= 0) {
          pocket.active = true;
        }
      }
      continue;
    }
    if (Math.hypot(p.x - pocket.x, p.y - pocket.y) <= pocket.radius + 6) {
      pocket.active = false;
      pocket.respawnTicks = 240;
      p.oxygen = WELL_CONSTANTS.OXYGEN_MAX;
      p.oxygenStunTicks = WELL_CONSTANTS.OXYGEN_GET_STUN;
      emitEvent(state, {
        type: 'oxygen_restore',
        x: pocket.x,
        y: pocket.y,
        oxygen: p.oxygen,
      });
    }
  }

  // 3. Pickups (gun modules, shop items, air bubbles, heart drops)
  state.shopPromptText = null;
  const buyAttempt = upPressed || input.actionPressed;

  for (const pk of state.pickups) {
    if (!pk.alive) continue;

    if (pk.kind === 'air_bubble') {
      const nextY = pk.y - 0.15;
      if (!isSolidTile(getTile(state.world, xToCol(pk.x), yToRow(nextY - 4)), state.world)) {
        pk.y = nextY;
      }
    }

    const overlaps = Math.abs(p.x - pk.x) <= 12 && Math.abs(p.y - pk.y) <= 14;
    if (!overlaps) continue;

    switch (pk.kind) {
      case 'air_bubble': {
        pk.alive = false;
        p.oxygen = WELL_CONSTANTS.OXYGEN_MAX;
        p.oxygenStunTicks = WELL_CONSTANTS.OXYGEN_GET_STUN;
        emitEvent(state, {
          type: 'oxygen_restore',
          x: pk.x,
          y: pk.y,
          oxygen: p.oxygen,
        });
        break;
      }

      case 'heart_drop': {
        pk.alive = false;
        healPlayer(state, 1);
        emitEvent(state, {
          type: 'floating_text',
          x: pk.x,
          y: pk.y - 10,
          text: '+1 HP',
          channel: 'M',
        });
        break;
      }

      case 'gun_module': {
        pk.alive = false;
        const newWeapon = pk.weaponId ?? 0;
        const bonus = pk.bonusType ?? 'ammo';
        p.weaponId = newWeapon;
        p.burstRemaining = 0;
        p.burstTimer = 0;
        state.runStats.modulesCollected += 1;

        const wDef = getWeaponDef(newWeapon);
        if (bonus === 'hp') {
          healPlayer(state, 1);
          emitEvent(state, {
            type: 'floating_text',
            x: pk.x,
            y: pk.y - 10,
            text: `${wDef.shortName} +HP`,
            channel: 'M',
          });
        } else {
          p.ammoMax += 1;
          p.ammo = p.ammoMax;
          p.meterJiggleTicks = 8;
          emitEvent(state, {
            type: 'floating_text',
            x: pk.x,
            y: pk.y - 10,
            text: `${wDef.shortName} +CHG`,
            channel: 'S',
          });
        }
        rechargeGunboots(state);
        emitEvent(state, {
          type: 'pickup_gun',
          x: pk.x,
          y: pk.y,
          weaponId: newWeapon,
          bonusType: bonus,
        });
        break;
      }

      case 'shop_item': {
        const itemDef = getShopItemDef(pk.shopItemId ?? 100);
        const price =
          pk.price ??
          computeShopPrice(
            itemDef.basePrice,
            state.area,
            state.hardMode,
            state.styleId === 4,
            hasUpgrade(state, 14),
          );
        state.shopPromptText = `${itemDef.name} - ${price}G`;

        if (buyAttempt) {
          if (state.gems >= price) {
            state.gems -= price;
            pk.alive = false;
            state.shopPromptText = null;

            if (itemDef.maxHpGain > 0) {
              p.hpMax += itemDef.maxHpGain;
              p.hp = Math.min(p.hpMax, p.hp + itemDef.hpGain);
            } else if (itemDef.hpGain > 0) {
              healPlayer(state, itemDef.hpGain);
            }

            if (itemDef.ammoMaxGain > 0) {
              p.ammoMax += itemDef.ammoMaxGain;
              p.ammo = p.ammoMax;
              p.meterJiggleTicks = 8;
            }

            emitEvent(state, {
              type: 'pickup_shop',
              x: pk.x,
              y: pk.y,
              itemId: itemDef.id,
              price,
            });
            emitEvent(state, {
              type: 'floating_text',
              x: pk.x,
              y: pk.y - 10,
              text: itemDef.name,
              channel: 'L',
            });
          } else {
            emitEvent(state, {
              type: 'shop_deny',
              x: pk.x,
              y: pk.y,
            });
            emitEvent(state, {
              type: 'floating_text',
              x: pk.x,
              y: pk.y - 10,
              text: 'TOO POOR!',
              channel: 'M',
            });
          }
        }
        break;
      }
    }
  }

  state.pickups = state.pickups.filter((pk) => pk.alive);
}
