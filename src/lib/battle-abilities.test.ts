import { expect, it } from 'vitest';
import { simulateBattle, attackInterval } from './autobattle';
import { applyBurn, keywordsFor } from './battle-abilities';
import type { JourneyCharacter } from './types';
function teams(): JourneyCharacter[][] { return [0, 1].map(side => Array.from({ length: 5 }, (_, i) => ({ id: 900000 + side * 5 + i, name: 'Unit', instanceId: String(side * 5 + i), image: null, url: '', titles: [], statRarity: 'N', baseStats: { hp: 500, attack: 125, defense: 125, speed: 125 } }))); }
it('Burn refreshes one timer without postponing its next tick', () => {
  const burn = applyBurn(undefined, 2, 0);
  expect(burn).toEqual({ until: 8, next: 3, source: 0 });
  expect(applyBurn(burn, 2.5, 1)).toEqual({ until: 8.5, next: 3, source: 1 });
});
it('Gabimaru applies periodic 3% burn damage on either side', () => {
  for (const side of [0, 1]) {
    const t = teams(); t[side][0].id = 171437;
    const battle = simulateBattle(t[0], t[1], () => 0);
    const applied = battle.events.find(e => e.kind === 'status')!;
    const tick = battle.events.find(e => e.kind === 'burn')!;
    expect(tick.time).toBeCloseTo(applied.time + 1);
    expect(tick.damage).toBe(15);
    expect(tick.target < 5).toBe(side === 1);
  }
});
it('Koyomi heals every four seconds and cannot exceed max HP', () => {
  const t = teams(); t[1][0].id = 22036;
  const b = simulateBattle(t[0], t[1], () => 0);
  const heal = b.events.find(e => e.ability === 'Koyomi Vamp')!;
  expect(heal.time).toBe(4); expect(heal.damage).toBe(-50); expect(heal.hp).toBeLessThanOrEqual(500);
});
it('Turbo doubles Speed for ten seconds then preserves accumulated ATB when it expires', () => {
  const t = teams(); t[0][0].id = 196899;
  const b = simulateBattle(t[0], t[1], () => 0);
  expect(b.frames![0].speed[0]).toBe(250);
  expect(b.events.find(e => e.attacker === 0 && !e.kind)!.time).toBeCloseTo(attackInterval(250));
  expect(b.frames!.find(f => f.time === 10)!.speed[0]).toBe(125);
});
it('God Hand attracts single-target attacks and reduces their damage', () => {
  const t = teams(); t[1][2].id = 16412;
  expect(keywordsFor(t[1][2])).toEqual(['TAUNT']);
  const b = simulateBattle(t[0], t[1], () => 0);
  const hits = b.events.filter(e => !e.kind && e.attacker < 5 && e.time < 4);
  expect(hits).toHaveLength(5);
  expect(hits.every(e => e.target === 7 && e.damage === 18.75)).toBe(true);
});
it('Marcille revives the first fallen ally once at full HP', () => {
  const t = teams(); t[1][1].id = 134263; t[1][0].baseStats.hp = 1;
  const b = simulateBattle(t[0], t[1], () => 0);
  const revives = b.events.filter(e => e.ability === 'Forbidden Magic');
  expect(revives).toHaveLength(1); expect(revives[0].target).toBe(5); expect(revives[0].hp).toBe(1);
});
it('Drivers High buffs other allies only and disappears when Onizuka dies without editing base stats', () => {
  const t = teams(); t[0][0].id = 434; t[0][0].baseStats.hp = 1;
  const before = structuredClone(t);
  const b = simulateBattle(t[0], t[1], () => 0);
  expect(b.frames![0].maxHP[1]).toBe(550);
  expect(b.frames![0].maxHP[0]).toBe(1);
  expect(b.frames!.find(f => f.hp[0] === 0)!.maxHP[1]).toBe(500);
  expect(t).toEqual(before);
});
it('Denji waits for another death, revives at 15%, and starts a fresh ATB cycle', () => {
  const t = teams(); t[1][0].id = 170732; t[1][0].baseStats.hp = 1; t[1][1].baseStats.hp = 1;
  const b = simulateBattle(t[0], t[1], () => 0);
  const revive = b.events.find(e => e.ability === 'Chainsaw Heart')!;
  expect(revive.hp).toBe(0.15);
  const deathIndex = b.events.findIndex(e => e.target === 5 && e.hp === 0);
  const revivalIndex = b.events.indexOf(revive);
  expect(b.events.slice(deathIndex + 1, revivalIndex).some(e => e.target !== 5 && e.hp === 0)).toBe(true);
  expect(b.frames!.filter(f => f.hp[5] === 0).every(f => f.atb[5] === 0)).toBe(true);
});
