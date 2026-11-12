import cast from './data/event-characters.json';
import definitions from './data/events.json';
import type { ItemId } from './items';
import type { JourneyCharacter, PoolCharacter } from './types';

export const EVENT_RULES = definitions.rules;
export const EVENTS = definitions.events;
export type EventId = keyof typeof EVENTS;
export const EVENT_IDS = Object.keys(EVENTS) as EventId[];

export const MARINE_IDS = definitions.marineIds;
export const CAPTIVE_IDS = definitions.captiveIds;
export const ROCKET_IDS = definitions.rocketIds;
export const QUIZ_QUESTIONS = definitions.quizQuestions;

export const GOTOH_BUTLERS = ['Left Butler', 'Gotoh', 'Right Butler', 'Behind Butler'] as const;
export type ButlerName = (typeof GOTOH_BUTLERS)[number];

export type JankenChoice = 'rock' | 'paper' | 'scissors';

export type HangmanCard = {
  id: string;
  rank: number; // 1..10 for A..10, 0 for Joker (XI)
  suit: 'spade' | 'heart' | 'joker';
  label: string;
};

export type JourneyEvent = {
  id: EventId;
  status: 'choice' | 'target' | 'confirm' | 'play' | 'battle' | 'reward' | 'complete';
  outcome?: 'accepted' | 'declined' | 'won' | 'lost' | 'timeout';
  message?: string;
  quote?: string;
  subtext?: string;
  reward?: JourneyCharacter;
  targetUnitId?: string;
  targetUnitName?: string;
  targetUnitImage?: string | null;
  abilityId?: number;
  abilityName?: string;
  previewTeam?: JourneyCharacter[];
  jankenPlayer?: JankenChoice;
  jankenEnemy?: JankenChoice;
  jankenTie?: boolean;
  gotohPasses?: string[];
  gotohAnswer?: ButlerName;
  hangmanPlayerHand?: HangmanCard[];
  hangmanEnemyHand?: HangmanCard[];
  hangmanEnemyCount?: number;
  hangmanLog?: string[];
  quizIndex?: number;
  ballsReward?: ItemId[];
  akinaOpponent?: 2821 | 2822;
  akinaTargetId?: string;
  akinaTargetName?: string;
  akinaTargetImage?: string | null;
  akinaPlayerSpeed?: number;
  akinaOpponentSpeed?: number;
  akinaPlayerBlocks?: number;
  akinaOpponentBlocks?: number;
  akinaTime?: number;
};

export type EventAction = {
  index: number;
  choice?: 'yes' | 'no';
  target?: string;
  janken?: JankenChoice | 'timeout';
  butler?: ButlerName | 'timeout';
  cardIndex?: number | 'timeout';
  answer?: number | 'timeout';
  akinaOpponent?: 2821 | 2822;
};

export const eventCharacter = (id: number): PoolCharacter => {
  const character = cast.find((c) => c.id === id);
  if (!character) throw new Error('Event character metadata is missing.');
  return character as PoolCharacter;
};

export function rollEvents(random = Math.random): (JourneyEvent | null)[] {
  return Array.from({ length: 3 }, () => {
    if (random() >= EVENT_RULES.chance) return null;
    const id = EVENT_IDS[Math.min(EVENT_IDS.length - 1, Math.floor(random() * EVENT_IDS.length))];
    return { id, status: 'choice' };
  });
}

export function rollRocketBalls(count = EVENT_RULES.rocketBalls, random = Math.random): ItemId[] {
  return Array.from({ length: count }, () => {
    const roll = random();
    if (roll < 0.6) return 'pokeball';
    if (roll < 0.85) return 'greatball';
    if (roll < 0.95) return 'ultraball';
    return 'masterball';
  });
}

const PASS_VERBS = ['passes the coin to', 'tosses the coin to', 'flicks the coin to', 'slips the coin to'];

export function rollGotohSequence(random = Math.random): { passes: string[]; answer: ButlerName } {
  let holder: ButlerName = 'Gotoh';
  const passes: string[] = [];
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const others = GOTOH_BUTLERS.filter((b) => b !== holder);
    const next = others[Math.min(others.length - 1, Math.floor(random() * others.length))];
    const verb = PASS_VERBS[Math.min(PASS_VERBS.length - 1, Math.floor(random() * PASS_VERBS.length))];
    passes.push(`${holder} ${verb} ${next}.`);
    holder = next;
  }
  return { passes, answer: holder };
}

export function discardHangmanPairs(hand: HangmanCard[]): {
  remaining: HangmanCard[];
  discarded: number;
  discardedLabels: string[];
} {
  const remaining: HangmanCard[] = [];
  const byRank = new Map<number, HangmanCard>();
  const discardedLabels: string[] = [];
  let discarded = 0;
  for (const card of hand) {
    if (card.suit === 'joker' || card.rank === 0) {
      remaining.push(card);
      continue;
    }
    if (byRank.has(card.rank)) {
      const match = byRank.get(card.rank)!;
      byRank.delete(card.rank);
      discarded++;
      discardedLabels.push(match.label);
    } else {
      byRank.set(card.rank, card);
    }
  }
  for (const card of hand) {
    if (card.suit !== 'joker' && byRank.get(card.rank) === card) {
      remaining.push(card);
    }
  }
  return { remaining, discarded, discardedLabels };
}

