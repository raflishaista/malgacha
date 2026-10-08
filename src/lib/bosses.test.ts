import { expect, it } from 'vitest';
import { BOSSES, BOSS_RULES, isBossFloor, rollBoss } from './bosses';
import { simulateBattle } from './autobattle';
it('schedules bosses at the tenth, twentieth and thirtieth encounters', () => {
  expect([0, 8, 9, 10, 19, 20, 29].map(isBossFloor)).toEqual([false, false, true, false, true, false, true]);
});
it('rolls fixed HP and exactly 510 bounded combat stats', () => {
  for (let i = 0; i < 1000; i++) {
    const boss = rollBoss(String(i));
    const { hp, attack, defense, speed } = boss.baseStats;
    expect(hp).toBe(500);
    expect(attack + defense + speed).toBe(510);
    expect([attack, defense, speed].every(n => n >= BOSS_RULES.min && n <= BOSS_RULES.max)).toBe(true);
    expect(BOSSES.some(b => b.id === boss.id)).toBe(true);
  }
});
it('runs a 5v1 battle with random normal attacks and no boss ability events', () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ ...rollBoss(String(i)), boss: false, id: i }));
  for (const entry of BOSSES) {
    const boss = { ...rollBoss('boss'), id: entry.id };
    const replay = simulateBattle(players, [boss]);
    expect(replay.units).toHaveLength(6);
    expect(replay.events.some(e => e.attacker === 5)).toBe(true);
    expect(replay.events.every(e => e.attacker < 6 && e.target < 6 && !e.ability)).toBe(true);
  }
});
