import { randomUUID } from 'node:crypto';
import type { Job, JourneyCharacter, PoolCharacter } from '../types';
import { ITEMS, CATCH_RATES, isBall, canUseOn, rollItem, relicCount, rerollFilter, type ItemId } from '../items';
import { generateBaseStats } from '../stats';
import { rarityFor } from '../rarity';
import { abilityIds, IMPLEMENTED_ABILITIES } from '../battle/abilities';
import { fusePair, RARITY_ORDER } from './item-effects';
export function newUnit(character: PoolCharacter, random = Math.random, forceUR = false): JourneyCharacter {
  const statRarity = forceUR ? 'UR' : rarityFor(character.favorites) ?? 'N';
  return { id: character.id, name: character.name, image: character.image, url: character.url, favorites: character.favorites, titles: character.titles, instanceId: randomUUID(), statRarity, ...(forceUR ? { rarityOverride: 'UR' as const } : {}), baseStats: generateBaseStats(statRarity, random) };
}
export function emptySlot(): JourneyCharacter {
  return { id: 0, name: 'Empty slot', image: null, url: '', titles: [], instanceId: randomUUID(), statRarity: 'N', baseStats: { hp: 0, attack: 0, defense: 0, speed: 0 }, empty: true };
}
export function randomPoolUnit(job: Job, random = Math.random, ur = false): JourneyCharacter {
  const pool = Object.values(job.pool).filter(c => !ur || rarityFor(c.favorites) === 'UR');
  if (!pool.length) throw new Error('No eligible characters are available. Your item was not used.');
  return newUnit(pool[Math.floor(random() * pool.length)], random);
}
export function victoryRerollPool(job: Job, target: JourneyCharacter) {
  const filter = rerollFilter(job.inventory ?? []), stone = relicCount(job.inventory ?? [], 'stone');
  const ids = new Set(job.starterTeam?.map(c => c.id));
  return Object.values(job.pool).filter(c => !ids.has(c.id) && (!filter || (c.favorites ?? 0) > filter) && (!stone || RARITY_ORDER.indexOf(rarityFor(c.favorites) ?? 'N') >= RARITY_ORDER.indexOf(target.statRarity)));
}
export type InventoryAction = { action: 'claim' | 'equip' | 'use' | 'catch' | 'replace-catch' | 'wish' | 'dismiss-fusion'; item?: string; target?: string; reward?: string; ability?: number; character?: number };
function grantItem(job: Job, id: ItemId, random: () => number) {
  if (ITEMS[id].unique && job.inventory?.some(item => item.itemId === id)) throw new Error('You already own this relic.');
  const extra = id === 'merry' || id === 'sunny' ? randomPoolUnit(job, random) : undefined;
  if (extra) job.starterTeam!.push(extra);
  (job.inventory ??= []).push({ instanceId: randomUUID(), itemId: id });
}
export function inventoryView(job: Job) { return { pendingCatch: job.pendingCatch ?? null, itemNotice: job.itemNotice ?? '', fusionNotice: !!job.fusionNotice, encounter: job.encounter ?? null, lives: job.lives ?? 3, arenaWins: job.arenaWins ?? 0, inventory: job.inventory ?? [], itemReward: job.itemReward ?? null, characters: job.starterTeam ?? [] }; }
export function applyInventoryAction(job: Job, action: InventoryAction, random = Math.random) {
  const team = job.starterTeam as JourneyCharacter[];
  if (!team) throw new Error('Roll a team first.');
  job.inventory ??= [];
  if (action.action === 'dismiss-fusion') { delete job.fusionNotice; return; }
  if (action.action === 'replace-catch') {
    if (!job.pendingCatch) throw new Error('No caught unit is waiting.');
    const index = team.findIndex(c => c.instanceId === action.target);
    if (index < 0) throw new Error('Choose a team slot.');
    team[index] = job.pendingCatch; delete job.pendingCatch; return;
  }
  if (action.action === 'wish') {
    if (relicCount(job.inventory, 'dragonball') < 7) throw new Error('Collect seven Dragon Balls first.');
    const character = job.wishCandidates?.find(c => c.id === action.character) ?? job.pool[String(action.character)];
    if (!character) throw new Error('Search for and select a character first.');
    const index = team.findIndex(c => c.instanceId === action.target);
    if (index < 0) throw new Error('Choose a team slot.');
    team[index] = newUnit(character, random);
    let removed = 0; job.inventory = job.inventory.filter(item => item.itemId !== 'dragonball' || removed++ >= 7);
    job.itemNotice = 'Your wish has been granted.'; return;
  }
  if (action.action === 'claim') {
    if (!job.itemReward || job.itemReward.id !== action.reward || !job.itemReward.choices.includes(action.item as ItemId)) throw new Error('This reward is no longer available.');
    const id = action.item as ItemId;
    grantItem(job, id, random); delete job.itemReward; return;
  }
  const index = job.inventory.findIndex(i => i.instanceId === action.item);
  if (index < 0) throw new Error('Item not found or already used.');
  const item = job.inventory[index], definition = ITEMS[item.itemId];
  if (action.action === 'catch') {
    if (!isBall(item.itemId)) throw new Error('Choose a Poké Ball.');
    if (job.pendingCatch) throw new Error('Place your caught unit first.');
    const encounter = job.encounter;
    if (!encounter?.result || encounter.gameOver || !(encounter.result.winner ? encounter.result.winner === 'left' : encounter.result.left > encounter.result.right)) throw new Error('Win a battle before catching a defeated opponent.');
    const opponent = encounter.teams[encounter.selected ?? -1]?.find(c => c.instanceId === action.target);
    if (!opponent || opponent.boss || opponent.empty) throw new Error('Choose a defeated non-boss opponent.');
    if (random() < CATCH_RATES[item.itemId][opponent.statRarity]) {
      job.pendingCatch = newUnit(opponent, random); job.itemNotice = 'Caught! Choose a team slot to replace.';
    } else job.itemNotice = 'The unit broke free. The ball was used.';
    job.inventory.splice(index, 1); return;
  }
  const targetIndex = team.findIndex(c => c.instanceId === action.target && !c.empty);
  if (targetIndex < 0) throw new Error('Choose a living team member.');
  const target = team[targetIndex];
  if (!canUseOn(item.itemId, target)) throw new Error(item.itemId === 'arrow' ? 'This unit already has three passive abilities.' : definition.category === 'equipment' ? 'This unit already has three equipped items.' : 'This unit cannot use that item.');
  if (action.action === 'equip') {
    if (definition.category !== 'equipment') throw new Error('This item cannot be equipped.');
    if ((target.equipment?.length ?? 0) >= 3) throw new Error('This unit already has three equipped items.');
    target.equipment = [...(target.equipment ?? []), item];
    if (item.itemId === 'potara') {
      const other = team.findIndex((c, i) => i !== targetIndex && !c.empty && c.equipment?.some(e => e.itemId === 'potara'));
      if (other >= 0) { fusePair(team, Math.min(other, targetIndex), Math.max(other, targetIndex)); job.fusionNotice = true; }
    }
  } else if (action.action === 'use') {
    if (definition.category !== 'consumable' || isBall(item.itemId)) throw new Error('Use this ball on a defeated opponent.');
    if (item.itemId === 'finger') {
      target.sukunaStacks = (target.sukunaStacks ?? 0) + 1;
      if (target.sukunaStacks === 20) { target.name = 'Incarnated Sukuna'; target.image = '/images/units/incarnated-sukuna.webp'; target.fusionImages = undefined; }
    } else if (item.itemId === 'drug') {
      if (!abilityIds(target).includes(action.ability!)) throw new Error('Choose an ability to remove.');
      target.removedAbilities = [...(target.removedAbilities ?? []), action.ability!];
    } else if (item.itemId === 'journal' || item.itemId === 'mask') {
      target.keywords = [...new Set([...(target.keywords ?? []), item.itemId === 'journal' ? 'TAUNT' as const : 'LIFESTEAL' as const])];
    } else if (item.itemId === 'rokkakaka') {
      const reward = rollItem(job.inventory, random, target.statRarity as Exclude<typeof target.statRarity, 'N'>);
      grantItem(job, reward, random); team[targetIndex] = emptySlot(); job.itemNotice = 'Received ' + ITEMS[reward].name + '.';
    } else if (item.itemId === 'arrow') {
      const existing = abilityIds(target);
      if (existing.length >= 3) throw new Error('This unit already has three passive abilities. Your item was not used.');
      const available = IMPLEMENTED_ABILITIES.filter(id => !existing.includes(id));
      if (random() < .7) { const id = available[Math.floor(random() * available.length)]; target.removedAbilities = target.removedAbilities?.filter(a => a !== id); target.extraAbilities = [...(target.extraAbilities ?? []), id]; }
      else team[targetIndex] = emptySlot();
    }
  } else throw new Error('Invalid inventory action.');
  job.inventory.splice(index, 1);
}
