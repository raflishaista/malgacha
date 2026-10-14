import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const koyomiVamp: AbilityDefinition = {
  id: 22036, cooldown: ABILITY_RULES.vampCooldown,
  onTimed(context, owner) {
    context.heal(owner, ABILITY_RULES.vampHeal, 'Koyomi Vamp');
    return { nextDelay: ABILITY_RULES.vampCooldown };
  }
};
