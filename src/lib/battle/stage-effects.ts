import { STAGE_RULES, type StageId } from '../stages';
import type { JourneyCharacter } from '../types';
import type { BattleStatuses } from './statuses';
import type { BattleEffects } from './effects';
import type { BattleEvent, BattleReplay } from './types';

export const firstStageTick = (stage?: StageId) => {
  switch (stage) {
    case 'punk':
      return 0;
    case 'hell':
      return 1;
    case 'infinite_castle':
      return (STAGE_RULES as any).biwaSeconds ?? 8;
    case 'dangai':
      return STAGE_RULES.sweepSeconds;
    case 'colosseum':
      return STAGE_RULES.swapSeconds;
    case 'tracen':
      return (STAGE_RULES as any).tracenSeconds ?? 6;
    case 'tootsuki':
      return (STAGE_RULES as any).shokugekiSeconds ?? 6;
    case 'itomori':
      return STAGE_RULES.impactSeconds;
    default:
      return Infinity;
  }
};

export interface StageContext {
  time: number;
  units: JourneyCharacter[];
  hp: number[];
  maxHP: number[];
  sides: number[];
  positions: number[];
  burnSide: number;
  statuses: BattleStatuses;
  effects: BattleEffects;
  castleRooms: number[];
  hellState: { appeared: boolean };
  available(unit: number): boolean;
  random(): number;
  refreshStats(): void;
  refreshTeamModifiers(): void;
  damageEveryone(fraction: number): void;
  emit(actor: number, target: number, kind: BattleEvent['kind'], ability?: string, damage?: number): void;
  dealDamage(target: number, amount: number, abilityName?: string): void;
  killUnit(target: number, abilityName?: string): void;
}

