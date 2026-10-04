import type { JourneyCharacter } from './types';
export const BATTLE_RULES = { baseDamage: 25, hpScale: 1, referenceSpeed: 125, attackSeconds: 3.6, maxSeconds: 120 };
export const attackInterval = (speed: number) => BATTLE_RULES.attackSeconds * Math.sqrt(BATTLE_RULES.referenceSpeed / speed);
export const battleHP = (hp: number) => hp * BATTLE_RULES.hpScale;
export const attackDamage = (attack: number, defense: number) => BATTLE_RULES.baseDamage * (2 * attack) / (attack + defense);
export type BattleEvent = { time: number; attacker: number; target: number; damage: number; hp: number };
export type BattleReplay = { units: JourneyCharacter[]; events: BattleEvent[]; duration: number; winner: 'left' | 'right' | 'draw'; left: number; right: number };

/** Simulate once on the server; the browser only plays this event timeline. */
export function simulateBattle(left: JourneyCharacter[], right: JourneyCharacter[], random = Math.random): BattleReplay {
  if (left.length !== 5 || right.length !== 5) throw new Error('Autobattles require two teams of five.');
  const units = [...left, ...right];
  if (units.some(c => !c.baseStats || Object.values(c.baseStats).some(n => !Number.isFinite(n) || n <= 0))) throw new Error('Every unit needs valid base stats.');
  const hp = units.map(c => battleHP(c.baseStats.hp));
  const intervals = units.map(c => attackInterval(c.baseStats.speed));
  const next = [...intervals];
  const events: BattleEvent[] = [];
  let time = 0;
  while (hp.slice(0, 5).some(n => n > 0) && hp.slice(5).some(n => n > 0)) {
    const earliest = Math.min(...next.map((n, i) => hp[i] > 0 ? n : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    const ready = next.flatMap((n, i) => hp[i] > 0 && Math.abs(n - earliest) < 1e-9 ? [i] : []);
    // Random tie order prevents the left side always getting the first hit.
    const attacker = ready[Math.floor(random() * ready.length)];
    const targets = hp.flatMap((n, i) => n > 0 && (i < 5) !== (attacker < 5) ? [i] : []);
    const target = targets[Math.floor(random() * targets.length)];
    const damage = attackDamage(units[attacker].baseStats.attack, units[target].baseStats.defense);
    hp[target] = Math.max(0, hp[target] - damage);
    events.push({ time, attacker, target, damage, hp: hp[target] });
    next[attacker] = time + intervals[attacker];
  }
  const survivors = [hp.slice(0, 5), hp.slice(5)].map(side => side.filter(n => n > 0).length);
  const winner = survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw';
  return { units, events, duration: time, winner, left: survivors[0], right: survivors[1] };
}
