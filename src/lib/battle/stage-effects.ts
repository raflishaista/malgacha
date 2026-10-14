import { STAGE_RULES, type StageId } from '../stages';
import type { JourneyCharacter } from '../types';
import type { BattleStatuses } from './statuses';
import type { BattleReplay } from './types';

export const firstStageTick = (stage?: StageId) => stage === 'punk' ? 0 : stage === 'dangai' ? STAGE_RULES.sweepSeconds : stage === 'colosseum' ? STAGE_RULES.swapSeconds : stage === 'itomori' ? STAGE_RULES.impactSeconds : Infinity;
interface StageContext {
  time: number;
  units: JourneyCharacter[];
  hp: number[];
  maxHP: number[];
  sides: number[];
  positions: number[];
  burnSide: number;
  statuses: BattleStatuses;
  available(unit: number): boolean;
  random(): number;
  refreshStats(): void;
  refreshTeamModifiers(): void;
  damageEveryone(fraction: number): void;
}
/** Timed environments use battle-local actions; they never edit the saved roster. */
export function applyStageTick(stage: StageId | undefined, context: StageContext): { nextAt: number; winner?: BattleReplay['winner'] } {
  const { time, units, hp, maxHP, sides, positions, statuses, available, random } = context;
  switch (stage) {
    case 'punk':
      units.forEach((_, i) => {
        if (available(i)) { if (sides[i] === context.burnSide) statuses.burn(i, time, -1); else statuses.chill(i, time); }
      });
      context.refreshStats();
      return { nextAt: time + 1 };
    case 'dangai':
      context.damageEveryone(STAGE_RULES.sweepDamage);
      return { nextAt: time + STAGE_RULES.sweepSeconds };
    case 'colosseum':
      // Visit each original unit once, preserving occupied slots and team sizes.
      for (let i = 0; i < units.length; i++) {
        if (units[i].witch) continue;
        const destination = random() < 0.5 ? sides[i] : 1 - sides[i];
        const candidates = units.flatMap((_, j) => !units[j].witch && sides[j] === destination && j !== i ? [j] : []);
        if (!candidates.length) continue;
        const target = candidates[Math.floor(random() * candidates.length)];
        [sides[i], sides[target]] = [sides[target], sides[i]];
        [positions[i], positions[target]] = [positions[target], positions[i]];
      }
      context.refreshTeamModifiers();
      return { nextAt: Infinity };
    case 'itomori': {
      const totals = [0, 1].map(side => hp.reduce((sum, value, i) => sum + (sides[i] === side ? value / maxHP[i] : 0), 0));
      const witchAlive = units.some((_, i) => sides[i] === 2 && available(i));
      return { nextAt: Infinity, winner: witchAlive ? 'right' : totals[0] >= totals[1] ? 'left' : 'right' };
    }
    default: return { nextAt: Infinity };
  }
}
