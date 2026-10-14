import { abilityIds, type AbilityHolder } from './catalog';
import type { AbilityContext, AbilityDefinition } from './types';
import { blackFlash } from './black-flash';
import { theWorld } from './the-world';
import { kakuja } from './kakuja';
import { rumbling } from './rumbling';
import { asceticBlaze } from './ascetic-blaze';
import { koyomiVamp } from './koyomi-vamp';
import { turboGranny } from './turbo-granny';
import { godHand } from './god-hand';
import { forbiddenMagic } from './forbidden-magic';
import { driversHigh } from './drivers-high';
import { chainsawHeart } from './chainsaw-heart';
import { malevolentShrine } from './malevolent-shrine';

export { ABILITY_RULES } from './config';
export { abilityIds, hasAbility } from './catalog';
export type { AbilityContext, AbilityDefinition, AbilityState } from './types';
const definitions = [blackFlash, theWorld, kakuja, rumbling, asceticBlaze, koyomiVamp, turboGranny, godHand, forbiddenMagic, driversHigh, chainsawHeart, malevolentShrine];
export const ABILITIES: ReadonlyMap<number, AbilityDefinition> = new Map(definitions.map(ability => [ability.id, ability]));
export const IMPLEMENTED_ABILITIES = definitions.map(ability => ability.id);
export const implementationsFor = (unit: AbilityHolder): AbilityDefinition[] => abilityIds(unit).flatMap(id => { const ability = ABILITIES.get(id); return ability ? [ability] : []; });
export const timedAbilities = definitions.filter(ability => ability.cooldown !== undefined && ability.onTimed);
export const abilityCooldown = (unit: AbilityHolder) => Math.min(Infinity, ...implementationsFor(unit).flatMap(ability => ability.cooldown === undefined ? [] : [ability.cooldown]));
export const incomingDamageMultiplier = (unit: AbilityHolder) => implementationsFor(unit).reduce((multiplier, ability) => multiplier * (1 - (ability.damageReduction ?? 0)), 1);
export const DEFAULT_AURA_MULTIPLIER = driversHigh.auraMultiplier!;
export function attackEffectsFor(unit: AbilityHolder, context: AbilityContext, owner: number) {
  let multiplier = 1;
  const titles: string[] = [];
  for (const ability of implementationsFor(unit)) {
    const effect = ability.onAttack?.(context, owner);
    if (effect) { multiplier *= effect.multiplier; if (effect.title) titles.push(effect.title); }
  }
  return { multiplier, title: titles.length ? titles.join(' + ') : undefined };
}
