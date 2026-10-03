import { expect, it } from 'vitest';
import { generateBaseStats, STAT_RULES, statTotal, type Rarity } from './stats';
function seeded() { let seed = 123456; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
for (const rarity of Object.keys(STAT_RULES) as Rarity[]) {
  it(`${rarity}: 10000 rolls preserve totals/bounds, center all slots and keep extremes uncommon`, () => {
    const rule = STAT_RULES[rarity];
    const random = seeded();
    const sums = [0, 0, 0, 0];
    const unique = new Set<string>();
    let extreme = 0;
    let moderate = 0;
    for (let i = 0; i < 10000; i++) {
      const stats = generateBaseStats(rarity, random);
      if (statTotal(stats) !== rule.bst) throw new Error('Incorrect BST');
      const values = Object.values(stats);
      values.forEach((value, index) => {
        if (!Number.isInteger(value) || value < rule.min || value > rule.max) throw new Error('Invalid stat');
        
        
        sums[index] += value;
      });
      if (values.some(v => v === rule.min || v === rule.max)) extreme++;
      if (values.every(v => Math.abs(v - rule.bst / 4) < (rule.max - rule.min) * 0.35)) moderate++;
      unique.add(JSON.stringify(stats));
    }
    sums.forEach(sum => expect(Math.abs(sum / 10000 - rule.bst / 4)).toBeLessThan(1.5));
    expect(unique.size).toBeGreaterThan(9500);
    expect(extreme).toBeGreaterThan(0);
    expect(extreme).toBeLessThan(1000);
    expect(moderate).toBeGreaterThan(5000);
    // All configured endpoints are reachable while leaving a feasible remainder.
    expect(rule.bst - rule.min).toBeLessThanOrEqual(3 * rule.max);
    expect(rule.bst - rule.max).toBeGreaterThanOrEqual(3 * rule.min);
  });
}
it('can reach the extreme N allocation without a retry loop', () => {
  const draws = [0, 0.99999999, 0, 0, 0.99, 0.99, 0.99];
  expect(Object.values(generateBaseStats('N', () => draws.shift()!))).toEqual([75, 175, 75, 175]);
});

