import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const malevolentShrine: AbilityDefinition = {
  id: 175198, offensive:true, cooldown: ABILITY_RULES.shrineCooldown, gauge: 'shrine', oncePerBattle: true,
  onTimed(context, owner) {
    const state = context.state(owner, 175198);
    if (!state.used) { state.used = true; state.pulses = ABILITY_RULES.shrineHits; }
    state.pulses = (state.pulses ?? 0) - 1;
    return { nextDelay: state.pulses > 0 ? ABILITY_RULES.shrineInterval : Infinity, attack: { kind: 'shrine', title: 'Malevolent Shrine' } };
  }
};
