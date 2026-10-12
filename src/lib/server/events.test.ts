import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';
import { Engine } from './engine';
import { Store } from './store';
import { CAPTIVE_IDS, MARINE_IDS } from '../events';
import type { JourneyCharacter } from '../types';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('malgacha-event-test-')) throw new Error('Unsafe test cleanup'); await rm(root, { recursive: true, force: true }); } });
async function setup(event: 'creature' | 'marine') {
  const root = await mkdtemp(join(tmpdir(), 'malgacha-event-test-')); roots.push(root);
  const store = new Store(root), engine = new Engine(store, { lists: async () => [], cast: async () => [] }, 0);
  const job = await engine.create('demo', true, true, 'journeys');
  for (let i = 0; i < 300 && (await store.getJob(job.id))!.state !== 'complete'; i++) await sleep(50);
  const team = await engine.journeyTeam(job.id), saved = (await store.getJob(job.id))!;
  saved.encounter = { teams: [team, team, team], events: [{ id: event, status: 'choice' }, null, null] };
  await store.saveJob(saved); return { store, engine, id: job.id, team };
}
it('declining advances once, costs no lives, and cannot be used as a free battle', async () => {
  const { engine, id } = await setup('marine');
  const result = await engine.journeyEvent(id, { index: 0, choice: 'no' });
  expect(result.arenaWins).toBe(1); expect(result.lives).toBe(3);
  expect((await engine.journeyEvent(id, { index: 0, choice: 'no' })).arenaWins).toBe(1);
  await expect(engine.journeyBattle(id, 0, undefined, 'idle')).rejects.toThrow('no battle');
});
it('saves a Soul Gem on exactly one eligible unit and advances once with a fifth-floor item', async () => {
  const { engine, store, id, team } = await setup('creature');
  const saved = (await store.getJob(id))!; saved.arenaWins = 4; await store.saveJob(saved);
  await engine.journeyEvent(id, { index: 0, choice: 'yes' });
  await expect(engine.journeyOpponents(id)).rejects.toThrow('Finish your event');
  await expect(engine.journeyEvent(id, { index: 0, target: 'missing' })).rejects.toThrow('eligible');
  const result = await engine.journeyEvent(id, { index: 0, target: team[0].instanceId });
  expect(result.arenaWins).toBe(5); expect(result.itemReward?.choices).toHaveLength(3);
  expect((result.characters[0] as JourneyCharacter).soulGem).toBe(true);
  expect((result.characters[0] as JourneyCharacter).baseStats).toEqual(team[0].baseStats);
  expect((await engine.journeyEvent(id, { index: 0, target: team[1].instanceId })).characters).toEqual(result.characters);
});
it('builds five distinct Marines, saves a rescue on victory, and replaces one chosen slot once', async () => {
  const { engine, store, id, team } = await setup('marine');
  const start = await engine.journeyEvent(id, { index: 0, choice: 'yes' });
  const marines = start.encounter!.teams[0];
  expect(new Set(marines.map(c => c.id)).size).toBe(5); expect(marines.every(c => MARINE_IDS.includes(c.id) && c.marine)).toBe(true);
  await expect(engine.journeyBattle(id, 1, undefined, 'idle')).rejects.toThrow('already selected');
  const saved = (await store.getJob(id))!;
  saved.starterTeam = team.map(c => ({ ...c, baseStats: { hp: 10000, attack: 10000, defense: 10000, speed: 10000 } })); await store.saveJob(saved);
  const fight = await engine.journeyBattle(id, 0, undefined, 'clout');
  expect(fight.result?.mode).toBe('idle'); expect(fight.result?.winner).toBe('left');
  const reward = fight.encounter!.events![0]!.reward!; expect(CAPTIVE_IDS).toContain(reward.id);
  await expect(engine.journeyOpponents(id)).rejects.toThrow('Finish your event');
  expect((await engine.journeyBattle(id, 0, undefined, 'idle')).encounter!.events![0]!.reward).toEqual(reward);
  const rescued = await engine.journeyEvent(id, { index: 0, target: team[1].instanceId });
  expect(rescued.characters[1]).toEqual(reward);
  expect((await engine.journeyEvent(id, { index: 0, target: team[2].instanceId })).characters).toEqual(rescued.characters);
});
it('Marine battle losses cost one life and give no rescue', async () => {
  const { engine, store, id, team } = await setup('marine');
  await engine.journeyEvent(id, { index: 0, choice: 'yes' });
  const saved = (await store.getJob(id))!;
  saved.starterTeam = team.map(c => ({ ...c, baseStats: { hp: 1, attack: 1, defense: 1, speed: 1 } })); await store.saveJob(saved);
  const fight = await engine.journeyBattle(id, 0, undefined, 'idle');
  expect(fight.lives).toBe(2); expect(fight.encounter!.events![0]!.status).toBe('complete');
  expect(fight.encounter!.events![0]!.reward).toBeUndefined();
});
