import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const driversHigh: AbilityDefinition = {
  id: 434, startPriority: 1, auraMultiplier: 1 + ABILITY_RULES.driversHigh,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'Driver’s High')
};
