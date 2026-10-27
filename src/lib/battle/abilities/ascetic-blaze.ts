import type { AbilityDefinition } from './types';
export const asceticBlaze: AbilityDefinition = {
  id: 171437,
  onHit(context, owner, target) {
    if (context.hp[target] <= 0) return;
    context.activate(owner,171437,[target],actor=>{
      const victim=actor===owner?target:owner;
      context.inflictBurn(actor, victim);
      context.emit(actor, victim, 'status', 'Ninpo: Ascetic Blaze');
    });
  }
};
