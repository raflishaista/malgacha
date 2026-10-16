import type { JourneyCharacter } from '../types';
import { STAT_KEYS } from '../stats';
import { equipmentCount } from './equipment';
import { keywordsFor } from './keywords';
import type { BattleStatuses } from './statuses';
import type { BattleEvent } from './types';

interface ItemContext {
  readonly hp: number[];
  readonly maxHP: number[];
  readonly time: number;
  available(index: number): boolean;
  sameSide(a: number, b: number): boolean;
  sameDuel(a: number, b: number): boolean;
  emit(actor: number, target: number, kind: BattleEvent['kind'], title?: string, damage?: number): void;
  deaths(victims: number[], previouslyDead: number[]): void;
  refreshStats(): void;
}

/** Item hooks are battle-local; saved units and item instances are never mutated. */
export class BattleItems {
  readonly permanentlyNegated = new Set<number>();
  constructor(private units: JourneyCharacter[], private statuses: BattleStatuses, private overrides: Record<number, Partial<JourneyCharacter>>) {}
  suppressInitial() {
    this.units.forEach((unit, i) => {
      if (!equipmentCount(unit, 'hogyoku')) return;
      unit.negated = true; this.permanentlyNegated.add(i); this.statuses.negatedUntil[i] = 1e9;
      this.overrides[i] = { ...this.overrides[i], negated: true };
    });
  }
  onStart(context: ItemContext) {
    this.units.forEach((unit, owner) => {
      const copies = equipmentCount(unit, 'behelit');
      if (!context.available(owner) || !copies) return;
      const previouslyDead = context.hp.flatMap((value, i) => value <= 0 ? [i] : []);
      const victims = this.units.flatMap((_, i) => i !== owner && context.available(i) && context.sameSide(i, owner) && context.sameDuel(i, owner) ? [i] : []);
      for (const i of victims) { const damage = context.hp[i]; context.hp[i] = 0; context.emit(owner, i, 'execute', 'Behelit', damage); }
      for (const key of STAT_KEYS) unit.battleModifiers = { ...unit.battleModifiers, [key]: (unit.battleModifiers?.[key] ?? 0) + victims.length * 25 * copies };
      this.overrides[owner] = { ...this.overrides[owner], battleModifiers: unit.battleModifiers };
      context.deaths(victims, previouslyDead); context.refreshStats();
    });
  }
  /** Called only after an attack lands. Returns whether the extra item damage killed. */
  onHit(context: ItemContext, attacker: number, target: number, actualDamage: number): boolean {
    const unit = this.units[attacker];
    if (!unit.negated && keywordsFor(unit).includes('LIFESTEAL') && context.hp[attacker] > 0) {
      context.hp[attacker] = Math.min(context.maxHP[attacker], context.hp[attacker] + actualDamage / 2);
      context.emit(attacker, attacker, 'heal', 'Lifesteal');
    }
    if (equipmentCount(unit, 'inverted')) {
      if (!this.permanentlyNegated.has(target)) this.statuses.negate(target, context.time);
      this.units[target].negated = true; this.overrides[target] = { ...this.overrides[target], negated: true };
      context.refreshStats(); context.emit(attacker, target, 'status', 'NEGATED');
    }
    const copies = equipmentCount(unit, 'curse');
    if (copies) {
      const hits = (this.statuses.curse[target].get(attacker) ?? 0) + 1;
      this.statuses.curse[target].set(attacker, hits >= 3 ? 0 : hits);
      if (hits >= 3 && context.hp[target] > 0) {
        const damage = context.maxHP[target] * (this.units[target].boss ? .15 : .5) * copies;
        context.hp[target] = Math.max(0, context.hp[target] - damage);
        context.emit(attacker, target, 'curse', 'CURSE × 3', damage);
        return context.hp[target] === 0;
      }
    }
    return false;
  }
}
