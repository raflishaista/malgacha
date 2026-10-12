import { expect, it } from 'vitest';
import { CAPTIVE_IDS, MARINE_IDS, eventCharacter, keywordBonuses, rollEvents } from './events';
import { effectiveStats, keywordsFor } from './battle-abilities';
import { simulateBattle } from './autobattle';
import type { JourneyCharacter } from './types';
const team = (): JourneyCharacter[] => Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, instanceId: String(i), name: String(i), image: null, url: '', titles: [], statRarity: 'N', baseStats: { hp: 500, attack: 125, defense: 125, speed: 125 } }));
it('rolls an independent 15% event chance for each card, evenly splitting event types', () => {
  let seed = 123; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const events = Array.from({ length: 40000 }, () => rollEvents(random)).flat();
  expect(events.filter(Boolean).length / events.length).toBeCloseTo(.15, 2);
  expect(events.filter(e => e?.id === 'marine').length / events.filter(Boolean).length).toBeCloseTo(.5, 2);
});
it('contains 21 curated Marines and all five captive rewards with MAL metadata', () => {
  expect(MARINE_IDS).toHaveLength(21); expect(new Set(MARINE_IDS).size).toBe(21);
  for (const id of [...MARINE_IDS, ...CAPTIVE_IDS]) { const c = eventCharacter(id); expect(c.id).toBe(id); expect(c.image).toMatch(/^https:\/\/cdn.myanimelist.net\//); expect(c.titles[0].name).toBe('One Piece'); }
});
it('applies keyword boosts without changing saved base stats or boosting Soul Gem HP', () => {
  const unit = { ...team()[0], soulGem: true }, before = structuredClone(unit);
  const stats = effectiveStats(unit, false, 0);
  expect(stats.hp).toBe(500); expect(stats.attack).toBeCloseTo(143.75); expect(stats.speed).toBeCloseTo(143.75);
  expect(keywordBonuses(unit).hp).toBe(0); expect(unit).toEqual(before);
  expect(keywordsFor(unit)).toContain('SOUL GEM');
  const marine = effectiveStats({ ...unit, soulGem: false, marine: true }, false, 0);
  expect(marine.hp).toBe(525); expect(marine.attack).toBe(131.25);
});
it('transforms only once on death, attacks both sides, can be hit by both sides, and restores original roster', () => {
  const left = team(), right = team();
  left[0].soulGem = true; left[0].baseStats = { hp: 10, attack: 1, defense: 125, speed: 100000 };
  [...left.slice(1), ...right].forEach(c => { c.baseStats.attack = 1; c.baseStats.speed = .01; });
  right[0].baseStats.attack = 1000; right[0].baseStats.speed = 10000;
  left[1].baseStats.speed = 10000;
  const before = structuredClone([left, right]);
  const replay = simulateBattle(left, right, () => 0);
  const transformation = replay.events.find(e => e.kind === 'transform')!;
  expect(transformation).toBeDefined(); expect(replay.events.filter(e => e.kind === 'transform')).toHaveLength(1);
  const frame = replay.frames!.find(f => f.witches?.[0])!;
  expect(frame.maxHP[0]).toBeCloseTo(11); expect(frame.speed[0]).toBeCloseTo(126500);
  const witchHits = replay.events.filter(e => e.attacker === 0 && !e.kind && e.time > transformation.time);
  expect(witchHits.some(e => e.target < 5)).toBe(true); expect(witchHits.some(e => e.target >= 5)).toBe(true);
  const hitsOnWitch = replay.events.filter(e => e.target === 0 && !e.kind && e.time > transformation.time);
  expect(hitsOnWitch.some(e => e.attacker < 5)).toBe(true); expect(hitsOnWitch.some(e => e.attacker >= 5)).toBe(true);
  expect([left, right]).toEqual(before); expect(replay.units[0].witch).toBeUndefined();
});
it('requires defeating a Witch even after the enemy team is eliminated', () => {
  const left = team(), right = team();
  left[0].soulGem = true; left[0].baseStats.hp = 10;
  left.slice(1).forEach(c => { c.baseStats.attack = 10000; c.baseStats.speed = 1; });
  right.forEach(c => c.baseStats.attack = 10000);
  const replay = simulateBattle(left, right, () => 0);
  if (replay.winner === 'left') expect(replay.frames!.at(-1)!.hp[0]).toBe(0);
  expect(replay.events.some(e => e.kind === 'transform')).toBe(true);
});
