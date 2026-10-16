import { distributeStats, STAT_RULES } from './stats';
import type { JourneyCharacter } from './types';
export const BOSS_RULES = { hp: 1000, bst: 600, min: STAT_RULES.UR.min, max: STAT_RULES.UR.max };
export const SAHAQUIEL_ID = -1001; // Local boss identity; no MAL character record is required.
export const BOSS_ABILITY_RULES = { lureSeconds: 10, lureFraction: 0.25, bombSeconds: 5, bombMultiplier: 2.5, fiendBoost: 0.5, formeSeconds: 3, angelSeconds: 20 };
export const DEOXYS_FORMES = {
  normal: { name: 'Normal Forme', image: 'https://cdn.myanimelist.net/images/characters/4/282126.webp', modifiers: { attack: 0, defense: 0, speed: 0 } },
  attack: { name: 'Attack Forme', image: '/images/bosses/deoxys-attack.png', modifiers: { attack: 60, defense: -60, speed: 0 } },
  defense: { name: 'Defense Forme', image: '/images/bosses/deoxys-defense.png', modifiers: { attack: -80, defense: 80, speed: 0 } },
  speed: { name: 'Speed Forme', image: '/images/bosses/deoxys-speed.png', modifiers: { attack: -30, defense: -30, speed: 60 } }
} as const;
export const LURE = { id: 22849, name: 'LURE', image: 'https://cdn.myanimelist.net/images/characters/8/489580.webp', url: 'https://myanimelist.net/character/22849' };
export const BOSSES = [
  { id: 7345, name: 'Grand Fisher', image: 'https://cdn.myanimelist.net/images/characters/12/103060.webp', title: 'Lure', active: true, description: 'After 10 seconds without a lure, summons LURE with Taunt and one quarter of the boss’s stats. It can attack and must be defeated before the boss can be targeted again.' },
  { id: 7407, name: 'Kurama', image: 'https://cdn.myanimelist.net/images/characters/5/232183.webp', title: 'Tailed Beast Bomb', active: true, description: 'Every 5 seconds, hits all enemies for 2.5 times the damage of a normal attack.' },
  { id: 184112, name: 'Gun Devil', image: 'https://cdn.myanimelist.net/images/characters/7/500506.webp', title: 'Gun Fiend', active: true, description: 'Once on death, takes the player’s weakest member by base BST (first slot on ties) and returns at full HP. Uses the host’s current stats plus 50% of the boss’s stats. The host leaves the player’s side for this battle only.' },
  { id: 240069, name: 'Mahoraga', image: 'https://cdn.myanimelist.net/images/characters/8/625195.webp', title: 'Adaptation', description: 'After being affected by an ability once, becomes immune to that ability.' },
  { id: 74017, name: 'Deoxys', image: DEOXYS_FORMES.normal.image, title: 'Form Change', active: true, description: 'Starts in Normal Forme and switches to a different random forme every 3 seconds. Attack: +60 ATK, −60 DEF. Defense: +80 DEF, −80 ATK. Speed: +60 SPD, −30 ATK and DEF. Changes replace the previous forme’s bonuses.' },
  { id: SAHAQUIEL_ID, name: 'Sahaquiel', image: '/images/bosses/sahaquiel.webp', title: '10th Angel', active: true, description: 'Does not attack. At 20 seconds, kills every player unit and ends the battle in defeat. Defeat it before the countdown reaches zero. Time stop does not pause this countdown.' }
];
export const bossFor = (unit: Pick<JourneyCharacter, 'id' | 'bossId'>) => BOSSES.find(boss => boss.id === (unit.bossId ?? unit.id));
// Floor 10 is the encounter after nine wins. A loss leaves the boss floor pending.
export const isBossFloor = (wins: number) => (wins + 1) % 10 === 0;
export function rollBoss(instanceId: string, random = Math.random): JourneyCharacter {
  const boss = BOSSES[Math.floor(random() * BOSSES.length)];
  const [attack, defense, speed] = distributeStats(BOSS_RULES, 3, random);
  return { id: boss.id, name: boss.name, image: boss.image, url: boss.id > 0 ? `https://myanimelist.net/character/${boss.id}` : '', titles: [], instanceId, statRarity: 'UR', boss: true, ...(boss.id === 74017 ? { bossForm: 'normal' as const } : {}), baseStats: { hp: BOSS_RULES.hp, attack, defense, speed } };
}
