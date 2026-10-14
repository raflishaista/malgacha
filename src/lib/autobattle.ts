// Compatibility entry point. New battle code lives in battle/.
export { simulateBattle } from './battle/engine';
export { BATTLE_RULES, attackInterval, battleHP, attackDamage, activeSeconds } from './battle/formulas';
export { ABILITY_RULES } from './battle/abilities';
export type { BattleEvent, BattleFrame, BattleReplay, TimeStop } from './battle/types';
