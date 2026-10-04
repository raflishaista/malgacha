import { expect, it } from 'vitest';
import { simulateBattle, attackDamage, attackInterval, battleHP } from './autobattle';
import { generateBaseStats, type Rarity } from './stats';
import type { JourneyCharacter } from './types';
let seed = 9234;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const team = (rarity: Rarity = 'N'): JourneyCharacter[] => Array.from({ length: 5 }, (_, i) => ({ id: i, instanceId: String(i), name: String(i), image: null, url: '', titles: [], statRarity: rarity, baseStats: generateBaseStats(rarity, random) }));
it('uses the pictured damage formula and separate speed/HP conversions', () => {
  expect(attackDamage(100, 100)).toBe(25);
  expect(attackDamage(200, 100)).toBeCloseTo(100 / 3);
  expect(attackDamage(100, 200)).toBeLessThan(25);
  expect(attackInterval(200)).toBeLessThan(attackInterval(100));
  expect(battleHP(130)).toBe(130);
});
it('attacks only living opponents, resets ATB, stops dead attackers and preserves base stats', () => {
  const left = team(), right = team();
  const before = structuredClone([left, right]);
  const replay = simulateBattle(left, right, random);
  const hp = replay.units.map(c => battleHP(c.baseStats.hp));
  const last = Array(10).fill(0);
  for (const event of replay.events) {
    expect(hp[event.attacker]).toBeGreaterThan(0);
    expect(hp[event.target]).toBeGreaterThan(0);
    expect(event.attacker < 5).not.toBe(event.target < 5);
    expect(event.time - last[event.attacker]).toBeCloseTo(attackInterval(replay.units[event.attacker].baseStats.speed));
    last[event.attacker] = event.time;
    hp[event.target] = Math.max(0, hp[event.target] - event.damage);
    expect(event.hp).toBeCloseTo(hp[event.target]);
  }
  expect([left, right]).toEqual(before);
  expect(hp.slice(0, 5).every(n => n === 0) || hp.slice(5).every(n => n === 0)).toBe(true);
});
it('averages 20–40 seconds across 300 mixed-rarity battles', () => {
  const rarities: Rarity[] = ['N', 'R', 'SR', 'SSR', 'UR'];
  const times = Array.from({ length: 300 }, (_, i) => simulateBattle(team(rarities[i % 5]), team(rarities[Math.floor(i / 5) % 5]), random).duration);
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Autobattle duration: mean ${average.toFixed(1)}s, min ${Math.min(...times).toFixed(1)}s, max ${Math.max(...times).toFixed(1)}s`);
  expect(average).toBeGreaterThanOrEqual(20);
  expect(average).toBeLessThanOrEqual(40);
});
it('rejects incomplete teams', () => expect(() => simulateBattle(team().slice(1), team())).toThrow('five'));
