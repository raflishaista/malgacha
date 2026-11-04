import { describe, expect, it } from 'vitest';
import { simulateBattle, attackInterval } from './autobattle';
import { rollStage, STAGES, type StageId } from './stages';
import type { JourneyCharacter } from './types';

const team = (size = 5): JourneyCharacter[] => Array.from({ length: size }, (_, i) => ({ id: 900000+i, name: `Unit ${i}`, instanceId: `${i}`, image: null, url: '', titles: [], statRarity: 'N', baseStats: { hp: 500, attack: 125, defense: 125, speed: 125 } }));
const rng = (initial = 123) => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); };

it('splits stage rolls equally between effects and scenery, uniformly within each group', () => {
  const random = rng(), counts = Object.fromEntries(Object.keys(STAGES).map(id => [id, 0]));
  const effectCount = Object.values(STAGES).filter(s => s.effect).length;
  const sceneryCount = Object.values(STAGES).filter(s => !s.effect).length;
  for (let i = 0; i < 120000; i++) counts[rollStage(random)]++;
  for (const id of Object.keys(STAGES) as StageId[]) expect(counts[id] / 120000).toBeCloseTo(0.5 / (STAGES[id].effect ? effectCount : sceneryCount), 2);
});
it('scenery has exactly the normal battle behavior', () => {
  const plain = simulateBattle(team(), team(), rng());
  for (const stage of ['shuchiin', 'dusseldorf', 'ishigami', 'starry', 'the765', 'anteiku'] as const) {
    const replay = simulateBattle(team(), team(), rng(), stage);
    expect(replay.events).toEqual(plain.events); expect(replay.winner).toBe(plain.winner);
  }
});
it('ignores every stage against bosses', () => {
  const boss = [{ ...team()[0], boss: true }];
  const expected = simulateBattle(team(), boss, rng());
  for (const stage of Object.keys(STAGES) as StageId[]) expect(simulateBattle(team(), boss, rng(), stage)).toEqual(expected);
});
it('Punk Hazard randomly assigns persistent burn/chill and slows ATB exactly 25%', () => {
  for (const choice of [0.1, 0.9]) {
    const replay = simulateBattle(team(), team(), () => choice, 'punk');
    const start = replay.frames!.filter(f => f.time === 0).at(-1)!;
    const burnSide = choice < 0.5 ? 0 : 1;
    start.burnUntil.forEach((until, i) => expect(until > 0).toBe((i < 5 ? 0 : 1) === burnSide));
    const chill = burnSide === 0 ? 5 : 0;
    expect(start.intervals![chill]).toBeCloseTo(attackInterval(125) / 0.75);
    const later = replay.frames!.find(f => f.time === 7)!;
    expect(later.chillUntil![chill]).toBeGreaterThan(7);
    expect(replay.events.find(e => e.kind === 'burn')?.damage).toBe(15);
  }
});
it('Dangai hits everyone for 20% max HP at five-second intervals', () => {
  const replay = simulateBattle(team(), team(), rng(), 'dangai');
  const hits = replay.events.filter(e => e.kind === 'environment');
  expect(hits.filter(e => e.time === 5)).toHaveLength(10);
  expect(hits.every(e => e.time % 5 === 0 && e.damage === 100)).toBe(true);
});
describe('Tenkaichi Budokai', () => {
  it('isolates targeting and stops after three wins; extra units never act', () => {
    const left = team(7); left.forEach(c => c.baseStats.attack = 2000);
    const replay = simulateBattle(left, team(), rng(), 'budokai');
    expect(replay.winner).toBe('left');
    expect(replay.frames!.at(-1)!.duelWins![0]).toBe(3);
    for (const e of replay.events.filter(e => !e.kind)) {
      expect(e.attacker).not.toBe(5); expect(e.attacker).not.toBe(6);
      expect(e.attacker < 7 ? e.attacker : e.attacker - 7).toBe(e.target < 7 ? e.target : e.target - 7);
    }
  });
  it('treats empty slots as forfeits without shifting later matchups', () => {
    const left = team(); left[0].empty = left[1].empty = left[2].empty = true;
    const replay = simulateBattle(left, team(), rng(), 'budokai');
    expect(replay.winner).toBe('right'); expect(replay.duration).toBe(0);
    expect(replay.frames![0].duelWins).toEqual([0, 3]);
  });
  it('keeps AoE and time stops inside their own duel', () => {
    const left = team(); left[0].extraAbilities = [40882, 4004, 175198];
    const replay = simulateBattle(left, team(), rng(), 'budokai');
    expect(replay.events.filter(e => e.attacker === 0 && e.damage > 0).every(e => e.target === 5)).toBe(true);
    expect(replay.stops![0].affected).toEqual([5]);
  });
});
it('Valley picks highest modified BST, breaks ties in team order, and excludes benches', () => {
  const left = team(); left[2].equipment = [{ itemId: 'nichirin', instanceId: 'sword' }];
  const replay = simulateBattle(left, team(), rng(), 'valley');
  expect(replay.frames![0].participating).toEqual([false, false, true, false, false, true, false, false, false, false]);
  expect(replay.events.filter(e => e.damage > 0).every(e => [2, 5].includes(e.attacker) && [2, 5].includes(e.target))).toBe(true);
});
it('Colosseum swaps positions and allegiances, targets current opponents, and preserves the saved roster', () => {
  const left = team(7), right = team(), original = structuredClone([left, right]);
  const replay = simulateBattle(left, right, rng(), 'colosseum');
  const frame = replay.frames!.find(f => f.time === 6)!;
  expect(frame.sides!.filter(s => s === 0)).toHaveLength(7);
  expect(frame.sides!.slice(0, 7).some(s => s === 1)).toBe(true);
  expect(new Set(frame.sides!.map((s, i) => `${s}:${frame.positions![i]}`)).size).toBe(12);
  for (const e of replay.events.filter(e => e.time >= 6 && !e.kind)) expect(frame.sides![e.attacker]).not.toBe(frame.sides![e.target]);
  expect([left, right]).toEqual(original);
});
it('Hope executes only the first killer and cannot revive the executed unit', () => {
  const left = team(); left[0].baseStats.attack = 10000; left[0].baseStats.speed = 10000; left[0].extraAbilities = [170732]; left[1].extraAbilities = [134263];
  const right = team(); right.forEach(c => c.baseStats.hp = 20);
  const replay = simulateBattle(left, right, rng(), 'hope');
  const executions = replay.events.filter(e => e.kind === 'execute');
  expect(executions).toHaveLength(1); expect(executions[0].attacker).toBe(0);
  expect(replay.events.some(e => e.kind === 'revive' && e.target === 0)).toBe(false);
});
it('Itomori decides at 20 seconds using summed percentages, including extra members', () => {
  const replay = simulateBattle(team(7), team(), rng(), 'itomori');
  expect(replay.duration).toBe(20);
  const last = replay.frames!.at(-1)!;
  const totals = [last.hp.slice(0, 7), last.hp.slice(7)].map(side => side.reduce((a, b) => a + b / 500, 0));
  expect(replay.winner).toBe(totals[0] >= totals[1] ? 'left' : 'right');
});
it('Itomori ties favor the player', () => {
  const left = team(), right = team(); [...left, ...right].forEach(c => c.baseStats.speed = 0.01);
  expect(simulateBattle(left, right, rng(), 'itomori').winner).toBe('left');
});
it('Itomori impact ends the battle even when a living Witch remains', () => {
  const left = team(7), right = team();
  [...left, ...right].forEach(c => c.baseStats.speed = 0.01);
  left[0].soulGem = true;
  left[0].baseStats.hp = 100;
  right[0].baseStats.speed = 125;
  const before = structuredClone([left, right]);
  const replay = simulateBattle(left, right, () => 0, 'itomori');
  expect(replay.duration).toBe(20);
  expect(replay.winner).toBe('right');
  expect(replay.frames!.at(-1)!.witches![0]).toBe(true);
  expect(replay.frames!.at(-1)!.hp[0]).toBeGreaterThan(0);
  expect([left, right]).toEqual(before);
});
it('Morioh instantly kills one random character from each team at start', () => {
  const replay = simulateBattle(team(), team(), rng(), 'morioh');
  const executions = replay.events.filter(e => e.kind === 'execute' && e.time === 0);
  expect(executions).toHaveLength(2);
  expect(executions[0].target).toBeLessThan(5);
  expect(executions[1].target).toBeGreaterThanOrEqual(5);
  expect(replay.frames![0].hp[executions[0].target]).toBe(0);
  expect(replay.frames![0].hp[executions[1].target]).toBe(0);
});
it('Hell heralds the Darkness Devil, damages all units and applies WEAKENED', () => {
  const replay = simulateBattle(team(), team(), rng(456), 'hell');
  const herald = replay.events.find(e => e.ability?.includes('Darkness Devil'));
  expect(herald).toBeDefined();
  const weakened = replay.events.filter(e => e.ability?.includes('cuts off') || e.ability === 'WEAKENED');
  expect(weakened.length).toBeGreaterThan(0);
});
it('Infinite Castle isolates matchups into rooms and changes rooms every 8s', () => {
  const replay = simulateBattle(team(), team(), rng(), 'infinite_castle');
  const roomChanges = replay.events.filter(e => e.ability?.includes('The rooms change'));
  expect(roomChanges.length).toBeGreaterThan(0);
  const f0 = replay.frames![0];
  expect(f0.castleRooms).toBeDefined();
  expect(f0.castleRooms!.some(r => r === 1)).toBe(true);
});
it('Inaba announces the thick fog at the start of battle', () => {
  const replay = simulateBattle(team(), team(), rng(), 'inaba');
  const fog = replay.events.find(e => e.ability?.includes('thick fog'));
  expect(fog).toBeDefined();
  expect(fog!.time).toBe(0);
});
it('Tracen Academy triggers periodic random student effects', () => {
  const replay = simulateBattle(team(), team(), rng(), 'tracen');
  const studentEvents = replay.events.filter(e => e.ability && (
    e.ability.includes('Gold Ship') ||
    e.ability.includes('Shinko Windy') ||
    e.ability.includes('Agnes Tachyon') ||
    e.ability.includes('Oguri Cap')
  ));
  expect(studentEvents.length).toBeGreaterThan(0);
});
it('Alcatraz Tower allows true free-for-all attacks across allies and enemies', () => {
  const replay = simulateBattle(team(), team(), rng(), 'alcatraz');
  const announcement = replay.events.find(e => e.ability?.includes('Battle Royale'));
  expect(announcement).toBeDefined();
  const teamAttacks = replay.events.filter(e => e.attacker >= 0 && e.target >= 0 && (
    (e.attacker < 5 && e.target < 5) || (e.attacker >= 5 && e.target >= 5)
  ) && !e.kind);
  expect(teamAttacks.length).toBeGreaterThan(0);
});
it('Alcatraz Tower simulates 4-way battle royale when all opponent teams are present', () => {
  const t1 = team(), t2 = team(), t3 = team(), t4 = team();
  const replay = simulateBattle(t1, t2, rng(), 'alcatraz', [t3, t4]);
  expect(replay.units).toHaveLength(20);
  expect(replay.teamCounts).toEqual([5, 5, 5, 5]);
  expect(replay.events.some(e => e.ability?.includes('Battle Royale'))).toBe(true);
  expect(['left', 'right', 'draw']).toContain(replay.winner);
  expect(replay.frames!.every(frame => frame.sides && frame.sides.length === 20)).toBe(true);
});
it('Axis reinforces left with Amuro, Bright, Hathaway and right with Char, Quess, Gyunei', () => {
  const left = team(), right = team();
  const replay = simulateBattle(left, right, rng(), 'axis');
  expect(replay.units).toHaveLength(16);
  expect(replay.leftCount).toBe(8);
  expect(replay.units.map(u => u.name)).toContain('Ray, Amuro');
  expect(replay.units.map(u => u.name)).toContain('Noa, Bright');
  expect(replay.units.map(u => u.name)).toContain('Noa, Hathaway');
  expect(replay.units.map(u => u.name)).toContain('Aznable, Char');
  expect(replay.units.map(u => u.name)).toContain('Paraya, Quess');
  expect(replay.units.map(u => u.name)).toContain('Guss, Gyunei');
});
it('Totsuki Culinary Academy periodically heals the lowest HP unit by 30%', () => {
  const left = team(), right = team();
  const replay = simulateBattle(left, right, rng(), 'tootsuki');
  const heals = replay.events.filter(e => e.kind === 'heal' && e.ability?.includes('Shokugeki'));
  expect(heals.length).toBeGreaterThan(0);
});
it('all stages finish with finite state when combined with implemented abilities', () => {
  for (const stage of Object.keys(STAGES) as StageId[]) {
    const left = team(), right = team();
    [...left, ...right].forEach((c, i) => c.extraAbilities = [[4004, 175198, 40882], [170732, 134263], [87275, 171437], [22036, 434], [196899, 16412]][i % 5]);
    const replay = simulateBattle(left, right, rng(), stage);
    expect(replay.duration).toBeLessThanOrEqual(120);
    expect(replay.frames!.every(f => f.hp.every(Number.isFinite))).toBe(true);
  }
});
