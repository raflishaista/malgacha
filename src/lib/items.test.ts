import { expect, it } from 'vitest';
import { applyInventoryAction, emptySlot, newUnit } from './server/inventory';
import { ITEMS, equipmentBonuses, rewardChoices, type ItemId } from './items';
import { abilityIds, hasAbility } from './battle-abilities';
import { simulateBattle } from './autobattle';
import type { Job, JourneyCharacter } from './types';
const unit = (id: number) => newUnit({ id, name: String(id), favorites: id === 175198 ? 20000 : 0, image: null, url: '', titles: [] }, () => 0.5);
function fixture(): Job {
  const team = [17, 90001, 90002, 90003, 90004].map(unit);
  return { id: 'test', username: 'demo', scope: 'journeys', state: 'complete', demo: true, includePlanned: true, createdAt: '', updatedAt: '', titles: [], listed: true, done: [], failures: {}, message: '', pool: Object.fromEntries([...team, unit(175198), unit(90005)].map(c => { const { instanceId, baseStats, statRarity, ...character } = c; return [c.id, character]; })), starterTeam: team, inventory: [] };
}
function grant(job: Job, itemId: ItemId) { const instanceId = String(job.inventory!.length) + itemId; job.inventory!.push({ instanceId, itemId }); return instanceId; }
it('unique relics are excluded from distinct reward choices', () => {
  for (let i = 0; i < 100; i++) {
    const choices = rewardChoices([{ instanceId: 'x', itemId: 'merry' }, { instanceId: 'y', itemId: 'sunny' }]);
    expect(new Set(choices).size).toBe(3); expect(choices).not.toContain('merry'); expect(choices).not.toContain('sunny');
  }
});
it('ship rewards add two saved slots and a reward cannot be claimed twice', () => {
  const job = fixture();
  for (const id of ['merry', 'sunny'] as const) {
    job.itemReward = { id, choices: [id, 'finger', 'arrow'] };
    applyInventoryAction(job, { action: 'claim', item: id, reward: id }, () => 0.5);
    expect(() => applyInventoryAction(job, { action: 'claim', item: id, reward: id })).toThrow();
  }
  expect(job.starterTeam).toHaveLength(7); expect(job.inventory).toHaveLength(2);
});
it('equipment stacks to three, consumes bag instances and leaves base stats unchanged', () => {
  const job = fixture(), target = (job.starterTeam as JourneyCharacter[])[0], before = structuredClone(target.baseStats);
  for (let i = 0; i < 3; i++) applyInventoryAction(job, { action: 'equip', item: grant(job, 'nichirin'), target: target.instanceId });
  expect(equipmentBonuses(job.starterTeam as JourneyCharacter[])[0].attack).toBe(45);
  const fourth = grant(job, 'airgear');
  expect(() => applyInventoryAction(job, { action: 'equip', item: fourth, target: target.instanceId })).toThrow('three');
  expect(job.inventory).toHaveLength(1); expect(target.baseStats).toEqual(before);
});
it('White Whistle excludes its wearer and stacks onto the first highest-BST ally', () => {
  const team = [unit(90001), unit(90002), unit(90003)];
  team[0].equipment = [{ instanceId: 'a', itemId: 'whistle' }, { instanceId: 'b', itemId: 'whistle' }];
  const buffs = equipmentBonuses(team);
  expect(buffs[0].attack).toBe(0); expect(buffs[1].attack).toBe(team[1].baseStats.attack * 0.1); expect(buffs[2].attack).toBe(0);
});
it('Sukuna transformations are new UR instances, permit duplicates and discard old equipment', () => {
  const job = fixture(), team = job.starterTeam as JourneyCharacter[];
  team[0].equipment = [{ instanceId: 'sword', itemId: 'nichirin' }];
  const old = team[0].instanceId;
  for (const index of [0, 1]) applyInventoryAction(job, { action: 'use', item: grant(job, 'finger'), target: team[index].instanceId }, () => 0.5);
  expect(team[0].id).toBe(175198); expect(team[1].id).toBe(175198); expect(team[0].instanceId).not.toBe(old);
  expect(Object.values(team[0].baseStats).reduce((a, b) => a + b)).toBe(600); expect(team[0].equipment).toBeUndefined();
});
it('Stand Arrow grants new abilities up to three or leaves an empty slot on failure', () => {
  const job = fixture(), team = job.starterTeam as JourneyCharacter[], target = team[0];
  for (let i = 0; i < 2; i++) applyInventoryAction(job, { action: 'use', item: grant(job, 'arrow'), target: target.instanceId }, () => 0);
  expect(abilityIds(target)).toHaveLength(3);
  const excess = grant(job, 'arrow');
  expect(() => applyInventoryAction(job, { action: 'use', item: excess, target: target.instanceId })).toThrow('three');
  expect(job.inventory!.some(i => i.instanceId === excess)).toBe(true);
  applyInventoryAction(job, { action: 'use', item: excess, target: team[1].instanceId }, () => 0.9);
  expect(team[1].empty).toBe(true); expect(team[1].equipment).toBeUndefined();
});
it('Master Ball draws a UR or keeps the item when no UR exists', () => {
  const job = fixture(), team = job.starterTeam as JourneyCharacter[];
  applyInventoryAction(job, { action: 'use', item: grant(job, 'masterball'), target: team[0].instanceId }, () => 0.5);
  expect(team[0].statRarity).toBe('UR'); delete job.pool['175198'];
  const item = grant(job, 'masterball');
  expect(() => applyInventoryAction(job, { action: 'use', item, target: team[0].instanceId })).toThrow('No UR');
  expect(job.inventory!.some(i => i.instanceId === item)).toBe(true);
});
it('extra units, empty slots and equipment participate in combat without editing base stats', () => {
  const team = Array.from({ length: 7 }, (_, i) => unit(90000 + i));
  team[0].equipment = [{ instanceId: 'air', itemId: 'airgear' }];
  team[3] = emptySlot();
  const before = structuredClone(team), replay = simulateBattle(team, Array.from({ length: 5 }, (_, i) => unit(91000 + i)), () => 0.2);
  expect(replay.leftCount).toBe(6); expect(replay.units).toHaveLength(11);
  expect(replay.frames![0].speed[0]).toBe(team[0].baseStats.speed + 15); expect(team).toEqual(before);
});
it('granted timed abilities run independently and Shrine pulses five times only', () => {
  const team = Array.from({ length: 5 }, (_, i) => unit(90000 + i));
  team[0].extraAbilities = [175198, 22036, 40882];
  const opponents = Array.from({ length: 5 }, (_, i) => ({ ...unit(92000 + i), baseStats: { hp: 10000, attack: 1, defense: 125, speed: 125 } }));
  expect(hasAbility(team[0], 175198)).toBe(true);
  const replay = simulateBattle(team, opponents, () => 0.2);
  const shrine = replay.events.filter(e => e.kind === 'shrine');
  expect(shrine).toHaveLength(25); expect(new Set(shrine.map(e => e.time)).size).toBe(5);
  expect(replay.events.some(e => e.ability === 'Koyomi Vamp')).toBe(true);
  expect(replay.events.some(e => e.ability === 'Rumbling')).toBe(true);
});
