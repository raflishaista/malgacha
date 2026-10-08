import { randomUUID } from 'node:crypto';
import type { Job, JourneyCharacter, PoolCharacter } from '../types';
import { ITEMS, type ItemId } from '../items';
import { generateBaseStats } from '../stats';
import { rarityFor } from '../rarity';
import { abilityIds, IMPLEMENTED_ABILITIES } from '../battle-abilities';
export function newUnit(character: PoolCharacter, random = Math.random, forceUR = false): JourneyCharacter {
  const statRarity = forceUR ? 'UR' : rarityFor(character.favorites) ?? 'N';
  return { ...character, instanceId: randomUUID(), statRarity, ...(forceUR ? { rarityOverride: 'UR' as const } : {}), baseStats: generateBaseStats(statRarity, random) };
}
export function emptySlot(): JourneyCharacter {
  return { id: 0, name: 'Empty slot', image: null, url: '', titles: [], instanceId: randomUUID(), statRarity: 'N', baseStats: { hp: 0, attack: 0, defense: 0, speed: 0 }, empty: true };
}
export function randomPoolUnit(job: Job, random = Math.random, ur = false): JourneyCharacter {
  const pool = Object.values(job.pool).filter(c => !ur || rarityFor(c.favorites) === 'UR');
  if (!pool.length) throw new Error(ur ? 'No UR characters are available in this imported pool. Your item was not used.' : 'No characters are available.');
  return newUnit(pool[Math.floor(random() * pool.length)], random);
}
export type InventoryAction = { action: 'claim' | 'equip' | 'use'; item?: string; target?: string; reward?: string };
export function inventoryView(job: Job) { return { inventory: job.inventory ?? [], itemReward: job.itemReward ?? null, characters: job.starterTeam ?? [] }; }
export function applyInventoryAction(job: Job, action: InventoryAction, random = Math.random) {
  const team = job.starterTeam as JourneyCharacter[];
  if (!team) throw new Error('Roll a team first.');
  job.inventory ??= [];
  if (action.action === 'claim') {
    if (!job.itemReward || job.itemReward.id !== action.reward || !job.itemReward.choices.includes(action.item as ItemId)) throw new Error('This reward is no longer available.');
    const id = action.item as ItemId;
    if (ITEMS[id].unique && job.inventory.some(i => i.itemId === id)) throw new Error('You already own this relic.');
    if (id === 'merry' || id === 'sunny') team.push(randomPoolUnit(job, random));
    job.inventory.push({ instanceId: randomUUID(), itemId: id });
    delete job.itemReward;
    return;
  }
  const index = job.inventory.findIndex(i => i.instanceId === action.item);
  if (index < 0) throw new Error('Item not found or already used.');
  const item = job.inventory[index], definition = ITEMS[item.itemId];
  const targetIndex = team.findIndex(c => c.instanceId === action.target && !c.empty);
  if (targetIndex < 0) throw new Error('Choose a living team member.');
  const target = team[targetIndex];
  if (action.action === 'equip') {
    if (definition.category !== 'equipment') throw new Error('This item cannot be equipped.');
    if ((target.equipment?.length ?? 0) >= 3) throw new Error('This unit already has three equipped items.');
    target.equipment = [...(target.equipment ?? []), item];
  } else if (action.action === 'use') {
    if (definition.category !== 'consumable') throw new Error('This item cannot be consumed.');
    if (item.itemId === 'finger') {
      const sukuna: PoolCharacter = { id: 175198, name: 'Ryoumen, Sukuna', image: 'https://cdn.myanimelist.net/images/characters/6/431152.webp', url: 'https://myanimelist.net/character/175198', titles: job.pool['175198']?.titles ?? [], favorites: job.pool['175198']?.favorites ?? null };
      team[targetIndex] = newUnit(sukuna, random, true);
    } else if (item.itemId === 'masterball') team[targetIndex] = randomPoolUnit(job, random, true);
    else if (item.itemId === 'arrow') {
      const existing = abilityIds(target);
      if (existing.length >= 3) throw new Error('This unit already has three passive abilities. Your item was not used.');
      const available = IMPLEMENTED_ABILITIES.filter(id => !existing.includes(id));
      if (random() < 0.7) target.extraAbilities = [...(target.extraAbilities ?? []), available[Math.floor(random() * available.length)]];
      else team[targetIndex] = emptySlot();
    }
  } else throw new Error('Invalid inventory action.');
  job.inventory.splice(index, 1);
}
