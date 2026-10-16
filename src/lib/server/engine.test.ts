vi.mock('../events', async (importOriginal) => ({ ...await importOriginal<typeof import('../events')>(), rollEvents: () => [null, null, null] }));
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine } from './engine';
import { Store } from './store';
import { parseUsername } from './providers';
import type { Job, Title } from '../types';
import { BOSSES } from '../bosses';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('malgacha-test-')) throw new Error('Unsafe test cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});
async function setup() { const root = await mkdtemp(join(tmpdir(), 'malgacha-test-')); roots.push(root); return new Store(root); }
async function finished(store: Store, id: string) {
  for (let i = 0; i < 300; i++) {
    const job = (await store.getJob(id))!;
    if (['complete', 'partial', 'error', 'cancelled'].includes(job.state)) return job;
    await sleep(50);
  }
  throw new Error('Import did not finish.');
}
const title: Title = { id: 1, kind: 'anime', name: 'First', status: 'completed' };
const second: Title = { ...title, kind: 'manga', name: 'Second' };
const character = { id: 42, name: 'Shared character', image: null, url: 'https://myanimelist.net/character/42' };

describe('durable imports', () => {
  it('persists searched wish candidates separately and atomically spends seven balls on a replacement', async () => {
    const store=await setup(), searchCharacters=vi.fn(async()=>[{id:6127,name:'Shen Long',favorites:12000,image:null,url:'',titles:[]}]);
    const providers={lists:vi.fn(async()=>[]),cast:vi.fn(async()=>[]),searchCharacters};
    const engine=new Engine(store,providers,0), job=await engine.create('demo',true,true,'journeys');
    await finished(store,job.id);const team=await engine.journeyTeam(job.id), saved=(await store.getJob(job.id))!;
    saved.inventory=Array.from({length:7},(_,i)=>({instanceId:String(i),itemId:'dragonball'}));await store.saveJob(saved);
    expect((await engine.journeySearch(job.id,'Shen'))[0].id).toBe(6127);expect((await store.getJob(job.id))!.pool['6127']).toBeUndefined();
    const restarted=new Engine(store,providers,0), action={action:'wish' as const,character:6127,target:team[0].instanceId};
    const results=await Promise.allSettled([restarted.journeyInventory(job.id,action),restarted.journeyInventory(job.id,action)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const after=await restarted.journeyInventory(job.id);
    expect(after.characters[0].id).toBe(6127);expect(after.inventory).toHaveLength(0);
  });
  it('Future Machine resets a losing encounter once, keeps the relic and only charges the final loss across reloads', async () => {
    const store = await setup(), providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => []) };
    const engine = new Engine(store, providers, 0), job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);const team = await engine.journeyTeam(job.id), saved = (await store.getJob(job.id))!;
    saved.inventory = [{instanceId:'machine',itemId:'machine'}];
    saved.encounter = {teams:[[{...team[0],id:-1001,instanceId:'angel',boss:true,baseStats:{hp:10000000,attack:125,defense:125,speed:125}}]]};
    await store.saveJob(saved);
    const result = await engine.journeyBattle(job.id,0,undefined,'idle');
    expect(result.replay?.initialAttempt?.duration).toBe(20);expect(result.replay?.duration).toBe(20);expect(result.lives).toBe(2);expect(result.encounter?.machineUsed).toBe(true);expect(result.inventory).toEqual(saved.inventory);expect(result.characters).toEqual(team);
    const restarted = new Engine(store,providers,0), again = await restarted.journeyBattle(job.id,0,undefined,'idle');expect(again.lives).toBe(2);expect(again.replay).toEqual(result.replay);
  });
  it('persists a Gun Fiend loss once while restoring the captured player and keeping the boss floor pending', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const initial = await engine.journeyTeam(job.id);
    const host = { ...initial[0], id: 900000, baseStats: { hp: 1000, attack: 125, defense: 125, speed: 125 } };
    const definition = BOSSES.find(boss => boss.id === 184112)!;
    const enemy = { ...host, ...definition, url: '', instanceId: 'gun-devil', boss: true, baseStats: { hp: 1, attack: 200, defense: 200, speed: 200 } };
    const saved = (await store.getJob(job.id))!;
    saved.starterTeam = [host]; saved.arenaWins = 9; saved.encounter = { teams: [[enemy]] };
    await store.saveJob(saved);
    const result = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(result.result!.winner).toBe('right'); expect(result.lives).toBe(2); expect(result.arenaWins).toBe(9);
    expect(result.characters).toEqual([host]);
    const restarted = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const replayed = await restarted.journeyBattle(job.id, 0, undefined, 'idle');
    expect(replayed.lives).toBe(2); expect(replayed.characters).toEqual([host]);
    expect(replayed.replay!.frames!.some(frame => frame.unitOverrides?.[1]?.bossId === 184112)).toBe(true);
    expect((await restarted.journeyOpponents(job.id)).teams).toHaveLength(1);
    expect((await store.getJob(job.id))!.starterTeam).toEqual([host]);
  });
  it('deducts lives once per loss and resets the entire run on the third loss', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    for (let loss = 1; loss <= 3; loss++) {
      const saved = (await store.getJob(job.id))!;
      saved.arenaWins = 12; saved.inventory = [{ instanceId: 'boat', itemId: 'merry' }];
      saved.starterTeam = team.map(c => ({ ...c, favorites: 0, equipment: [{ instanceId: 'sword', itemId: 'nichirin' }] }));
      saved.encounter = { teams: [team.map(c => ({ ...c, favorites: 999999 }))] };
      await store.saveJob(saved);
      const fight = await engine.journeyBattle(job.id, 0, undefined, 'clout');
      expect(fight.lives).toBe(loss === 3 ? 3 : 3 - loss);
      expect(fight.gameOver).toBe(loss === 3);
      const retry = await engine.journeyBattle(job.id, 0, undefined, 'clout');
      expect(retry.characters).toEqual(fight.characters); expect(retry.lives).toBe(fight.lives);
    }
    const saved = (await store.getJob(job.id))!;
    expect(saved.arenaWins).toBe(0); expect(saved.inventory).toEqual([]);
    expect(saved.starterTeam).toHaveLength(5);
    expect(saved.starterTeam!.every(c => !('equipment' in c))).toBe(true);
    expect(saved.starterTeam!.some(c => 'instanceId' in c && team.some(old => old.instanceId === c.instanceId))).toBe(false);
    expect((await engine.journeyInventory(job.id)).lives).toBe(3);
    await engine.journeyReset(job.id);
    expect((await store.getJob(job.id))!.encounter).toBeUndefined();
  });
  it('awards an item after a non-boss fourth floor, keeps draws free, and clears pending rewards on reset', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    const saved = (await store.getJob(job.id))!;
    saved.lives = 2; saved.arenaWins = 3;
    saved.starterTeam = team.map(c => ({ ...c, baseStats: { hp: 10000, attack: 10000, defense: 10000, speed: 10000 } }));
    saved.encounter = { teams: [team] };
    await store.saveJob(saved);
    const fight = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(fight.arenaWins).toBe(4); expect(fight.itemReward!.choices).toHaveLength(3); expect(fight.lives).toBe(2);
    expect((await engine.journeyBattle(job.id, 0, undefined, 'idle')).itemReward).toEqual(fight.itemReward);
    const reset = await engine.journeyReset(job.id);
    expect(reset.itemReward).toBeNull(); expect(reset.arenaWins).toBe(0); expect(reset.lives).toBe(3);
    const fresh = (await store.getJob(job.id))!;
    fresh.encounter = { teams: [fresh.starterTeam as typeof team] };
    await store.saveJob(fresh);
    expect((await engine.journeyBattle(job.id, 0, undefined, 'clout')).lives).toBe(3);
  });
  it('persists one fourth-floor item reward, atomically claims it, and keeps inventory across reloads', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => []) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    const saved = (await store.getJob(job.id))!;
    saved.arenaWins = 7;
    saved.starterTeam = team.map(c => ({ ...c, baseStats: { hp: 10000, attack: 10000, defense: 10000, speed: 10000 } }));
    await store.saveJob(saved);
    const bossEncounter = await engine.journeyOpponents(job.id);
    expect(bossEncounter.stage).toBeDefined();
    expect((await store.getJob(job.id))!.encounter!.stage).toBeDefined();
    const fight = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(fight.replay!.stage).toBeDefined();
    expect(fight.itemReward!.choices).toHaveLength(3);
    expect((await engine.journeyBattle(job.id, 0, undefined, 'idle')).itemReward).toEqual(fight.itemReward);
    await expect(engine.journeyOpponents(job.id)).rejects.toThrow('Choose your item reward');
    const action = { action: 'claim' as const, item: fight.itemReward!.choices[0], reward: fight.itemReward!.id };
    const claims = await Promise.allSettled([engine.journeyInventory(job.id, action), engine.journeyInventory(job.id, action)]);
    expect(claims.filter(c => c.status === 'fulfilled')).toHaveLength(1);
    const restarted = new Engine(store, providers, 0);
    const inventory = await restarted.journeyInventory(job.id);
    expect(inventory.inventory).toHaveLength(1);
    expect(inventory.itemReward).toBeNull();
    await restarted.journeyOpponents(job.id);
    expect((await restarted.journeyInventory(job.id)).inventory).toEqual(inventory.inventory);
  });
  it('fills empty slots with the victory reward and saves equipped items without rerolling base stats', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    const saved = (await store.getJob(job.id))!;
    saved.inventory = [{ instanceId: 'sword', itemId: 'nichirin' }];
    await store.saveJob(saved);
    await engine.journeyInventory(job.id, { action: 'equip', item: 'sword', target: team[0].instanceId });
    const equipped = await engine.journeyTeam(job.id);
    expect(equipped[0].baseStats).toEqual(team[0].baseStats);
    expect(equipped[0].equipment).toHaveLength(1);
    const latest = (await store.getJob(job.id))!;
    latest.starterTeam = equipped;
    latest.starterTeam[1] = { ...equipped[1], empty: true, id: 0, baseStats: { hp: 0, attack: 0, defense: 0, speed: 0 } };
    latest.encounter = { teams: [team], result: { left: 5, right: 0, winner: 'left', mode: 'idle' } };
    await store.saveJob(latest);
    const replaced = await engine.journeyBattle(job.id, undefined, equipped[1].instanceId);
    expect('empty' in replaced.characters[1]).toBe(false);
    expect(replaced.characters[0]).toEqual(equipped[0]);
  });
  it('increments arena floors once per idle victory and persists across reloads', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => []) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    const saved = (await store.getJob(job.id))!;
    saved.starterTeam = team.map(c => ({ ...c, baseStats: { hp: 10000, attack: 10000, defense: 10000, speed: 10000 } }));
    await store.saveJob(saved);
    await engine.journeyOpponents(job.id);
    const first = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(first.result!.winner).toBe('left');
    expect(first.replay!.floor).toBe(0);
    expect(first.arenaWins).toBe(1);
    expect((await engine.journeyBattle(job.id, 0, undefined, 'idle')).arenaWins).toBe(1);
    const restarted = new Engine(store, providers, 0);
    await restarted.journeyOpponents(job.id);
    const second = await restarted.journeyBattle(job.id, 0, undefined, 'idle');
    expect(second.replay!.floor).toBe(1);
    expect(second.arenaWins).toBe(2);
    await restarted.journeyOpponents(job.id);
    expect((await restarted.journeyBattle(job.id, 0, undefined, 'clout')).arenaWins).toBe(2);
  });
  it('stores an idle battle once and preserves the original team stats', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    const encounter = await engine.journeyOpponents(job.id);
    expect(encounter.stage).toBeDefined();
    expect((await store.getJob(job.id))!.encounter!.stage).toBe(encounter.stage);
    const battle = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(battle.replay!.stage).toBe(encounter.stage);
    expect(battle.replay!.events.length).toBeGreaterThan(0);
    expect(battle.result!.mode).toBe('idle');
    expect(await engine.journeyBattle(job.id, 0, undefined, 'idle')).toEqual(battle);
    expect(await engine.journeyTeam(job.id)).toEqual(team);
  });
  it('saves an Itomori impact victory once and permits the next encounter', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    await engine.journeyOpponents(job.id);
    const saved = (await store.getJob(job.id))!;
    const slowTeam = team.map((c, i) => ({ ...c, id: 900000 + i, baseStats: { hp: 500, attack: 125, defense: 125, speed: 0.01 } }));
    saved.starterTeam = slowTeam;
    saved.encounter = { stage: 'itomori', teams: [structuredClone(slowTeam)] };
    await store.saveJob(saved);
    const battle = await engine.journeyBattle(job.id, 0, undefined, 'idle');
    expect(battle.replay!.duration).toBe(20);
    expect(battle.result!.winner).toBe('left');
    expect(battle.arenaWins).toBe(1);
    expect(await engine.journeyBattle(job.id, 0, undefined, 'idle')).toEqual(battle);
    expect((await engine.journeyOpponents(job.id)).teams).toHaveLength(3);
    expect((await store.getJob(job.id))!.arenaWins).toBe(1);
  });
  it('allows one saved replacement after victory, preserving the other four instances', async () => {
    const store = await setup();
    const engine = new Engine(store, { lists: vi.fn(async () => []), cast: vi.fn(async () => []) }, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const team = await engine.journeyTeam(job.id);
    await engine.journeyOpponents(job.id);
    await expect(engine.journeyBattle(job.id, undefined, team[0].instanceId)).rejects.toThrow('after each victory');
    const saved = (await store.getJob(job.id))!;
    saved.starterTeam = team.map(c => ({ ...c, favorites: 100 }));
    await store.saveJob(saved);
    expect((await engine.journeyBattle(job.id, 0)).result).toEqual({ left: 500, right: 0 });
    const reward = await engine.journeyBattle(job.id, undefined, team[0].instanceId);
    expect(reward.rewardUsed).toBe(true);
    expect(team.some(c => c.id === reward.characters[0].id)).toBe(false);
    expect(reward.characters.slice(1)).toEqual(saved.starterTeam.slice(1));
    expect(await engine.journeyTeam(job.id)).toEqual(reward.characters);
    await expect(engine.journeyBattle(job.id, undefined, team[1].instanceId)).rejects.toThrow('after each victory');
    await engine.journeyOpponents(job.id);
    await expect(engine.journeyBattle(job.id, undefined, team[1].instanceId)).rejects.toThrow('after each victory');
  });
  it('saves one journey team for concurrent requests and restores it after restart', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => []) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('demo', true, true, 'journeys');
    await finished(store, job.id);
    const [first, second] = await Promise.all([engine.journeyTeam(job.id), engine.journeyTeam(job.id)]);
    expect(first).toHaveLength(5);
    expect(second).toEqual(first);
    const restarted = new Engine(store, providers, 0);
    expect(await restarted.journeyTeam(job.id)).toEqual(first);
    expect((await store.getJob(job.id))!.starterTeam).toEqual(first);
    const { teams: opponents } = await restarted.journeyOpponents(job.id);
    expect(opponents).toHaveLength(3);
    expect(opponents.every(team => team.length === 5 && team.every(c => c.instanceId && c.baseStats))).toBe(true);
    expect(await restarted.journeyTeam(job.id)).toEqual(first);
    const rerolled = await restarted.journeyTeam(job.id, true);
    expect(rerolled.every(c => !first.some(old => old.instanceId === c.instanceId))).toBe(true);
    expect(rerolled.map(c => c.baseStats)).not.toEqual(first.map(c => c.baseStats));
    expect(await restarted.journeyTeam(job.id)).toEqual(rerolled);
    // A legacy team receives stats once without changing its characters.
    const saved = (await store.getJob(job.id))!;
    saved.starterTeam = first.map(({ instanceId, baseStats, statRarity, ...character }) => character);
    await store.saveJob(saved);
    const migrated = await restarted.journeyTeam(job.id);
    expect(migrated.map(c => c.id)).toEqual(first.map(c => c.id));
    expect(migrated.every(c => c.baseStats && c.instanceId)).toBe(true);
    expect(await restarted.journeyTeam(job.id)).toEqual(migrated);
    expect(Object.values((await store.getJob(job.id))!.pool).every(c => !('baseStats' in c))).toBe(true);
  });
  it('keeps the same profile independent across comparison panels', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => [title]), cast: vi.fn(async () => [character]) };
    const engine = new Engine(store, providers, 0);
    const left = await engine.create('fhgeh', true, false, 'left');
    const right = await engine.create('fhgeh', true, false, 'right');
    expect(left.id).not.toBe(right.id);
    await engine.cancel(right.id);
    expect((await finished(store, left.id)).state).toBe('complete');
    expect((await store.getJob(right.id))!.state).toBe('cancelled');
  });
  it('aborts an active cast, preserves saved characters, and resumes unfinished titles', async () => {
    const store = await setup();
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    let aborted = false;
    const providers = { lists: vi.fn(async () => [title, second]), cast: vi.fn(async (t: Title, signal?: AbortSignal) => {
      if (t.kind === 'manga' && !aborted) {
        started();
        await new Promise<void>((_, reject) => signal!.addEventListener('abort', () => { aborted = true; reject(signal!.reason); }, { once: true }));
      }
      return [character];
    }) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('fhgeh', true, false);
    await pending;
    const cancelled = await engine.cancel(job.id);
    expect(aborted).toBe(true);
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.done).toEqual(['anime:1']);
    expect(cancelled.pool[42]).toBeDefined();
    await engine.retry(job.id);
    const done = await finished(store, job.id);
    expect(done.state).toBe('complete');
    expect(done.done).toEqual(['anime:1', 'manga:1']);
    expect(providers.cast).toHaveBeenCalledTimes(3);
  });

  it('cancels queued and listing jobs without restarting them on server startup', async () => {
    const store = await setup();
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    const providers = { lists: vi.fn(async (_: string, __: boolean, signal?: AbortSignal): Promise<Title[]> => {
      started();
      return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
    }), cast: vi.fn(async () => [character]) };
    const engine = new Engine(store, providers, 0);
    const first = await engine.create('fhgeh', true, false);
    await pending;
    const queued = await engine.create('another', true, false);
    expect((await engine.cancel(queued.id)).state).toBe('cancelled');
    expect((await engine.cancel(first.id)).state).toBe('cancelled');
    await new Engine(store, providers, 0).init();
    await sleep(30);
    expect((await store.getJob(first.id))!.state).toBe('cancelled');
    expect(providers.lists).toHaveBeenCalledTimes(1);
    expect(providers.cast).not.toHaveBeenCalled();
  });
  it('deduplicates across sources and reuses the cast cache for another profile', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => [title, second]), cast: vi.fn(async () => [character]) };
    const engine = new Engine(store, providers, 0);
    const first = await engine.create('fhgeh', true, false);
    const done = await finished(store, first.id);
    expect(done.state, done.message).toBe('complete');
    expect(Object.keys(done.pool)).toHaveLength(1);
    expect(done.pool[42].titles).toHaveLength(2);
    const next = await engine.create('another', true, false);
    await finished(store, next.id);
    expect(providers.cast).toHaveBeenCalledTimes(2);
  });
  it('keeps a usable partial pool and retries only unfinished titles', async () => {
    const store = await setup();
    let fail = true;
    const providers = { lists: vi.fn(async () => [title, second]), cast: vi.fn(async (t: Title) => {
      if (t.kind === 'manga' && fail) throw new Error('Temporary outage');
      return [character];
    }) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('fhgeh', true, false);
    const partial = await finished(store, job.id);
    expect(partial.state).toBe('partial');
    expect(partial.pool[42]).toBeDefined();
    fail = false;
    await engine.retry(job.id);
    const retried = await finished(store, job.id);
    expect(retried.state, retried.message).toBe('complete');
    expect(providers.cast).toHaveBeenCalledTimes(3);
    expect(providers.lists).toHaveBeenCalledTimes(1);
  });
  it('resumes a persisted interrupted import without refetching finished titles', async () => {
    const store = await setup();
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), username: 'fhgeh', demo: false, includePlanned: true, state: 'fetching', createdAt: now, updatedAt: now, titles: [title, second], listed: true, done: ['anime:1'], failures: {}, pool: { 42: { ...character, titles: [title] } }, message: '' };
    await store.saveJob(job);
    const providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => [character]) };
    await new Engine(store, providers, 0).init();
    const done = await finished(store, job.id);
    expect(done.done).toEqual(['anime:1', 'manga:1']);
    expect(providers.lists).not.toHaveBeenCalled();
    expect(providers.cast).toHaveBeenCalledExactlyOnceWith(second, expect.any(AbortSignal));
  });
  it('stores the demo separately from real API cast caches', async () => {
    const store = await setup();
    const providers = { lists: vi.fn(async () => []), cast: vi.fn(async () => []) };
    const engine = new Engine(store, providers, 0);
    const job = await engine.create('', true, true);
    const result = await finished(store, job.id);
    expect(Object.keys(result.pool)).toHaveLength(10);
    expect(await store.cast('anime:1')).toBeNull();
    expect(providers.cast).not.toHaveBeenCalled();
  });
});

it('validates profile URLs without fetching user-controlled destinations', () => {
  expect(parseUsername('https://myanimelist.net/profile/fhgeh')).toBe('fhgeh');
  expect(parseUsername(' fhgeh ')).toBe('fhgeh');
  expect(() => parseUsername('https://example.com/profile/fhgeh')).toThrow();
  expect(() => parseUsername('../../anything')).toThrow();
});
