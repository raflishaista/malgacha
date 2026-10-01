export function favoriteTotal(team: { favorites?: number | null }[]): number {
  return team.reduce((sum, character) => sum + (character.favorites ?? 0), 0);
}
export function cloutWinner(left: number, right: number): string {
  return left === right ? 'Draw!' : left > right ? 'Player 1 wins!' : 'Player 2 wins!';
}
