import catalog from '../../data/abilities.json';
import type { JourneyCharacter } from '../../types';

export type AbilityHolder = Pick<
  JourneyCharacter,
  | 'id'
  | 'boss'
  | 'bossId'
  | 'empty'
  | 'extraAbilities'
  | 'witch'
  | 'summonOwner'
  | 'removedAbilities'
  | 'sukunaStacks'
  | 'negated'
  | 'clone'
>;

const listedIds = new Set(catalog.map(ability => ability.characterId));

/**
 * Resolves all active ability IDs for a given character instance.
 * Excludes bosses, empty units, witches, and non-clone summons.
 */
export function abilityIds(unit: AbilityHolder): number[] {
  if (unit.boss || unit.empty || unit.witch || (unit.summonOwner !== undefined && !unit.clone)) {
    return [];
  }

  const baseId = listedIds.has(unit.id) ? [unit.id] : [];
  const extras = unit.extraAbilities ?? [];
  const allIds = Array.from(new Set([...baseId, ...extras]));

  if (!unit.removedAbilities?.length) {
    return allIds;
  }

  return allIds.filter(id => !unit.removedAbilities!.includes(id));
}

/**
 * Checks whether a unit currently has a specific ability active.
 */
export function hasAbility(unit: AbilityHolder, id: number): boolean {
  return abilityIds(unit).includes(id);
}
