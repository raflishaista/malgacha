import type { AbilityDefinition } from '../types';
export const gunDevil: AbilityDefinition = {
  id: 184112,
  onDeath(context, owner) {
    const state = context.state(owner, 184112);
    if (state.used) return false;
    state.used = true;
    return context.captureWeakest(owner);
  }
};
