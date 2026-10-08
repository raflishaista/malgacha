import { distributeStats, STAT_RULES } from './stats';
import type { JourneyCharacter } from './types';
export const BOSS_RULES = { hp: 500, bst: 510, min: STAT_RULES.UR.min, max: STAT_RULES.UR.max };
export const BOSSES = [
  { id: 7345, name: 'Grand Fisher', image: 'https://cdn.myanimelist.net/images/characters/12/103060.webp', title: 'Lure', description: 'Periodically summons a substitute with Taunt. The player must defeat the substitute first.' },
  { id: 7407, name: 'Kurama', image: 'https://cdn.myanimelist.net/images/characters/5/232183.webp', title: 'Tailed Beast Bomb', description: 'Periodically unleashes an attack that damages all enemies.' },
  { id: 184112, name: 'Gun Devil', image: 'https://cdn.myanimelist.net/images/characters/7/500506.webp', title: 'Gun Fiend', description: 'Upon death, takes a random unit from the player’s team and revives using that unit’s stats with a boost.' },
  { id: 240069, name: 'Mahoraga', image: 'https://cdn.myanimelist.net/images/characters/8/625195.webp', title: 'Adaptation', description: 'After being affected by an ability once, becomes immune to that ability.' },
  { id: 74017, name: 'Deoxys', image: 'https://cdn.myanimelist.net/images/characters/4/282126.webp', title: 'Form Change', description: 'Periodically switches between Attack, Defense, and Speed formes, boosting the corresponding stat.' }
];
// Floor 10 is the encounter after nine wins. A loss leaves the boss floor pending.
export const isBossFloor = (wins: number) => (wins + 1) % 10 === 0;
export function rollBoss(instanceId: string, random = Math.random): JourneyCharacter {
  const boss = BOSSES[Math.floor(random() * BOSSES.length)];
  const [attack, defense, speed] = distributeStats(BOSS_RULES, 3, random);
  return { id: boss.id, name: boss.name, image: boss.image, url: `https://myanimelist.net/character/${boss.id}`, titles: [], instanceId, statRarity: 'UR', boss: true, baseStats: { hp: BOSS_RULES.hp, attack, defense, speed } };
}
