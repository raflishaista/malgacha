import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const turboGranny: AbilityDefinition = {
  id: 196899, startPriority: 0, expiresAt: ABILITY_RULES.turboDuration,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'Turbo Granny'),
  speedMultiplier: time => time < ABILITY_RULES.turboDuration ? ABILITY_RULES.turboMultiplier : 1
};
