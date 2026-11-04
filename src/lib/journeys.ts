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
      const candidate = [0, 1, 2].map(offset => Array.from({ length: 5 }, (_, j) => draw[(offset + j) % draw.length]))
        .find(c => !seen.has(signature(c)));
      team = candidate ?? sample(unique, 5, random);
    }
    seen.add(signature(team)); teams.push(team);
  }
  return teams;
}
export { abilities };
export const abilityFor = (id: number) => abilities.find((ability) => ability.characterId === id);

export const NEW_TESTING_CHARACTERS: PoolCharacter[] = [
  {
    id: 164470,
    name: 'Fushiguro, Megumi',
    image: 'https://cdn.myanimelist.net/images/characters/11/427601.webp',
    favorites: 26000,
    url: 'https://myanimelist.net/character/164470',
    titles: [{ id: 40748, kind: 'anime', name: 'Jujutsu Kaisen', status: 'completed' }]
  },
  {
    id: 30,
    name: 'Freecss, Gon',
    image: 'https://cdn.myanimelist.net/images/characters/15/241957.webp',
    favorites: 42000,
    url: 'https://myanimelist.net/character/30',
    titles: [{ id: 11061, kind: 'anime', name: 'Hunter x Hunter (2011)', status: 'completed' }]
  },
  {
    id: 27,
    name: 'Zoldyck, Killua',
    image: 'https://cdn.myanimelist.net/images/characters/2/327920.webp',
    favorites: 98000,
    url: 'https://myanimelist.net/character/27',
    titles: [{ id: 11061, kind: 'anime', name: 'Hunter x Hunter (2011)', status: 'completed' }]
  },
  {
    id: 175543,
    name: 'Fushiguro, Toji',
    image: 'https://cdn.myanimelist.net/images/characters/14/517336.webp',
    favorites: 14000,
    url: 'https://myanimelist.net/character/175543',
    titles: [{ id: 43608, kind: 'anime', name: 'Jujutsu Kaisen 2nd Season', status: 'completed' }]
  },
  {
    id: 164482,
    name: "Zen'in, Maki",
    image: 'https://cdn.myanimelist.net/images/characters/5/423579.webp',
    favorites: 6500,
    url: 'https://myanimelist.net/character/164482',
    titles: [{ id: 40748, kind: 'anime', name: 'Jujutsu Kaisen', status: 'completed' }]
  },
  {
    id: 1336,
    name: 'Aznable, Char',
    image: 'https://cdn.myanimelist.net/images/characters/7/41374.webp',
    favorites: 4800,
    url: 'https://myanimelist.net/character/1336',
    titles: [{ id: 80, kind: 'anime', name: 'Mobile Suit Gundam', status: 'completed' }]
  },
  {
    id: 40881,
    name: 'Ackerman, Mikasa',
    image: 'https://cdn.myanimelist.net/images/characters/9/215563.webp',
    favorites: 55000,
    url: 'https://myanimelist.net/character/40881',
    titles: [{ id: 16498, kind: 'anime', name: 'Shingeki no Kyojin', status: 'completed' }]
  },
  {
    id: 46494,
    name: 'Arlert, Armin',
    image: 'https://cdn.myanimelist.net/images/characters/3/218057.webp',
    favorites: 16000,
    url: 'https://myanimelist.net/character/46494',
    titles: [{ id: 16498, kind: 'anime', name: 'Shingeki no Kyojin', status: 'completed' }]
  },
  {
    id: 62,
    name: 'Roronoa, Zoro',
    image: 'https://cdn.myanimelist.net/images/characters/3/100534.webp',
    favorites: 116558,
    url: 'https://myanimelist.net/character/62',
    titles: [{ id: 21, kind: 'anime', name: 'One Piece', status: 'completed' }]
  },
  {
    id: 2072,
    name: 'Portgas D., Ace',
    image: 'https://cdn.myanimelist.net/images/characters/12/56234.webp',
    favorites: 38000,
    url: 'https://myanimelist.net/character/2072',
    titles: [{ id: 21, kind: 'anime', name: 'One Piece', status: 'completed' }]
  },
  {
    id: 305,
    name: 'Sanji',
    image: 'https://cdn.myanimelist.net/images/characters/5/136769.webp',
    favorites: 88000,
    url: 'https://myanimelist.net/character/305',
    titles: [{ id: 21, kind: 'anime', name: 'One Piece', status: 'completed' }]
  }
];

export function testingStarterTeam(
  pool: Record<number, PoolCharacter> | PoolCharacter[] = {},
  random = Math.random
): PoolCharacter[] {
  const poolList = Array.isArray(pool) ? pool : Object.values(pool);
  const poolMap = new Map<number, PoolCharacter>(poolList.map((c) => [c.id, c]));

  // Pick 1 guaranteed character with one of the new abilities
  const eligible = NEW_TESTING_CHARACTERS.map((char) => poolMap.get(char.id) ?? char);
  const guaranteed = eligible[Math.floor(random() * eligible.length)];

  // The 4 other slots are random from the rest of the pool
  const allCandidates = [
    ...poolList,
    ...NEW_TESTING_CHARACTERS.map((c) => poolMap.get(c.id) ?? c)
  ];
  const uniqueRest = [...new Map(allCandidates.map((c) => [c.id, c])).values()].filter(
    (c) => c.id !== guaranteed.id
  );

  const rest = [...uniqueRest];
  for (let i = 0; i < 4 && i < rest.length; i++) {
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
