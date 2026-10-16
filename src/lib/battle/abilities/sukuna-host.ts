import type { AbilityDefinition } from './types';
export const hostCleave: AbilityDefinition = {
  id: -10, cooldown: 6, bossGauge: true,
  onTimed(context, owner) {
    const incarnated = (context.units[owner].sukunaStacks ?? 0) >= 20;
    return { nextDelay: 6, attack: { kind: 'boss-attack', title: incarnated ? 'World-Cutting Slash' : 'Cleave', multiplier: 2, single: true, defenseIgnore: incarnated ? .5 : 0 } };
  }
};
export const hostShrine: AbilityDefinition = {
  id: -15, cooldown: 8, bossGauge: true,
  onTimed(context, owner) {
    const state = context.state(owner, -15);
    state.pulses = state.pulses ?? ((context.units[owner].sukunaStacks ?? 0) >= 20 ? 5 : 3);
    state.pulses--;
    const nextDelay = state.pulses > 0 ? .2 : 8;
    if (!state.pulses) state.pulses = undefined;
    return { nextDelay, attack: { kind: 'boss-attack', title: (context.units[owner].sukunaStacks ?? 0) >= 20 ? 'Malevolent Shrine' : 'Incomplete Malevolent Shrine' } };
  }
};
