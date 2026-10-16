import definitions from '../data/events.json';
import { implementationsFor } from './abilities';
import type { BaseStats } from '../stats';
import type { JourneyCharacter } from '../types';
export type Keyword = 'TAUNT' | 'SOUL GEM' | 'MARINE SOLIDARITY' | 'WITCH' | 'LIFESTEAL' | 'HOST OF SUKUNA';
export const KEYWORD_INFO: Record<Keyword, string> = { ...definitions.keywords, LIFESTEAL: 'Attacks heal this unit for half the actual damage dealt.', 'HOST OF SUKUNA': 'Stacks unlock King of Poison (5), Cleave (10), Incomplete Malevolent Shrine (15), and Incarnated Sukuna (20).' };
export const KEYWORD_RULES = { soulGem: definitions.rules.soulGem, witch: definitions.rules.witch, marine: definitions.rules.marine };
export const keywordsFor = (unit: Pick<JourneyCharacter, 'id' | 'boss' | 'bossId' | 'empty' | 'extraAbilities' | 'witch' | 'soulGem' | 'marine' | 'keywords' | 'sukunaStacks' | 'removedAbilities' | 'negated'>): Keyword[] => [...new Set<Keyword>([
  ...implementationsFor({ ...unit, negated: false }).flatMap(ability => ability.keywords ?? []),
  ...(unit.keywords ?? []),
  ...(unit.witch ? ['WITCH' as const] : unit.soulGem ? ['SOUL GEM' as const] : []),
  ...(unit.marine ? ['MARINE SOLIDARITY' as const] : []),
  ...(unit.sukunaStacks ? ['HOST OF SUKUNA' as const] : [])
])];
export function keywordBonuses(unit: JourneyCharacter, gear: BaseStats = { hp: 0, attack: 0, defense: 0, speed: 0 }): BaseStats {
  if (unit.negated) return { hp: 0, attack: 0, defense: 0, speed: 0 };
  return Object.fromEntries((['hp', 'attack', 'defense', 'speed'] as const).map(key => {
    const base = unit.baseStats[key] + gear[key] + (unit.permanentBoosts?.[key] ?? 0);
    const multiplier = (unit.soulGem && key !== 'hp' ? 1 + KEYWORD_RULES.soulGem : 1) * (unit.marine ? 1 + KEYWORD_RULES.marine : 1);
    return [key, base * (multiplier - 1)];
  })) as BaseStats;
}
