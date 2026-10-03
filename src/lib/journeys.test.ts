import { describe, expect, it } from 'vitest';
import { abilities, abilityFor, starterTeam, opponentTeams } from './journeys';
import type { PoolCharacter } from './types';
const character = (id: number): PoolCharacter => ({ id, name: String(id), image: null, url: '', titles: [], favorites: 0 });
describe('starting teams', () => {
  it('offers three different five-unit opponents even with repeated RNG values', () => {
    for (const size of [6, 10, 100]) {
      const pool = Array.from({ length: size }, (_, i) => character(900000 + i));
      const before = structuredClone(pool);
      const teams = opponentTeams(pool, () => 0);
      expect(teams).toHaveLength(3);
      expect(new Set(teams.map(team => team.map(c => c.id).sort().join(','))).size).toBe(3);
      expect(teams.every(team => team.length === 5 && new Set(team.map(c => c.id)).size === 5)).toBe(true);
      expect(pool).toEqual(before);
    }
    expect(() => opponentTeams([1, 2, 3, 4, 5].map(character))).toThrow('six unique');
  });
  it('guarantees a passive among five unique characters without filtering favorites or changing the pool', () => {
    const pool = [17, 900001, 900002, 900003, 900004, 900005, 17].map(character);
    const before = structuredClone(pool);
    for (let i = 0; i < 50; i++) {
      const team = starterTeam(pool);
      expect(team).toHaveLength(5);
      expect(new Set(team.map(c => c.id)).size).toBe(5);
      expect(team.some(c => abilityFor(c.id))).toBe(true);
      expect(team.every(c => pool.includes(c))).toBe(true);
    }
    expect(pool).toEqual(before);
  });
  it('allows additional passive characters in the random slots', () => {
    expect(starterTeam([17, 246, 913, 40, 5].map(character)).every(c => abilityFor(c.id))).toBe(true);
  });
  it('rejects undersized pools and pools with no eligible character', () => {
    expect(() => starterTeam([17, 17, 246, 40, 5].map(character))).toThrow('five unique');
    expect(() => starterTeam([900001, 900002, 900003, 900004, 900005].map(character))).toThrow('No characters');
  });
  it('uses unique MAL IDs and complete descriptions', () => {
    expect(new Set(abilities.map(a => a.characterId)).size).toBe(abilities.length);
    expect(abilities.every(a => a.characterName && a.title && a.description)).toBe(true);
    expect(abilityFor(4)).toBeUndefined();
    expect(abilityFor(16)).toBeUndefined();
  });
});
