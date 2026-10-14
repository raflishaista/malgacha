import catalog from '../../data/abilities.json';
import type { JourneyCharacter } from '../../types';

export type AbilityHolder = Pick<JourneyCharacter, 'id' | 'boss' | 'empty' | 'extraAbilities' | 'witch'>;
const listedIds = new Set(catalog.map(ability => ability.characterId));
export const abilityIds = (unit: AbilityHolder): number[] => unit.boss || unit.empty || unit.witch ? [] :
  [...new Set([...(listedIds.has(unit.id) ? [unit.id] : []), ...(unit.extraAbilities ?? [])])];
export const hasAbility = (unit: AbilityHolder, id: number) => abilityIds(unit).includes(id);
