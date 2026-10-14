import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const kakuja: AbilityDefinition = {
  id: 87275, tracksAttackBonus: true,
  onOtherDeath(context, owner) {
    context.addAttack(owner, ABILITY_RULES.kakujaAttack);
    context.heal(owner, ABILITY_RULES.kakujaHeal, 'Kakuja');
  }
};
