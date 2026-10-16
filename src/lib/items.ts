import definitions from './data/items.json';
import type { JourneyCharacter } from './types';
import { abilityIds } from './battle/abilities/catalog';
import { keywordsFor } from './battle/keywords';
export type ItemCategory = 'relic' | 'equipment' | 'consumable';
export type ItemRarity = 'R' | 'SR' | 'SSR' | 'UR';
export type ItemDefinition = { name: string; category: ItemCategory; rarity: ItemRarity; unique: boolean; description: string };
export const ITEMS = definitions as { [Id in keyof typeof definitions]: ItemDefinition };
export type ItemId = keyof typeof ITEMS;
export type ItemInstance = { instanceId: string; itemId: ItemId };
export { emptyBoosts, equipmentBonuses } from './battle/equipment';
export const ITEM_RARITY_WEIGHTS: Record<ItemRarity, number> = { R: 50, SR: 30, SSR: 15, UR: 5 };
export const ITEM_COLORS: Record<ItemRarity, string> = { R: '#64aaff', SR: '#c6cbd4', SSR: '#efc45f', UR: '#ec9aee' };
export const CATCH_RATES = {
  pokeball: { N: .9, R: .6, SR: .3, SSR: .1, UR: .01 },
  greatball: { N: 1, R: .8, SR: .5, SSR: .3, UR: .05 },
  ultraball: { N: 1, R: 1, SR: .8, SSR: .5, UR: .1 },
  masterball: { N: 1, R: 1, SR: 1, SSR: 1, UR: 1 }
};
export const isBall = (id: ItemId): id is keyof typeof CATCH_RATES => id in CATCH_RATES;
export const relicCount = (inventory: ItemInstance[], id: ItemId) => inventory.filter(item => item.itemId === id).length;
export const rerollFilter = (inventory: ItemInstance[]) => relicCount(inventory, 'coin') * 50;
export function rollItem(inventory: ItemInstance[], random = Math.random, rarity?: ItemRarity): ItemId {
  const eligible = (Object.keys(ITEMS) as ItemId[]).filter(id => !ITEMS[id].unique || !inventory.some(item => item.itemId === id));
  if (!rarity) {
    let roll = random() * 100;
    for (const [tier, weight] of Object.entries(ITEM_RARITY_WEIGHTS)) { roll -= weight; if (roll < 0) { rarity = tier as ItemRarity; break; } }
    rarity ??= 'UR';
  }
  const pool = eligible.filter(id => ITEMS[id].rarity === rarity);
  const pick = random();
  if (rarity === 'SSR' && relicCount(inventory, 'radar')) {
    if (pick < .4) return 'dragonball';
    const other = pool.filter(id => id !== 'dragonball');
    return other[Math.min(other.length - 1, Math.floor((pick - .4) / .6 * other.length))];
  }
  return pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
}
export function rewardChoices(inventory: ItemInstance[], random = Math.random): ItemId[] {
  // Independent cards preserve the stated rarity odds. Duplicate choices are possible.
  return Array.from({ length: 3 }, () => rollItem(inventory, random));
}
export function canUseOn(id: ItemId, unit: JourneyCharacter): boolean {
  if (unit.empty) return false;
  if (ITEMS[id].category === 'equipment') return (unit.equipment?.length ?? 0) < 3;
  if (id === 'rokkakaka') return unit.statRarity !== 'N';
  if (id === 'journal') return !keywordsFor(unit).includes('TAUNT');
  if (id === 'mask') return !keywordsFor(unit).includes('LIFESTEAL');
  if (id === 'drug') return abilityIds(unit).length > 0;
  if (id === 'arrow') return abilityIds(unit).length < 3;
  return true;
}
