import { abilityIds, type AbilityHolder } from './catalog';
import type { AbilityContext, AbilityDefinition } from './types';
import {
  characterAbilities,
  bossAbilities,
  hostCleave,
  hostShrine,
  driversHigh,
  blackFlash,
  theWorld,
  kakuja,
  rumbling,
  asceticBlaze,
  koyomiVamp,
  turboGranny,
  godHand,
  forbiddenMagic,
  chainsawHeart,
  malevolentShrine,
  grandFisher,
  kurama,
  gunDevil,
  deoxys,
  sahaquiel,
  thresholdAbilities,
  timedCharacters,
  activeCharacters,
  withThisTreasure,
  jajanken,
  godspeed,
  tojiHeavenlyRestriction,
  makiHeavenlyRestriction,
  redComet,
  thunderSpears,
  colossalTitan,
  santoryu,
  daiEnkaiEntei,
  diableJambe
} from './definitions';

export { ABILITY_RULES } from './config';
export { abilityIds, hasAbility } from './catalog';
export type { AbilityContext, AbilityDefinition, AbilityState, TimedActivation } from './types';

// Named exports for individual ability definitions
export {
  blackFlash,
  theWorld,
  kakuja,
  rumbling,
  asceticBlaze,
  koyomiVamp,
  turboGranny,
  godHand,
  forbiddenMagic,
  driversHigh,
  chainsawHeart,
  malevolentShrine,
  withThisTreasure,
  jajanken,
  godspeed,
  tojiHeavenlyRestriction,
  makiHeavenlyRestriction,
  redComet,
  thunderSpears,
  colossalTitan,
  santoryu,
  daiEnkaiEntei,
  diableJambe,
  hostCleave,
  hostShrine,
  grandFisher,
  kurama,
  gunDevil,
  deoxys,
  sahaquiel,
  thresholdAbilities,
  timedCharacters,
  activeCharacters
};

/** Map of boss abilities by boss ID */
export const BOSS_ABILITIES: ReadonlyMap<number, AbilityDefinition> = new Map(
  bossAbilities.map(ability => [ability.id, ability])
);

/** Complete registry of all abilities by ID (characters + bosses + special mechanics) */
export const ABILITIES: ReadonlyMap<number, AbilityDefinition> = new Map(
  [...characterAbilities, ...bossAbilities, hostCleave, hostShrine].map(ability => [ability.id, ability])
);

/** IDs of all implemented normal character abilities */
export const IMPLEMENTED_ABILITIES: readonly number[] = characterAbilities.map(ability => ability.id);

/**
 * Returns all active ability definitions for a given combat unit.
 */
export function implementationsFor(unit: AbilityHolder): AbilityDefinition[] {
  if (unit.empty || unit.witch || unit.negated) {
    return [];
  }

  if (unit.boss) {
    const bossAbility = BOSS_ABILITIES.get(unit.bossId ?? unit.id);
    return bossAbility ? [bossAbility] : [];
  }

  const standardAbilities = abilityIds(unit).flatMap(id => {
    const ability = characterAbilities.find(def => def.id === id);
    return ability ? [ability] : [];
  });

  const sukunaStacks = unit.sukunaStacks ?? 0;
  const hostAbilities: AbilityDefinition[] = [];
  if (sukunaStacks >= 10) hostAbilities.push(hostCleave);
  if (sukunaStacks >= 15) hostAbilities.push(hostShrine);

  return [...standardAbilities, ...hostAbilities];
}

/** All abilities that feature periodic timed triggers */
export const timedAbilities: readonly AbilityDefinition[] = [
  ...characterAbilities,
  ...bossAbilities,
  hostCleave,
  hostShrine
].filter(ability => ability.cooldown !== undefined && ability.onTimed !== undefined);

/**
 * Returns the shortest cooldown among a unit's active abilities, or Infinity if none.
 */
export function abilityCooldown(unit: AbilityHolder): number {
  const cooldowns = implementationsFor(unit).flatMap(ability =>
    ability.cooldown === undefined ? [] : [ability.cooldown]
  );
  return cooldowns.length > 0 ? Math.min(...cooldowns) : Infinity;
}

/**
 * Multiplier for incoming damage, computed from all active damage reduction abilities.
 */
export function incomingDamageMultiplier(unit: AbilityHolder): number {
  return implementationsFor(unit).reduce(
    (multiplier, ability) => multiplier * (1 - (ability.damageReduction ?? 0)),
    1
  );
}

export const DEFAULT_AURA_MULTIPLIER = driversHigh.auraMultiplier!;

/**
 * Computes attack damage multiplier and triggered title effects for a unit's attack.
 */
export function attackEffectsFor(
  unit: AbilityHolder,
  context: AbilityContext,
  owner: number,
  targets: number[] = context.enemies(owner)
): { multiplier: number; reflectedBy?: number; title?: string; defenseIgnore?: number } {
  let multiplier = 1;
  let reflectedBy: number | undefined;
  let defenseIgnore = 0;
  const titles: string[] = [];

  for (const ability of implementationsFor(unit)) {
    const effect = ability.onAttack?.(context, owner);
    if (!effect) continue;

    let allowed = true;
    if (effect.title) {
      allowed = context.activate(owner, ability.id, targets, actor => {
        if (actor !== owner) reflectedBy = actor;
      });
    }

    if (allowed) {
      multiplier *= effect.multiplier;
      if (effect.defenseIgnore) {
        defenseIgnore = 1 - (1 - defenseIgnore) * (1 - effect.defenseIgnore);
      }
      if (effect.title) {
        titles.push(effect.title);
      }
    }
  }

  return {
    multiplier,
    reflectedBy,
    title: titles.length > 0 ? titles.join(' + ') : undefined,
    ...(defenseIgnore > 0 ? { defenseIgnore } : {})
  };
}
