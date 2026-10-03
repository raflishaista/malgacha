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
    const opponents = await restarted.journeyOpponents(job.id);
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
