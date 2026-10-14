import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const godHand: AbilityDefinition = {
  id: 16412, startPriority: 2, keywords: ['TAUNT'], damageReduction: ABILITY_RULES.godHandReduction,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'God Hand')
};
