import abilities from './data/abilities.json';
import type { JourneyCharacter, PoolCharacter } from './types';
import { sample } from './pool';
import { rarityFor } from './rarity';
import { generateBaseStats, type Rarity } from './stats';

export const IMPLEMENTED_ABILITY_IDS: readonly number[] = abilities.map((a) => a.characterId);

export const RARITY_RANK: Record<Rarity, number> = {
  N: 0,
  R: 1,
  SR: 2,
  SSR: 3,
  UR: 4
};

export type OpponentTierRule = {
  maxFloor: number;
  teamSize: number;
  naturals: ('N' | 'R' | 'SR' | 'SSR' | 'UR' | 'random')[];
  promoted: ('R' | 'SR' | 'SSR' | 'UR')[];
  naturalAbilities: number;
  promotedAbilities: number;
  totalAbilities: number;
};

export const OPPONENT_SCALING_RULES: OpponentTierRule[] = [
  // 1-10: 5 random units
  { maxFloor: 10, teamSize: 5, naturals: ['random', 'random', 'random', 'random', 'random'], promoted: [], naturalAbilities: 0, promotedAbilities: 0, totalAbilities: 0 },
  // 10-20: 1 r
  { maxFloor: 20, teamSize: 5, naturals: ['R', 'random', 'random', 'random', 'random'], promoted: [], naturalAbilities: 0, promotedAbilities: 0, totalAbilities: 0 },
  // 20-30: 3 r  1 ability 1 promoted r
  { maxFloor: 30, teamSize: 5, naturals: ['R', 'R', 'random', 'random'], promoted: ['R'], naturalAbilities: 1, promotedAbilities: 0, totalAbilities: 1 },
  // 30-40: 5 r 1 ability 3 promoted r 1 promoted ability
  { maxFloor: 40, teamSize: 5, naturals: ['R', 'R'], promoted: ['R', 'R', 'R'], naturalAbilities: 1, promotedAbilities: 1, totalAbilities: 2 },
  // 40-50: 4 r 1 sr 1 ability 3 promoted r 1 promoted ability
  { maxFloor: 50, teamSize: 5, naturals: ['SR', 'R'], promoted: ['R', 'R', 'R'], naturalAbilities: 1, promotedAbilities: 1, totalAbilities: 2 },
  // 50-60: 2r 3 sr 1 ability 1 promoted sr 1 promoted r 1 promoted ability
  { maxFloor: 60, teamSize: 5, naturals: ['SR', 'SR', 'R'], promoted: ['SR', 'R'], naturalAbilities: 1, promotedAbilities: 1, totalAbilities: 2 },
  // 60-70: 4 sr 1 r 2 ability 3 promoted sr 1 promoted ability
  { maxFloor: 70, teamSize: 5, naturals: ['SR', 'R'], promoted: ['SR', 'SR', 'SR'], naturalAbilities: 2, promotedAbilities: 1, totalAbilities: 3 },
  // 70-80: 4 sr 1 ssr 2 ability 3 promoted sr 1 promoted ability
  { maxFloor: 80, teamSize: 5, naturals: ['SSR', 'SR'], promoted: ['SR', 'SR', 'SR'], naturalAbilities: 2, promotedAbilities: 1, totalAbilities: 3 },
  // 80-90: 3 sr 2 ssr 3 ability 1 promoted sr 1 promoted ability
  { maxFloor: 90, teamSize: 5, naturals: ['SSR', 'SSR', 'SR', 'SR'], promoted: ['SR'], naturalAbilities: 3, promotedAbilities: 1, totalAbilities: 4 },
  // 90-100: 4 ssr 1 sr 3 ability 2 promoted ssr 1 promoted ability
  { maxFloor: 100, teamSize: 5, naturals: ['SSR', 'SSR', 'SR'], promoted: ['SSR', 'SSR'], naturalAbilities: 3, promotedAbilities: 1, totalAbilities: 4 },
  // 100-110: 5 ssr 1 random 4 ability 2 promoted ssr 1 promoted ability
  { maxFloor: 110, teamSize: 6, naturals: ['SSR', 'SSR', 'SSR', 'random'], promoted: ['SSR', 'SSR'], naturalAbilities: 4, promotedAbilities: 1, totalAbilities: 5 },
  // 110-120: 1 ur 4 ssr 1 r 4 ability 1 promoted ur 2 promoted ssr 2 PROMOTED ABILITY
  { maxFloor: 120, teamSize: 6, naturals: ['SSR', 'SSR', 'R'], promoted: ['UR', 'SSR', 'SSR'], naturalAbilities: 4, promotedAbilities: 2, totalAbilities: 6 },
  // 120-130: 3 ur 2 ssr 1 sr 5 ability 1 promoted ur  1 promoted ability
  { maxFloor: 130, teamSize: 6, naturals: ['UR', 'UR', 'SSR', 'SSR', 'SR'], promoted: ['UR'], naturalAbilities: 5, promotedAbilities: 1, totalAbilities: 6 },
  // 130-140: 4 ur 2 ssr 6 ability 2 promoted ur
  { maxFloor: 140, teamSize: 6, naturals: ['UR', 'UR', 'SSR', 'SSR'], promoted: ['UR', 'UR'], naturalAbilities: 6, promotedAbilities: 0, totalAbilities: 6 },
  // 140-150: 6 ur 8 abilities 3 promoted ur
  { maxFloor: 150, teamSize: 6, naturals: ['UR', 'UR', 'UR'], promoted: ['UR', 'UR', 'UR'], naturalAbilities: 6, promotedAbilities: 2, totalAbilities: 8 },
  // 150-160: 6 ur 1 random 9 abilities 3 promoted ur
  { maxFloor: 160, teamSize: 7, naturals: ['UR', 'UR', 'UR', 'random'], promoted: ['UR', 'UR', 'UR'], naturalAbilities: 7, promotedAbilities: 2, totalAbilities: 9 },
  // 160-170: 6 ur 1 r 10 abilities 3 promoted ur
  { maxFloor: 170, teamSize: 7, naturals: ['UR', 'UR', 'UR', 'R'], promoted: ['UR', 'UR', 'UR'], naturalAbilities: 7, promotedAbilities: 3, totalAbilities: 10 },
  // 170-180: 6 ur 1 sr 12 abilities 3 promoted ur
  { maxFloor: 180, teamSize: 7, naturals: ['UR', 'UR', 'UR', 'SR'], promoted: ['UR', 'UR', 'UR'], naturalAbilities: 7, promotedAbilities: 5, totalAbilities: 12 },
  // 180-190: 6 ur 1 ssr 14 abilities 3 promoted ur
  { maxFloor: 190, teamSize: 7, naturals: ['UR', 'UR', 'UR', 'SSR'], promoted: ['UR', 'UR', 'UR'], naturalAbilities: 7, promotedAbilities: 7, totalAbilities: 14 },
  // 190-200+: 7 ur 16 abiilities 4 promoted ur
  { maxFloor: Infinity, teamSize: 7, naturals: ['UR', 'UR', 'UR'], promoted: ['UR', 'UR', 'UR', 'UR'], naturalAbilities: 7, promotedAbilities: 9, totalAbilities: 16 }
];

