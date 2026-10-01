import { expect, it } from 'vitest';
import { favoriteTotal, cloutWinner } from './match';
it('compares total favorites, including ties and missing counts', () => {
  const left = favoriteTotal([{ favorites: 20000 }, { favorites: 500 }, {}]);
  expect(left).toBe(20500);
  expect(cloutWinner(left, 10000)).toBe('Player 1 wins!');
  expect(cloutWinner(left, 30000)).toBe('Player 2 wins!');
  expect(cloutWinner(left, left)).toBe('Draw!');
});
