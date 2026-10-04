import type { JourneyCharacter } from './types';
export const BATTLE_RULES = { baseDamage: 25, hpScale: 1, referenceSpeed: 125, attackSeconds: 3.6, maxSeconds: 120 };
export const ABILITY_RULES = { blackFlashChance: 0.3, worldCooldown: 10, worldDuration: 3, kakujaHeal: 0.15, kakujaAttack: 5, rumblingCooldown: 8 };
export const attackInterval = (speed: number) => BATTLE_RULES.attackSeconds * Math.sqrt(BATTLE_RULES.referenceSpeed / speed);
export const battleHP = (hp: number) => hp * BATTLE_RULES.hpScale;
export const attackDamage = (attack: number, defense: number) => BATTLE_RULES.baseDamage * (2 * attack) / (attack + defense);
export type BattleEvent = { time: number; attacker: number; target: number; damage: number; hp: number; kind?: 'heal' | 'world' | 'rumbling'; ability?: string; attackBonus?: number };
export type TimeStop = { start: number; end: number; owner: number };
export type BattleReplay = { units: JourneyCharacter[]; events: BattleEvent[]; stops?: TimeStop[]; floor?: number; duration: number; winner: 'left' | 'right' | 'draw'; left: number; right: number };
export function activeSeconds(from: number, to: number, unit: number, stops: TimeStop[] = []) {
  return Math.max(0, to - from - stops.filter(s => s.owner !== unit).reduce((sum, s) => sum + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)), 0));
}

/** Server-owned timeline. Combat HP and buffs never modify saved base stats. */
export function simulateBattle(left: JourneyCharacter[], right: JourneyCharacter[], random = Math.random): BattleReplay {
  if (left.length !== 5 || right.length !== 5) throw new Error('Autobattles require two teams of five.');
  const units = [...left, ...right];
  if (units.some(c => !c.baseStats || Object.values(c.baseStats).some(n => !Number.isFinite(n) || n <= 0))) throw new Error('Every unit needs valid base stats.');
  const maxHP = units.map(c => battleHP(c.baseStats.hp));
  const hp = [...maxHP];
  const bonus = Array(10).fill(0) as number[];
  const intervals = units.map(c => attackInterval(c.baseStats.speed));
  const next = [...intervals];
  const cooldown = units.map(c => c.id === 4004 ? ABILITY_RULES.worldCooldown : c.id === 40882 ? ABILITY_RULES.rumblingCooldown : Infinity);
  const nextAbility = [...cooldown];
  const events: BattleEvent[] = [];
  const stops: TimeStop[] = [];
  let time = 0;
  function deaths(count: number) {
    for (let death = 0; death < count; death++) {
      units.forEach((c, i) => {
        if (c.id !== 87275 || hp[i] <= 0) return;
        const before = hp[i];
        hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * ABILITY_RULES.kakujaHeal);
        bonus[i] += ABILITY_RULES.kakujaAttack;
        events.push({ time, attacker: i, target: i, hp: hp[i], damage: before - hp[i], kind: 'heal', ability: 'Kakuja', attackBonus: bonus[i] });
      });
    }
  }
  while (hp.slice(0, 5).some(n => n > 0) && hp.slice(5).some(n => n > 0)) {
    const earliest = Math.min(...next.map((n, i) => hp[i] > 0 ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    const ready = next.flatMap((n, i) => hp[i] > 0 && Math.abs(Math.min(n, nextAbility[i]) - earliest) < 1e-9 ? [i] : []);
    const attacker = ready[Math.floor(random() * ready.length)];
    const isAbility = nextAbility[attacker] <= next[attacker];
    if (isAbility && units[attacker].id === 4004) {
      stops.push({ start: time, end: time + ABILITY_RULES.worldDuration, owner: attacker });
      events.push({ time, attacker, target: attacker, damage: 0, hp: hp[attacker], kind: 'world', ability: 'The World' });
      for (let i = 0; i < 10; i++) if (i !== attacker) { next[i] += ABILITY_RULES.worldDuration; nextAbility[i] += ABILITY_RULES.worldDuration; }
      nextAbility[attacker] = time + cooldown[attacker];
      continue;
    }
    const living = hp.flatMap((n, i) => n > 0 && (i < 5) !== (attacker < 5) ? [i] : []);
    const targets = isAbility ? living : [living[Math.floor(random() * living.length)]];
    const blackFlash = !isAbility && units[attacker].id === 163847 && random() < ABILITY_RULES.blackFlashChance;
    let killed = 0;
    // Resolve the entire AoE before death reactions, so lethal hits cannot be healed away.
    targets.forEach((target, index) => {
      const damage = attackDamage(units[attacker].baseStats.attack + bonus[attacker], units[target].baseStats.defense) * (blackFlash ? 2 : 1);
      hp[target] = Math.max(0, hp[target] - damage);
      if (hp[target] === 0) killed++;
      events.push({ time, attacker, target, damage, hp: hp[target], ...(isAbility ? { kind: 'rumbling' as const } : {}), ...(index === 0 && (isAbility || blackFlash) ? { ability: isAbility ? 'Rumbling' : 'Black Flash' } : {}) });
    });
    if (isAbility) nextAbility[attacker] = time + cooldown[attacker];
    else next[attacker] = time + intervals[attacker];
    deaths(killed);
  }
  const survivors = [hp.slice(0, 5), hp.slice(5)].map(side => side.filter(n => n > 0).length);
  const winner = survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw';
  return { units, events, stops, duration: time, winner, left: survivors[0], right: survivors[1] };
}
