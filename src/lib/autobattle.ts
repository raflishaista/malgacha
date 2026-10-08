import { equipmentBonuses } from './items';
import type { JourneyCharacter } from './types';
export const BATTLE_RULES = { baseDamage: 25, hpScale: 1, referenceSpeed: 125, attackSeconds: 3.6, maxSeconds: 120 };
import { ABILITY_RULES, STATUS_RULES, keywordsFor, hasAbility, effectiveStats, abilityCooldown, applyBurn, type Burn } from './battle-abilities';
export { ABILITY_RULES } from './battle-abilities';
export const attackInterval = (speed: number) => BATTLE_RULES.attackSeconds * Math.sqrt(BATTLE_RULES.referenceSpeed / speed);
export const battleHP = (hp: number) => hp * BATTLE_RULES.hpScale;
export const attackDamage = (attack: number, defense: number) => BATTLE_RULES.baseDamage * (2 * attack) / (attack + defense);
export type BattleEvent = { time: number; attacker: number; target: number; damage: number; hp: number; kind?: 'heal' | 'world' | 'rumbling' | 'burn' | 'revive' | 'buff' | 'status' | 'shrine'; ability?: string; attackBonus?: number };
export type TimeStop = { start: number; end: number; owner: number };
export type BattleFrame = { time: number; hp: number[]; maxHP: number[]; speed: number[]; atb: number[]; rumbling: number[]; burnUntil: number[]; aura: boolean[]; shrine?: number[]; shrineUsed?: boolean[] };
export type BattleReplay = { frames?: BattleFrame[]; leftCount?: number; units: JourneyCharacter[]; events: BattleEvent[]; stops?: TimeStop[]; floor?: number; duration: number; winner: 'left' | 'right' | 'draw'; left: number; right: number };
export function activeSeconds(from: number, to: number, unit: number, stops: TimeStop[] = []) {
  return Math.max(0, to - from - stops.filter(s => s.owner !== unit).reduce((sum, s) => sum + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)), 0));
}

