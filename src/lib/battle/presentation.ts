import type { JourneyCharacter } from '../types';
import type { BattleFrame, BattleReplay } from './types';

export function unitAtFrame(replay: BattleReplay, frame: BattleFrame | undefined, index: number): JourneyCharacter {
  const unit = { ...replay.units[index], ...frame?.unitOverrides?.[index] };
  return frame?.witches?.[index] ? { ...unit, witch: true, name: 'Witch', image: '/images/witch.png', fusionImages: undefined } : unit;
}
export function visibleBattleUnits(replay: BattleReplay, frame: BattleFrame | undefined, side: number): number[] {
  return replay.units.flatMap((_, i) => {
    if (frame && i >= frame.hp.length) return []; // A summon has not appeared yet.
    const originalSide = i < (replay.leftCount ?? 5) ? 0 : 1;
    const currentSide = frame?.witches?.[i] ? originalSide : frame?.sides?.[i] ?? originalSide;
    return currentSide === side && (frame?.participating?.[i] ?? true) ? [i] : [];
  }).sort((a, b) => (frame?.positions?.[a] ?? a) - (frame?.positions?.[b] ?? b));
}
