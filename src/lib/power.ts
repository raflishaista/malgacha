import type { PoolCharacter } from './types';
export const tiers = ['11-C','11-B','11-A','10-C','10-B','10-A','9-C','9-B','9-A','8-C','High 8-C','8-B','8-A','Low 7-C','7-C','High 7-C','Low 7-B','7-B','7-A','High 7-A','6-C','High 6-C','Low 6-B','6-B','High 6-B','6-A','High 6-A','5-C','Low 5-B','5-B','5-A','High 5-A','Low 4-C','4-C','High 4-C','4-B','4-A','3-C','3-B','3-A','High 3-A','Low 2-C','2-C','2-B','2-A','Low 1-C','1-C','High 1-C','1-B','High 1-B','Low 1-A','1-A','High 1-A','High 1-A+','0'] as const;
export type Power = { tier: string | null; status: 'ranked' | 'unmatched' | 'unavailable'; url?: string; page?: string; raw?: string; key?: string; checkedAt: string };
export function topPower(team: PoolCharacter[]) {
 return team.reduce<string | null>((best, c) => {
  const tier = c.power?.tier;
  return tier && tiers.indexOf(tier as typeof tiers[number]) > tiers.indexOf(best as typeof tiers[number]) ? tier : best;
 }, null);
}
export function powerWinner(left: PoolCharacter[], right: PoolCharacter[]) {
 const a = topPower(left), b = topPower(right);
 if (!a || !b) return 'Insufficient tier data';
 const diff = tiers.indexOf(a as typeof tiers[number]) - tiers.indexOf(b as typeof tiers[number]);
 return diff === 0 ? 'Draw!' : diff > 0 ? 'Player 1 wins!' : 'Player 2 wins!';
}
