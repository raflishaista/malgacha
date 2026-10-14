import { equipmentBonuses } from './equipment';
import { firstStageTick, applyStageTick } from './stage-effects';
import type { StageId } from '../stages';
import type { JourneyCharacter } from '../types';
import { ABILITIES, timedAbilities, implementationsFor, hasAbility, abilityCooldown, incomingDamageMultiplier, attackEffectsFor, type AbilityContext, type AbilityState } from './abilities';
import { keywordsFor } from './keywords';
import { effectiveStats } from './modifiers';
import { BattleStatuses } from './statuses';
import { BATTLE_RULES, attackInterval, attackDamage, battleHP, activeSeconds } from './formulas';
import type { BattleEvent, BattleFrame, BattleReplay, TimeStop } from './types';

/** Scheduler owns timing, targeting and stage victory rules. Abilities use typed actions. */
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
  const statuses = new BattleStatuses(count);
  const { burns, chillUntil } = statuses;
  let stageAt = firstStageTick(stage);
  if (units.some(c => !c.baseStats || Object.values(c.baseStats).some(n => !Number.isFinite(n) || n <= 0))) throw new Error('Every unit needs valid base stats.');
  let time = 0;
  const hp = units.map(c => battleHP(c.baseStats.hp));
  let maxHP = [...hp], intervals = units.map(c => attackInterval(c.baseStats.speed));
  let stats = units.map(c => ({ ...c.baseStats }));
  let aura = units.map(() => false);
  const bonus = units.map(() => 0), next = [...intervals], cooldown = units.map(abilityCooldown), nextAbility = [...cooldown];
  const timedIds = timedAbilities.map(ability => ability.id);
  const timedCooldown = (id: number) => ABILITIES.get(id)?.cooldown ?? Infinity;
  const timers = units.map(c => Object.fromEntries(timedIds.filter(id => hasAbility(c, id)).map(id => [id, timedCooldown(id)])) as Record<number, number>);
  const abilityStates = units.map(() => new Map<number, AbilityState>());
  function state(owner: number, id: number): AbilityState {
    let value = abilityStates[owner].get(id);
    if (!value) { value = {}; abilityStates[owner].set(id, value); }
    return value;
  }
  const shrineUsed = (owner: number) => {
    const ability = implementationsFor(units[owner]).find(ability => ability.gauge === 'shrine');
    // Transformed units lose their abilities but retain the replay's already-used marker.
    const shrine = ability ?? timedAbilities.find(ability => ability.gauge === 'shrine');
    return shrine ? !!state(owner, shrine.id).used : false;
  };
  const syncTimers = () => { for (let i = 0; i < count; i++) nextAbility[i] = Math.min(Infinity, ...Object.values(timers[i])); };
  syncTimers();

  const events: BattleEvent[] = [], stops: TimeStop[] = [], frames: BattleFrame[] = [];
  const expirations = units.flatMap(unit => implementationsFor(unit).flatMap(ability => ability.expiresAt === undefined ? [] : [ability.expiresAt]));
  let nextExpiration = Math.min(Infinity, ...expirations);
  const sameSide = (a: number, b: number) => sides[a] === sides[b];
  const sameDuel = (a: number, b: number) => stage !== 'budokai' || positions[a] === positions[b];
  const available = (i: number) => participating[i] && !retired.has(i) && hp[i] > 0;
  const frozenUntil = (i: number) => Math.max(time, ...stops.filter(s => s.owner !== i && (!s.affected || s.affected.includes(i)) && s.start <= time && s.end > time).map(s => s.end));
  function emit(actor: number, target: number, kind: BattleEvent['kind'], ability?: string, damage = 0) {
    events.push({ time, attacker: actor, target, kind, ability, damage, hp: hp[target], ...(actor >= 0 && implementationsFor(units[actor]).some(ability => ability.tracksAttackBonus) ? { attackBonus: bonus[actor] } : {}) });
  }
  function refreshStats() {
    const auraMultipliers = units.map((_, i) => {
      const sources = new Map<number, number>();
      units.forEach((unit, j) => {
        if (j !== i && sameSide(i, j) && sameDuel(i, j) && available(j)) for (const ability of implementationsFor(unit)) {
          if (ability.auraMultiplier !== undefined) sources.set(ability.id, ability.auraMultiplier);
        }
      });
      return [...sources.values()].reduce((multiplier, value) => multiplier * value, 1);
    });
    aura = auraMultipliers.map(multiplier => multiplier !== 1);
    stats = units.map((c, i) => effectiveStats(c, auraMultipliers[i], time, bonus[i], gear[i]));
    for (let i = 0; i < count; i++) {
      const maximum = battleHP(stats[i].hp), interval = attackInterval(stats[i].speed) / statuses.atbRate(i, time);
      hp[i] = hp[i] > 0 ? Math.min(maximum, hp[i] / maxHP[i] * maximum) : 0;
      const resume = frozenUntil(i);
      if (hp[i] > 0) next[i] = resume + Math.max(0, next[i] - resume) / intervals[i] * interval;
      maxHP[i] = maximum; intervals[i] = interval;
    }
  }
  function timedGauge(owner: number, gauge: 'rumbling' | 'shrine') {
    const ability = implementationsFor(units[owner]).find(ability => ability.gauge === gauge);
    if (!ability || hp[owner] <= 0 || ability.oncePerBattle && state(owner, ability.id).used) return 0;
    return Math.max(0, 1 - activeSeconds(time, timers[owner][ability.id], owner, stops) / ability.cooldown!);
  }
  function snapshot() {
    frames.push({ witches: units.map(c => !!c.witch), time, hp: [...hp], maxHP: [...maxHP], speed: stats.map(s => s.speed), aura: [...aura], sides: [...sides], positions: [...positions], participating: [...participating], intervals: [...intervals], chillUntil: [...chillUntil], duelWins: [...duelWins],
      atb: next.map((n, i) => hp[i] > 0 ? Math.max(0, Math.min(1, 1 - activeSeconds(time, n, i, stops) / intervals[i])) : 0),
      rumbling: units.map((_, i) => timedGauge(i, 'rumbling')),
      shrine: units.map((_, i) => timedGauge(i, 'shrine')), shrineUsed: units.map((_, i) => shrineUsed(i)),
      burnUntil: burns.map(b => b?.until ?? 0) });
  }
  function heal(i: number, fraction: number, title: string) {
    const before = hp[i]; hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * fraction); emit(i, i, 'heal', title, before - hp[i]);
  }
  function revive(actor: number, target: number, fraction: number, title: string) {
    if (!participating[target] || retired.has(target) || executed.has(target)) return;
    hp[target] = maxHP[target] * fraction; statuses.clearBurn(target);
    next[target] = frozenUntil(target) + intervals[target];
    for (const id of timedIds) if (hasAbility(units[target], id)) timers[target][id] = ABILITIES.get(id)?.oncePerBattle && state(target, id).used ? Infinity : frozenUntil(target) + timedCooldown(id);
    syncTimers();
    emit(actor, target, 'revive', title);
  }
  const context: AbilityContext = {
    units, hp, random, state, heal, revive, emit,
    get maxHP() { return maxHP; },
    get stats() { return stats; },
    get time() { return time; },
    addAttack(owner, amount) { bonus[owner] += amount; },
    inflictBurn(owner, target) { statuses.burn(target, time, owner); },
    stopTime(owner, seconds) {
      stops.push({ start: time, end: time + seconds, owner, affected: units.flatMap((_, i) => i !== owner && sameDuel(i, owner) ? [i] : []) });
      for (let i = 0; i < count; i++) if (i !== owner && sameDuel(i, owner)) {
        next[i] += seconds;
        for (const id of timedIds) if (timers[i][id] !== undefined) timers[i][id] += seconds;
        statuses.freeze(i, seconds);
      }
    }
  };
  function deaths(dead: number[], alreadyDead: number[]) {
    if (!dead.length) return;
    for (const i of dead) { statuses.clearBurn(i); next[i] = Infinity; nextAbility[i] = Infinity; for (const id of timedIds) timers[i][id] = Infinity; }
    refreshStats();
    for (const victim of dead) {
      units.forEach((c, i) => { if (available(i) && sameDuel(i, victim)) for (const ability of implementationsFor(c)) ability.onOtherDeath?.(context, i); });
      if (units[victim].soulGem && !units[victim].witch && participating[victim]) {
        units[victim].witch = true; sides[victim] = 2;
        refreshGear(); refreshStats(); hp[victim] = maxHP[victim];
        next[victim] = frozenUntil(victim) + intervals[victim];
        emit(victim, victim, 'transform', 'Witch');
        continue;
      }
      const caster = units.findIndex((c, i) => i !== victim && sameSide(i, victim) && sameDuel(i, victim) && available(i) && !executed.has(victim) && implementationsFor(c).some(ability => ability.canReviveAlly?.(context, i)));
      if (caster >= 0 && hp[victim] === 0) implementationsFor(units[caster]).find(ability => ability.canReviveAlly?.(context, caster))?.onAllyDeath?.(context, caster, victim);
    }
    // Only Denji units dead before this damage batch can react to its deaths.
    for (const i of alreadyDead) if (hp[i] === 0 && dead.some(v => sameDuel(i, v))) for (const ability of implementationsFor(units[i])) ability.onLaterDeath?.(context, i);
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
  units.forEach((unit, i) => {
    if (available(i)) implementationsFor(unit).filter(ability => ability.onStart).sort((a, b) => (a.startPriority ?? 0) - (b.startPriority ?? 0))[0]?.onStart?.(context, i);
  });
  settleDuels();
  snapshot();
  const hasSide = (side: number) => units.some((_, i) => sides[i] === side && available(i));
  while (!stageWinner && ((hasSide(0) && hasSide(1)) || (hasSide(2) && (hasSide(0) || hasSide(1))))) {
    const burnTimes = units.map((_, i) => available(i) ? statuses.nextBurn(i) : Infinity);
    const earliest = Math.min(stageAt, nextExpiration, ...burnTimes, ...next.map((n, i) => available(i) ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    if (time === stageAt) {
      const effect = applyStageTick(stage, {
        time, units, hp, maxHP, sides, positions, burnSide, statuses, available, random, refreshStats,
        refreshTeamModifiers() { refreshGear(); refreshStats(); },
        damageEveryone(fraction) {
          const alreadyDead = hp.flatMap((value, i) => value <= 0 ? [i] : []), dead: number[] = [];
          units.forEach((_, i) => {
            if (available(i)) {
              const damage = maxHP[i] * fraction;
              hp[i] = Math.max(0, hp[i] - damage);
              emit(-1, i, 'environment', undefined, damage);
              if (hp[i] === 0) dead.push(i);
            }
          });
          deaths(dead, alreadyDead);
        }
      });
      stageAt = effect.nextAt;
      stageWinner = effect.winner ?? stageWinner;
      snapshot(); continue;
    }
    if (time === nextExpiration) { nextExpiration = Math.min(Infinity, ...expirations.filter(at => at > time)); refreshStats(); snapshot(); continue; }
    const burnTarget = burnTimes.findIndex(n => n === time);
    if (burnTarget >= 0) {
      const tick = statuses.tickBurn(burnTarget, time);
      if (tick) {
        const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []);
        const damage = maxHP[burnTarget] * tick.hpFraction * incomingDamageMultiplier(units[burnTarget]);
        hp[burnTarget] = Math.max(0, hp[burnTarget] - damage);
        emit(tick.source, burnTarget, 'burn', undefined, damage);
        const dead = hp[burnTarget] === 0 ? [burnTarget] : [];
        execution(tick.source, dead); deaths(dead, alreadyDead); settleDuels();
      }
      snapshot(); continue;
    }
    const ready = next.flatMap((n, i) => available(i) && Math.abs(Math.min(n, nextAbility[i]) - time) < 1e-9 ? [i] : []);
    const attacker = ready[Math.floor(random() * ready.length)];
    const isAbility = nextAbility[attacker] <= next[attacker];
    const activeId = isAbility ? Number(Object.entries(timers[attacker]).find(([, at]) => at === nextAbility[attacker])?.[0]) : 0;
    const activation = isAbility ? ABILITIES.get(activeId)?.onTimed?.(context, attacker) : undefined;
    if (isAbility && !activation?.attack) {
      timers[attacker][activeId] = time + (activation?.nextDelay ?? Infinity);
      syncTimers(); snapshot(); continue;
    }
    const living = hp.flatMap((n, i) => i !== attacker && available(i) && (units[attacker].witch || units[i].witch || !sameSide(i, attacker)) && sameDuel(i, attacker) ? [i] : []);
    const taunts = living.filter(i => keywordsFor(units[i]).includes('TAUNT'));
    const candidates = taunts.length ? taunts : living;
    const targets = isAbility || units[attacker].witch ? living : [candidates[Math.floor(random() * candidates.length)]];
    if (!targets.length) { retired.add(attacker); next[attacker] = Infinity; nextAbility[attacker] = Infinity; continue; }
    const attackEffect = !isAbility ? attackEffectsFor(units[attacker], context, attacker) : undefined;
    const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
    targets.forEach((target, index) => {
      const damage = attackDamage(stats[attacker].attack, stats[target].defense) * (attackEffect?.multiplier ?? 1) * incomingDamageMultiplier(units[target]);
      hp[target] = Math.max(0, hp[target] - damage); if (hp[target] === 0) dead.push(target);
      emit(attacker, target, activation?.attack?.kind, index === 0 ? activation?.attack?.title ?? attackEffect?.title : undefined, damage);
      if (!isAbility) for (const ability of implementationsFor(units[attacker])) ability.onHit?.(context, attacker, target);
    });
    if (isAbility) { timers[attacker][activeId] = time + (activation?.nextDelay ?? Infinity); syncTimers(); } else next[attacker] = time + intervals[attacker];
    execution(attacker, dead); deaths(dead, alreadyDead); settleDuels(); snapshot();
  }
  const survivors = [0, 1].map(side => hp.filter((n, i) => n > 0 && sides[i] === side && participating[i]).length);
  const winner = stageWinner ?? (survivors[0] === 0 && survivors[1] === 0 ? 'draw' : survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw');
  return { stage, units: [...left, ...right], leftCount, events, stops, frames, duration: time, winner: hasSide(2) ? survivors[0] === 0 ? 'right' : winner === 'left' ? 'draw' : winner : winner, left: survivors[0], right: survivors[1] };
}
