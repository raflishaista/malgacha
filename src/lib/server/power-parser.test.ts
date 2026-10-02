import { expect, it } from 'vitest';
import { parseTier, nameMatches, originMatches } from './power-parser';
import { powerWinner } from '../power';
import type { PoolCharacter } from '../types';
const character: PoolCharacter = { id: 1, name: 'Hashibira, Inosuke', url: '', image: null, titles: [{ id: 1, kind: 'anime', name: 'Kimetsu no Yaiba', status: 'completed' }] };
it('parses wiki links and templates and chooses the highest tier, not the biggest number', () => {
  expect(parseTier("'''[[Tiering System|Tier]]:''' {{9-A}} | {{High 8-C}} | {{7-C}}\n'''Key:''' Early | Middle | Late")).toEqual({ tier: '7-C', raw: '9-A | High 8-C | 7-C', key: 'Early | Middle | Late' });
  expect(parseTier("'''Tier:''' Low 2-C, possibly 2-A").tier).toBe('2-A');
  expect(parseTier("'''Tier:''' Unknown\nOther: 0").tier).toBeNull();
  expect(parseTier("'''Tier:''' High 1-A+ | 0").tier).toBe('0');
});
it('matches reversed names and requires a matching source franchise', () => {
  expect(nameMatches(character.name, 'Inosuke Hashibira')).toBe(true);
  expect(nameMatches(character.name, 'Tanjiro Kamado')).toBe(false);
  expect(originMatches(character, "'''Origin:''' [[Demon Slayer: Kimetsu No Yaiba]]")).toBe(true);
  expect(originMatches(character, "'''Origin:''' [[Naruto]]")).toBe(false);
});
it('compares team maxima, ties, and unavailable data', () => {
  const ranked = (tier: string): PoolCharacter => ({ ...character, power: { tier, status: 'ranked', checkedAt: '' } });
  expect(powerWinner([ranked('9-A'), ranked('7-C')], [ranked('High 8-C')])).toBe('Player 1 wins!');
  expect(powerWinner([ranked('7-C')], [ranked('7-C')])).toBe('Draw!');
  expect(powerWinner([character], [ranked('7-C')])).toBe('Insufficient tier data');
});
