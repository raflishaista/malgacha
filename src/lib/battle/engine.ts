import { equipmentBonuses, dodgeChance, defenseIgnore, equipmentAtbRate } from './equipment';
import { BattleItems } from './item-effects';
import { firstStageTick, applyStageTick } from './stage-effects';
import type { StageId } from '../stages';
import type { JourneyCharacter } from '../types';
import { bossFor, BOSS_ABILITY_RULES, DEOXYS_FORMES, LURE } from '../bosses';
import { STAT_KEYS, statTotal } from '../stats';
import { ABILITIES, timedAbilities, implementationsFor, abilityCooldown, incomingDamageMultiplier, attackEffectsFor, type AbilityContext, type AbilityState } from './abilities';
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
  const replayUnits = [...left, ...right];
  const units = structuredClone(replayUnits);
  let count = units.length;
  const unitOverrides: Record<number, Partial<JourneyCharacter>> = {};
  units.forEach((unit, index) => {
    if (unit.boss && (unit.bossId ?? unit.id) === 74017) {
      unit.bossForm = 'normal'; unit.image = DEOXYS_FORMES.normal.image; unit.battleModifiers = undefined;
      unitOverrides[index] = { bossForm: 'normal', image: DEOXYS_FORMES.normal.image, battleModifiers: {} };
    }
  });
  const sides: number[] = units.map((_, i) => i < leftCount ? 0 : 1), positions = [...originalSlots];
  const participating = units.map((_, i) => stage !== 'budokai' || positions[i] < 5);
  const retired = new Set<number>(), executed = new Set<number>(), duelWins = [0, 0];
  const settledDuels = new Set<number>();
  let stageWinner: 'left' | 'right' | 'draw' | undefined;
  let executionUsed = false;
  const burnSide = stage === 'punk' ? Math.floor(random() * 2) : -1;
  const statuses = new BattleStatuses(count);
  const { burns, chillUntil } = statuses;
  const pendingRevival = new Set<number>();
  const itemEffects = new BattleItems(units, statuses, unitOverrides);
  const { permanentlyNegated } = itemEffects;
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
  const timers = units.map(c => Object.fromEntries(implementationsFor(c).filter(ability => ability.cooldown !== undefined).map(ability => [ability.id, ability.cooldown!])) as Record<number, number>);
  const abilityStates = units.map(() => new Map<number, AbilityState>());
  itemEffects.suppressInitial();
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
  const cannotAttack = (i: number) => implementationsFor(units[i]).some(ability => ability.cannotAttack);
  units.forEach((_, i) => { if (cannotAttack(i)) next[i] = Infinity; });
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
      const maximum = battleHP(stats[i].hp), interval = attackInterval(stats[i].speed) / statuses.atbRate(i, time) / equipmentAtbRate(units[i]);
      hp[i] = hp[i] > 0 ? Math.min(maximum, hp[i] / maxHP[i] * maximum) : 0;
      const resume = frozenUntil(i);
      if (hp[i] > 0) next[i] = cannotAttack(i) || retired.has(i) || !participating[i] ? Infinity : Number.isFinite(next[i]) ? resume + Math.max(0, next[i] - resume) / intervals[i] * interval : resume + interval;
      maxHP[i] = maximum; intervals[i] = interval;
    }
  }
  function timedGauge(owner: number, gauge: 'rumbling' | 'shrine') {
    const ability = implementationsFor(units[owner]).find(ability => ability.gauge === gauge);
    if (!ability || hp[owner] <= 0 || ability.oncePerBattle && state(owner, ability.id).used) return 0;
    return Math.max(0, 1 - activeSeconds(time, timers[owner][ability.id], owner, stops) / ability.cooldown!);
  }
  function snapshot() {
    const bossGauges = units.flatMap((unit, owner) => implementationsFor(unit).flatMap(ability => {
      if (!ability.bossGauge || !ability.cooldown || !available(owner) || !Number.isFinite(timers[owner][ability.id])) return [];
      const remaining = ability.absoluteTimer ? Math.max(0, timers[owner][ability.id] - time) : activeSeconds(time, timers[owner][ability.id], owner, stops);
      const title = ability.id === -10 ? (unit.sukunaStacks! >= 20 ? 'World-Cutting Slash' : 'Cleave') : ability.id === -15 ? (unit.sukunaStacks! >= 20 ? 'Malevolent Shrine' : 'Incomplete Malevolent Shrine') : bossFor(unit)?.title ?? 'Boss ability';
      return [{ owner, title, progress: Math.max(0, Math.min(1, 1 - remaining / ability.cooldown)), remaining, cooldown: ability.cooldown, absolute: !!ability.absoluteTimer }];
    }));
    frames.push({ ...(Object.keys(unitOverrides).length ? { unitOverrides: structuredClone(unitOverrides) } : {}), ...(bossGauges.length ? { bossGauges } : {}), witches: units.map(c => !!c.witch), time, hp: [...hp], maxHP: [...maxHP], speed: stats.map(s => s.speed), aura: [...aura], sides: [...sides], positions: [...positions], participating: [...participating], intervals: [...intervals], chillUntil: [...chillUntil], duelWins: [...duelWins],
      atb: next.map((n, i) => hp[i] > 0 ? Math.max(0, Math.min(1, 1 - activeSeconds(time, n, i, stops) / intervals[i])) : 0),
      rumbling: units.map((_, i) => timedGauge(i, 'rumbling')),
      shrine: units.map((_, i) => timedGauge(i, 'shrine')), shrineUsed: units.map((_, i) => shrineUsed(i)),
      ...(statuses.negatedUntil.some(at => at > 0) ? { negatedUntil: [...statuses.negatedUntil] } : {}), ...(statuses.curse.some(stacks => stacks.size > 0) ? { curseStacks: statuses.curse.map(stacks => [...stacks.values()].reduce((a,b) => a+b,0)) } : {}), burnUntil: burns.map(b => b?.until ?? 0) });
  }
  function heal(i: number, fraction: number, title: string) {
    const before = hp[i]; hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * fraction); emit(i, i, 'heal', title, before - hp[i]);
  }
  function revive(actor: number, target: number, fraction: number, title: string) {
    if (!participating[target] || retired.has(target) || executed.has(target)) return;
    hp[target] = maxHP[target] * fraction; statuses.clearBurn(target);
    next[target] = frozenUntil(target) + intervals[target];
    for (const ability of implementationsFor({ ...units[target], negated: false })) if (ability.cooldown !== undefined) timers[target][ability.id] = ability.oncePerBattle && state(target, ability.id).used ? Infinity : frozenUntil(target) + ability.cooldown;
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
    scheduleAbility(owner, ability, delay) { timers[owner][ability] = time + delay; syncTimers(); },
    summonLure(owner) {
      let target = units.findIndex(unit => unit.summonOwner === owner);
      if (target >= 0 && available(target)) return;
      const baseStats = Object.fromEntries(STAT_KEYS.map(key => [key, stats[owner][key] * BOSS_ABILITY_RULES.lureFraction])) as JourneyCharacter['baseStats'];
      const lure: JourneyCharacter = { ...LURE, titles: [], instanceId: `${units[owner].instanceId}-lure`, statRarity: 'N', baseStats, summonOwner: owner, keywords: ['TAUNT'] };
      if (target < 0) {
        target = count++;
        units.push(lure); replayUnits.push(structuredClone(lure));
        hp.push(baseStats.hp); maxHP.push(baseStats.hp); intervals.push(attackInterval(baseStats.speed)); stats.push({ ...baseStats });
        gear.push({ hp: 0, attack: 0, defense: 0, speed: 0 }); aura.push(false); bonus.push(0);
        next.push(time + intervals[target]); nextAbility.push(Infinity); timers.push({}); abilityStates.push(new Map());
        sides.push(sides[owner]); positions.push(positions[owner] + 1); participating.push(true); statuses.addUnit();
      } else {
        units[target] = lure; retired.delete(target); hp[target] = baseStats.hp; maxHP[target] = baseStats.hp;
        intervals[target] = attackInterval(baseStats.speed);
        statuses.clearBurn(target); statuses.chillUntil[target] = 0; timers[target] = {}; nextAbility[target] = Infinity;
        next[target] = time + attackInterval(baseStats.speed);
      }
      refreshGear(); refreshStats();
      next[target] = frozenUntil(target) + intervals[target];
      unitOverrides[target] = structuredClone(lure);
      emit(owner, target, 'summon', 'Lure');
    },
    captureWeakest(owner) {
      const candidates = units.flatMap((unit, i) => i < leftCount && !unit.witch && !retired.has(i) ? [i] : []);
      if (!candidates.length) return false;
      const target = candidates.reduce((first, candidate) => statTotal(replayUnits[candidate].baseStats) < statTotal(replayUnits[first].baseStats) ? candidate : first);
      const host = units[target], bossStats = { ...stats[owner] };
      const baseStats = Object.fromEntries(STAT_KEYS.map(key => [key, stats[target][key] + bossStats[key] * BOSS_ABILITY_RULES.fiendBoost])) as JourneyCharacter['baseStats'];
      retired.add(target); hp[target] = 0; next[target] = Infinity; nextAbility[target] = Infinity; statuses.clearBurn(target);
      for (const id of timedIds) timers[target][id] = Infinity;
      emit(owner, target, 'capture');
      units[owner] = { ...structuredClone(host), instanceId: units[owner].instanceId, boss: true, bossId: 184112, bossForm: undefined, baseStats, equipment: [], permanentBoosts: undefined, extraAbilities: [], keywords: [], battleModifiers: undefined, soulGem: false, marine: false, witch: false };
      unitOverrides[owner] = structuredClone(units[owner]);
      refreshGear(); refreshStats(); hp[owner] = maxHP[owner];
      next[owner] = frozenUntil(owner) + intervals[owner];
      emit(owner, owner, 'transform', 'Gun Fiend');
      syncTimers();
      return true;
    },
    changeForm(owner, form) {
      const definition = DEOXYS_FORMES[form];
      units[owner].bossForm = form; units[owner].image = definition.image; units[owner].battleModifiers = { ...definition.modifiers };
      unitOverrides[owner] = { ...unitOverrides[owner], bossForm: form, image: definition.image, battleModifiers: { ...definition.modifiers } };
      refreshStats();
      emit(owner, owner, 'transform', 'Form Change');
    },
    defeatOpponents(owner, title) {
      let announced = false;
      units.forEach((_, i) => {
        if (sides[i] !== sides[owner] && participating[i]) {
          const damage = hp[i]; hp[i] = 0; next[i] = Infinity; nextAbility[i] = Infinity; statuses.clearBurn(i);
          emit(owner, i, 'annihilate', announced ? undefined : title, damage); announced = true;
        }
      });
      stageWinner = sides[owner] === 0 ? 'left' : 'right';
    },
    stopTime(owner, seconds) {
      stops.push({ start: time, end: time + seconds, owner, affected: units.flatMap((_, i) => i !== owner && sameDuel(i, owner) ? [i] : []) });
      for (let i = 0; i < count; i++) if (i !== owner && sameDuel(i, owner)) {
        next[i] += seconds;
        for (const id of timedIds) if (timers[i][id] !== undefined && !ABILITIES.get(id)?.absoluteTimer) timers[i][id] += seconds;
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
      const summonOwner = units[victim].summonOwner;
      if (summonOwner !== undefined && available(summonOwner)) for (const ability of implementationsFor(units[summonOwner])) ability.onSummonDeath?.(context, summonOwner);
      if (implementationsFor(units[victim]).some(ability => ability.onDeath?.(context, victim))) continue;
      if (units[victim].soulGem && !units[victim].negated && !units[victim].witch && participating[victim]) {
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
    for (const i of alreadyDead) if (hp[i] === 0 && dead.some(v => sameDuel(i, v))) {
      if (units[i].negated && !permanentlyNegated.has(i) && (units[i].id === 170732 || units[i].extraAbilities?.includes(170732)) && !units[i].removedAbilities?.includes(170732)) pendingRevival.add(i);
      for (const ability of implementationsFor(units[i])) ability.onLaterDeath?.(context, i);
    }
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
  const itemContext = { hp, get maxHP() { return maxHP; }, get time() { return time; }, available, sameSide, sameDuel, emit, deaths, refreshStats };
  itemEffects.onStart(itemContext);
  settleDuels();
  snapshot();
  const hasSide = (side: number) => units.some((_, i) => sides[i] === side && available(i));
  while (!stageWinner && ((hasSide(0) && hasSide(1)) || (pendingRevival.size > 0 && (hasSide(0) || hasSide(1))) || (hasSide(2) && (hasSide(0) || hasSide(1))))) {
    const burnTimes = units.map((_, i) => available(i) ? statuses.nextBurn(i) : Infinity);
    const negationExpiry = Math.min(Infinity, ...statuses.negatedUntil.filter((at, i) => !permanentlyNegated.has(i) && at > time));
    const earliest = Math.min(stageAt, nextExpiration, negationExpiry, ...burnTimes, ...next.map((n, i) => available(i) ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    if (time === negationExpiry) {
      units.forEach((unit, i) => {
        if (!permanentlyNegated.has(i) && unit.negated && statuses.negatedUntil[i] <= time) {
          unit.negated = false; unitOverrides[i] = { ...unitOverrides[i], negated: false };
          if (pendingRevival.delete(i) && hp[i] <= 0) implementationsFor(unit).find(ability => ability.id === 170732)?.onLaterDeath?.(context, i);
        }
      });
      refreshStats(); snapshot(); continue;
    }
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
    const deadlineOwner = ready.find(i => implementationsFor(units[i]).some(ability => ability.absoluteTimer && timers[i][ability.id] === time));
    const attacker = deadlineOwner ?? ready[Math.floor(random() * ready.length)];
    const isAbility = nextAbility[attacker] <= next[attacker];
    const activeId = isAbility ? Number(Object.entries(timers[attacker]).find(([, at]) => at === nextAbility[attacker])?.[0]) : 0;
    const activation = isAbility && !units[attacker].negated ? ABILITIES.get(activeId)?.onTimed?.(context, attacker) : undefined;
    if (isAbility && !activation?.attack) {
      timers[attacker][activeId] = time + (units[attacker].negated ? timedCooldown(activeId) : activation?.nextDelay ?? Infinity);
      syncTimers(); snapshot(); continue;
    }
    const protectedByLure = (i: number) => implementationsFor(units[i]).some(ability => ability.protectedBySummon) && units.some((unit, j) => unit.summonOwner === i && available(j));
    const living = hp.flatMap((n, i) => i !== attacker && available(i) && !protectedByLure(i) && (units[attacker].witch || units[i].witch || !sameSide(i, attacker)) && sameDuel(i, attacker) ? [i] : []);
    const taunts = living.filter(i => !units[i].negated && keywordsFor(units[i]).includes('TAUNT'));
    const candidates = taunts.length ? taunts : living;
    const targets = isAbility && !activation?.attack?.single || units[attacker].witch ? living : candidates.length ? [candidates[Math.floor(random() * candidates.length)]] : [];
    if (!targets.length) {
      if (pendingRevival.size) { next[attacker] = time + intervals[attacker]; if (isAbility) { timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); } }
      else { retired.add(attacker); next[attacker] = Infinity; nextAbility[attacker] = Infinity; }
      continue;
    }
    const attackEffect = !isAbility ? attackEffectsFor(units[attacker], context, attacker) : undefined;
    const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
    targets.forEach((target, index) => {
      if (dodgeChance(units[target]) > 0 && random() < dodgeChance(units[target])) { emit(attacker, target, 'dodge', 'DODGE'); return; }
      const ignore = 1 - (1 - defenseIgnore(units[attacker])) * (1 - (activation?.attack?.defenseIgnore ?? 0));
      const damage = attackDamage(stats[attacker].attack, stats[target].defense * (1 - ignore)) * (activation?.attack?.multiplier ?? attackEffect?.multiplier ?? 1) * incomingDamageMultiplier(units[target]);
      const actual = Math.min(hp[target], damage);
      hp[target] = Math.max(0, hp[target] - damage); if (hp[target] === 0) dead.push(target);
      emit(attacker, target, activation?.attack?.kind, index === 0 ? activation?.attack?.title ?? attackEffect?.title : undefined, damage);
      if (!isAbility) for (const ability of implementationsFor(units[attacker])) ability.onHit?.(context, attacker, target);
      if (itemEffects.onHit(itemContext, attacker, target, actual) && !dead.includes(target)) dead.push(target);
    });
    if (isAbility) { timers[attacker][activeId] = time + (activation?.nextDelay ?? Infinity); syncTimers(); } else next[attacker] = time + intervals[attacker];
    execution(attacker, dead); deaths(dead, alreadyDead); settleDuels(); snapshot();
  }
  const survivors = [0, 1].map(side => hp.filter((n, i) => n > 0 && sides[i] === side && participating[i]).length);
  const winner = stageWinner ?? (survivors[0] === 0 && survivors[1] === 0 ? 'draw' : survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw');
  return { stage, units: replayUnits, leftCount, events, stops, frames, duration: time, winner: hasSide(2) ? survivors[0] === 0 ? 'right' : winner === 'left' ? 'draw' : winner : winner, left: survivors[0], right: survivors[1] };
}
