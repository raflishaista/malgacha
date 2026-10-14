// Compatibility exports for existing callers. Implementations are registered in battle/abilities/.
export { ABILITY_RULES, IMPLEMENTED_ABILITIES, abilityIds, hasAbility, abilityCooldown } from './battle/abilities';
export { STATUS_RULES, applyBurn, type Burn } from './battle/statuses';
export { keywordsFor, type Keyword } from './battle/keywords';
export { effectiveStats } from './battle/modifiers';
