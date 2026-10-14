import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const rumbling: AbilityDefinition = {
  id: 40882, cooldown: ABILITY_RULES.rumblingCooldown, gauge: 'rumbling',
  onTimed: () => ({ nextDelay: ABILITY_RULES.rumblingCooldown, attack: { kind: 'rumbling', title: 'Rumbling' } })
};
