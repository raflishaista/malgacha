import { ABILITY_RULES } from './config';
import type { AbilityDefinition } from './types';
export const blackFlash: AbilityDefinition = {
  id: 163847,
  onAttack: context => context.random() < ABILITY_RULES.blackFlashChance ? { multiplier: 2, title: 'Black Flash' } : { multiplier: 1 }
};
