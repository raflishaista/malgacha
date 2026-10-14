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
// Compatibility exports; keyword mechanics are independent of event flows.
export { KEYWORD_INFO, keywordBonuses } from './battle/keywords';
