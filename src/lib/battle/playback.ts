/** Journeys always plays two simulation seconds per real second. This is not a mode. */
export const PLAYBACK_RATE = 2;
export const STAGE_REVEAL_STEP_MS = 42.5;

export function advanceReplayTime(elapsed: number, deltaSeconds: number, duration: number): number {
  return Math.min(duration, elapsed + Math.max(0, deltaSeconds) * PLAYBACK_RATE);
}
