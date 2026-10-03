import abilities from './data/abilities.json';
import type { PoolCharacter } from './types';
import { sample } from './pool';
/** Distinct five-member lineups; characters may recur across opponents. */
export function opponentTeams(pool: PoolCharacter[], random = Math.random): PoolCharacter[][] {
  const unique = [...new Map(pool.map(c => [c.id, c])).values()];
  if (unique.length < 6) throw new Error('At least six unique characters are needed for three different opponent teams.');
  const teams: PoolCharacter[][] = [];
  const seen = new Set<string>();
  const signature = (team: PoolCharacter[]) => team.map(c => c.id).sort((a, b) => a - b).join(',');
  for (let i = 0; i < 3; i++) {
    let team = sample(unique, 5, random);
    if (seen.has(signature(team))) {
      // Three distinct windows guarantee a free choice, without unbounded retries.
      const draw = sample(unique, Math.min(10, unique.length), random);
      team = [0, 1, 2].map(offset => Array.from({ length: 5 }, (_, j) => draw[(offset + j) % draw.length]))
        .find(candidate => !seen.has(signature(candidate)))!;
    }
    seen.add(signature(team)); teams.push(team);
  }
  return teams;
}
export { abilities };
export const abilityFor = (id: number) => abilities.find((ability) => ability.characterId === id);
export function starterTeam(pool: PoolCharacter[], random = Math.random): PoolCharacter[] {
  const unique = [...new Map(pool.map((c) => [c.id, c])).values()];
  if (unique.length < 5) throw new Error('This collection needs at least five unique characters. Try another profile or the demo.');
  const eligible = unique.filter((c) => abilityFor(c.id));
  if (!eligible.length) throw new Error('No characters in this collection have a listed passive ability yet. Try another profile or the demo.');
  const guaranteed = eligible[Math.floor(random() * eligible.length)];
  const rest = unique.filter((c) => c.id !== guaranteed.id);
  for (let i = 0; i < 4; i++) {
    const j = i + Math.floor(random() * (rest.length - i));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const team = [guaranteed, ...rest.slice(0, 4)];
  for (let i = team.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [team[i], team[j]] = [team[j], team[i]];
  }
  return team;
}
