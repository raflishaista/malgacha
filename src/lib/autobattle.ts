import { equipmentBonuses } from './items';
import { STAGE_RULES, type StageId } from './stages';
import type { JourneyCharacter } from './types';
export const BATTLE_RULES = { baseDamage: 25, hpScale: 1, referenceSpeed: 125, attackSeconds: 3.6, maxSeconds: 120 };
import { ABILITY_RULES, STATUS_RULES, keywordsFor, hasAbility, effectiveStats, abilityCooldown, applyBurn, type Burn } from './battle-abilities';
export { ABILITY_RULES } from './battle-abilities';
export const attackInterval = (speed: number) => BATTLE_RULES.attackSeconds * Math.sqrt(BATTLE_RULES.referenceSpeed / speed);
export const battleHP = (hp: number) => hp * BATTLE_RULES.hpScale;
export const attackDamage = (attack: number, defense: number) => BATTLE_RULES.baseDamage * (2 * attack) / (attack + defense);
export type BattleEvent = { time: number; attacker: number; target: number; damage: number; hp: number; kind?: 'heal' | 'world' | 'rumbling' | 'burn' | 'revive' | 'buff' | 'status' | 'shrine' | 'environment' | 'execute' | 'transform'; ability?: string; attackBonus?: number };
export type TimeStop = { start: number; end: number; owner: number; affected?: number[] };
export type BattleFrame = { witches?: boolean[]; time: number; hp: number[]; maxHP: number[]; speed: number[]; atb: number[]; rumbling: number[]; burnUntil: number[]; aura: boolean[]; shrine?: number[]; shrineUsed?: boolean[]; chillUntil?: number[]; sides?: number[]; positions?: number[]; participating?: boolean[]; intervals?: number[]; duelWins?: number[] };
export type BattleReplay = { stage?: StageId; frames?: BattleFrame[]; leftCount?: number; units: JourneyCharacter[]; events: BattleEvent[]; stops?: TimeStop[]; floor?: number; duration: number; winner: 'left' | 'right' | 'draw'; left: number; right: number };
export function activeSeconds(from: number, to: number, unit: number, stops: TimeStop[] = []) {
  return Math.max(0, to - from - stops.filter(s => s.owner !== unit && (!s.affected || s.affected.includes(unit))).reduce((sum, s) => sum + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)), 0));
}

