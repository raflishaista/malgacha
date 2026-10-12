import definitions from './data/events.json';
import cast from './data/event-characters.json';
import type { JourneyCharacter, PoolCharacter } from './types';
export const EVENT_RULES = definitions.rules;
export const EVENTS = definitions.events;
export type JourneyEvent = { id: keyof typeof EVENTS; status: 'choice' | 'target' | 'battle' | 'reward' | 'complete'; reward?: JourneyCharacter };
export type EventAction = { index: number; choice?: 'yes' | 'no'; target?: string };
export const MARINE_IDS = definitions.marineIds;
export const CAPTIVE_IDS = definitions.captiveIds;
export const eventCharacter = (id: number): PoolCharacter => {
  const character = cast.find(c => c.id === id);
  if (!character) throw new Error('Event character metadata is missing.');
  return character as PoolCharacter;
};
export function rollEvents(random = Math.random): (JourneyEvent | null)[] {
  return Array.from({ length: 3 }, () => random() < EVENT_RULES.chance ? { id: random() < 0.5 ? 'creature' : 'marine', status: 'choice' } : null);
}
export const KEYWORD_INFO = definitions.keywords;
export function keywordBonuses(unit: JourneyCharacter, gear = { hp: 0, attack: 0, defense: 0, speed: 0 }) {
  return Object.fromEntries((['hp', 'attack', 'defense', 'speed'] as const).map(key => {
    const base = unit.baseStats[key] + gear[key] + (unit.permanentBoosts?.[key] ?? 0);
    const multiplier = (unit.soulGem && key !== 'hp' ? 1 + EVENT_RULES.soulGem : 1) * (unit.marine ? 1 + EVENT_RULES.marine : 1);
    return [key, base * (multiplier - 1)];
  })) as import('./stats').BaseStats;
}
