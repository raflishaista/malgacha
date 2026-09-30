import { afterEach, expect, it, vi } from 'vitest';
import { createProviders } from './providers';
import { setTimeout as sleep } from 'node:timers/promises';

// Eliminate real pacing delays while still exercising the provider control flow.
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => undefined) }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('follows both list paginations, includes NSFW entries, and filters only planned titles', async () => {
  const item = (id: number, status: string) => ({ node: { id, title: `Title ${id}` }, list_status: { status } });
  const responses = [
    { data: [item(1, 'completed'), item(2, 'plan_to_watch')], paging: { next: 'https://api.myanimelist.net/next' } },
    { data: [item(3, 'dropped')], paging: {} },
    { data: [item(1, 'reading'), item(2, 'plan_to_read')], paging: {} }
  ];
  const fetcher = vi.fn(async () => Response.json(responses.shift()));
  vi.stubGlobal('fetch', fetcher);
  const titles = await createProviders(() => 'test-client').lists('fhgeh', false);
  expect(titles.map((t) => `${t.kind}:${t.id}`)).toEqual(['anime:1', 'anime:3', 'manga:1']);
  const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
  expect(new URL(calls[1][0]).searchParams.get('offset')).toBe('2');
  expect(new URL(calls[0][0]).searchParams.get('nsfw')).toBe('true');
  expect(calls[0][1].headers).toEqual({ 'X-MAL-CLIENT-ID': 'test-client' });
});

it('retries upstream errors embedded in HTTP 200 and does not forward the MAL credential to Tenrai', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: 500, message: 'Upstream failure' }))
    .mockResolvedValueOnce(Response.json({ data: [{ character: { mal_id: 42, name: 'Person', images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/characters/1.jpg' } } } }] }));
  vi.stubGlobal('fetch', fetcher);
  const cast = await createProviders(() => 'secret').cast({ id: 1, kind: 'anime', name: 'Title', status: 'completed' });
  expect(cast).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].headers).toEqual({});
  expect(fetcher.mock.calls[0][0]).toBe('https://api.tenrai.org/v1/anime/1/characters');
});

it('fetches manga casts from Tenrai and preserves MAL character IDs for deduplication', async () => {
  const fetcher = vi.fn(async () => Response.json({ data: [{ character: {
    mal_id: 720, name: 'Liebert, Anna', images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/characters/11/286916.jpg' } }
  } }] }));
  vi.stubGlobal('fetch', fetcher);
  const cast = await createProviders(() => 'secret').cast({ id: 1, kind: 'manga', name: 'Monster', status: 'completed' });
  expect(fetcher.mock.calls[0]).toEqual(['https://api.tenrai.org/v1/manga/1/characters', expect.objectContaining({ headers: {} })]);
  expect(cast[0]).toEqual({ id: 720, name: 'Liebert, Anna', favorites: null, image: 'https://cdn.myanimelist.net/images/characters/11/286916.jpg', url: 'https://myanimelist.net/character/720' });
});

it('does not treat a malformed cast response as a successfully empty cast', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'not a cast' })));
  await expect(createProviders(() => 'test').cast({ id: 1, kind: 'manga', name: 'Title', status: 'reading' })).rejects.toThrow('unexpected response');
});

const title = { id: 1, kind: 'anime' as const, name: 'Title', status: 'completed' };

it.each([504, 200])('preserves HTTP %s and the upstream API error after exhausting retries', async (httpStatus) => {
  const fetcher = vi.fn(async () => Response.json({ status: 504, message: 'The API gateway did not receive a timely response from the upstream service.' }, { status: httpStatus }));
  vi.stubGlobal('fetch', fetcher);
  await expect(createProviders(() => '').cast(title)).rejects.toThrow(
    `Tenrai HTTP ${httpStatus}${httpStatus === 200 ? ' (API status 504)' : ''}: Upstream gateway timeout. The API gateway did not receive a timely response from the upstream service.`
  );
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('keeps the final 429 Retry-After cooldown for the next title', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const fetcher = vi.fn(async () => Response.json({ message: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '120' } }));
  vi.stubGlobal('fetch', fetcher);
  const provider = createProviders(() => '');
  await expect(provider.cast(title)).rejects.toThrow('HTTP 429: Rate limit reached.');
  fetcher.mockImplementation(async () => Response.json({ data: [] }));
  vi.mocked(sleep).mockClear();
  await provider.cast({ ...title, id: 2 });
  expect(vi.mocked(sleep).mock.calls[0][0]).toBeGreaterThanOrEqual(120_000);
});

it('reports a non-JSON server error without displaying its HTML', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>proxy failure</html>', { status: 503 })));
  await expect(createProviders(() => '').cast(title)).rejects.toThrow('Tenrai HTTP 503: Upstream service error. Failed after 4 attempts');
});

it.each(['TimeoutError', 'TypeError'])('distinguishes %s from an HTTP error', async (name) => {
  const error = new Error('internal connection details');
  error.name = name;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
  await expect(createProviders(() => '').cast(title)).rejects.toThrow(
    `Tenrai ${name === 'TimeoutError' ? 'request timed out after 20 seconds' : 'connection failed'} after 4 attempts. No HTTP response received.`
  );
});
