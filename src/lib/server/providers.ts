import { setTimeout as sleep } from 'node:timers/promises';
import type { Character, Title } from '../types';

export interface Providers {
  lists(username: string, includePlanned: boolean): Promise<Title[]>;
  cast(title: Title): Promise<Character[]>;
}

export function parseUsername(input: string): string {
  let username = input.trim();
  if (/^https?:\/\//i.test(username)) {
    const url = new URL(username);
    if (url.hostname !== 'myanimelist.net' && url.hostname !== 'www.myanimelist.net') throw new Error('Use a myanimelist.net profile URL.');
    const match = /^\/profile\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) throw new Error('Use a MAL profile URL or username.');
    username = decodeURIComponent(match[1]);
  }
  if (!/^[a-zA-Z0-9_-]{2,16}$/.test(username)) throw new Error('Enter a valid MAL username (2–16 letters, numbers, underscores or hyphens).');
  return username;
}

// A single shared provider instance controls all upstream calls in this process.
export function createProviders(clientId: () => string | undefined): Providers {
  let nextTenrai = 0;
  let nextMal = 0;
  async function request(url: string, provider: 'mal' | 'tenrai'): Promise<any> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const now = Date.now();
      const slot = Math.max(now, provider === 'tenrai' ? nextTenrai : nextMal);
      if (provider === 'tenrai') nextTenrai = slot + 1100;
      else nextMal = slot + 1100;
      await sleep(Math.max(0, slot - now));
      let response: Response;
      try {
        response = await fetch(url, {
          headers: provider === 'mal' ? { 'X-MAL-CLIENT-ID': clientId() || '' } : {},
          signal: AbortSignal.timeout(20_000)
        });
      } catch (error) {
        if (attempt === 3) {
          const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
          throw new Error(`${provider === 'mal' ? 'MAL' : 'Tenrai'} ${timedOut ? 'request timed out after 20 seconds' : 'connection failed'} after 4 attempts. No HTTP response received. Retry later.`);
        }
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      const body = await response.json().catch(() => null);
      const status = typeof body?.status === 'number' && body.status >= 400 ? body.status : response.status;
      const label = `${provider === 'mal' ? 'MAL' : 'Tenrai'} HTTP ${response.status}${status !== response.status ? ` (API status ${status})` : ''}`;
      // Only expose the public Tenrai message, never raw bodies or MAL credential errors.
      const detail = provider === 'tenrai' && typeof body?.message === 'string'
        ? ` ${body.message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 400)}` : '';
      if (status === 429 || status >= 500) {
        const retryHeader = response.headers.get('retry-after');
        const retrySeconds = retryHeader ? Number(retryHeader) : NaN;
        const retryMs = Number.isFinite(retrySeconds) ? retrySeconds * 1000 : retryHeader ? Date.parse(retryHeader) - Date.now() : 0;
        const delay = Math.max(status === 429 ? 60_000 : 2000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
        if (provider === 'tenrai') nextTenrai = Math.max(nextTenrai, Date.now() + delay);
        else nextMal = Math.max(nextMal, Date.now() + delay);
        if (attempt === 3) {
          const reason = status === 429 ? 'Rate limit reached.' : status === 504 ? 'Upstream gateway timeout.' : 'Upstream service error.';
          throw new Error(`${label}: ${reason}${detail} Failed after 4 attempts; waiting at least ${Math.ceil(delay / 1000)} seconds before the next request.`);
        }
        continue;
      }
      if (!response.ok || status >= 400) {
        if (provider === 'mal' && (status === 401 || status === 403)) throw new Error(`${label}: Access denied. Check your client ID and that both lists are public.`);
        if (status === 404) throw new Error(`${label}: This profile or title could not be found.${detail}`);
        throw new Error(`${label}: Request failed.${detail}`);
      }
      if (!body || !Array.isArray(body.data)) throw new Error('The provider returned an unexpected response.');
      return body;
    }
    throw new Error('Provider request failed.');
  }
  return {
    async lists(username, includePlanned) {
      if (!clientId()) throw new Error('Add MAL_CLIENT_ID to .env and restart the server, or try the demo.');
      const titles: Title[] = [];
      for (const kind of ['anime', 'manga'] as const) {
        let offset = 0;
        for (;;) {
          const url = new URL(`https://api.myanimelist.net/v2/users/${encodeURIComponent(username)}/${kind}list`);
          url.search = new URLSearchParams({ limit: '1000', offset: String(offset), fields: 'list_status', nsfw: 'true' }).toString();
          const page = await request(url.toString(), 'mal');
          for (const item of page.data) {
            if (!Number.isInteger(item.node?.id) || typeof item.node?.title !== 'string' || typeof item.list_status?.status !== 'string') throw new Error('MAL returned an incomplete list entry.');
            const status = item.list_status.status;
            if (includePlanned || !['plan_to_watch', 'plan_to_read'].includes(status)) titles.push({ id: item.node.id, kind, name: item.node.title, status });
          }
          if (!page.paging?.next) break;
          if (page.data.length === 0) throw new Error('MAL pagination stopped unexpectedly. Retry the import.');
          offset += page.data.length;
        }
      }
      return [...new Map(titles.map((title) => [`${title.kind}:${title.id}`, title])).values()];
    },
    async cast(title) {
      const page = await request(`https://api.tenrai.org/v1/${title.kind}/${title.id}/characters`, 'tenrai');
      return page.data.map((item: any): Character => {
        const c = item.character;
        if (!Number.isInteger(c?.mal_id) || typeof c?.name !== 'string') throw new Error('Tenrai returned an incomplete character.');
        const sourceImage = c.images?.webp?.image_url || c.images?.jpg?.image_url;
        const image = typeof sourceImage === 'string' && sourceImage.startsWith('https://cdn.myanimelist.net/') ? sourceImage : null;
        return { id: c.mal_id, name: c.name, image, url: `https://myanimelist.net/character/${c.mal_id}` };
      });
    }
  };
}