export function buildScaledOpponentTeam(
  rule: OpponentTierRule,
  pool: PoolCharacter[],
  random = Math.random
): (PoolCharacter & Partial<JourneyCharacter>)[] {
  const unique = [...new Map(pool.map((c) => [c.id, c])).values()];
  const used = new Set<number>();

  const pickCandidate = (candidates: PoolCharacter[]): PoolCharacter => {
    const unpicked = candidates.filter((c) => !used.has(c.id));
    const targetPool = unpicked.length ? unpicked : candidates.length ? candidates : unique;
    const choice = targetPool[Math.floor(random() * targetPool.length)];
    used.add(choice.id);
    return choice;
  };

  const team: (PoolCharacter & Partial<JourneyCharacter>)[] = [];

  // Pick promoted units first (lower natural rarity than target promoted tier)
  for (const promotedTarget of rule.promoted) {
    const lower = unique.filter(
      (c) => RARITY_RANK[rarityFor(c.favorites) ?? 'N'] < RARITY_RANK[promotedTarget]
    );
    const chosen = pickCandidate(lower);
    team.push({
      ...chosen,
      statRarity: promotedTarget,
      rarityOverride: promotedTarget,
      baseStats: generateBaseStats(promotedTarget, random)
    });
  }

  // Pick natural units
  for (const naturalTarget of rule.naturals) {
    if (naturalTarget === 'random') {
      const chosen = pickCandidate(unique);
      const statRarity = rarityFor(chosen.favorites) ?? 'N';
      team.push({
        ...chosen,
        statRarity,
        baseStats: generateBaseStats(statRarity, random)
      });
    } else {
      const matching = unique.filter((c) => (rarityFor(c.favorites) ?? 'N') === naturalTarget);
      const chosen = pickCandidate(matching);
      team.push({
        ...chosen,
        statRarity: naturalTarget,
        rarityOverride: naturalTarget,
        baseStats: generateBaseStats(naturalTarget, random)
      });
    }
  }

  // Ensure natural abilities quota
  let unitsWithAbility = team.filter((u) => abilityFor(u.id) !== undefined).length;
  if (unitsWithAbility < rule.naturalAbilities) {
    const noAbilityUnits = team.filter(
      (u) => abilityFor(u.id) === undefined && (!u.extraAbilities || u.extraAbilities.length === 0)
    );
    noAbilityUnits.sort((a, b) => (RARITY_RANK[b.statRarity ?? 'N'] ?? 0) - (RARITY_RANK[a.statRarity ?? 'N'] ?? 0));
    for (const unit of noAbilityUnits) {
      if (unitsWithAbility >= rule.naturalAbilities) break;
      const available = IMPLEMENTED_ABILITY_IDS.filter(
        (id) => id !== unit.id && !(unit.extraAbilities ?? []).includes(id)
      );
      if (available.length) {
        const abilityId = available[Math.floor(random() * available.length)];
        unit.extraAbilities = [abilityId];
        unitsWithAbility++;
      }
    }
  }

  // Distribute remaining abilities to reach totalAbilities evenly, prioritizing higher rarity
  const countAbilities = (u: PoolCharacter & Partial<JourneyCharacter>) =>
    (abilityFor(u.id) !== undefined ? 1 : 0) + (u.extraAbilities?.length ?? 0);

  let currentTotal = team.reduce((sum, u) => sum + countAbilities(u), 0);
  while (currentTotal < rule.totalAbilities) {
    const minCount = Math.min(...team.map((u) => countAbilities(u)));
    let candidates = team.filter((u) => countAbilities(u) === minCount && countAbilities(u) < 3);
    if (!candidates.length) {
      candidates = team.filter((u) => countAbilities(u) < 3);
    }
    if (!candidates.length) break;

    candidates.sort((a, b) => (RARITY_RANK[b.statRarity ?? 'N'] ?? 0) - (RARITY_RANK[a.statRarity ?? 'N'] ?? 0));
    const topTierRank = RARITY_RANK[candidates[0].statRarity ?? 'N'] ?? 0;
    const topCandidates = candidates.filter(
      (c) => (RARITY_RANK[c.statRarity ?? 'N'] ?? 0) === topTierRank
    );
    const chosen = topCandidates[Math.floor(random() * topCandidates.length)];

    const available = IMPLEMENTED_ABILITY_IDS.filter(
      (id) => id !== chosen.id && !(chosen.extraAbilities ?? []).includes(id)
    );
    if (!available.length) break;
    const abilityId = available[Math.floor(random() * available.length)];
    chosen.extraAbilities = [...(chosen.extraAbilities ?? []), abilityId];
    currentTotal++;
  }

  // Shuffle team members order
  for (let i = team.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [team[i], team[j]] = [team[j], team[i]];
  }

  return team;
}

