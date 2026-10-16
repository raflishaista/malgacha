import { BOSS_ABILITY_RULES } from '../../../bosses';
import type { AbilityDefinition } from '../types';
export const grandFisher: AbilityDefinition = {
  id: 7345, cooldown: BOSS_ABILITY_RULES.lureSeconds, protectedBySummon: true,
  onTimed(context, owner) { context.summonLure(owner); return { nextDelay: Infinity }; },
  onSummonDeath(context, owner) { context.scheduleAbility(owner, 7345, BOSS_ABILITY_RULES.lureSeconds); }
};
