import { expect, it } from 'vitest';
import { rarityFor } from './rarity';

it.each([[0, 'N'], [199, 'N'], [200, 'R'], [999, 'R'], [1000, 'SR'], [4999, 'SR'], [5000, 'SSR'], [10000, 'SSR'], [10001, 'UR']] as const)('assigns %s favorites to %s', (favorites, rarity) => {
  expect(rarityFor(favorites)).toBe(rarity);
});
it('leaves missing and invalid counts unranked', () => {
  for (const count of [undefined, null, -1, NaN, Infinity]) expect(rarityFor(count)).toBeNull();
});
