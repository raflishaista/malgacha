import type { TimeStop } from './types';
export const BATTLE_RULES = { baseDamage: 25, hpScale: 1, referenceSpeed: 125, attackSeconds: 3.6, maxSeconds: 120 };
export const attackInterval = (speed: number) => BATTLE_RULES.attackSeconds * Math.sqrt(BATTLE_RULES.referenceSpeed / speed);
export const battleHP = (hp: number) => hp * BATTLE_RULES.hpScale;
export const attackDamage = (attack: number, defense: number) => BATTLE_RULES.baseDamage * (2 * attack) / (attack + defense);
export function activeSeconds(from: number, to: number, unit: number, stops: TimeStop[] = []) {
  return Math.max(0, to - from - stops.filter(s => s.owner !== unit && (!s.affected || s.affected.includes(unit))).reduce((sum, s) => sum + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)), 0));
}

