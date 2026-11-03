import { randomUUID } from 'node:crypto';
import type { JourneyCharacter } from '../types';
import { STAT_KEYS } from '../stats';
import { abilityIds } from '../battle/abilities';
import { keywordsFor } from '../battle/keywords';
import { emptySlot } from './inventory';

export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'] as const;

export function fuseUnits(first: JourneyCharacter, second: JourneyCharacter): JourneyCharacter {
  const a = first.fusionRoot ?? first;
  const b = second.fusionRoot ?? second;

  const rarity =
    RARITY_ORDER.indexOf(first.statRarity) >= RARITY_ORDER.indexOf(second.statRarity)
      ? first.statRarity
      : second.statRarity;

  const root = structuredClone(a);
  const traits = [a, b];
  const abilities = [...new Set(traits.flatMap((unit) => abilityIds(unit).slice(0, 1)))];
  const keys = [...new Set(traits.flatMap((unit) => keywordsFor(unit).slice(0, 1)))];

  const baseStats = Object.fromEntries(
    STAT_KEYS.map((key) => [key, (first.baseStats[key] + second.baseStats[key]) * 0.75])
  ) as JourneyCharacter['baseStats'];

  return {
    id: -2000,
    instanceId: randomUUID(),
    name: 'FUSED UNIT',
    image: a.image,
    url: '',
    titles: [...a.titles, ...b.titles],
    favorites: Math.max(a.favorites ?? 0, b.favorites ?? 0),
    statRarity: rarity,
    rarityOverride: rarity,
    baseStats,
    fusionImages: [a.image ?? '', b.image ?? ''],
    fusionRoot: root,
    extraAbilities: abilities,
    keywords: keys.filter((key) => key === 'TAUNT' || key === 'LIFESTEAL'),
    soulGem: keys.includes('SOUL GEM'),
    marine: keys.includes('MARINE SOLIDARITY'),
    sukunaStacks: keys.includes('HOST OF SUKUNA')
      ? Math.max(a.sukunaStacks ?? 0, b.sukunaStacks ?? 0)
      : undefined,
    equipment: traits.flatMap((unit) =>
      (unit.equipment ?? []).filter((item) => item.itemId !== 'potara').slice(0, 1)
    )
  };
}

export function fusePair(team: JourneyCharacter[], first: number, second: number) {
  team[first] = fuseUnits(team[first], team[second]);
  team[second] = emptySlot();
}