function shuffleCards<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function initHangman(random = Math.random): {
  playerHand: HangmanCard[];
  enemyHand: HangmanCard[];
  log: string[];
  winner?: 'won' | 'lost';
} {
  const deck: HangmanCard[] = [];
  const labels = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  for (const suit of ['spade', 'heart'] as const) {
    for (let rank = 1; rank <= 10; rank++) {
      deck.push({ id: `${suit}-${rank}`, rank, suit, label: labels[rank - 1] });
    }
  }
  deck.push({ id: 'joker-xi', rank: 0, suit: 'joker', label: 'XI' });

  const shuffled = shuffleCards(deck, random);
  const split = random() < 0.5 ? 10 : 11;
  const pInit = discardHangmanPairs(shuffled.slice(0, split));
  const eInit = discardHangmanPairs(shuffled.slice(split));

  const playerHand = shuffleCards(pInit.remaining, random);
  const enemyHand = shuffleCards(eInit.remaining, random);
  const log: string[] = [];
  if (pInit.discardedLabels.length > 0) {
    log.push(`You discarded pairs of: ${pInit.discardedLabels.join(', ')}.`);
  } else {
    log.push('You have no starting pairs to discard.');
  }
  if (eInit.discardedLabels.length > 0) {
    log.push(`Sadakuni discarded pairs of: ${eInit.discardedLabels.join(', ')}.`);
  } else {
    log.push('Sadakuni has no starting pairs to discard.');
  }

  let winner: 'won' | 'lost' | undefined;
  if (playerHand.length === 0 && enemyHand.length === 1 && enemyHand[0].suit === 'joker') {
    winner = 'won';
  } else if (enemyHand.length === 0 && playerHand.length === 1 && playerHand[0].suit === 'joker') {
    winner = 'lost';
  }

  return { playerHand, enemyHand, log, winner };
}

export function stepHangman(
  playerHand: HangmanCard[],
  enemyHand: HangmanCard[],
  cardIndex: number,
  random = Math.random
): {
  playerHand: HangmanCard[];
  enemyHand: HangmanCard[];
  log: string[];
  winner?: 'won' | 'lost';
} {
  const pHand = [...playerHand];
  let eHand = [...enemyHand];
  const log: string[] = [];

  const idx = Math.max(0, Math.min(eHand.length - 1, cardIndex));
  const [drawn] = eHand.splice(idx, 1);
  if (drawn) {
    log.push(`You drew ${drawn.suit === 'joker' ? 'the Joker (XI)!' : `${drawn.label} of ${drawn.suit === 'spade' ? '♠' : '♥'}`}.`);
    pHand.push(drawn);
  }
  const pDiscarded = discardHangmanPairs(pHand);
  if (pDiscarded.discardedLabels.length > 0) {
    log.push(`You discarded a pair of ${pDiscarded.discardedLabels.join(', ')}s!`);
  }
  let nextPlayer = pDiscarded.remaining;

  if (nextPlayer.length === 0 && eHand.length === 1 && eHand[0].suit === 'joker') {
    return { playerHand: nextPlayer, enemyHand: eHand, log, winner: 'won' };
  }
  if (eHand.length === 0 && nextPlayer.length === 1 && nextPlayer[0].suit === 'joker') {
    return { playerHand: nextPlayer, enemyHand: eHand, log, winner: 'lost' };
  }

  // Sadakuni's turn
  if (nextPlayer.length > 0 && eHand.length > 0) {
    const aiPick = Math.min(nextPlayer.length - 1, Math.floor(random() * nextPlayer.length));
    const [aiDrawn] = nextPlayer.splice(aiPick, 1);
    if (aiDrawn) {
      eHand.push(aiDrawn);
      log.push('Sadakuni draws a card from your hand.');
      const eDiscarded = discardHangmanPairs(eHand);
      if (eDiscarded.discardedLabels.length > 0) {
        log.push(`Sadakuni discarded a pair of ${eDiscarded.discardedLabels.join(', ')}s.`);
      }
      eHand = shuffleCards(eDiscarded.remaining, random);
    }
  }

  let winner: 'won' | 'lost' | undefined;
  if (nextPlayer.length === 0 && eHand.length === 1 && eHand[0].suit === 'joker') {
    winner = 'won';
  } else if (eHand.length === 0 && nextPlayer.length === 1 && nextPlayer[0].suit === 'joker') {
    winner = 'lost';
  }

  return { playerHand: nextPlayer, enemyHand: eHand, log, winner };
}

// Compatibility exports; keyword mechanics are independent of event flows.
export { KEYWORD_INFO, keywordBonuses } from './battle/keywords';
