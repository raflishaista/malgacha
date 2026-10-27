import catalog from '../../data/abilities.json';
import type { JourneyCharacter } from '../../types';

export type AbilityHolder = Pick<JourneyCharacter, 'id' | 'boss' | 'bossId' | 'empty' | 'extraAbilities' | 'witch' | 'summonOwner' | 'removedAbilities' | 'sukunaStacks' | 'negated' | 'clone'>;
const listedIds = new Set(catalog.map(ability => ability.characterId));
export const abilityIds = (unit: AbilityHolder): number[] => unit.boss || unit.empty || unit.witch || unit.summonOwner !== undefined && !unit.clone ? [] :
  [...new Set([...(listedIds.has(unit.id) ? [unit.id] : []), ...(unit.extraAbilities ?? [])])].filter(id => !unit.removedAbilities?.includes(id));
export const hasAbility = (unit: AbilityHolder, id: number) => abilityIds(unit).includes(id);
