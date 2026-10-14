import type { BaseStats } from '../stats';
import { STAT_KEYS, statTotal } from '../stats';
import type { JourneyCharacter } from '../types';
import type { ItemId } from '../items';

export const emptyBoosts = (): BaseStats => ({ hp: 0, attack: 0, defense: 0, speed: 0 });
type EquipmentEffect = (team: JourneyCharacter[], boosts: BaseStats[], owner: number) => void;
const effects: Partial<Record<ItemId, EquipmentEffect>> = {
  nichirin: (_team, boosts, owner) => { boosts[owner].attack += 15; },
  airgear: (_team, boosts, owner) => { boosts[owner].speed += 15; },
  whistle(team, boosts, owner) {
    const candidates = team.map((unit, index) => ({ unit, index })).filter(candidate => candidate.index !== owner && !candidate.unit.empty);
    candidates.sort((a, b) => statTotal(b.unit.baseStats) - statTotal(a.unit.baseStats) || a.index - b.index);
    const target = candidates[0];
    if (target) for (const key of STAT_KEYS) boosts[target.index][key] += target.unit.baseStats[key] * 0.05;
  }
};

/** Same-name equipment stacks. The engine determines which allies can share support. */
export function equipmentBonuses(team: JourneyCharacter[]): BaseStats[] {
  const boosts = team.map(emptyBoosts);
  team.forEach((unit, owner) => {
    if (!unit.empty) for (const item of unit.equipment ?? []) effects[item.itemId]?.(team, boosts, owner);
  });
  return boosts;
}
