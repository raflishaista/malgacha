import { rarityFor } from './rarity';
export type Rarity = NonNullable<ReturnType<typeof rarityFor>>;
export type BaseStats = { hp: number; attack: number; defense: number; speed: number };
export const STAT_RULES = {
  N: { bst: 500, min: 75, max: 175 },
  R: { bst: 520, min: 77, max: 182 },
  SR: { bst: 545, min: 80, max: 192 },
  SSR: { bst: 570, min: 83, max: 202 },
  UR: { bst: 600, min: 85, max: 215 }
} as const;
export const STAT_LABELS = { hp: 'HP', attack: 'ATK', defense: 'DEF', speed: 'SPD' } as const;
export const STAT_KEYS = Object.keys(STAT_LABELS) as (keyof BaseStats)[];
export const STAT_BAR_MAX = Math.max(...Object.values(STAT_RULES).map(rule => rule.max));
export const STAT_DISTRIBUTION = { spread: 0.2, uniformChance: 0.08 };
export const statTotal = (stats: BaseStats) => STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);

/** Bounded weighted allocation, no rejection sampling. Shuffle removes assignment-order bias. */
export function generateBaseStats(rarity: Rarity, random = Math.random): BaseStats {
  const { bst, min, max } = STAT_RULES[rarity];
  if (4 * min > bst || 4 * max < bst) throw new Error('Infeasible stat configuration.');
  let remaining = bst;
  const values: number[] = [];
  for (let slots = 4; slots > 0; slots--) {
    const low = Math.max(min, remaining - (slots - 1) * max);
    const high = Math.min(max, remaining - (slots - 1) * min);
    const center = remaining / slots;
    const sigma = (max - min) * STAT_DISTRIBUTION.spread;
    const weights = Array.from({ length: high - low + 1 }, (_, i) => Math.exp(-0.5 * ((low + i - center) / sigma) ** 2));
    const total = weights.reduce((a, b) => a + b, 0);
    let ticket = random();
    let value = high;
    for (let i = 0; i < weights.length; i++) {
      ticket -= (1 - STAT_DISTRIBUTION.uniformChance) * weights[i] / total + STAT_DISTRIBUTION.uniformChance / weights.length;
      if (ticket < 0) { value = low + i; break; }
    }
    values.push(value); remaining -= value;
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return { hp: values[0], attack: values[1], defense: values[2], speed: values[3] };
}
