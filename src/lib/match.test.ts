import { expect, it } from 'vitest';
import { favoriteTotal, cloutWinner, bestSource, writingTotal } from './match';
import type { Title } from './types';

it('chooses the highest rated source and counts one score per character, even with shared sources', () => {
  const title: Title = { id: 1, kind: 'anime', name: 'Series', status: 'completed', score: 8.37 };
  const sequel = { ...title, id: 2, score: 8.89 };
  const character = { titles: [title, { ...title, id: 3, score: null }, sequel] };
  expect(bestSource(character)).toEqual(sequel);
  expect(writingTotal([character, character, { titles: [title] }])).toBe(26.15);
  expect(bestSource({ titles: [{ ...title, score: 0 }, { ...title, score: undefined }] })).toBeNull();
  expect(() => writingTotal([{ titles: [] }])).toThrow('rated source');
});
it('compares total favorites, including ties and missing counts', () => {
  const left = favoriteTotal([{ favorites: 20000 }, { favorites: 500 }, {}]);
  expect(left).toBe(20500);
  expect(cloutWinner(left, 10000)).toBe('Player 1 wins!');
  expect(cloutWinner(left, 30000)).toBe('Player 2 wins!');
  expect(cloutWinner(left, left)).toBe('Draw!');
});
