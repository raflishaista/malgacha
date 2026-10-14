import type { AbilityDefinition } from './types';
export const asceticBlaze: AbilityDefinition = {
  id: 171437,
  onHit(context, owner, target) {
    if (context.hp[target] <= 0) return;
    context.inflictBurn(owner, target);
    context.emit(owner, target, 'status', 'Ninpo: Ascetic Blaze');
  }
};
