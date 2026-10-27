import { BOSS_ABILITY_RULES } from '../../../bosses';
import type { AbilityDefinition } from '../types';
export const kurama: AbilityDefinition = {
  id: 7407, offensive:true, cooldown: BOSS_ABILITY_RULES.bombSeconds, bossGauge: true,
  onTimed: () => ({ nextDelay: BOSS_ABILITY_RULES.bombSeconds, attack: { kind: 'boss-attack', title: 'Tailed Beast Bomb', multiplier: BOSS_ABILITY_RULES.bombMultiplier } })
};