/** Distinct team lineups; characters may recur across opponents. */
export function opponentTeams(
  pool: PoolCharacter[],
  random = Math.random,
  floor = 1
): (PoolCharacter & Partial<JourneyCharacter>)[][] {
  const unique = [...new Map(pool.map((c) => [c.id, c])).values()];
  if (unique.length < 6) {
    throw new Error('At least six unique characters are needed for three different opponent teams.');
  }

  const rule =
    OPPONENT_SCALING_RULES.find((r) => floor <= r.maxFloor) ??
    OPPONENT_SCALING_RULES[OPPONENT_SCALING_RULES.length - 1];

  if (rule.maxFloor <= 10) {
    const teams: (PoolCharacter & Partial<JourneyCharacter>)[][] = [];
    const seen = new Set<string>();
    const signature = (team: PoolCharacter[]) =>
      team
        .map((c) => c.id)
        .sort((a, b) => a - b)
        .join(',');
    for (let i = 0; i < 3; i++) {
      let team = sample(unique, 5, random);
      if (seen.has(signature(team))) {
        // Three distinct windows guarantee a free choice, without unbounded retries.
        const draw = sample(unique, Math.min(10, unique.length), random);
        const candidate = [0, 1, 2]
          .map((offset) =>
            Array.from({ length: 5 }, (_, j) => draw[(offset + j) % draw.length])
          )
          .find((c) => !seen.has(signature(c)));
        team = candidate ?? sample(unique, 5, random);
      }
      seen.add(signature(team));
      teams.push(team);
    }
    return teams;
  }

  const teams: (PoolCharacter & Partial<JourneyCharacter>)[][] = [];
  const seen = new Set<string>();
  const signature = (team: (PoolCharacter & Partial<JourneyCharacter>)[]) =>
    team
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(',');

  for (let i = 0; i < 3; i++) {
    let team = buildScaledOpponentTeam(rule, unique, random);
    let attempts = 0;
    while (seen.has(signature(team)) && attempts < 10) {
      team = buildScaledOpponentTeam(rule, unique, random);
      attempts++;
    }
    seen.add(signature(team));
    teams.push(team);
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
