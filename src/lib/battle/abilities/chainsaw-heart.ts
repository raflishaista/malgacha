import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const chainsawHeart: AbilityDefinition = {
  id: 170732,
  onLaterDeath: (context, owner) => context.revive(owner, owner, ABILITY_RULES.chainsawHeal, 'Chainsaw Heart')
};
