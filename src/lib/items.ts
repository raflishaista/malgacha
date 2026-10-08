import type { BaseStats } from './stats';
import { STAT_KEYS, statTotal } from './stats';
import type { JourneyCharacter } from './types';
export const ITEMS = {
  merry: { name: 'Going Merry', category: 'relic', unique: true, description: 'Permanently adds one team slot, immediately filled with a random character. One per player.' },
  sunny: { name: 'Thousand Sunny', category: 'relic', unique: true, description: 'Permanently adds one team slot, immediately filled with a random character. One per player.' },
  nichirin: { name: 'Nichirin Sword', category: 'equipment', unique: false, description: 'The equipped unit gains +15 Attack. Multiple copies stack.' },
  whistle: { name: 'White Whistle', category: 'equipment', unique: false, description: 'Gives the strongest other ally +5% of every base stat. Uses base BST; ties go to the first ally. Multiple copies stack.' },
  airgear: { name: 'Air Gear', category: 'equipment', unique: false, description: 'The equipped unit gains +15 Speed. Multiple copies stack.' },
  finger: { name: "Sukuna’s Finger", category: 'consumable', unique: false, description: 'Replaces a chosen unit with Sukuna, with fresh UR stats totaling 600. Equipment and previous abilities are lost.' },
  arrow: { name: 'Stand Arrow', category: 'consumable', unique: false, description: '70% chance to grant a new implemented passive; 30% chance to permanently kill the unit, leaving an empty slot. Maximum three passives per unit.' },
  masterball: { name: 'Master Ball', category: 'consumable', unique: false, description: 'Replaces a chosen unit with a random UR character from your imported pool, with fresh stats. Requires an eligible UR character.' }
} as const;
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
