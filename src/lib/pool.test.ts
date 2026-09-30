import { describe, expect, it } from 'vitest';
import { mergeCast, sample } from './pool';
import type { PoolCharacter, Title } from './types';

describe('character pool', () => {
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
