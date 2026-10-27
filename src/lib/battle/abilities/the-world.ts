import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const theWorld: AbilityDefinition = {
  id: 4004, cooldown: ABILITY_RULES.worldCooldown, targets:'all',
  onTimed(context, owner) {
    context.stopTime(owner, ABILITY_RULES.worldDuration);
    context.emit(owner, owner, 'world', 'The World');
    return { nextDelay: ABILITY_RULES.worldCooldown };
  }
};
