import bossesData from './data/bosses.json';
import { distributeStats, STAT_RULES } from './stats';
import type { JourneyCharacter } from './types';

export interface BossDefinition {
  id: number;
  name: string;
  image: string;
  title: string;
  active?: boolean;
  description: string;
}

export const BOSS_RULES = {
  hp: 1000,
  bst: 600,
  min: STAT_RULES.UR.min,
  max: STAT_RULES.UR.max
} as const;

export const SAHAQUIEL_ID = -1001; // Local boss identity; no MAL character record is required.

export const BOSS_ABILITY_RULES = {
  lureSeconds: 10,
  lureFraction: 0.25,
  bombSeconds: 5,
  bombMultiplier: 1.5,
  fiendBoost: 0.3,
  formeSeconds: 3,
  angelSeconds: 25
} as const;

export const DEOXYS_FORMES = {
  normal: {
    name: 'Normal Forme',
    image: 'https://cdn.myanimelist.net/images/characters/4/282126.webp',
    modifiers: { attack: 0, defense: 0, speed: 0 }
  },
  attack: {
    name: 'Attack Forme',
    image: '/images/bosses/deoxys-attack.png',
    modifiers: { attack: 60, defense: -60, speed: 0 }
  },
  defense: {
    name: 'Defense Forme',
    image: '/images/bosses/deoxys-defense.png',
    modifiers: { attack: -80, defense: 80, speed: 0 }
  },
  speed: {
    name: 'Speed Forme',
    image: '/images/bosses/deoxys-speed.png',
    modifiers: { attack: -30, defense: -30, speed: 60 }
  }
} as const;

export const LURE = {
  id: 22849,
  name: 'LURE',
  image: 'https://cdn.myanimelist.net/images/characters/8/489580.webp',
  url: 'https://myanimelist.net/character/22849'
} as const;

export const BOSSES: readonly BossDefinition[] = bossesData;

/**
 * Returns the boss definition for a given character if they are a boss.
 */
export function bossFor(unit: Pick<JourneyCharacter, 'id' | 'bossId'>): BossDefinition | undefined {
  const bossId = unit.bossId ?? unit.id;
  return BOSSES.find(boss => boss.id === bossId);
}

/**
 * Floor 10 is the encounter after 9 cleared wins (10th encounter).
 * Boss floors occur every 10 floors (10, 20, 30, ...).
 */
export function isBossFloor(wins: number): boolean {
  return (wins + 1) % 10 === 0;
}

/**
 * Rolls a random boss instance with standard boss stats.
 */
export function rollBoss(instanceId: string, random = Math.random): JourneyCharacter {
  const boss = BOSSES[Math.floor(random() * BOSSES.length)];
  const [attack, defense, speed] = distributeStats(BOSS_RULES, 3, random);

  return {
    id: boss.id,
    name: boss.name,
    image: boss.image,
    url: boss.id > 0 ? `https://myanimelist.net/character/${boss.id}` : '',
    titles: [],
    instanceId,
    statRarity: 'UR',
    boss: true,
    ...(boss.id === 74017 ? { bossForm: 'normal' as const } : {}),
    baseStats: {
      hp: BOSS_RULES.hp,
      attack,
      defense,
      speed
    }
  };
}
