import { expect, it } from 'vitest';
import { simulateBattle } from './engine';
import { attackDamage } from './formulas';
import { unitAtFrame, visibleBattleUnits } from './presentation';
import { BOSS_ABILITY_RULES, BOSSES, DEOXYS_FORMES, SAHAQUIEL_ID } from '../bosses';
import { IMPLEMENTED_ABILITIES, implementationsFor } from './abilities';
import type { JourneyCharacter } from '../types';

const players = (size = 5): JourneyCharacter[] => Array.from({ length: size }, (_, i) => ({ id: 900000 + i, name: `Player ${i}`, instanceId: `player-${i}`, image: null, url: '', titles: [], statRarity: 'N', baseStats: { hp: 10000, attack: 125, defense: 125, speed: 125 } }));
function boss(id: number, hp = 1000): JourneyCharacter {
  const definition = BOSSES.find(b => b.id === id)!;
  return { id, name: definition.name, image: definition.image, url: '', titles: [], boss: true, instanceId: 'boss', statRarity: 'UR', baseStats: { hp, attack: 200, defense: 200, speed: 200 } };
}
const rng = (initial = 391) => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); };

it('keeps boss abilities out of ordinary characters and Stand Arrow rewards', () => {
  for (const entry of BOSSES) expect(IMPLEMENTED_ABILITIES).not.toContain(entry.id);
  expect(implementationsFor({ ...boss(7407), boss: false })).toEqual([]);
  expect(implementationsFor(boss(240069))).toEqual([]);
});
it('Grand Fisher summons an attacking quarter-stat Taunt lure, then replaces it ten seconds after death', () => {
  const left = players(); left.forEach(c => { c.baseStats.speed = 30; c.baseStats.attack = 300; });
  const right = [boss(7345)], original = structuredClone([left, right]);
  const replay = simulateBattle(left, right, () => 0);
  const summons = replay.events.filter(e => e.kind === 'summon');
  expect(summons[0].time).toBe(10);
  expect(summons.length).toBeGreaterThan(1);
  const lure = summons[0].target;
  expect(replay.units[lure]).toMatchObject({ id: 22849, name: 'LURE', keywords: ['TAUNT'], baseStats: { hp: 250, attack: 50, defense: 50, speed: 50 } });
  expect(replay.events.some(e => e.attacker === lure && !e.kind)).toBe(true);
  const firstDeath = replay.events.find(e => e.target === lure && e.hp === 0)!;
  expect(summons[1].time).toBeCloseTo(firstDeath.time + 10);
  const hp = replay.units.map(unit => unit.baseStats.hp);
  for (const event of replay.events) {
    if (event.attacker < 5 && event.damage > 0 && hp[lure] > 0 && event.time >= 10) expect(event.target).toBe(lure);
    hp[event.target] = event.hp;
  }
  expect(visibleBattleUnits(replay, replay.frames![0], 1)).toEqual([5]);
  const spawned = replay.frames!.find(frame => frame.time === 10)!;
  expect(visibleBattleUnits(replay, spawned, 1)).toEqual([5, lure]);
  expect([left, right]).toEqual(original);
});
it('the lure also protects Grand Fisher from newly targeted area attacks', () => {
  const left = players(); left[0].extraAbilities = [40882];
  const replay = simulateBattle(left, [boss(7345, 10000)], rng());
  const hit = replay.events.filter(e => e.time === 16 && e.kind === 'rumbling');
  expect(hit).toHaveLength(1);
  expect(hit[0].target).toBe(6);
});
it('Kurama charges every five seconds and deals 2.5x calculated damage to all enemies', () => {
  const replay = simulateBattle(players(), [boss(7407)], () => 0);
  const blast = replay.events.filter(e => e.kind === 'boss-attack' && e.time === 5);
  expect(blast.map(e => e.target)).toEqual([0, 1, 2, 3, 4]);
  expect(blast.every(e => e.damage === attackDamage(200, 125) * 2.5)).toBe(true);
  expect(blast.filter(e => e.ability === 'Tailed Beast Bomb')).toHaveLength(1);
  expect(replay.frames![0].bossGauges?.[0]).toMatchObject({ progress: 0, remaining: 5, cooldown: 5, absolute: false });
  expect(replay.frames!.find(frame => frame.time === 5)!.bossGauges?.[0].remaining).toBe(5);
});
it('Gun Fiend takes the weakest original BST, breaks ties by slot, fills HP and restores the saved roster', () => {
  const left = players();
  for (const i of [2, 3]) left[i].baseStats = { hp: 80, attack: 80, defense: 80, speed: 80 };
  const right = [boss(184112, 1)], original = structuredClone([left, right]);
  const replay = simulateBattle(left, right, () => 0);
  const capture = replay.events.filter(e => e.kind === 'capture');
  expect(capture).toHaveLength(1); expect(capture[0].target).toBe(2);
  const transformed = replay.frames!.find(frame => frame.unitOverrides?.[5]?.bossId === 184112)!;
  const fiend = unitAtFrame(replay, transformed, 5);
  expect(fiend).toMatchObject({ id: left[2].id, name: left[2].name, boss: true, bossId: 184112, baseStats: { hp: 80.5, attack: 180, defense: 180, speed: 180 } });
  expect(transformed.hp[5]).toBe(transformed.maxHP[5]);
  expect(transformed.hp[2]).toBe(0);
  expect(replay.events.some(e => e.attacker === 2 && e.time >= capture[0].time)).toBe(false);
  expect(replay.events.filter(e => e.kind === 'transform' && e.ability === 'Gun Fiend')).toHaveLength(1);
  expect(replay.winner).toBe('left');
  expect([left, right]).toEqual(original);
});
it('Gun Fiend capturing the last player unit is a player loss', () => {
  const replay = simulateBattle(players(1), [boss(184112, 1)], () => 0);
  expect(replay.winner).toBe('right'); expect(replay.left).toBe(0); expect(replay.right).toBe(1);
});
it('Deoxys starts normal and switches every three seconds with replaceable modifiers and portraits', () => {
  const left = players(), right = [boss(74017, 100000)], original = structuredClone(right);
  const replay = simulateBattle(left, right, rng());
  expect(unitAtFrame(replay, replay.frames![0], 5).image).toBe(DEOXYS_FORMES.normal.image);
  const changes = replay.events.filter(e => e.kind === 'transform' && e.ability === 'Form Change');
  expect(changes.length).toBeGreaterThan(5);
  let previous = 'normal'; const seen = new Set(['normal']);
  for (const event of changes) {
    expect(event.time / 3).toBeCloseTo(Math.round(event.time / 3), 8);
    const frame = replay.frames!.filter(frame => frame.time === event.time && frame.unitOverrides?.[5]?.bossForm).at(-1)!;
    const unit = unitAtFrame(replay, frame, 5), form = unit.bossForm!;
    expect(form).not.toBe(previous); previous = form; seen.add(form);
    expect(unit.image).toBe(DEOXYS_FORMES[form].image);
    expect(unit.battleModifiers).toEqual(DEOXYS_FORMES[form].modifiers);
    expect(frame.speed[5]).toBe(200 + DEOXYS_FORMES[form].modifiers.speed);
    expect(frame.maxHP[5]).toBe(100000);
    expect(unit.baseStats).toEqual(right[0].baseStats);
  }
  expect(seen.size).toBe(4);
  expect(right).toEqual(original);
});
it('Deoxys resets to Normal Forme at the start even if input metadata contains a prior forme', () => {
  const enemy = { ...boss(74017), bossForm: 'speed' as const, image: DEOXYS_FORMES.speed.image, battleModifiers: { speed: 60, attack: -30, defense: -30 } };
  const before = structuredClone(enemy);
  const replay = simulateBattle(players(), [enemy], () => 0);
  expect(unitAtFrame(replay, replay.frames![0], 5).bossForm).toBe('normal');
  expect(unitAtFrame(replay, replay.frames![0], 5).image).toBe(DEOXYS_FORMES.normal.image);
  expect(replay.frames![0].speed[5]).toBe(200);
  expect(enemy).toEqual(before);
});
it('Sahaquiel cannot attack and ends the match at 20s despite time stop and revival passives', () => {
  const left = players(); left[0].extraAbilities = [4004]; left[1].extraAbilities = [134263]; left[2].extraAbilities = [170732];
  const replay = simulateBattle(left, [boss(SAHAQUIEL_ID, 100000)], () => 0);
  expect(replay.duration).toBe(BOSS_ABILITY_RULES.angelSeconds); expect(replay.winner).toBe('right');
  expect(replay.events.some(e => e.attacker === 5 && !e.kind)).toBe(false);
  expect(replay.events.filter(e => e.kind === 'annihilate')).toHaveLength(5);
  expect(replay.frames!.at(-1)!.hp.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
  expect(replay.frames![0].bossGauges?.[0]).toMatchObject({ remaining: 20, absolute: true });
  expect(replay.stops!.length).toBeGreaterThan(0);
});
it('defeating Sahaquiel before the deadline prevents its wipe', () => {
  const replay = simulateBattle(players(), [boss(SAHAQUIEL_ID, 1)], () => 0);
  expect(replay.duration).toBeLessThan(20); expect(replay.winner).toBe('left');
  expect(replay.events.some(e => e.kind === 'annihilate')).toBe(false);
});
