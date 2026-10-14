export const STATUS_RULES = {
  chill: { duration: 6, rate: 0.75, label: 'CHILL', description: 'ATB fills 25% slower for 6 seconds. Reapplication refreshes the duration; it does not stack.' },
  burn: { duration: 6, interval: 1, hpFraction: 0.03, label: 'BURN', description: 'This unit takes 3% of maximum HP as damage each second for 6 seconds. Reapplication refreshes the duration; it does not stack.' }
};
export type Burn = { until: number; next: number; source: number };
export function applyBurn(previous: Burn | undefined, time: number, source: number): Burn {
  return { until: time + STATUS_RULES.burn.duration, next: previous && previous.until >= time ? previous.next : time + STATUS_RULES.burn.interval, source };
}
/** Battle-local status storage. Stage and ability applications share these refresh/tick rules. */
export class BattleStatuses {
  readonly burns: (Burn | undefined)[];
  readonly chillUntil: number[];
  constructor(count: number) { this.burns = Array(count).fill(undefined); this.chillUntil = Array(count).fill(0); }
  burn(target: number, time: number, source: number) { this.burns[target] = applyBurn(this.burns[target], time, source); }
  chill(target: number, time: number) { this.chillUntil[target] = time + STATUS_RULES.chill.duration; }
  atbRate(target: number, time: number) { return this.chillUntil[target] > time ? STATUS_RULES.chill.rate : 1; }
  clearBurn(target: number) { this.burns[target] = undefined; }
  freeze(target: number, duration: number) {
    const burn = this.burns[target];
    // Stage burn continues through time stop; character-inflicted burn pauses.
    if (burn && burn.source >= 0) { burn.next += duration; burn.until += duration; }
  }
  nextBurn(target: number) { const burn = this.burns[target]; return burn ? Math.min(burn.next, burn.until) : Infinity; }
  tickBurn(target: number, time: number): { source: number; hpFraction: number } | undefined {
    const burn = this.burns[target];
    if (!burn) return;
    const tick = burn.next <= burn.until ? { source: burn.source, hpFraction: STATUS_RULES.burn.hpFraction } : undefined;
    if (tick) burn.next += STATUS_RULES.burn.interval;
    if (time >= burn.until) this.clearBurn(target);
    return tick;
  }
}
