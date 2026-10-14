import { expect, it } from 'vitest';
import { BattleStatuses, STATUS_RULES } from './statuses';

it('refreshes Burn while preserving its next tick, expires it, and clears it on death/revive', () => {
  const statuses = new BattleStatuses(1);
  statuses.burn(0, 0, 2);
  statuses.burn(0, 0.5, 3);
  expect(statuses.nextBurn(0)).toBe(1);
  expect(statuses.tickBurn(0, 1)).toEqual({ source: 3, hpFraction: 0.03 });
  for (let time = 2; time <= 6; time++) expect(statuses.tickBurn(0, time)).toBeDefined();
  expect(statuses.nextBurn(0)).toBe(6.5);
  expect(statuses.tickBurn(0, 6.5)).toBeUndefined();
  expect(statuses.nextBurn(0)).toBe(Infinity);
  statuses.burn(0, 10, 2); statuses.clearBurn(0);
  expect(statuses.nextBurn(0)).toBe(Infinity);
});
it('pauses unit-inflicted Burn in time stop but leaves environmental Burn running', () => {
  const statuses = new BattleStatuses(2);
  statuses.burn(0, 0, 1); statuses.burn(1, 0, -1);
  statuses.freeze(0, 3); statuses.freeze(1, 3);
  expect(statuses.burns[0]).toEqual({ next: 4, until: 9, source: 1 });
  expect(statuses.burns[1]).toEqual({ next: 1, until: 6, source: -1 });
});
it('refreshes Chill without stacking and keeps statuses local to a battle', () => {
  const statuses = new BattleStatuses(1);
  statuses.chill(0, 0); statuses.chill(0, 2);
  expect(statuses.atbRate(0, 7)).toBe(STATUS_RULES.chill.rate);
  expect(statuses.atbRate(0, 8)).toBe(1);
  const fresh = new BattleStatuses(1);
  expect(fresh.atbRate(0, 0)).toBe(1);
  expect(fresh.nextBurn(0)).toBe(Infinity);
});
