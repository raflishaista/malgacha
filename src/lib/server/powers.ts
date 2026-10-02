import { setTimeout as sleep } from 'node:timers/promises';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PoolCharacter } from '../types';
import type { Power } from '../power';
import { nameMatches, originMatches, parseTier } from './power-parser';

const root = resolve('.data/powers');
const shared = globalThis as typeof globalThis & { powerQueue?: Promise<unknown>; powerPending?: Map<string, Promise<Power>>; powerNext?: number };
shared.powerPending ??= new Map();
async function request(params: Record<string, string>) {
  await sleep(Math.max(0, (shared.powerNext ?? 0) - Date.now()));
  shared.powerNext = Date.now() + 1100;
  const response = await fetch('https://vsbattles.fandom.com/api.php?' + new URLSearchParams({ ...params, format: 'json' }), {
    signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'MALGacha/0.1 (character tier lookup)' }
  });
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after'));
    shared.powerNext = Date.now() + Math.max(60000, Number.isFinite(seconds) ? seconds * 1000 : 0);
  }
  if (!response.ok) throw new Error('Wiki unavailable');
  const body = await response.json();
  if (body.error) throw new Error('Wiki API error');
  return body;
}
async function lookup(character: PoolCharacter): Promise<Power> {
  const name = character.name.includes(',') ? character.name.split(',').reverse().join(' ').trim() : character.name;
  const search = await request({ action: 'query', list: 'search', srnamespace: '0', srsearch: name, srlimit: '5' });
  if (!Array.isArray(search.query?.search)) throw new Error('Invalid search response');
  const candidates = search.query.search.filter((p: { title: string }) => nameMatches(character.name, p.title));
  if (candidates.length > 3) return { tier: null, status: 'unmatched', checkedAt: new Date().toISOString() };
  const matches: Power[] = [];
  for (const page of candidates.slice(0, 3)) {
    const parsed = await request({ action: 'parse', page: page.title, prop: 'wikitext' });
    const wiki = parsed.parse?.wikitext?.['*'];
    if (typeof wiki !== 'string') throw new Error('Invalid page response');
    if (!originMatches(character, wiki)) continue;
    const stats = parseTier(wiki);
    matches.push({ ...stats, status: stats.tier ? 'ranked' : 'unmatched', page: page.title,
      url: 'https://vsbattles.fandom.com/wiki/' + encodeURIComponent(page.title.replaceAll(' ', '_')), checkedAt: new Date().toISOString() });
  }
  // Multiple continuities are ambiguous; do not silently choose another version.
  return matches.length === 1 ? matches[0] : { tier: null, status: 'unmatched', checkedAt: new Date().toISOString() };
}
export async function getPower(character: PoolCharacter): Promise<Power> {
  const key = String(character.id);
  const file = join(root, key + '.json');
  try {
    const cached = JSON.parse(await readFile(file, 'utf8')) as Power;
    const ttl = cached.status === 'ranked' ? 7 * 86400000 : cached.status === 'unavailable' ? 60000 : 86400000;
    if (Date.now() - Date.parse(cached.checkedAt) < ttl) return cached;
  } catch { /* Missing or invalid cache entries are fetched again. */ }
  const existing = shared.powerPending!.get(key);
  if (existing) return existing;
  if (shared.powerPending!.size >= 24) return { tier: null, status: 'unavailable', checkedAt: new Date().toISOString() };
  const task = (shared.powerQueue ?? Promise.resolve()).then(async () => {
    let result: Power;
    try { result = await lookup(character); }
    catch { result = { tier: null, status: 'unavailable', checkedAt: new Date().toISOString() }; }
    await mkdir(root, { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(result));
    await rename(temporary, file);
    return result;
  });
  shared.powerQueue = task.catch(() => {});
  shared.powerPending!.set(key, task);
  try { return await task; } finally { shared.powerPending!.delete(key); }
}