/** Event scheduler owns combat; effect rules live in battle-abilities.ts. */
export function simulateBattle(left: JourneyCharacter[], right: JourneyCharacter[], random = Math.random): BattleReplay {
  left = left.filter(c => !c.empty);
  right = right.filter(c => !c.empty);
  if (left.length < 1 || left.length > 7 || (right.length !== 5 && !(right.length === 1 && right[0].boss))) throw new Error('Autobattles require 1–7 player units and five opponents or one boss.');
  const leftCount = left.length;
  const gear = [...equipmentBonuses(left), ...equipmentBonuses(right)];
  const units = [...left, ...right], count = units.length;
  if (units.some(c => !c.baseStats || Object.values(c.baseStats).some(n => !Number.isFinite(n) || n <= 0))) throw new Error('Every unit needs valid base stats.');
  let time = 0;
  const hp = units.map(c => battleHP(c.baseStats.hp));
  let maxHP = [...hp], intervals = units.map(c => attackInterval(c.baseStats.speed));
  let stats = units.map(c => ({ ...c.baseStats }));
  let aura = units.map(() => false);
  const bonus = units.map(() => 0), next = [...intervals], cooldown = units.map(abilityCooldown), nextAbility = [...cooldown];
  const timedIds = [4004, 40882, 22036, 175198];
  const timedCooldown = (id: number) => id === 4004 ? ABILITY_RULES.worldCooldown : id === 40882 ? ABILITY_RULES.rumblingCooldown : id === 22036 ? ABILITY_RULES.vampCooldown : ABILITY_RULES.shrineCooldown;
  const timers = units.map(c => Object.fromEntries(timedIds.filter(id => hasAbility(c, id)).map(id => [id, timedCooldown(id)])) as Record<number, number>);
  const shrineUsed = units.map(() => false), pulses = units.map(() => 0);
  const syncTimers = () => { for (let i = 0; i < count; i++) nextAbility[i] = Math.min(Infinity, ...Object.values(timers[i])); };
  syncTimers();
  const burns: (Burn | undefined)[] = units.map(() => undefined);
  const usedRevive = new Set<number>();
  const events: BattleEvent[] = [], stops: TimeStop[] = [], frames: BattleFrame[] = [];
  let turboEnd = units.some(c => hasAbility(c, 196899)) ? ABILITY_RULES.turboDuration : Infinity;
  const sameSide = (a: number, b: number) => (a < leftCount) === (b < leftCount);
  const frozenUntil = (i: number) => Math.max(time, ...stops.filter(s => s.owner !== i && s.start <= time && s.end > time).map(s => s.end));
  function emit(actor: number, target: number, kind: BattleEvent['kind'], ability?: string, damage = 0) {
    events.push({ time, attacker: actor, target, kind, ability, damage, hp: hp[target], ...(hasAbility(units[actor], 87275) ? { attackBonus: bonus[actor] } : {}) });
  }
  function refreshStats() {
    aura = units.map((_, i) => units.some((c, j) => j !== i && sameSide(i, j) && hp[j] > 0 && hasAbility(c, 434)));
    stats = units.map((c, i) => effectiveStats(c, aura[i], time, bonus[i], gear[i]));
    for (let i = 0; i < count; i++) {
      const maximum = battleHP(stats[i].hp), interval = attackInterval(stats[i].speed);
      hp[i] = hp[i] > 0 ? Math.min(maximum, hp[i] / maxHP[i] * maximum) : 0;
      const resume = frozenUntil(i);
      if (hp[i] > 0) next[i] = resume + Math.max(0, next[i] - resume) / intervals[i] * interval;
      maxHP[i] = maximum; intervals[i] = interval;
    }
  }
  function snapshot() {
    frames.push({ time, hp: [...hp], maxHP: [...maxHP], speed: stats.map(s => s.speed), aura: [...aura],
      atb: next.map((n, i) => hp[i] > 0 ? Math.max(0, Math.min(1, 1 - activeSeconds(time, n, i, stops) / intervals[i])) : 0),
      rumbling: units.map((c, i) => hasAbility(c, 40882) && hp[i] > 0 ? Math.max(0, 1 - activeSeconds(time, timers[i][40882], i, stops) / ABILITY_RULES.rumblingCooldown) : 0),
      shrine: units.map((c, i) => hasAbility(c, 175198) && hp[i] > 0 && !shrineUsed[i] ? Math.max(0, 1 - activeSeconds(time, timers[i][175198], i, stops) / ABILITY_RULES.shrineCooldown) : 0), shrineUsed: [...shrineUsed],
      burnUntil: burns.map(b => b?.until ?? 0) });
  }
  function heal(i: number, fraction: number, title: string) {
    const before = hp[i]; hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * fraction); emit(i, i, 'heal', title, before - hp[i]);
  }
  function revive(actor: number, target: number, fraction: number, title: string) {
    hp[target] = maxHP[target] * fraction; burns[target] = undefined;
    next[target] = frozenUntil(target) + intervals[target]; for (const id of timedIds) if (hasAbility(units[target], id)) timers[target][id] = id === 175198 && shrineUsed[target] ? Infinity : frozenUntil(target) + timedCooldown(id); syncTimers();
    emit(actor, target, 'revive', title);
  }
  function deaths(dead: number[], alreadyDead: number[]) {
    if (!dead.length) return;
    for (const i of dead) { burns[i] = undefined; next[i] = Infinity; nextAbility[i] = Infinity; for (const id of timedIds) timers[i][id] = Infinity; }
    refreshStats();
    for (const victim of dead) {
      units.forEach((c, i) => { if (hp[i] > 0 && hasAbility(c, 87275)) { bonus[i] += ABILITY_RULES.kakujaAttack; heal(i, ABILITY_RULES.kakujaHeal, 'Kakuja'); } });
      const caster = units.findIndex((c, i) => i !== victim && sameSide(i, victim) && hp[i] > 0 && hasAbility(c, 134263) && !usedRevive.has(i));
      if (caster >= 0 && hp[victim] === 0) { usedRevive.add(caster); revive(caster, victim, 1, 'Forbidden Magic'); }
    }
    // Only Denji units dead before this damage batch can react to its deaths.
    for (const i of alreadyDead) if (hp[i] === 0 && hasAbility(units[i], 170732)) revive(i, i, ABILITY_RULES.chainsawHeal, 'Chainsaw Heart');
    refreshStats();
  }
  refreshStats();
  units.forEach((c, i) => { const title = hasAbility(c, 196899) ? 'Turbo Granny' : hasAbility(c, 434) ? "Driver’s High" : hasAbility(c, 16412) ? 'God Hand' : undefined; if (title) emit(i, i, 'buff', title); });
  snapshot();
  while (hp.slice(0, leftCount).some(n => n > 0) && hp.slice(leftCount).some(n => n > 0)) {
    const burnTimes = burns.map((b, i) => b && hp[i] > 0 ? Math.min(b.next, b.until) : Infinity);
    const earliest = Math.min(turboEnd, ...burnTimes, ...next.map((n, i) => hp[i] > 0 ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    if (time === turboEnd) { turboEnd = Infinity; refreshStats(); snapshot(); continue; }
    const burnTarget = burnTimes.findIndex(n => n === time);
    if (burnTarget >= 0) {
      const b = burns[burnTarget]!;
      if (b.next <= b.until) {
        const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []);
        const damage = maxHP[burnTarget] * STATUS_RULES.burn.hpFraction * (hasAbility(units[burnTarget], 16412) ? 1 - ABILITY_RULES.godHandReduction : 1);
        hp[burnTarget] = Math.max(0, hp[burnTarget] - damage);
        emit(b.source, burnTarget, 'burn', undefined, damage); b.next += STATUS_RULES.burn.interval;
        deaths(hp[burnTarget] === 0 ? [burnTarget] : [], alreadyDead);
      }
      if (burns[burnTarget] && time >= b.until) burns[burnTarget] = undefined;
      snapshot(); continue;
    }
    const ready = next.flatMap((n, i) => hp[i] > 0 && Math.abs(Math.min(n, nextAbility[i]) - time) < 1e-9 ? [i] : []);
    const attacker = ready[Math.floor(random() * ready.length)];
    const isAbility = nextAbility[attacker] <= next[attacker];
    const activeId = isAbility ? Number(Object.entries(timers[attacker]).find(([, at]) => at === nextAbility[attacker])?.[0]) : 0;
    if (activeId === 4004) {
      stops.push({ start: time, end: time + ABILITY_RULES.worldDuration, owner: attacker }); emit(attacker, attacker, 'world', 'The World');
      for (let i = 0; i < count; i++) if (i !== attacker) { next[i] += ABILITY_RULES.worldDuration; for (const id of timedIds) if (timers[i][id] !== undefined) timers[i][id] += ABILITY_RULES.worldDuration; if (burns[i]) { burns[i]!.next += ABILITY_RULES.worldDuration; burns[i]!.until += ABILITY_RULES.worldDuration; } }
      timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); snapshot(); continue;
    }
    if (activeId === 22036) { heal(attacker, ABILITY_RULES.vampHeal, 'Koyomi Vamp'); timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); snapshot(); continue; }
    if (activeId === 175198 && !shrineUsed[attacker]) { shrineUsed[attacker] = true; pulses[attacker] = ABILITY_RULES.shrineHits; }
    const living = hp.flatMap((n, i) => n > 0 && !sameSide(i, attacker) ? [i] : []);
    const taunts = living.filter(i => keywordsFor(units[i]).includes('TAUNT'));
    const candidates = taunts.length ? taunts : living;
    const targets = isAbility ? living : [candidates[Math.floor(random() * candidates.length)]];
    const blackFlash = !isAbility && hasAbility(units[attacker], 163847) && random() < ABILITY_RULES.blackFlashChance;
    const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
    targets.forEach((target, index) => {
      const damage = attackDamage(stats[attacker].attack, stats[target].defense) * (blackFlash ? 2 : 1) * (hasAbility(units[target], 16412) ? 1 - ABILITY_RULES.godHandReduction : 1);
      hp[target] = Math.max(0, hp[target] - damage); if (hp[target] === 0) dead.push(target);
      emit(attacker, target, isAbility ? activeId === 175198 ? 'shrine' : 'rumbling' : undefined, index === 0 && (isAbility || blackFlash) ? isAbility ? activeId === 175198 ? 'Malevolent Shrine' : 'Rumbling' : 'Black Flash' : undefined, damage);
      if (!isAbility && hasAbility(units[attacker], 171437) && hp[target] > 0) { burns[target] = applyBurn(burns[target], time, attacker); emit(attacker, target, 'status', 'Ninpo: Ascetic Blaze'); }
    });
    if (isAbility) { timers[attacker][activeId] = activeId === 175198 ? --pulses[attacker] > 0 ? time + ABILITY_RULES.shrineInterval : Infinity : time + timedCooldown(activeId); syncTimers(); } else next[attacker] = time + intervals[attacker];
    deaths(dead, alreadyDead); snapshot();
  }
  const survivors = [hp.slice(0, leftCount), hp.slice(leftCount)].map(side => side.filter(n => n > 0).length);
  const winner = survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw';
  return { units, leftCount, events, stops, frames, duration: time, winner, left: survivors[0], right: survivors[1] };
}
