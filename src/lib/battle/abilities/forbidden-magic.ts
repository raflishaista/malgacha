import type { AbilityDefinition } from './types';
export const forbiddenMagic: AbilityDefinition = {
  id: 134263,
  canReviveAlly: (context, owner) => !context.state(owner, 134263).used,
  onAllyDeath(context, owner, victim) {
    context.state(owner, 134263).used = true;
    context.revive(owner, victim, 1, 'Forbidden Magic');
  }
};
