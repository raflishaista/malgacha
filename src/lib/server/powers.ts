import { setTimeout as sleep } from 'node:timers/promises';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PoolCharacter } from '../types';
import type { Power } from '../power';
import {
  nameMatches,
  originMatches,
  parseTier,
  searchName,
  fallbackQueries
} from './power-parser';

const ROOT_DIR = resolve('.data/powers');
const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

const shared = globalThis as typeof globalThis & {
  powerQueue?: Promise<unknown>;
  powerPending?: Map<string, Promise<Power>>;
  powerNext?: number;
};

shared.powerPending ??= new Map();

async function request(params: Record<string, string>) {
  await sleep(Math.max(0, (shared.powerNext ?? 0) - Date.now()));
  shared.powerNext = Date.now() + 1100;

  const url = `https://vsbattles.fandom.com/api.php?${new URLSearchParams({ ...params, format: 'json' })}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'MALGacha/0.1 (character tier lookup)' }
  });

  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    const retryDelay = Number.isFinite(seconds) ? seconds * 1000 : ONE_MINUTE;
    shared.powerNext = Date.now() + Math.max(ONE_MINUTE, retryDelay);
  }

  if (!response.ok) {
    throw new Error('Wiki unavailable');
  }

  const body = await response.json();
  if (body.error) {
    throw new Error('Wiki API error');
  }

  return body;
}

export async function lookup(character: PoolCharacter, call = request): Promise<Power> {
  const seen = new Set<string>();
  let parsedCount = 0;

  const queries = [searchName(character.name), ...fallbackQueries(character)];

  for (const query of queries) {
    const search = await call({
      action: 'query',
      list: 'search',
      srnamespace: '0',
      srsearch: query,
      srlimit: '8'
    });

    if (!Array.isArray(search.query?.search)) {
      throw new Error('Invalid search response');
    }

    for (const page of search.query.search) {
      if (
        typeof page.title !== 'string' ||
        seen.has(page.title) ||
        !nameMatches(character.name, page.title)
      ) {
        continue;
      }

      seen.add(page.title);
      parsedCount++;
      if (parsedCount > 5) break;

      const parsed = await call({
        action: 'parse',
        page: page.title,
        prop: 'wikitext',
        redirects: '1'
      });

      const wiki = parsed.parse?.wikitext?.['*'];
      const title = parsed.parse?.title ?? page.title;

      if (typeof wiki !== 'string') {
        throw new Error('Invalid page response');
      }

      if (!nameMatches(character.name, title) || !originMatches(character, wiki)) {
        continue;
      }

      const stats = parseTier(wiki);
      if (!stats.tier || /\{\{\s*(?:disambiguation|disambig)\b/i.test(wiki)) {
        continue;
      }

      return {
        ...stats,
        status: 'ranked',
        page: title,
        url: `https://vsbattles.fandom.com/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
        checkedAt: new Date().toISOString()
      };
    }

    if (parsedCount >= 5) break;
  }

  return { tier: null, status: 'unmatched', checkedAt: new Date().toISOString() };
}

export async function getPower(character: PoolCharacter): Promise<Power> {
  const key = `v2-${character.id}`;
  const file = join(ROOT_DIR, `${key}.json`);

  try {
    const content = await readFile(file, 'utf8');
    const cached = JSON.parse(content) as Power;
    const ttl =
      cached.status === 'ranked'
        ? ONE_WEEK
        : cached.status === 'unavailable'
          ? ONE_MINUTE
          : ONE_DAY;

    if (Date.now() - Date.parse(cached.checkedAt) < ttl) {
      return cached;
    }
  } catch {
    // Missing or invalid cache entries are fetched again.
  }

  const existing = shared.powerPending!.get(key);
  if (existing) {
    return existing;
  }

  if (shared.powerPending!.size >= 24) {
    return { tier: null, status: 'unavailable', checkedAt: new Date().toISOString() };
  }

  const task = (shared.powerQueue ?? Promise.resolve()).then(async () => {
    let result: Power;
    try {
      result = await lookup(character);
    } catch {
      result = { tier: null, status: 'unavailable', checkedAt: new Date().toISOString() };
    }

    await mkdir(ROOT_DIR, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(result));
    await rename(temporary, file);
    return result;
  });

  shared.powerQueue = task.catch(() => {});
  shared.powerPending!.set(key, task);

  try {
    return await task;
  } finally {
    shared.powerPending!.delete(key);
  }
}
