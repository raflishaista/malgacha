import { equipmentBonuses, dodgeChance, defenseIgnore, equipmentAtbRate } from './equipment';
import { BattleItems } from './item-effects';
import { firstStageTick, applyStageTick } from './stage-effects';
import type { StageId } from '../stages';
import type { JourneyCharacter } from '../types';
import { bossFor, BOSS_ABILITY_RULES, DEOXYS_FORMES, LURE } from '../bosses';
import { STAT_KEYS, statTotal } from '../stats';
import { ABILITIES, IMPLEMENTED_ABILITIES, timedAbilities, implementationsFor, abilityCooldown, incomingDamageMultiplier, attackEffectsFor, type AbilityContext, type AbilityState } from './abilities';
import { keywordsFor } from './keywords';
import { effectiveStats } from './modifiers';
import { BattleStatuses } from './statuses';
import { BATTLE_RULES, attackInterval, attackDamage, battleHP, activeSeconds } from './formulas';
import type { BattleEvent, BattleFrame, BattleReplay, TimeStop } from './types';
import {BattleEffects} from './effects';
import type {EffectId} from './effects';
import {abilityIds} from './abilities/catalog';
import {COPY_EXCLUDED,EXPANDED_RULES as R} from './abilities/expanded-config';
import {specialUnit,type SummonKind} from './abilities/special-units';
import {abilityFor} from '../journeys';

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
  const effects = new BattleEffects(count);
  const counters:Record<number,{ability:number;value:number;digits?:number[]}>={};
  const links:Record<number,number>={};
  const protections=new Map<number,{owner:number;until:number}>();
  const processedDeaths=new Set<number>();
  const persistence:NonNullable<BattleReplay['updates']>={};
  const attackOverrides=new Map<number,number>();
  const pausedAtb=new Map<number,number>();
  let abilityDepth=0;
  let activationTarget:number|undefined;
  const casualties=[0,0,0];
  let blastTie=false;
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
  const cannotAttack = (i: number) => implementationsFor(units[i]).some(ability => ability.cannotAttack) || effects.has(i,'STUN',time) || implementationsFor(units[i]).some(a=>a.id===140046)&&(state(i,140046).hits??0)>=5;
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
    stats.forEach((value,i)=>{
      if(effects.has(i,'WEAKENED',time))for(const key of STAT_KEYS)value[key]=Math.max(1,value[key]-20);
      if(!units[i].negated&&effects.has(i,'FESTIVE MIRACLE',time))value.speed*=4;
      if(implementationsFor(units[i]).some(a=>a.speedFloor))value.speed=Math.max(value.speed,units[i].baseStats.speed);
      if(attackOverrides.has(i))value.attack=attackOverrides.get(i)!;
    });
    for (let i = 0; i < count; i++) {
      const maximum = battleHP(stats[i].hp), interval = attackInterval(stats[i].speed) / statuses.atbRate(i, time) / equipmentAtbRate(units[i]);
      hp[i] = hp[i] > 0 ? Math.min(maximum, hp[i] / maxHP[i] * maximum) : 0;
      const resume = frozenUntil(i);
      if(effects.has(i,'STUN',time)&&Number.isFinite(next[i]))pausedAtb.set(i,Math.max(0,next[i]-resume)/intervals[i]);
      if (hp[i] > 0) next[i] = cannotAttack(i) || retired.has(i) || !participating[i] ? Infinity : Number.isFinite(next[i]) ? resume + Math.max(0, next[i] - resume) / intervals[i] * interval : resume + (pausedAtb.get(i)??1)*interval;
      if(!effects.has(i,'STUN',time))pausedAtb.delete(i);
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
      if (!ability.bossGauge || !ability.cooldown || !available(owner) || !Number.isFinite(timers[owner][ability.id]) && !(ability.id===177491&&state(owner,177491).ready)) return [];
      const remaining = ability.id===177491&&state(owner,177491).ready?0:ability.absoluteTimer ? Math.max(0, timers[owner][ability.id] - time) : activeSeconds(time, timers[owner][ability.id], owner, stops);
      const title = ability.id === -10 ? (unit.sukunaStacks! >= 20 ? 'World-Cutting Slash' : 'Cleave') : ability.id === -15 ? (unit.sukunaStacks! >= 20 ? 'Malevolent Shrine' : 'Incomplete Malevolent Shrine') : bossFor(unit)?.title ?? abilityFor(ability.id)?.title ?? 'Ability';
      return [{ owner, title, progress: Math.max(0, Math.min(1, 1 - remaining / ability.cooldown)), remaining, cooldown: ability.cooldown, absolute: !!ability.absoluteTimer }];
    }));
    frames.push({ ...(units.some((_,i)=>cannotAttack(i))?{inactive:units.map((_,i)=>cannotAttack(i))}:{}), ...(effects.entries.some(map=>map.size)?{effects:effects.frame(time)}:{}), ...(Object.keys(counters).length?{counters:structuredClone(counters)}:{}), ...(Object.keys(links).length?{links:{...links}}:{}), ...(Object.keys(unitOverrides).length ? { unitOverrides: structuredClone(unitOverrides) } : {}), ...(bossGauges.length ? { bossGauges } : {}), witches: units.map(c => !!c.witch), time, hp: [...hp], maxHP: [...maxHP], speed: stats.map(s => s.speed), aura: [...aura], sides: [...sides], positions: [...positions], participating: [...participating], intervals: [...intervals], chillUntil: [...chillUntil], duelWins: [...duelWins],
      atb: next.map((n, i) => hp[i] > 0 ? effects.has(i,'STUN',time)?1-(pausedAtb.get(i)??1):Math.max(0, Math.min(1, 1 - activeSeconds(time, n, i, stops) / intervals[i])) : 0),
      rumbling: units.map((_, i) => timedGauge(i, 'rumbling')),
      shrine: units.map((_, i) => timedGauge(i, 'shrine')), shrineUsed: units.map((_, i) => shrineUsed(i)),
      ...(statuses.negatedUntil.some(at => at > 0) ? { negatedUntil: [...statuses.negatedUntil] } : {}), ...(statuses.curse.some(stacks => stacks.size > 0) ? { curseStacks: statuses.curse.map(stacks => [...stacks.values()].reduce((a,b) => a+b,0)) } : {}), burnUntil: burns.map(b => b?.until ?? 0) });
  }
  function heal(i: number, fraction: number, title: string) {
    const before = hp[i]; hp[i] = Math.min(maxHP[i], hp[i] + maxHP[i] * fraction); emit(i, i, 'heal', title, before - hp[i]);
  }
  function revive(actor: number, target: number, fraction: number, title: string) {
    if (!participating[target] || retired.has(target) || executed.has(target)) return;
    hp[target] = maxHP[target] * fraction; statuses.clearBurn(target);processedDeaths.delete(target);
    next[target] = frozenUntil(target) + intervals[target];
    for (const ability of implementationsFor({ ...units[target], negated: false })) if (ability.cooldown !== undefined) timers[target][ability.id] = ability.oncePerBattle && state(target, ability.id).used ? Infinity : frozenUntil(target) + ability.cooldown;
    syncTimers();
    emit(actor, target, 'revive', title);
  }
  function enemies(owner:number){return units.flatMap((unit,i)=>i!==owner&&available(i)&&sameDuel(owner,i)&&(unit.witch||units[owner].witch||!sameSide(i,owner))?[i]:[]);}
  function allies(owner:number,dead=false){return units.flatMap((_,i)=>i!==owner&&participating[i]&&!retired.has(i)&&sameSide(i,owner)&&sameDuel(i,owner)&&(dead?hp[i]<=0:hp[i]>0)?[i]:[]);}
  function titleOf(id:number){return abilityFor(id)?.title??bossFor({id})?.title??'Ability';}
  function affected(owner:number,id:number){const definition=ABILITIES.get(id);if(definition?.activationTargets)return definition.activationTargets(context,owner);if(definition?.selectTarget){const target=definition.selectTarget(context,owner);return target===undefined?[]:[target];}const mode=definition?.targets??'self';return mode==='all'?units.flatMap((_,i)=>available(i)&&sameDuel(i,owner)?[i]:[]):mode==='enemies'?enemies(owner):mode==='enemy'?(enemies(owner).length?[enemies(owner)[Math.floor(random()*enemies(owner).length)]]:[]):mode==='allies'?[owner,...allies(owner)]:[owner];}
  function trigger<T>(owner:number,id:number,targets:number[],action:(actor:number)=>T):{actor:number;value:T}|undefined {
    if(abilityDepth>=8||units[owner].negated)return;
    abilityDepth++;
    try{
      let actor=owner;
      const chained=Object.entries(links).find(([source,target])=>target===owner&&available(Number(source))&&!units[Number(source)].negated);
      if(chained){deal(Number(chained[0]),owner,maxHP[owner],'Judgment Chain');return;}
      intercept:for(let i=0;i<count;i++)if(available(i)&&!sameSide(i,owner)&&sameDuel(i,owner))for(const ability of implementationsFor(units[i])){
        const response=ability.onEnemyActivation?.(context,i,owner,id,targets);
        if(response==='interrupt')return;
        if(response==='reflect'){actor=i;break intercept;}
      }
      for(let i=0;i<count;i++)if(available(i))for(const ability of implementationsFor(units[i]))ability.onAnyActivation?.(context,i);
      if(actor!==owner&&(id===1374||id===1375))state(actor,id).card=state(owner,id).card;
      const previous=activationTarget;activationTarget=actor===owner?targets.find(i=>!sameSide(i,owner)):owner;
      const value=action(actor);activationTarget=previous;
      refreshStats();return{actor,value};
    }finally{abilityDepth--;}
  }
  function append(unit:JourneyCharacter,owner:number){
    const i=count++;units.push(unit);replayUnits.push(structuredClone(unit));hp.push(unit.baseStats.hp);maxHP.push(unit.baseStats.hp);intervals.push(attackInterval(unit.baseStats.speed));stats.push({...unit.baseStats});gear.push({hp:0,attack:0,defense:0,speed:0});aura.push(false);bonus.push(0);next.push(time+intervals[i]);nextAbility.push(Infinity);timers.push({});abilityStates.push(new Map());statuses.addUnit();effects.addUnit();sides.push(sides[owner]);positions.push(Math.max(4,...positions.filter((_,j)=>sides[j]===sides[owner]))+1);participating.push(stage!=='budokai'&&stage!=='valley');if(!participating[i]){hp[i]=0;next[i]=Infinity;}unitOverrides[i]=structuredClone(unit);return i;
  }
  function record(owner:number){return persistence[units[owner].instanceId]??= {};}
  function addStats(owner:number,amount:number,title:string,permanent=false){
    for(const key of STAT_KEYS){
      if(permanent){units[owner].permanentBoosts={...units[owner].permanentBoosts,[key]:(units[owner].permanentBoosts?.[key]??0)+amount};}
      else units[owner].battleModifiers={...units[owner].battleModifiers,[key]:(units[owner].battleModifiers?.[key]??0)+amount};
    }
    if(permanent)record(owner).permanentBoosts={...units[owner].permanentBoosts};
    unitOverrides[owner]={...unitOverrides[owner],permanentBoosts:units[owner].permanentBoosts,battleModifiers:units[owner].battleModifiers};refreshStats();emit(owner,owner,'buff',title);
  }
  function grant(owner:number,id:number,permanent=false,allowSpecial=false){
    if(units[owner].clone&&[17,2473,7035,1374,1375].includes(id))return false;
    if(!IMPLEMENTED_ABILITIES.includes(id)||!allowSpecial&&!permanent&&COPY_EXCLUDED.has(id)||abilityIds(units[owner]).includes(id))return false;
    if(permanent&&abilityIds(units[owner]).length>=3)return false;
    units[owner].removedAbilities=units[owner].removedAbilities?.filter(a=>a!==id);units[owner].extraAbilities=[...(units[owner].extraAbilities??[]),id];
    unitOverrides[owner]={...unitOverrides[owner],extraAbilities:[...units[owner].extraAbilities],removedAbilities:units[owner].removedAbilities};
    if(permanent)record(owner).extraAbilities=[...new Set([...(replayUnits[owner].extraAbilities??[]),...(record(owner).extraAbilities??[]),id])];
    const ability=ABILITIES.get(id)!;
    if(id===672){const candidates=IMPLEMENTED_ABILITIES.filter(candidate=>!COPY_EXCLUDED.has(candidate)&&!abilityIds(units[owner]).includes(candidate));const copied=candidates[Math.floor(random()*candidates.length)];if(copied!==undefined){grant(owner,copied);units[owner].parodyAbility=copied;unitOverrides[owner]={...unitOverrides[owner],parodyAbility:copied};emit(owner,owner,'buff','Parody ('+titleOf(copied)+')');}}
    if(ability.cooldown!==undefined)timers[owner][id]=time+ability.cooldown;
    if(id===177491)state(owner,id).ready=undefined;
    syncTimers();
    if(ability.onStart)trigger(owner,id,affected(owner,id),actor=>ability.onStart!(context,actor));
    if(ability.onTimed){const result=trigger(owner,id,affected(owner,id),actor=>ability.onTimed!(context,actor));if(result){timers[owner][id]=time+result.value.nextDelay;syncTimers();}if(result?.value.attack){const {attack}=result.value;const target=activationTarget??enemies(result.actor)[0];const targets=attack.single?(target===undefined?[]:[target]):enemies(result.actor);for(const t of targets)deal(result.actor,t,attackDamage(stats[result.actor].attack,stats[t].defense)*(attack.multiplier??1),attack.title);}}
    refreshStats();return true;
  }
  function fatal(target:number,attacker:number,previousHP=1):boolean{
    if(effects.has(target,'STRUGGLER',time)||effects.has(target,'INVINCIBLE',time))return true;
    const guard=protections.get(target);if(guard&&guard.until>time&&available(guard.owner))return true;
    for(const ability of implementationsFor(units[target]))if(ability.onFatal?.(context,target)){if(ability.id===71)hp[target]=previousHP;return true;}
    for(const owner of allies(target))for(const ability of implementationsFor(units[owner]))if(ability.onAllyFatal?.(context,owner,target)){hp[target]=previousHP;return true;}
    return false;
  }
  function killCredit(actor:number,target:number){
    if(actor<0||hp[target]>0)return;
    for(const ability of implementationsFor(units[actor]))ability.onKill?.(context,actor,target);
    if(implementationsFor(units[actor]).some(a=>a.id===2867)){units[actor].gantzPoints=(units[actor].gantzPoints??0)+R.gantzKillPoints;record(actor).gantzPoints=units[actor].gantzPoints;emit(actor,actor,'buff','GANTZ +25');}
    const junko=units.findIndex((_,i)=>available(i)&&sameDuel(i,actor)&&implementationsFor(units[i]).some(a=>a.id===65523)&&!state(i,65523).used);
    if(junko>=0&&hp[actor]>0){state(junko,65523).used=true;deal(junko,actor,maxHP[actor],'Execution');}
  }
  function deal(actor:number,target:number,damage:number,title:string,reflect=true){
    if(!available(target))return;
    if(effects.has(target,'INVINCIBLE',time)||effects.has(target,'STRUGGLER',time)&&hp[target]<=1)return;
    if(effects.has(target,'KURIBOH',time)){effects.entries[target].delete('KURIBOH');emit(target,target,'buff','Kuriboh');return;}
    if(reflect&&!units[target].negated&&effects.has(target,'REFLECT',time)&&actor!==target){deal(target,actor,damage,'REFLECT',false);return;}
    const oldDead=hp.flatMap((v,i)=>v<=0?[i]:[]);
    const previousHP=hp[target];hp[target]=Math.max(0,hp[target]-damage);
    if(hp[target]===0&&fatal(target,actor,previousHP))hp[target]=Math.max(1,hp[target]);
    emit(actor,target,'boss-attack',title,damage);
    if(hp[target]===0){killCredit(actor,target);deaths([target],oldDead);}
  }
  const context: AbilityContext = {
    sides,enemies,allies,addStats,grant,
    activate(owner,id,targets,action){return !!trigger(owner,id,targets,action);},
    target(owner){const values=enemies(owner);return activationTarget!==undefined&&values.includes(activationTarget)?activationTarget:values[Math.floor(random()*values.length)];},
    addStat(owner,key,amount,title){units[owner].battleModifiers={...units[owner].battleModifiers,[key]:(units[owner].battleModifiers?.[key]??0)+amount};unitOverrides[owner]={...unitOverrides[owner],battleModifiers:units[owner].battleModifiers};refreshStats();emit(owner,owner,'buff',title);},
    effect(owner,target,id,duration,title){effects.apply(target,id,time,duration,owner);refreshStats();emit(owner,target,'buff',title);},
    damage(owner,target,amount,title,percent=false){if(title==='Self-Destruct')blastTie=true;deal(owner,target,percent?maxHP[target]*amount:amount,title);},
    setCounter(owner,ability,value,digits){counters[owner]={ability,value,digits};},
    effectiveAttack(owner,value){attackOverrides.set(owner,value);refreshStats();},
    summon(owner,kind){
      if(units[owner].clone)return;
      if((kind==='clone'||kind==='pikachu')&&units.some(u=>u.summonOwner===owner))return;
      const key=-90000-(kind==='clone'?1:kind==='pikachu'?2:kind==='mahad'?3:4);if(state(owner,key).used)return;state(owner,key).used=true;
      const unit=kind==='clone'?{...structuredClone(units[owner]),clone:true,baseStats:{...stats[owner]},name:units[owner].name+' (Clone)',equipment:[],extraAbilities:abilityIds(units[owner]).filter(id=>id!==17),removedAbilities:[17],permanentBoosts:undefined,battleModifiers:undefined,instanceId:units[owner].instanceId+'-clone'}:specialUnit(kind,units[owner].instanceId+'-'+kind,random);
      unit.summonOwner=owner;const target=append(unit,owner);
      if(kind==='clone')for(const ability of implementationsFor(unit))if(ability.cooldown!==undefined)timers[target][ability.id]=time+ability.cooldown;
      syncTimers();refreshGear();refreshStats();emit(owner,target,'summon',kind==='clone'?'Shadow Clones':kind==='pikachu'?'I Choose You':kind==='mahad'?'Dark Magic Curtain':'Slifer the Sky Dragon');
    },
    replaceCrew(owner){const crew=['faye','jet','ein','edward'] as const;const members=allies(owner).filter(i=>positions[i]<5).slice(0,4);members.forEach((i,n)=>{units[i]={...specialUnit(crew[n],units[i].instanceId,random)};timers[i]={};abilityStates[i].clear();unitOverrides[i]=structuredClone(units[i]);hp[i]=units[i].baseStats.hp;maxHP[i]=hp[i];next[i]=time+attackInterval(units[i].baseStats.speed);});refreshGear();refreshStats();syncTimers();emit(owner,owner,'transform','Bebop Crew');},
    absorb(owner,amount,healFraction,inherit=false){const targets=allies(owner);if(!targets.length)return false;
      const oldDead=hp.flatMap((v,i)=>v<=0?[i]:[]);const inherited=targets.flatMap(i=>abilityIds(units[i])).slice(0,2);
      if(inherit){const inheritedKeywords=targets.flatMap(i=>keywordsFor(units[i]));units[owner].keywords=[...new Set([...(units[owner].keywords??[]),...inheritedKeywords.filter(k=>k==='TAUNT'||k==='LIFESTEAL')])];units[owner].soulGem||=targets.some(i=>units[i].soulGem);units[owner].marine||=targets.some(i=>units[i].marine);units[owner].sukunaStacks=Math.max(units[owner].sukunaStacks??0,...targets.map(i=>units[i].sukunaStacks??0));if(!units[owner].equipment?.length)units[owner].equipment=targets.flatMap(i=>units[i].equipment??[]).slice(0,3);}
      for(const target of targets){hp[target]=0;emit(owner,target,'execute',inherit?'Gattai da!':'Mutation');}
      addStats(owner,targets.length*amount,inherit?'Gattai da!':'Mutation');if(healFraction)hp[owner]=Math.min(maxHP[owner],hp[owner]+maxHP[owner]*healFraction*targets.length);
      unitOverrides[owner]=structuredClone(units[owner]);deaths(targets,oldDead);if(inherit)for(const id of inherited)grant(owner,id,false,true);refreshGear();refreshStats();return hp[owner]>0;
    },
    transform(owner,target){if(!abilityIds(units[target]).length||state(owner,135879).used)return;state(owner,135879).used=true;const source=units[target];units[owner].name=source.name;units[owner].image=source.image;units[owner].fusionImages=source.fusionImages;units[owner].removedAbilities=[...(units[owner].removedAbilities??[]),135879];units[owner].extraAbilities=abilityIds(source).filter(id=>id!==135879);unitOverrides[owner]=structuredClone(units[owner]);for(const id of abilityIds(units[owner])){const ability=ABILITIES.get(id);if(ability?.cooldown!==undefined)timers[owner][id]=time+ability.cooldown;}syncTimers();emit(owner,owner,'transform','Transform');},
    swap(owner,target){[sides[owner],sides[target]]=[sides[target],sides[owner]];[positions[owner],positions[target]]=[positions[target],positions[owner]];refreshGear();refreshStats();emit(owner,target,'transform','Musubi');},
    protect(owner,target,duration,title){protections.set(target,{owner,until:time+duration});effects.apply(owner,'INVINCIBLE',time,duration,owner);effects.apply(owner,'STUN',time,duration,owner);effects.apply(target,'INVINCIBLE',time,duration,owner);refreshStats();emit(owner,target,'buff',title);},
    seal(owner,target){links[owner]=target;emit(owner,target,'status','Judgment Chain');},
    curse(owner,target,title){const hits=(statuses.curse[target].get(owner)??0)+1;statuses.curse[target].set(owner,hits>=3?0:hits);if(hits>=3)trigger(owner,2511,[target],actor=>deal(actor,actor===owner?target:owner,maxHP[actor===owner?target:owner]*(units[actor===owner?target:owner].boss ? .15 : .5),title));},
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
        sides.push(sides[owner]); positions.push(positions[owner] + 1); participating.push(true); statuses.addUnit();effects.addUnit();
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
    dead=dead.filter(i=>hp[i]<=0&&!processedDeaths.has(i));
    if (!dead.length) return;
    for(const i of dead){processedDeaths.add(i);casualties[sides[i]]++;}
    for (const i of dead) { statuses.clearBurn(i); next[i] = Infinity; nextAbility[i] = Infinity; for (const id of timedIds) timers[i][id] = Infinity; }
    refreshStats();
    for (const victim of dead) {
      units.forEach((c, i) => { if (available(i) && sameDuel(i, victim)) for (const ability of implementationsFor(c)) ability.onOtherDeath?.(context, i); });
      const summonOwner = units[victim].summonOwner;
      if (summonOwner !== undefined && available(summonOwner)) for (const ability of implementationsFor(units[summonOwner])) ability.onSummonDeath?.(context, summonOwner);
      if (implementationsFor(units[victim]).some(ability => ability.onDeath ? trigger(victim,ability.id,affected(victim,ability.id),actor=>ability.onDeath!(context,actor))?.value : false)) continue;
      if (units[victim].soulGem && !units[victim].negated && !units[victim].witch && participating[victim]) {
        units[victim].witch = true; sides[victim] = 2;
        refreshGear(); refreshStats(); hp[victim] = maxHP[victim];
        next[victim] = frozenUntil(victim) + intervals[victim];
        emit(victim, victim, 'transform', 'Witch');
        continue;
      }
      const caster = units.findIndex((c, i) => i !== victim && sameSide(i, victim) && sameDuel(i, victim) && available(i) && !executed.has(victim) && implementationsFor(c).some(ability => ability.canReviveAlly?.(context, i)));
      if (caster >= 0 && hp[victim] === 0) implementationsFor(units[caster]).find(ability => ability.canReviveAlly?.(context, caster))?.onAllyDeath?.(context, caster, victim);
      const gantz=allies(victim).find(i=>implementationsFor(units[i]).some(a=>a.id===2867)&&(units[i].gantzPoints??0)>=100);
      if(gantz!==undefined&&hp[victim]===0){units[gantz].gantzPoints!-=100;record(gantz).gantzPoints=units[gantz].gantzPoints;revive(gantz,victim,1,'GANTZ');}
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
  const startup=units.flatMap((unit,owner)=>implementationsFor(unit).filter(ability=>ability.onStart).map(ability=>({owner,ability}))).sort((a,b)=>(a.ability.startPriority??0)-(b.ability.startPriority??0)||a.owner-b.owner);
  for(const {owner,ability} of startup)if(available(owner)&&implementationsFor(units[owner]).some(a=>a.id===ability.id)){
    if(ability.id===672){const candidates=IMPLEMENTED_ABILITIES.filter(id=>!COPY_EXCLUDED.has(id)&&!abilityIds(units[owner]).includes(id));const copied=candidates[Math.floor(random()*candidates.length)];if(copied!==undefined){grant(owner,copied);units[owner].parodyAbility=copied;unitOverrides[owner]={...unitOverrides[owner],parodyAbility:copied};emit(owner,owner,'buff','Parody ('+titleOf(copied)+')');}}
    else trigger(owner,ability.id,affected(owner,ability.id),actor=>ability.onStart!(context,actor));
  }
  const itemContext = { hp, get maxHP() { return maxHP; }, get time() { return time; }, available, sameSide, sameDuel, emit, deaths, refreshStats };
  itemEffects.onStart(itemContext);
  settleDuels();
  snapshot();
  const hasSide = (side: number) => units.some((_, i) => sides[i] === side && available(i));
  while (!stageWinner && ((hasSide(0) && hasSide(1)) || (pendingRevival.size > 0 && (hasSide(0) || hasSide(1))) || (hasSide(2) && (hasSide(0) || hasSide(1))))) {
    for(let i=0;i<count;i++)if(available(i))for(const ability of implementationsFor(units[i]))ability.onUpdate?.(context,i);
    const burnTimes = units.map((_, i) => available(i) ? statuses.nextBurn(i) : Infinity);
    const negationExpiry = Math.min(Infinity, ...statuses.negatedUntil.filter((at, i) => !permanentlyNegated.has(i) && at > time));
    const effectExpiry=effects.next(time);
    const earliest = Math.min(stageAt, nextExpiration, negationExpiry,effectExpiry, ...burnTimes, ...next.map((n, i) => available(i) ? Math.min(n, nextAbility[i]) : Infinity));
    if (earliest > BATTLE_RULES.maxSeconds) { time = BATTLE_RULES.maxSeconds; break; }
    time = earliest;
    if(time===effectExpiry){const oldDead=hp.flatMap((v,i)=>v<=0?[i]:[]),dead=effects.expire(time).filter(i=>available(i));for(const i of dead){hp[i]=0;emit(i,i,'execute','Time expired');}deaths(dead,oldDead);refreshStats();settleDuels();snapshot();continue;}
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
              const previousHP=hp[i];hp[i] = Math.max(0, hp[i] - damage);if(hp[i]===0&&fatal(i,-1,previousHP))hp[i]=Math.max(1,hp[i]);
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
        const previousHP=hp[burnTarget];hp[burnTarget] = Math.max(0, hp[burnTarget] - damage);if(hp[burnTarget]===0&&fatal(burnTarget,tick.source,previousHP))hp[burnTarget]=Math.max(1,hp[burnTarget]);
        emit(tick.source, burnTarget, 'burn', undefined, damage);
        const dead = hp[burnTarget] === 0 ? [burnTarget] : [];
        if(dead.length)killCredit(tick.source,burnTarget);
        execution(tick.source, dead); deaths(dead, alreadyDead); settleDuels();
      }
      snapshot(); continue;
    }
    const ready = next.flatMap((n, i) => available(i) && Math.abs(Math.min(n, nextAbility[i]) - time) < 1e-9 ? [i] : []);
    const deadlineOwner = ready.find(i => implementationsFor(units[i]).some(ability => ability.absoluteTimer && timers[i][ability.id] === time));
    const scheduledAttacker=deadlineOwner ?? ready[Math.floor(random() * ready.length)];
    let attacker = scheduledAttacker;
    const isAbility = nextAbility[attacker] <= next[attacker];
    const activeId = isAbility ? Number(Object.entries(timers[attacker]).find(([, at]) => at === nextAbility[attacker])?.[0]) : 0;
    if(isAbility&&ABILITIES.get(activeId)?.offensive&&effects.has(attacker,'STUN',time)){timers[attacker][activeId]=effects.entries[attacker].get('STUN')!.until;syncTimers();snapshot();continue;}
    const plannedTargets=isAbility?affected(attacker,activeId):[];
    const activated=isAbility&&!units[attacker].negated?trigger(attacker,activeId,plannedTargets,actor=>ABILITIES.get(activeId)?.onTimed?.(context,actor)):undefined;
    const activation=activated?.value;if(activated)attacker=activated.actor;
    if (isAbility && !activation?.attack) {
      const spent=!activated&&ABILITIES.get(activeId)?.oncePerBattle;
      if(spent)state(scheduledAttacker,activeId).used=true;
      timers[scheduledAttacker][activeId] = time + (spent?Infinity:!activated ? timedCooldown(activeId) : activation?.nextDelay ?? Infinity);
      syncTimers(); snapshot(); continue;
    }
    const protectedByLure = (i: number) => implementationsFor(units[i]).some(ability => ability.protectedBySummon) && units.some((unit, j) => unit.summonOwner === i && available(j));
    const attacksAllies=effects.has(attacker,'BERSERK',time)||(effects.has(attacker,'RAMPAGE',time)&&random()<.5);
    let living = hp.flatMap((n, i) => i !== attacker && available(i) && !protectedByLure(i) && (attacksAllies?sameSide(i,attacker):units[attacker].witch || units[i].witch || !sameSide(i, attacker)) && sameDuel(i, attacker) ? [i] : []);
    const targetable=living.filter(i=>!implementationsFor(units[i]).some(a=>a.untargetable));if(targetable.length)living=targetable;
    const taunts = living.filter(i => !units[i].negated && keywordsFor(units[i]).includes('TAUNT'));
    const candidates = taunts.length ? taunts : living;
    const targetCount=!isAbility?Math.max(1,...implementationsFor(units[attacker]).map(a=>a.attackTargets??1)):1;
    const single=isAbility&&activation?.attack?.single?(attacker!==scheduledAttacker?scheduledAttacker:plannedTargets.find(i=>candidates.includes(i)))??candidates[Math.floor(random()*candidates.length)]:candidates[Math.floor(random()*candidates.length)];
    let targets = isAbility && !activation?.attack?.single || units[attacker].witch ? living : candidates.length ? [single,...candidates.filter(i=>i!==single).slice(0,targetCount-1)] : [];
    if (!targets.length) {
      if (pendingRevival.size) { next[attacker] = time + intervals[attacker]; if (isAbility) { timers[attacker][activeId] = time + timedCooldown(activeId); syncTimers(); } }
      else { retired.add(attacker); next[attacker] = Infinity; nextAbility[attacker] = Infinity; }
      continue;
    }
    const attackEffect = !isAbility ? attackEffectsFor(units[attacker], context, attacker, targets) : undefined;
    if(attackEffect?.reflectedBy!==undefined){attacker=attackEffect.reflectedBy;targets=[scheduledAttacker];}
    const alreadyDead = hp.flatMap((n, i) => n <= 0 ? [i] : []), dead: number[] = [];
    const repeats=isAbility?1:Math.max(1,...implementationsFor(units[attacker]).map(a=>a.attackHits??1));
    for(let repeat=0;repeat<repeats;repeat++)targets.forEach((target, index) => {
      if(hp[target]<=0)return;
      if(effects.has(target,'INVINCIBLE',time)||effects.has(target,'STRUGGLER',time)&&hp[target]<=1)return;
      if(effects.has(target,'KURIBOH',time)){effects.entries[target].delete('KURIBOH');emit(target,target,'buff','Kuriboh');return;}
      const dodge=1-(1-dodgeChance(units[target]))*implementationsFor(units[target]).reduce((chance,a)=>chance*(1-(a.dodgeChance??0)),1);
      if (dodge > 0 && random() < dodge) { emit(target, target, 'dodge', 'DODGE');for(const ability of implementationsFor(units[target]))ability.onDodge?.(context,target); return; }
      const ignore = 1 - (1 - defenseIgnore(units[attacker])) * (1 - (activation?.attack?.defenseIgnore ?? 0));
      const matchup=implementationsFor(units[attacker]).reduce((value,a)=>value*(a.targetMultiplier?.(context,attacker,target)??1),1);
      const damage = attackDamage(stats[attacker].attack, stats[target].defense * (1 - ignore)) * (activation?.attack?.multiplier ?? attackEffect?.multiplier ?? 1) * incomingDamageMultiplier(units[target])*matchup;
      if(!units[target].negated&&effects.has(target,'REFLECT',time)){deal(target,attacker,damage,'REFLECT',false);return;}
      const actual = Math.min(hp[target], damage);
      const previousHP=hp[target];hp[target] = Math.max(0, hp[target] - damage);if(hp[target]===0&&fatal(target,attacker,previousHP))hp[target]=Math.max(1,hp[target]); if (hp[target] === 0) {dead.push(target);killCredit(attacker,target);}
      emit(attacker, target, activation?.attack?.kind, index === 0 ? activation?.attack?.title ?? attackEffect?.title : undefined, damage);
      if (!isAbility) for (const ability of implementationsFor(units[attacker])) ability.onHit?.(context,attacker,target);
      if (itemEffects.onHit(itemContext, attacker, target, actual) && !dead.includes(target)) {dead.push(target);killCredit(attacker,target);}
    });
    if (isAbility) { timers[scheduledAttacker][activeId] = frozenUntil(scheduledAttacker) + (activation?.nextDelay ?? Infinity); syncTimers(); } else {next[scheduledAttacker] = time + intervals[scheduledAttacker];if(implementationsFor(units[attacker]).some(a=>a.id===140046)&&(state(attacker,140046).hits??0)>=5){timers[attacker][140046]=time+R.regRecharge;syncTimers();next[attacker]=Infinity;}}
    execution(attacker, dead); deaths(dead, alreadyDead); settleDuels(); snapshot();
  }
  const survivors = [0, 1].map(side => hp.filter((n, i) => n > 0 && sides[i] === side && participating[i]).length);
  const winner = stageWinner ?? (survivors[0] === 0 && survivors[1] === 0 ? blastTie?'left':'draw' : survivors[0] === 0 ? 'right' : survivors[1] === 0 ? 'left' : 'draw');
  const finalWinner=hasSide(2)?survivors[0]===0?'right':winner==='left'?'draw':winner:winner;
  for(let i=0;i<count;i++)if(abilityIds(units[i]).includes(2867)&&casualties[sides[i]]===0&&(units[i].gantzPoints??0)>=100){units[i].gantzPoints!-=100;record(i).gantzPoints=units[i].gantzPoints;addStats(i,30,'GANTZ upgrade',true);}
  const losingSide=finalWinner==='left'?1:finalWinner==='right'?0:-1;
  const reset=units.some((unit,i)=>sides[i]===losingSide&&implementationsFor(unit).some(a=>a.resetsBattle));
  return { ...(Object.keys(persistence).length?{updates:persistence}:{}),...(reset?{resetSide:losingSide}:{}),stage, units: replayUnits, leftCount, events, stops, frames, duration: time, winner: finalWinner, left: survivors[0], right: survivors[1] };
}
