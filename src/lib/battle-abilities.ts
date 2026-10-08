import catalog from './data/abilities.json';
import type { BaseStats } from './stats';
import type { JourneyCharacter } from './types';
export const ABILITY_RULES = {
  blackFlashChance: 0.3, worldCooldown: 10, worldDuration: 3, kakujaHeal: 0.15, kakujaAttack: 5, rumblingCooldown: 8,
  vampCooldown: 4, vampHeal: 0.1, turboDuration: 10, turboMultiplier: 2, godHandReduction: 0.25,
  driversHigh: 0.1, chainsawHeal: 0.15, shrineCooldown: 8, shrineHits: 5, shrineInterval: 0.2
};
export const STATUS_RULES = { burn: { duration: 6, interval: 1, hpFraction: 0.03, label: 'BURN', description: 'This unit takes 3% of maximum HP as damage each second for 6 seconds. Reapplication refreshes the duration; it does not stack.' } };
export type Keyword = 'TAUNT';
export const IMPLEMENTED_ABILITIES = [163847, 4004, 87275, 40882, 171437, 22036, 196899, 16412, 134263, 434, 170732, 175198];
export const abilityIds = (unit: Pick<JourneyCharacter, 'id' | 'boss' | 'empty' | 'extraAbilities'>): number[] => unit.boss || unit.empty ? [] : [...new Set([...(catalog.some(a => a.characterId === unit.id) ? [unit.id] : []), ...(unit.extraAbilities ?? [])])];
export const hasAbility = (unit: Pick<JourneyCharacter, 'id' | 'boss' | 'empty' | 'extraAbilities'>, id: number) => abilityIds(unit).includes(id);
export const keywordsFor = (unit: Pick<JourneyCharacter, 'id' | 'boss' | 'empty' | 'extraAbilities'>): Keyword[] => hasAbility(unit, 16412) ? ['TAUNT'] : [];
export function effectiveStats(unit: JourneyCharacter, aura: boolean, time: number, attackBonus = 0, equipment: BaseStats = { hp: 0, attack: 0, defense: 0, speed: 0 }): BaseStats {
  const base = { ...unit.baseStats };
  for (const key of ['hp', 'attack', 'defense', 'speed'] as const) base[key] += equipment[key] + (unit.permanentBoosts?.[key] ?? 0);
  const multiplier = aura ? 1 + ABILITY_RULES.driversHigh : 1;
  return { hp: base.hp * multiplier, attack: (base.attack + attackBonus) * multiplier,
    defense: base.defense * multiplier,
    speed: base.speed * multiplier * (hasAbility(unit, 196899) && time < ABILITY_RULES.turboDuration ? ABILITY_RULES.turboMultiplier : 1) };
}
export const abilityCooldown = (unit: JourneyCharacter) => hasAbility(unit, 4004) ? ABILITY_RULES.worldCooldown : hasAbility(unit, 40882) ? ABILITY_RULES.rumblingCooldown : hasAbility(unit, 22036) ? ABILITY_RULES.vampCooldown : Infinity;
export type Burn = { until: number; next: number; source: number };
export function applyBurn(previous: Burn | undefined, time: number, source: number): Burn {
  return { until: time + STATUS_RULES.burn.duration, next: previous && previous.until >= time ? previous.next : time + STATUS_RULES.burn.interval, source };
}
