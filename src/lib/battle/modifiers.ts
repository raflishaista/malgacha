import type { BaseStats } from '../stats';
import type { JourneyCharacter } from '../types';
import { DEFAULT_AURA_MULTIPLIER, implementationsFor } from './abilities';
import { keywordBonuses, KEYWORD_RULES } from './keywords';

/** Existing order: base + gear + permanent, keyword percentages, Witch, temporary ATK,
 * ally aura, then temporary Speed. HP recalculation preserves percentage in the engine. */
export function effectiveStats(unit: JourneyCharacter, aura: boolean | number, time: number, attackBonus = 0, equipment: BaseStats = { hp: 0, attack: 0, defense: 0, speed: 0 }): BaseStats {
  const base = { ...unit.baseStats };
  for (const key of ['hp', 'attack', 'defense', 'speed'] as const) base[key] += equipment[key] + (unit.permanentBoosts?.[key] ?? 0);
  if (unit.battleModifiers) for (const key of ['hp', 'attack', 'defense', 'speed'] as const) base[key] = Math.max(1, base[key] + (unit.battleModifiers[key] ?? 0));
  const keywords = keywordBonuses(unit, equipment);
  for (const key of ['hp', 'attack', 'defense', 'speed'] as const) base[key] = (base[key] + keywords[key]) * (unit.witch ? 1 + KEYWORD_RULES.witch : 1);
  const multiplier = typeof aura === 'number' ? aura : aura ? DEFAULT_AURA_MULTIPLIER : 1;
  const speedMultiplier = implementationsFor(unit).reduce((value, ability) => value * (ability.speedMultiplier?.(time) ?? 1), 1);
  return { hp: Math.max(1, base.hp * multiplier), attack: Math.max(1, (base.attack + attackBonus) * multiplier), defense: Math.max(1, base.defense * multiplier), speed: Math.max(1, base.speed * multiplier * speedMultiplier) };
}
