import type { PoolCharacter, Title } from './types';
export function bestSource(character: Pick<PoolCharacter, 'titles'>): Title | null {
  return character.titles.filter((t) => typeof t.score === 'number' && Number.isFinite(t.score) && t.score > 0 && t.score <= 10)
    .sort((a, b) => b.score! - a.score! || a.kind.localeCompare(b.kind) || a.id - b.id)[0] ?? null;
}
export function writingTotal(team: Pick<PoolCharacter, 'titles'>[]): number {
  return team.reduce((sum, c) => {
    const source = bestSource(c);
    if (!source) throw new Error('Every character needs a rated source.');
    return sum + Math.round(source.score! * 100);
  }, 0) / 100;
}
export function favoriteTotal(team: { favorites?: number | null }[]): number {
  return team.reduce((sum, character) => sum + (character.favorites ?? 0), 0);
}
export function cloutWinner(left: number, right: number): string {
  return left === right ? 'Draw!' : left > right ? 'Player 1 wins!' : 'Player 2 wins!';
}
