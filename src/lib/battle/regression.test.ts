import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { simulateBattle } from '../autobattle';
import { STAGES, type StageId } from '../stages';
import type { JourneyCharacter } from '../types';

const stages: (StageId | undefined)[] = [undefined, ...Object.keys(STAGES) as StageId[]];
function roster(side: number, scenario: number): JourneyCharacter[] {
  return Array.from({ length: side === 0 && scenario === 2 ? 7 : 5 }, (_, i) => ({
    id: 900000 + side * 10 + i, instanceId: `${side}-${i}`, name: `Unit ${side}-${i}`,
    image: null, url: '', titles: [], statRarity: 'N',
    baseStats: { hp: scenario === 2 && i === 0 ? 70 : 300, attack: 110 + i * 5, defense: 130 - i * 3, speed: 100 + i * 7 },
    ...(scenario > 0 ? { extraAbilities: [[4004, 175198, 40882], [87275, 171437], [170732, 134263], [22036, 434], [196899, 16412, 163847]][i % 5] } : {}),
    ...(scenario === 2 ? { soulGem: i === 0, marine: side === 1, equipment: [{ itemId: 'whistle' as const, instanceId: `whistle-${side}-${i}` }] } : {})
  }));
}
it('preserves plain pre-refactor battles and current ability replay determinism across stages', () => {
  const actual: Record<string, string> = {};
  for (const stage of stages) for (const scenario of [0, 1, 2]) for (const initial of [71, 928]) {
    let seed = initial;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const replay = simulateBattle(roster(0, scenario), roster(1, scenario), random, stage);
    if(scenario===0)actual[`${stage ?? 'normal'}-${scenario}-${initial}`] = createHash('sha256').update(JSON.stringify(replay)).digest('hex');
    else {
      seed=initial;
      expect(simulateBattle(roster(0,scenario),roster(1,scenario),random,stage)).toEqual(replay);
      expect(replay.duration).toBeLessThanOrEqual(120);
      expect(replay.frames!.every(frame=>frame.hp.every(hp=>Number.isFinite(hp)&&hp>=0))).toBe(true);
    }
  }
  const file = new URL('./replay-baseline.json', import.meta.url);
  const old=JSON.parse(readFileSync(file,'utf8'));
  expect(actual).toEqual(Object.fromEntries(Object.entries(old).filter(([key])=>key.includes('-0-'))));
});
