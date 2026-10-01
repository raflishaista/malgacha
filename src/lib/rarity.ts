export function rarityFor(favorites?: number | null): 'N' | 'R' | 'SR' | 'SSR' | 'UR' | null {
  if (typeof favorites !== 'number' || !Number.isFinite(favorites) || favorites < 0) return null;
  if (favorites > 10000) return 'UR';
  if (favorites >= 5000) return 'SSR';
  if (favorites >= 1000) return 'SR';
  if (favorites >= 200) return 'R';
  return 'N';
}
