import { describe, expect, it } from 'vitest';
import { abilities, abilityFor, starterTeam, opponentTeams, testingStarterTeam, NEW_TESTING_CHARACTERS } from './journeys';
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
  it('rolls five unique characters with one guaranteed new ability and four random for testing', () => {
    expect(NEW_TESTING_CHARACTERS).toHaveLength(11);
    expect(NEW_TESTING_CHARACTERS.some(c => c.id === 175543 && c.name.includes('Toji'))).toBe(true);
    expect(NEW_TESTING_CHARACTERS.every(c => abilityFor(c.id) !== undefined)).toBe(true);

    const pool = Array.from({ length: 10 }, (_, i) => character(900000 + i));
    const team = testingStarterTeam(pool);
    expect(team).toHaveLength(5);
    expect(new Set(team.map(c => c.id)).size).toBe(5);
    // At least one unit must be one of the new ability characters
    expect(team.some(c => NEW_TESTING_CHARACTERS.some(a => a.id === c.id))).toBe(true);

    // Custom pool characters are preferred when present
    const customPool = Object.fromEntries(NEW_TESTING_CHARACTERS.map(c => [c.id, { ...c, name: `Custom ${c.name}` }]));
    const customTeam = testingStarterTeam(customPool);
    expect(customTeam.some(c => c.name.startsWith('Custom '))).toBe(true);
  });

  it('scales opponent teams by floor according to tier rules', () => {
    const diversePool = [
      ...Array.from({ length: 5 }, (_, i) => ({ ...character(100 + i), favorites: 10 })), // N
      ...Array.from({ length: 5 }, (_, i) => ({ ...character(200 + i), favorites: 500 })), // R
      ...Array.from({ length: 5 }, (_, i) => ({ ...character(300 + i), favorites: 2000 })), // SR
      ...Array.from({ length: 5 }, (_, i) => ({ ...character(400 + i), favorites: 6000 })), // SSR
      ...Array.from({ length: 5 }, (_, i) => ({ ...character(500 + i), favorites: 25000 })) // UR
    ];

    // Floor 5: 5 random units
    const floor5Teams = opponentTeams(diversePool, () => 0.5, 5);
    expect(floor5Teams[0]).toHaveLength(5);

    // Floor 35 (Tier 4): 5 R units, 2 abilities
    const floor35Teams = opponentTeams(diversePool, () => 0.5, 35);
    expect(floor35Teams[0]).toHaveLength(5);
    expect(floor35Teams[0].every((u) => u.statRarity === 'R')).toBe(true);
    const countAbilities = (u: any) => (abilityFor(u.id) ? 1 : 0) + (u.extraAbilities?.length ?? 0);
    const total35Abilities = floor35Teams[0].reduce((s, u) => s + countAbilities(u), 0);
    expect(total35Abilities).toBe(2);

    // Floor 105 (Tier 11): 6 units (5 SSR + 1 random), 5 abilities
    const floor105Teams = opponentTeams(diversePool, () => 0.5, 105);
    expect(floor105Teams[0]).toHaveLength(6);
    const total105Abilities = floor105Teams[0].reduce((s, u) => s + countAbilities(u), 0);
    expect(total105Abilities).toBe(5);

    // Floor 145 (Tier 15): 6 units (6 UR), 8 abilities evenly spread (min 1, max 2)
    const floor145Teams = opponentTeams(diversePool, () => 0.5, 145);
    expect(floor145Teams[0]).toHaveLength(6);
    expect(floor145Teams[0].every((u) => u.statRarity === 'UR')).toBe(true);
    const total145Abilities = floor145Teams[0].reduce((s, u) => s + countAbilities(u), 0);
    expect(total145Abilities).toBe(8);
    const counts145 = floor145Teams[0].map(countAbilities);
    expect(Math.min(...counts145)).toBe(1);
    expect(Math.max(...counts145)).toBe(2);

    // Floor 195 (Tier 20): 7 units (7 UR), 16 abilities evenly spread (min 2, max 3)
    const floor195Teams = opponentTeams(diversePool, () => 0.5, 195);
    expect(floor195Teams[0]).toHaveLength(7);
    expect(floor195Teams[0].every((u) => u.statRarity === 'UR')).toBe(true);
    const total195Abilities = floor195Teams[0].reduce((s, u) => s + countAbilities(u), 0);
    expect(total195Abilities).toBe(16);
    const counts195 = floor195Teams[0].map(countAbilities);
    expect(Math.min(...counts195)).toBe(2);
    expect(Math.max(...counts195)).toBe(3);
  });
});
