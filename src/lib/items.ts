import definitions from './data/items.json';
import type { BaseStats } from './stats';
import { STAT_KEYS, statTotal } from './stats';
import type { JourneyCharacter } from './types';
export type ItemCategory = 'relic' | 'equipment' | 'consumable';
export type ItemDefinition = { name: string; category: ItemCategory; unique: boolean; description: string };
export const ITEMS = definitions as { [Id in keyof typeof definitions]: ItemDefinition };
export type ItemId = keyof typeof ITEMS;
export type ItemInstance = { instanceId: string; itemId: ItemId };
export const emptyBoosts = (): BaseStats => ({ hp: 0, attack: 0, defense: 0, speed: 0 });
export function equipmentBonuses(team: JourneyCharacter[]): BaseStats[] {
  const boosts = team.map(emptyBoosts);
  team.forEach((owner, i) => {
    if (owner.empty) return;
    for (const item of owner.equipment ?? []) {
      if (item.itemId === 'nichirin') boosts[i].attack += 15;
      if (item.itemId === 'airgear') boosts[i].speed += 15;
      if (item.itemId === 'whistle') {
        const candidates = team.map((unit, j) => ({ unit, j })).filter(x => x.j !== i && !x.unit.empty);
        candidates.sort((a, b) => statTotal(b.unit.baseStats) - statTotal(a.unit.baseStats) || a.j - b.j);
        const target = candidates[0];
        if (target) for (const key of STAT_KEYS) boosts[target.j][key] += target.unit.baseStats[key] * 0.05;
      }
    }
  });
  return boosts;
}
export function rewardChoices(inventory: ItemInstance[], random = Math.random): ItemId[] {
  const choices = (Object.keys(ITEMS) as ItemId[]).filter(id => !ITEMS[id].unique || !inventory.some(item => item.itemId === id));
  for (let i = 0; i < 3; i++) { const j = i + Math.floor(random() * (choices.length - i)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  return choices.slice(0, 3);
}