export function shuffleCastleRooms(
  units: JourneyCharacter[],
  sides: number[],
  available: (i: number) => boolean,
  random: () => number,
  castleRooms: number[]
) {
  const left = units.flatMap((_, i) => sides[i] === 0 && available(i) ? [i] : []);
  const right = units.flatMap((_, i) => sides[i] === 1 && available(i) ? [i] : []);
  const shuffle = (arr: number[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffle(left);
  shuffle(right);

  units.forEach((_, i) => { castleRooms[i] = 0; });

  if (left.length <= 1 || right.length <= 1) {
    units.forEach((_, i) => { castleRooms[i] = 0; });
    return;
  }

  const candidatePatterns: [number, number][] = [
    [3, 2], [1, 1], [4, 1], [3, 3], [2, 2], [2, 3], [1, 4]
  ];
  const patterns = candidatePatterns.filter(([l, r]) => l < left.length && r < right.length);

  const pattern = patterns.length
    ? patterns[Math.floor(random() * patterns.length)]
    : [Math.floor(left.length / 2), Math.floor(right.length / 2)];
  const [lSize, rSize] = pattern;

  left.slice(0, lSize).forEach(i => { castleRooms[i] = 0; });
  right.slice(0, rSize).forEach(i => { castleRooms[i] = 0; });

  left.slice(lSize).forEach(i => { castleRooms[i] = 1; });
  right.slice(rSize).forEach(i => { castleRooms[i] = 1; });
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
    case 'morioh': {
      const leftCandidates = units.flatMap((_, i) => sides[i] === 0 && available(i) ? [i] : []);
      const rightCandidates = units.flatMap((_, i) => sides[i] === 1 && available(i) ? [i] : []);
      if (leftCandidates.length && rightCandidates.length) {
        const leftVictim = leftCandidates[Math.floor(random() * leftCandidates.length)];
        const rightVictim = rightCandidates[Math.floor(random() * rightCandidates.length)];
        const message = `${units[leftVictim].name} and ${units[rightVictim].name} disappear in a quiet explosion…`;
        context.killUnit(leftVictim, message);
        context.killUnit(rightVictim, message);
      }
      return { nextAt: Infinity };
    }
    case 'hell': {
      if (!context.hellState.appeared) {
        if (random() < 0.3) {
          context.hellState.appeared = true;
          context.emit(-1, -1, 'environment', 'The surroundings get dark! Astronauts herald the Darkness Devil!');
          return { nextAt: time + 4 };
        }
        return { nextAt: time + 1 };
      }
      context.damageEveryone(0.1);
      const living = units.flatMap((_, i) => available(i) ? [i] : []);
      const weakenedTargets = living.filter(() => random() < 0.5);
      const targets = weakenedTargets.length ? weakenedTargets : (living.length ? [living[Math.floor(random() * living.length)]] : []);
      for (const i of targets) {
        context.effects.apply(i, 'WEAKENED', time, 4, -1);
        context.emit(-1, i, 'status', `The Darkness Devil cuts off ${units[i].name}’s arms, weakening them.`);
      }
      context.refreshStats();
      return { nextAt: time + 4 };
    }
    case 'infinite_castle': {
      shuffleCastleRooms(units, sides, available, random, context.castleRooms);
      context.emit(-1, -1, 'environment', 'A biwa makes a noise! The rooms change.');
      return { nextAt: time + ((STAGE_RULES as any).biwaSeconds ?? 8) };
    }
    case 'inaba': {
      context.emit(-1, -1, 'environment', 'A thick fog obscures the truth of your opponent’s identity…');
      return { nextAt: Infinity };
    }
    case 'alcatraz': {
      context.emit(-1, -1, 'environment', 'The teams are lifted to the top! It’s a Battle Royale duel!');
      return { nextAt: Infinity };
    }
    case 'axis': {
      context.emit(-1, -1, 'environment', 'You and your opponent are reinforced by armies! Additional units join the battle.');
      return { nextAt: Infinity };
    }
    case 'tracen': {
      const allLiving = units.flatMap((_, i) => available(i) ? [i] : []);
      if (!allLiving.length) return { nextAt: Infinity };
      const choice = Math.floor(random() * 4);
      const target = allLiving[Math.floor(random() * allLiving.length)];
      if (choice === 0) {
        const dmg = maxHP[target] * 0.2;
        const msg = `Gold Ship mistakenly thinks ${units[target].name} is her trainer and dropkicks ${units[target].name}!`;
        context.dealDamage(target, dmg, msg);
      } else if (choice === 1) {
        context.effects.apply(target, 'STUN', time, 4, -1);
        const msg = `${units[target].name} falls into a pitfall trap by Shinko Windy!`;
        context.emit(-1, target, 'status', msg);
      } else if (choice === 2) {
        if (random() < 0.5) {
          context.effects.apply(target, 'POTION BOOST', time, 12, -1);
          context.refreshStats();
          const msg = `Agnes Tachyon offers ${units[target].name} to try her drink. It boosts ${units[target].name}’s speed!`;
          context.emit(-1, target, 'buff', msg);
        } else {
          context.effects.apply(target, 'POISON', time, 6, -1);
          context.statuses.burn(target, time, -1);
          const msg = `Agnes Tachyon offers ${units[target].name} to try her drink. It tastes funny…`;
          context.emit(-1, target, 'status', msg);
        }
      } else {
        context.statuses.chill(target, time);
        context.refreshStats();
        const msg = `${units[target].name} tries an eating competition with Oguri Cap, but loses. Slow Metabolism!`;
        context.emit(-1, target, 'status', msg);
      }
      return { nextAt: time + ((STAGE_RULES as any).tracenSeconds ?? 6) };
    }
    case 'tootsuki': {
      const candidates = units.flatMap((_, i) => available(i) ? [i] : []);
      if (candidates.length) {
        const lowest = candidates.reduce((best, i) => hp[i] / maxHP[i] < hp[best] / maxHP[best] ? i : best, candidates[0]);
        const heal = maxHP[lowest] * 0.3;
        hp[lowest] = Math.min(maxHP[lowest], hp[lowest] + heal);
        const msg = `A Shokugeki happens! ${units[lowest].name} becomes a judge and eats the food.`;
        context.emit(-1, lowest, 'heal', msg, heal);
      }
      return { nextAt: time + ((STAGE_RULES as any).shokugekiSeconds ?? 6) };
    }
    default:
      return { nextAt: Infinity };
  }
}
