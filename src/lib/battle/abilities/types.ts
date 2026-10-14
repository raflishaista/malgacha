import type { JourneyCharacter } from '../../types';
import type { BaseStats } from '../../stats';
import type { BattleEvent } from '../types';

export type AbilityState = { used?: boolean; pulses?: number };
export type TimedActivation = { nextDelay: number; attack?: { kind: 'rumbling' | 'shrine'; title: string } };
/** Abilities use combat actions, not the engine's scheduler or saved team data. */
export interface AbilityContext {
  readonly units: readonly JourneyCharacter[];
  readonly hp: readonly number[];
  readonly maxHP: readonly number[];
  readonly stats: readonly Readonly<BaseStats>[];
  readonly time: number;
  random(): number;
  state(owner: number, ability: number): AbilityState;
  heal(owner: number, fraction: number, title: string): void;
  revive(owner: number, target: number, fraction: number, title: string): void;
  emit(owner: number, target: number, kind: BattleEvent['kind'], title?: string): void;
  addAttack(owner: number, amount: number): void;
  stopTime(owner: number, seconds: number): void;
  inflictBurn(owner: number, target: number): void;
}
export interface AbilityDefinition {
  id: number;
  cooldown?: number;
  gauge?: 'rumbling' | 'shrine';
  oncePerBattle?: boolean;
  tracksAttackBonus?: boolean;
  startPriority?: number;
  onStart?(context: AbilityContext, owner: number): void;
  onTimed?(context: AbilityContext, owner: number): TimedActivation;
  onAttack?(context: AbilityContext, owner: number): { multiplier: number; title?: string };
  onHit?(context: AbilityContext, owner: number, target: number): void;
  onOtherDeath?(context: AbilityContext, owner: number): void;
  canReviveAlly?(context: AbilityContext, owner: number): boolean;
  onAllyDeath?(context: AbilityContext, owner: number, victim: number): void;
  onLaterDeath?(context: AbilityContext, owner: number): void;
  damageReduction?: number;
  auraMultiplier?: number;
  speedMultiplier?(time: number): number;
  expiresAt?: number;
  keywords?: ('TAUNT')[];
}
