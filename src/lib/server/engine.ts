import { applyInventoryAction, inventoryView, randomPoolUnit, type InventoryAction } from './inventory';
import { rewardChoices } from '../items';
import { starterTeam, opponentTeams } from '../journeys';
import { simulateBattle } from '../autobattle';
import { isBossFloor, rollBoss } from '../bosses';
import { generateBaseStats } from '../stats';
import { rarityFor } from '../rarity';
import type { JourneyCharacter } from '../types';
import { randomInt } from 'node:crypto';
import { bestSource, favoriteTotal } from '../match';
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
  async journeyOpponents(id: string): Promise<JourneyCharacter[][]> {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys' || job.state !== 'complete' || !job.starterTeam) throw new Error('Roll your starting team before departing.');
      if (job.itemReward) throw new Error('Choose your boss reward before continuing.');
      if (!job.starterTeam.some(c => !('empty' in c && c.empty))) throw new Error('Your team is empty. Use the testing team reroll to continue.');
      const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
      if (isBossFloor(job.arenaWins ?? 0)) {
        const teams = [[rollBoss(randomUUID(), random)]];
        job.encounter = { teams };
        await this.store.saveJob(job);
        return teams;
      }
      const teams = opponentTeams(Object.values(job.pool), random).map(team => team.map(character => {
        const statRarity = rarityFor(character.favorites) ?? 'N';
        return { ...character, instanceId: randomUUID(), statRarity, baseStats: generateBaseStats(statRarity, random) };
      }));
      job.encounter = { teams };
      await this.store.saveJob(job);
      return teams;
    });
  }
  async journeyTeam(id: string, reroll = false): Promise<JourneyCharacter[]> {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys') throw new Error('Journey import not found.');
      if (job.state !== 'complete') throw new Error('Finish importing before rolling your starting team.');
      const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
      const selected = !reroll && job.starterTeam ? job.starterTeam : starterTeam(Object.values(job.pool), random);
      const team = selected.map((character): JourneyCharacter => {
        if ('baseStats' in character && 'instanceId' in character && 'statRarity' in character) return character as JourneyCharacter;
        const statRarity = rarityFor(character.favorites) ?? 'N';
        return { ...character, instanceId: randomUUID(), statRarity, baseStats: generateBaseStats(statRarity, random) };
      });
      if (reroll) {
        if (job.itemReward) throw new Error('Choose your boss reward before rerolling.');
        const extra = (job.inventory ?? []).filter(i => i.itemId === 'merry' || i.itemId === 'sunny').length;
        for (let i = 0; i < extra; i++) team.push(randomPoolUnit(job, random));
      }
      job.starterTeam = team;
      if (reroll) delete job.encounter;
      await this.store.saveJob(job);
      return team;
    });
  }
  async journeyBattle(id: string, opponent?: number, replace?: string, mode: 'idle' | 'clout' = 'clout') {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys' || !job.starterTeam || !job.encounter) throw new Error('Depart before fighting.');
      const encounter = job.encounter;
      if (replace !== undefined) {
        if (!encounter.result || (encounter.result.winner ? encounter.result.winner !== 'left' : encounter.result.left <= encounter.result.right) || encounter.rewardUsed) throw new Error('One replacement is available after each victory.');
        const index = job.starterTeam.findIndex(c => 'instanceId' in c && c.instanceId === replace);
        if (index < 0) throw new Error('Team member not found.');
        const ids = new Set(job.starterTeam.map(c => c.id));
        const pool = Object.values(job.pool).filter(c => !ids.has(c.id));
        if (!pool.length) throw new Error('No different characters are available in this pool.');
        const character = pool[randomInt(pool.length)];
        const statRarity = rarityFor(character.favorites) ?? 'N';
        job.starterTeam[index] = { ...character, instanceId: randomUUID(), statRarity, baseStats: generateBaseStats(statRarity, () => randomInt(0, 2 ** 32) / 2 ** 32) };
        encounter.rewardUsed = true;
      } else {
        if (!Number.isInteger(opponent) || opponent! < 0 || opponent! >= encounter.teams.length) throw new Error('Choose an opponent.');
        if (!encounter.result) {
          if (encounter.teams[opponent!].some(c => c.boss)) mode = 'idle';
          if (mode === 'idle') {
            encounter.replay = simulateBattle(job.starterTeam as JourneyCharacter[], encounter.teams[opponent!], () => randomInt(0, 2 ** 32) / 2 ** 32);
            const { left, right, winner } = encounter.replay;
            encounter.replay.floor = job.arenaWins ?? 0;
            if (winner === 'left') {
              job.arenaWins = (job.arenaWins ?? 0) + 1;
              if (encounter.teams[opponent!].some(c => c.boss)) job.itemReward = { id: randomUUID(), choices: rewardChoices(job.inventory ?? [], () => randomInt(0, 2 ** 32) / 2 ** 32) };
            }
            encounter.result = { left, right, winner, mode };
          } else encounter.result = { left: favoriteTotal(job.starterTeam), right: favoriteTotal(encounter.teams[opponent!]) };
        }
      }
      await this.store.saveJob(job);
      return { result: encounter.result, replay: encounter.replay, arenaWins: job.arenaWins ?? 0, inventory: job.inventory ?? [], itemReward: job.itemReward ?? null, characters: job.starterTeam, rewardUsed: !!encounter.rewardUsed };
    });
  }
  async journeyInventory(id: string, action?: InventoryAction) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys') throw new Error('Journey not found.');
      if (action) {
        applyInventoryAction(job, action, () => randomInt(0, 2 ** 32) / 2 ** 32);
        await this.store.saveJob(job);
      }
      return inventoryView(job);
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
