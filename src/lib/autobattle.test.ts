import { expect, it } from 'vitest';
import { simulateBattle, attackDamage, attackInterval, battleHP, activeSeconds, ABILITY_RULES } from './autobattle';
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
it('rejects a completely empty team', () => expect(() => simulateBattle([], team())).toThrow('1–7'));
it('allows a smaller team after a permanent death', () => expect(simulateBattle(team().slice(1), team()).leftCount).toBe(4));

function fixedTeams() {
  return [team(), team()].map(side => side.map(c => ({ ...c, baseStats: { hp: 500, attack: 125, defense: 125, speed: 125 } })));
}
it('Black Flash doubles final damage at 30%, on either team', () => {
  for (const side of [0, 1]) {
    for (const [roll, critical] of [[0.299, true], [0.3, false]] as const) {
      const teams = fixedTeams(); teams[side][0].id = 163847;
      teams[side][0].baseStats.speed = 200;
      const replay = simulateBattle(teams[0], teams[1], () => roll);
      const first = replay.events[0];
      expect(first.attacker).toBe(side * 5);
      expect(first.damage).toBe(critical ? 50 : 25);
      expect(first.ability).toBe(critical ? 'Black Flash' : undefined);
    }
  }
});
it('The World freezes every other attacker and preserves their ATB progress', () => {
  for (const side of [0, 1]) {
    const teams = fixedTeams(); teams[side][0].id = 4004;
    const replay = simulateBattle(teams[0], teams[1], () => 0);
    const stop = replay.stops![0];
    expect(stop.start).toBe(10);
    expect(stop.end - stop.start).toBe(3);
    const actions = replay.events.filter(e => e.time >= stop.start && e.time < stop.end);
    expect(actions.every(e => e.attacker === stop.owner)).toBe(true);
    expect(actions.some(e => !e.kind)).toBe(true);
    expect(activeSeconds(0, 12, side === 0 ? 5 : 0, replay.stops)).toBe(10);
    expect(activeSeconds(0, 12, stop.owner, replay.stops)).toBe(12);
  }
});
it('Kakuja reacts to allied/enemy deaths, caps healing and resets its buffs each battle', () => {
  const teams = fixedTeams(); teams[0][1].id = 87275; teams[1][1].id = 87275;
  teams[1][0].baseStats.hp = 1;
  const before = structuredClone(teams);
  const replay = simulateBattle(teams[0], teams[1], () => 0);
  const heals = replay.events.filter(e => e.kind === 'heal');
  expect(heals.slice(0, 2).map(e => e.attacker)).toEqual([1, 6]);
  expect(heals.slice(0, 2).every(e => e.attackBonus === 5)).toBe(true);
  expect(heals.every(e => e.hp <= 500 && -e.damage <= 500 * ABILITY_RULES.kakujaHeal)).toBe(true);
  expect(teams).toEqual(before);
  expect(simulateBattle(teams[0], teams[1], () => 0)).toEqual(replay);
});
it('Rumbling hits all living enemies simultaneously, without resetting normal ATB', () => {
  for (const side of [0, 1]) {
    const teams = fixedTeams(); teams[side][0].id = 40882;
    const replay = simulateBattle(teams[0], teams[1], () => 0);
    const hits = replay.events.filter(e => e.kind === 'rumbling' && e.time === 8);
    expect(hits).toHaveLength(5);
    expect(hits.every(e => (e.target < 5) !== (side === 0) && e.damage === 25)).toBe(true);
    expect(hits.filter(e => e.ability === 'Rumbling')).toHaveLength(1);
    expect(replay.events.find(e => e.attacker === side * 5 && !e.kind && e.time > 8)!.time).toBeCloseTo(10.8);
  }
});
