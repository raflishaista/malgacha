import { expect, it } from 'vitest';
import { advanceReplayTime } from './playback';

it('always runs the battle clock at twice real time, including background catch-up', () => {
  expect(advanceReplayTime(0, 1, 120)).toBe(2);
  expect(advanceReplayTime(4, 3, 120)).toBe(10);
  expect(advanceReplayTime(4, 30, 120)).toBe(64);
});
it('finishes a twenty-second boss deadline in ten real seconds without overshooting', () => {
  expect(advanceReplayTime(0, 10, 20)).toBe(20);
  expect(advanceReplayTime(19, 5, 20)).toBe(20);
  expect(advanceReplayTime(4, -1, 20)).toBe(4);
});
