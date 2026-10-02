import { bestSource } from '../match';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { mergeCast } from '../pool';
import { titleKey, type Job, type JobView } from '../types';
import { demoCast, demoTitles } from './demo';
import { parseUsername, type Providers } from './providers';
import { Store } from './store';

const activeStates = new Set(['queued', 'listing', 'fetching']);
export function view(job: Job): JobView {
  const { titles, done, pool, failures, listed: _listed, ...rest } = job;
  return { ...rest, total: titles.length, processed: done.length, failed: Object.keys(failures).length,
    uniqueCharacters: Object.keys(pool).length,
    ratedFavoriteCounts: Object.values(pool).filter((c) => bestSource(c)).map((c) => c.favorites ?? null),
    favoriteCounts: Object.values(pool).flatMap((c) => typeof c.favorites === "number" ? [c.favorites] : []),
    unknownFavorites: Object.values(pool).filter((c) => typeof c.favorites !== "number").length,
    failures: Object.entries(failures).map(([key, message]) => ({ title: titles.find((t) => titleKey(t) === key)?.name || key, message })) };
}

/** One durable queue for one long-running Node process. */
export class Engine {
  private queue: string[] = [];
  private running = false;
  private controllers = new Map<string, AbortController>();
  private initialized?: Promise<void>;
  private mutations: Promise<unknown> = Promise.resolve();
  constructor(readonly store: Store, private providers: Providers, private demoDelay = 1500) {}
  init() {
    return this.initialized ??= (async () => {
      const jobs = await this.store.jobs();
      this.queue.push(...jobs.filter((job) => activeStates.has(job.state)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((job) => job.id));
      this.kick();
    })();
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation);
    this.mutations = next.catch(() => {});
    return next;
  }
  async create(input: string, includePlanned: boolean, demo: boolean, scope = 'lottery') {
    await this.init();
    return this.serialize(async () => {
      const username = demo ? 'demo' : parseUsername(input);
      const jobs = await this.store.jobs();
      const existing = jobs.find((job) => job.username.toLowerCase() === username.toLowerCase() && (job.scope ?? 'lottery') === scope && job.demo === demo && job.includePlanned === includePlanned && activeStates.has(job.state));
      if (existing) return existing;
      if (jobs.filter((job) => activeStates.has(job.state)).length >= 10) throw new Error('The import queue is full. Please try again later.');
      const now = new Date().toISOString();
      const job: Job = { id: randomUUID(), username, scope, demo, includePlanned, state: 'queued', createdAt: now, updatedAt: now, titles: [], listed: false, done: [], failures: {}, pool: {}, message: 'Waiting for the importer.' };
      await this.store.saveJob(job);
      this.queue.push(job.id);
      this.kick();
      return job;
    });
  }
  async retry(id: string) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job) throw new Error('Import not found.');
      if (activeStates.has(job.state) || job.state === 'complete') return job;
      if ((await this.store.jobs()).filter((item) => activeStates.has(item.state)).length >= 10) throw new Error('The import queue is full. Please try again later.');
      job.failures = {};
      job.state = 'queued';
      job.message = 'Retry queued; previously fetched characters are preserved.';
      await this.store.saveJob(job);
      this.queue.push(job.id);
      this.kick();
      return job;
    });
  }
  async cancel(id: string) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job) throw new Error('Import not found.');
      if (!activeStates.has(job.state)) return job;
      this.controllers.get(id)?.abort();
      this.queue = this.queue.filter((queued) => queued !== id);
      job.state = 'cancelled';
      job.message = 'Import cancelled. Collected characters are saved; you can roll or resume the import.';
      job.updatedAt = new Date().toISOString();
      await this.store.saveJob(job);
      return job;
    });
  }
  private kick() {
    if (this.running) return;
    this.running = true;
    void this.drain().catch((error) => console.error('Import queue stopped:', error)).finally(() => {
      this.running = false;
      if (this.queue.length) this.kick();
    });
  }
  private async persist(job: Job, signal: AbortSignal) {
    await this.serialize(async () => {
      signal.throwIfAborted();
      job.updatedAt = new Date().toISOString();
      await this.store.saveJob(job);
    });
  }
  private async drain() {
    while (this.queue.length) {
      const id = this.queue.shift()!;
      const controller = new AbortController();
      this.controllers.set(id, controller);
      const signal = controller.signal;
      const job = await this.store.getJob(id);
      if (!job || !activeStates.has(job.state)) { this.controllers.delete(id); continue; }
      try {
        if (!job.listed) {
          job.state = 'listing'; job.message = 'Reading anime and manga lists…';
          await this.persist(job, signal);
          job.titles = job.demo ? demoTitles : await this.providers.lists(job.username, job.includePlanned, signal);
          job.listed = true;
        }
        job.state = 'fetching';
        await this.persist(job, signal);
        for (const title of job.titles) {
          signal.throwIfAborted();
          const key = titleKey(title);
          if (job.done.includes(key)) continue;
          job.message = `Fetching characters from ${title.name}…`;
          await this.persist(job, signal);
          try {
            let cast;
            if (job.demo) { await sleep(this.demoDelay, undefined, { signal }); cast = demoCast(title); }
            else {
              cast = await this.store.cast(key);
              if (cast === null) { cast = await this.providers.cast(title, signal); await this.store.saveCast(key, cast); }
            }
            signal.throwIfAborted();
            mergeCast(job.pool, title, cast);
            job.done.push(key);
            delete job.failures[key];
          } catch (error) { signal.throwIfAborted(); job.failures[key] = error instanceof Error ? error.message : 'Could not fetch this cast.'; }
          await this.persist(job, signal);
        }
        job.state = Object.keys(job.failures).length ? 'partial' : 'complete';
        job.message = job.state === 'partial' ? 'Some titles could not be fetched. You can roll now or retry them.' : job.titles.length ? 'Your character pool is ready.' : 'No entries matched this import.';
        await this.persist(job, signal);
      } catch (error) {
        if (signal.aborted) continue;
        job.state = 'error'; job.message = error instanceof Error ? error.message : 'Import failed.';
        await this.persist(job, signal).catch((error) => { if (!signal.aborted) throw error; });
      } finally {
        this.controllers.delete(id);
      }
    }
  }
}