/** Event scheduler owns combat; effect rules live in battle-abilities.ts. */
export function simulateBattle(left: JourneyCharacter[], right: JourneyCharacter[], random = Math.random, stage?: StageId): BattleReplay {
  if (right.some(c => c.boss)) stage = undefined;
  const originalSlots = [...left.flatMap((c, i) => c.empty ? [] : [i]), ...right.flatMap((c, i) => c.empty ? [] : [i])];
  left = left.filter(c => !c.empty);
  right = right.filter(c => !c.empty);
  if (left.length < 1 || left.length > 7 || (right.length !== 5 && !(right.length === 1 && right[0].boss))) throw new Error('Autobattles require 1–7 player units and five opponents or one boss.');
  const leftCount = left.length;
  let gear = [...equipmentBonuses(left), ...equipmentBonuses(right)];
  const units = structuredClone([...left, ...right]), count = units.length;
  const sides: number[] = units.map((_, i) => i < leftCount ? 0 : 1), positions = [...originalSlots];
  const participating = units.map((_, i) => stage !== 'budokai' || positions[i] < 5);
  const retired = new Set<number>(), executed = new Set<number>(), duelWins = [0, 0];
  const settledDuels = new Set<number>();
  let stageWinner: 'left' | 'right' | 'draw' | undefined;
  let executionUsed = false;
  const burnSide = stage === 'punk' ? Math.floor(random() * 2) : -1;
  const chillUntil = units.map(() => 0);
  let stageAt = stage === 'punk' ? 0 : stage === 'dangai' ? STAGE_RULES.sweepSeconds : stage === 'colosseum' ? STAGE_RULES.swapSeconds : stage === 'itomori' ? STAGE_RULES.impactSeconds : Infinity;
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
  const sameSide = (a: number, b: number) => sides[a] === sides[b];
  const sameDuel = (a: number, b: number) => stage !== 'budokai' || positions[a] === positions[b];
  const available = (i: number) => participating[i] && !retired.has(i) && hp[i] > 0;
  const frozenUntil = (i: number) => Math.max(time, ...stops.filter(s => s.owner !== i && (!s.affected || s.affected.includes(i)) && s.start <= time && s.end > time).map(s => s.end));
  function emit(actor: number, target: number, kind: BattleEvent['kind'], ability?: string, damage = 0) {
    events.push({ time, attacker: actor, target, kind, ability, damage, hp: hp[target], ...(actor >= 0 && hasAbility(units[actor], 87275) ? { attackBonus: bonus[actor] } : {}) });
  }
  function refreshStats() {
    aura = units.map((_, i) => units.some((c, j) => j !== i && sameSide(i, j) && sameDuel(i, j) && available(j) && hasAbility(c, 434)));
    stats = units.map((c, i) => effectiveStats(c, aura[i], time, bonus[i], gear[i]));
    for (let i = 0; i < count; i++) {
      const maximum = battleHP(stats[i].hp), interval = attackInterval(stats[i].speed) / (chillUntil[i] > time ? STATUS_RULES.chill.rate : 1);
      hp[i] = hp[i] > 0 ? Math.min(maximum, hp[i] / maxHP[i] * maximum) : 0;
      const resume = frozenUntil(i);
      if (hp[i] > 0) next[i] = resume + Math.max(0, next[i] - resume) / intervals[i] * interval;
      maxHP[i] = maximum; intervals[i] = interval;
    }
  }
  function snapshot() {
    frames.push({ witches: units.map(c => !!c.witch), time, hp: [...hp], maxHP: [...maxHP], speed: stats.map(s => s.speed), aura: [...aura], sides: [...sides], positions: [...positions], participating: [...participating], intervals: [...intervals], chillUntil: [...chillUntil], duelWins: [...duelWins],
      atb: next.map((n, i) => hp[i] > 0 ? Math.max(0, Math.min(1, 1 - activeSeconds(time, n, i, stops) / intervals[i])) : 0),
      rumbling: units.map((c, i) => hasAbility(c, 40882) && hp[i] > 0 ? Math.max(0, 1 - activeSeconds(time, timers[i][40882], i, stops) / ABILITY_RULES.rumblingCooldown) : 0),
      shrine: units.map((c, i) => hasAbility(c, 175198) && hp[i] > 0 && !shrineUsed[i] ? Math.max(0, 1 - activeSeconds(time, timers[i][175198], i, stops) / ABILITY_RULES.shrineCooldown) : 0), shrineUsed: [...shrineUsed],
      burnUntil: burns.map(b => b?.until ?? 0) });
  }
  function heal(i: number, fraction: number, title: string) {
    const before = hp[i]; hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * fraction); emit(i, i, 'heal', title, before - hp[i]);
  }
  function revive(actor: number, target: number, fraction: number, title: string) {
    if (!participating[target] || retired.has(target) || executed.has(target)) return;
    hp[target] = maxHP[target] * fraction; burns[target] = undefined;
    next[target] = frozenUntil(target) + intervals[target]; for (const id of timedIds) if (hasAbility(units[target], id)) timers[target][id] = id === 175198 && shrineUsed[target] ? Infinity : frozenUntil(target) + timedCooldown(id); syncTimers();
    emit(actor, target, 'revive', title);
  }
  function deaths(dead: number[], alreadyDead: number[]) {
    if (!dead.length) return;
    for (const i of dead) { burns[i] = undefined; next[i] = Infinity; nextAbility[i] = Infinity; for (const id of timedIds) timers[i][id] = Infinity; }
    refreshStats();
    for (const victim of dead) {
      units.forEach((c, i) => { if (available(i) && sameDuel(i, victim) && hasAbility(c, 87275)) { bonus[i] += ABILITY_RULES.kakujaAttack; heal(i, ABILITY_RULES.kakujaHeal, 'Kakuja'); } });
      if (units[victim].soulGem && !units[victim].witch && participating[victim]) {
        units[victim].witch = true; sides[victim] = 2;
        refreshGear(); refreshStats(); hp[victim] = maxHP[victim];
        next[victim] = frozenUntil(victim) + intervals[victim];
        emit(victim, victim, 'transform', 'Witch');
        continue;
      }
      const caster = units.findIndex((c, i) => i !== victim && sameSide(i, victim) && sameDuel(i, victim) && available(i) && !executed.has(victim) && hasAbility(c, 134263) && !usedRevive.has(i));
      if (caster >= 0 && hp[victim] === 0) { usedRevive.add(caster); revive(caster, victim, 1, 'Forbidden Magic'); }
    }
    // Only Denji units dead before this damage batch can react to its deaths.
    for (const i of alreadyDead) if (hp[i] === 0 && dead.some(v => sameDuel(i, v)) && hasAbility(units[i], 170732)) revive(i, i, ABILITY_RULES.chainsawHeal, 'Chainsaw Heart');
    refreshStats();
  }
  refreshStats();
  if (stage === 'valley') {
    for (const side of [0, 1]) {
      const candidates = units.flatMap((_, i) => sides[i] === side ? [i] : []);
      const total = (i: number) => Object.values(stats[i]).reduce((a, b) => a + b, 0);
      const strongest = candidates.reduce((a, b) => total(b) > total(a) ? b : a);
      for (const i of candidates) participating[i] = i === strongest;
    }
  }
  for (let i = 0; i < count; i++) if (!participating[i]) { hp[i] = 0; next[i] = Infinity; nextAbility[i] = Infinity; }
  // Benched units cannot supply auras, equipment support, revives, or death triggers.
  function refreshGear() {
    gear = units.map(() => ({ hp: 0, attack: 0, defense: 0, speed: 0 }));
    for (const side of [0, 1, 2]) {
      const indices = units.flatMap((_, i) => sides[i] === side && participating[i] ? [i] : []).sort((a, b) => positions[a] - positions[b]);
      const bonuses = stage === 'budokai' ? indices.map(i => equipmentBonuses([units[i]])[0]) : equipmentBonuses(indices.map(i => units[i]));
      indices.forEach((i, n) => { gear[i] = bonuses[n]; });
    }
  }
  refreshGear(); refreshStats();
  function settleDuels() {
    if (stage !== 'budokai') return;
    for (let slot = 0; slot < 5; slot++) {
      if (settledDuels.has(slot)) continue;
      if (units.some((c, i) => c.witch && available(i) && positions[i] === slot)) continue;
      const living = [0, 1].map(side => units.some((_, i) => participating[i] && positions[i] === slot && sides[i] === side && hp[i] > 0));
      if (living[0] && living[1]) continue;
      settledDuels.add(slot);
      if (living[0]) duelWins[0]++; else if (living[1]) duelWins[1]++;
      units.forEach((_, i) => { if (positions[i] === slot) { retired.add(i); next[i] = Infinity; nextAbility[i] = Infinity; } });
    }
    if (duelWins[0] >= 3 && !units.some((c, i) => c.witch && available(i))) stageWinner = 'left';
    else if (duelWins[1] >= 3) stageWinner = 'right';
    else if (settledDuels.size === 5) stageWinner = 'draw';
  }
  function execution(killer: number, dead: number[]) {
    if (stage !== 'hope' || executionUsed || killer < 0 || !dead.length) return;
    executionUsed = true; executed.add(killer);
    const damage = hp[killer]; hp[killer] = 0;
    emit(killer, killer, 'execute', 'EXECUTED', damage);
    if (damage > 0 && !dead.includes(killer)) dead.push(killer);
  }
  units.forEach((c, i) => { const title = hasAbility(c, 196899) ? 'Turbo Granny' : hasAbility(c, 434) ? "Driver’s High" : hasAbility(c, 16412) ? 'God Hand' : undefined; if (title && available(i)) emit(i, i, 'buff', title); });
  settleDuels();
  snapshot();
  const hasSide = (side: number) => units.some((_, i) => sides[i] === side && available(i));
  while (!stageWinner && ((hasSide(0) && hasSide(1)) || (hasSide(2) && (hasSide(0) || hasSide(1))))) {
    const burnTimes = burns.map((b, i) => b && available(i) ? Math.min(b.next, b.until) : Infinity);
    const earliest = Math.min(stageAt, turboEnd, ...burnTimes, ...next.map((n, i) => available(i) ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    if (time === stageAt) {
      if (stage === 'punk') {
        units.forEach((_, i) => { if (available(i)) { if (sides[i] === burnSide) burns[i] = applyBurn(burns[i], time, -1); else chillUntil[i] = time + STATUS_RULES.chill.duration; } });
        stageAt = time + 1; refreshStats();
      } else if (stage === 'dangai') {
        const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
        units.forEach((_, i) => { if (available(i)) { const damage = maxHP[i] * STAGE_RULES.sweepDamage; hp[i] = Math.max(0, hp[i] - damage); emit(-1, i, 'environment', undefined, damage); if (hp[i] === 0) dead.push(i); } });
        deaths(dead, alreadyDead); stageAt += STAGE_RULES.sweepSeconds;
      } else if (stage === 'colosseum') {
        // Visit each original unit once. Each proposal selects its own or the other side equally.
        // Swapping occupied positions preserves team sizes, even with six or seven player slots.
        for (let i = 0; i < count; i++) {
          if (units[i].witch) continue;
          const destination = random() < 0.5 ? sides[i] : 1 - sides[i];
          const candidates = units.flatMap((_, j) => !units[j].witch && sides[j] === destination && j !== i ? [j] : []);
          if (!candidates.length) continue;
          const j = candidates[Math.floor(random() * candidates.length)];
          [sides[i], sides[j]] = [sides[j], sides[i]];
          [positions[i], positions[j]] = [positions[j], positions[i]];
        }
        refreshGear(); refreshStats(); stageAt = Infinity;
      } else if (stage === 'itomori') {
        const totals = [0, 1].map(side => hp.reduce((sum, h, i) => sum + (sides[i] === side ? h / maxHP[i] : 0), 0));
        if (!hasSide(2)) stageWinner = totals[0] >= totals[1] ? 'left' : 'right'; stageAt = Infinity;
      }
      snapshot(); continue;
    }
    if (time === turboEnd) { turboEnd = Infinity; refreshStats(); snapshot(); continue; }
    const burnTarget = burnTimes.findIndex(n => n === time);
    if (burnTarget >= 0) {
      const b = burns[burnTarget]!;
      if (b.next <= b.until) {
        const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []);
        const damage = maxHP[burnTarget] * STATUS_RULES.burn.hpFraction * (hasAbility(units[burnTarget], 16412) ? 1 - ABILITY_RULES.godHandReduction : 1);
        hp[burnTarget] = Math.max(0, hp[burnTarget] - damage);
        emit(b.source, burnTarget, 'burn', undefined, damage); b.next += STATUS_RULES.burn.interval;
        const dead = hp[burnTarget] === 0 ? [burnTarget] : [];
        execution(b.source, dead); deaths(dead, alreadyDead); settleDuels();
      }
      if (burns[burnTarget] && time >= b.until) burns[burnTarget] = undefined;
      snapshot(); continue;
    }
    const ready = next.flatMap((n, i) => available(i) && Math.abs(Math.min(n, nextAbility[i]) - time) < 1e-9 ? [i] : []);
    const attacker = ready[Math.floor(random() * ready.length)];
    const isAbility = nextAbility[attacker] <= next[attacker];
    const activeId = isAbility ? Number(Object.entries(timers[attacker]).find(([, at]) => at === nextAbility[attacker])?.[0]) : 0;
    if (activeId === 4004) {
      stops.push({ start: time, end: time + ABILITY_RULES.worldDuration, owner: attacker, affected: units.flatMap((_, i) => i !== attacker && sameDuel(i, attacker) ? [i] : []) }); emit(attacker, attacker, 'world', 'The World');
      for (let i = 0; i < count; i++) if (i !== attacker && sameDuel(i, attacker)) { next[i] += ABILITY_RULES.worldDuration; for (const id of timedIds) if (timers[i][id] !== undefined) timers[i][id] += ABILITY_RULES.worldDuration; if (burns[i] && burns[i]!.source >= 0) { burns[i]!.next += ABILITY_RULES.worldDuration; burns[i]!.until += ABILITY_RULES.worldDuration; } }
      timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); snapshot(); continue;
    }
    if (activeId === 22036) { heal(attacker, ABILITY_RULES.vampHeal, 'Koyomi Vamp'); timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); snapshot(); continue; }
    if (activeId === 175198 && !shrineUsed[attacker]) { shrineUsed[attacker] = true; pulses[attacker] = ABILITY_RULES.shrineHits; }
    const living = hp.flatMap((n, i) => i !== attacker && available(i) && (units[attacker].witch || units[i].witch || !sameSide(i, attacker)) && sameDuel(i, attacker) ? [i] : []);
    const taunts = living.filter(i => keywordsFor(units[i]).includes('TAUNT'));
    const candidates = taunts.length ? taunts : living;
    const targets = isAbility || units[attacker].witch ? living : [candidates[Math.floor(random() * candidates.length)]];
    if (!targets.length) { retired.add(attacker); next[attacker] = Infinity; nextAbility[attacker] = Infinity; continue; }
    const blackFlash = !isAbility && hasAbility(units[attacker], 163847) && random() < ABILITY_RULES.blackFlashChance;
    const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
    targets.forEach((target, index) => {
      const damage = attackDamage(stats[attacker].attack, stats[target].defense) * (blackFlash ? 2 : 1) * (hasAbility(units[target], 16412) ? 1 - ABILITY_RULES.godHandReduction : 1);
      hp[target] = Math.max(0, hp[target] - damage); if (hp[target] === 0) dead.push(target);
      emit(attacker, target, isAbility ? activeId === 175198 ? 'shrine' : 'rumbling' : undefined, index === 0 && (isAbility || blackFlash) ? isAbility ? activeId === 175198 ? 'Malevolent Shrine' : 'Rumbling' : 'Black Flash' : undefined, damage);
      if (!isAbility && hasAbility(units[attacker], 171437) && hp[target] > 0) { burns[target] = applyBurn(burns[target], time, attacker); emit(attacker, target, 'status', 'Ninpo: Ascetic Blaze'); }
    });
    if (isAbility) { timers[attacker][activeId] = activeId === 175198 ? --pulses[attacker] > 0 ? time + ABILITY_RULES.shrineInterval : Infinity : time + timedCooldown(activeId); syncTimers(); } else next[attacker] = time + intervals[attacker];
    execution(attacker, dead); deaths(dead, alreadyDead); settleDuels(); snapshot();
  }
  const survivors = [0, 1].map(side => hp.filter((n, i) => n > 0 && sides[i] === side && participating[i]).length);
  const winner = stageWinner ?? (survivors[0] === 0 && survivors[1] === 0 ? 'draw' : survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw');
  return { stage, units: [...left, ...right], leftCount, events, stops, frames, duration: time, winner: hasSide(2) ? survivors[0] === 0 ? 'right' : winner === 'left' ? 'draw' : winner : winner, left: survivors[0], right: survivors[1] };
}
