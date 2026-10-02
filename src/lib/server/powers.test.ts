import { expect, it, vi } from 'vitest';
import { lookup } from './powers';
import { nameMatches } from './power-parser';
import type { PoolCharacter } from '../types';
const character = (name: string, series: string): PoolCharacter => ({ id: 1, name, url: '', image: null, titles: [{ id: 1, kind: 'anime', name: series, status: 'completed' }] });
const page = (title: string, origin: string) => ({ parse: { title, wikitext: { '*': `'''Tier:''' 7-C\n'''Origin:''' [[${origin}]]` } } });
it('accepts small spelling differences but not short-name substrings or unrelated names', () => {
  expect(nameMatches('Komachine, Machi', 'Machi Komacine')).toBe(true);
  expect(nameMatches('Example, Haruto', 'Haruto Exampl')).toBe(true);
  expect(nameMatches('Nami', 'Nanami')).toBe(false);
  expect(nameMatches('Nami', 'Nani')).toBe(false);
});
it('selects the first franchise-verified version rather than rejecting multiple versions', async () => {
  const call = vi.fn().mockResolvedValueOnce({ query: { search: [{ title: 'Bardock (Toei)' }, { title: 'Bardock (Dragon Ball Minus)' }] } })
    .mockResolvedValueOnce(page('Bardock (Toei)', 'Dragon Ball'));
  expect((await lookup(character('Bardock', 'Dragon Ball Z'), call)).page).toBe('Bardock (Toei)');
  expect(call).toHaveBeenCalledTimes(2);
});
it('uses franchise fallback and verifies resolved redirects against the source', async () => {
  const call = vi.fn().mockResolvedValueOnce({ query: { search: [{ title: 'Nami' }] } })
    .mockResolvedValueOnce(page('Nami (League of Legends)', 'League of Legends'))
    .mockResolvedValueOnce({ query: { search: [{ title: 'Nami (One Piece)' }] } })
    .mockResolvedValueOnce(page('Nami (One Piece)', 'One Piece'));
  expect((await lookup(character('Nami', 'One Piece'), call)).page).toBe('Nami (One Piece)');
  expect(call.mock.calls[2][0].srsearch).toBe('Nami one piece');
  expect(call.mock.calls[1][0].redirects).toBe('1');
});
