import { BOSS_ABILITY_RULES, SAHAQUIEL_ID } from '../../../bosses';
import type { AbilityDefinition } from '../types';
export const sahaquiel: AbilityDefinition = {
  id: SAHAQUIEL_ID, cooldown: BOSS_ABILITY_RULES.angelSeconds, cannotAttack: true, absoluteTimer: true, bossGauge: true,
  onTimed(context, owner) {
    context.defeatOpponents(owner, '10th Angel');
    return { nextDelay: Infinity };
  }
};
