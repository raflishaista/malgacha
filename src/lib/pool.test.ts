import { describe, expect, it } from 'vitest';
import { mergeCast, sample, popularityPool } from './pool';
import type { PoolCharacter, Title } from './types';

describe('character pool', () => {
  it('filters inclusively, excludes unknown counts and returns smaller unique rolls', () => {
    const base = { name: 'Character', image: null, url: '' };
    const pool = [499, 500, 20001, null, undefined].map((favorites, id) => ({ ...base, id, favorites }));
    expect(popularityPool(pool, 500).map((c) => c.id)).toEqual([1, 2]);
    expect(sample(popularityPool(pool, 20000), 10, Math.random, true)).toEqual([pool[2]]);
    expect(() => sample(popularityPool(pool, 30000), 5, Math.random, true)).toThrow('No characters match');
    expect(popularityPool(pool, null)).toHaveLength(5);
    for (const invalid of [-1, 0.5, '500', Infinity]) expect(() => popularityPool(pool, invalid)).toThrow();
  });
  it('merges a character across anime and manga while preserving both sources', () => {
    const pool: Record<string, PoolCharacter> = {};
    const anime: Title = { id: 1, kind: 'anime', name: 'Anime', status: 'completed' };
    const manga: Title = { ...anime, kind: 'manga', name: 'Manga' };
    const character = { id: 42, name: 'Same person', image: null, url: 'https://myanimelist.net/character/42' };
    mergeCast(pool, anime, [character, character]);
    mergeCast(pool, manga, [character]);
    mergeCast(pool, anime, [character]);
    expect(Object.keys(pool)).toHaveLength(1);
    expect(pool[42].titles).toEqual([anime, manga]);
  });
  it('samples without replacement and never changes the source pool', () => {
    const pool = Array.from({ length: 20 }, (_, i) => i);
    for (let i = 0; i < 100; i++) expect(new Set(sample(pool, 10)).size).toBe(10);
    expect(pool).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(() => sample(pool, 11)).toThrow();
    expect(() => sample(pool, 5.5)).toThrow();
    expect(() => sample([1, 2], 5)).toThrow();
  });
});
