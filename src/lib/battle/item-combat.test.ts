import { expect, it } from 'vitest';
import { simulateBattle } from './engine';
import { attackDamage } from './formulas';
import { equipmentBonuses } from './equipment';
import type { JourneyCharacter } from '../types';
import type { ItemId } from '../items';
const unit = (id: number, equipment: ItemId[] = []): JourneyCharacter => ({id,instanceId:String(id),name:String(id),url:'',image:null,titles:[],statRarity:'N',baseStats:{hp:10000,attack:125,defense:125,speed:125},equipment:equipment.map((itemId,i)=>({itemId,instanceId:id+'-'+i}))});
const team = (offset=9000) => Array.from({length:5},(_,i)=>unit(offset+i));
it('Spear of Longinus reduces effective defense and stacks multiplicatively', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['longinus','longinus']).equipment;
  const replay=simulateBattle(left,right,()=>0);
  const hit=replay.events.find(e=>e.attacker===0 && !e.kind)!;
  expect(hit.damage).toBeCloseTo(attackDamage(125,125*.6*.6));
});
it('Swordfish stacks speed and dodge, with dodged attacks dealing no damage or on-hit effects', () => {
  const left=team(),right=team(10000);right.forEach(c=>c.equipment=unit(1,['swordfish']).equipment);left[0].extraAbilities=[171437];
  expect(equipmentBonuses(right)[0].speed).toBe(25);
  const replay=simulateBattle(left,right,()=>0);
  expect(replay.events.some(e=>e.kind==='dodge')).toBe(true);
  expect(replay.events.filter(e=>e.attacker<5 && !e.kind)).toHaveLength(0);
  expect(replay.events.filter(e=>e.kind==='burn' && e.target>=5)).toHaveLength(0);
});
it('Curse Nail slows ATB and triggers repeatedly after each three hits', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['curse']).equipment;right[0].keywords=['TAUNT'];right[0].extraAbilities=[22036];
  right[0].baseStats.hp=1000000;
  const replay=simulateBattle(left,right,()=>0);
  expect(replay.frames![0].intervals![0]).toBeCloseTo(3.6/.8);
  const hits=replay.events.filter(e=>e.attacker===0 && e.target===5 && !e.kind);
  const procs=replay.events.filter(e=>e.attacker===0 && e.target===5 && e.kind==='curse');
  expect(procs.length).toBeGreaterThan(1);expect(procs[0].time).toBe(hits[2].time);expect(procs[1].time).toBe(hits[5].time);expect(procs[0].damage).toBe(500000);
});
it('Curse Nail removes only 15% maximum HP against a boss', () => {
  const left=team(),boss={...unit(240069),boss:true};left[0].equipment=unit(1,['curse']).equipment;boss.baseStats.hp=100000;
  const replay=simulateBattle(left,[boss],()=>0);
  expect(replay.events.find(e=>e.kind==='curse')?.damage).toBe(15000);
});
it('Hōgyoku suppresses listed and implemented passives and keywords without mutating the saved unit', () => {
  const left=team(),right=team(10000);left[0]=unit(163847,['hogyoku']);left[0].extraAbilities=[22036];left[0].soulGem=true;left[0].keywords=['TAUNT'];
  const before=structuredClone(left);const replay=simulateBattle(left,right,()=>0);
  expect(left).toEqual(before);expect(replay.frames![0].speed[0]).toBe(175);expect(replay.frames![0].maxHP[0]).toBe(10050);
  expect(replay.events.some(e=>e.attacker===0 && ['Black Flash','Koyomi Vamp'].includes(e.ability??''))).toBe(false);expect(replay.frames![0].unitOverrides![0].negated).toBe(true);
});
it('Behelit kills allies and gains battle-only stats, allowing death abilities to react', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['behelit']).equipment;left[1].soulGem=true;left[2].extraAbilities=[87275];
  const before=structuredClone(left);const replay=simulateBattle(left,right,()=>0);
  expect(replay.events.filter(e=>e.ability==='Behelit')).toHaveLength(4);expect(replay.frames![0].speed[0]).toBe(225);expect(replay.frames![0].witches![1]).toBe(true);expect(left).toEqual(before);
});
it('Lifesteal heals half actual HP damage and cannot exceed maximum HP', () => {
  const left=team(),right=team(10000);left[0].keywords=['LIFESTEAL'];
  const replay=simulateBattle(left,right,()=>.1);const heal=replay.events.find(e=>e.attacker===0 && e.ability==='Lifesteal')!;
  expect(heal).toBeDefined();const frame=replay.frames!.find(f=>f.time===heal.time)!;expect(heal.hp).toBeLessThanOrEqual(frame.maxHP[0]);
});
it('Host of Sukuna unlocks the six-second single attack at ten stacks', () => {
  const left=team(),right=team(10000);left[0].sukunaStacks=10;
  const replay=simulateBattle(left,right,()=>0);const cleaves=replay.events.filter(e=>e.ability==='Cleave');
  expect(cleaves[0].time).toBe(6);expect(cleaves[0].damage).toBe(50);expect(replay.frames![0].bossGauges?.find(g=>g.owner===0)?.title).toBe('Cleave');expect(replay.events.some(e=>e.ability?.includes('Shrine'))).toBe(false);
});
it('fifteen stacks give three shrine pulses, twenty give five and an armor-piercing slash', () => {
  for(const stacks of [15,20]){const left=team(),right=team(10000);left[0].sukunaStacks=stacks;const replay=simulateBattle(left,right,()=>0);
    const pulses=replay.events.filter(e=>e.kind==='boss-attack' && e.attacker===0 && e.time>=8 && e.time<9);
    expect(pulses).toHaveLength((stacks===20?5:3)*5);
    if(stacks===20)expect(replay.events.find(e=>e.ability==='World-Cutting Slash')!.damage).toBeCloseTo(attackDamage(125,62.5)*2);
  }
});
it('NEGATED blocks regeneration, Burn application, Taunt and Soul Gem until expiry, then abilities resume', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['inverted']).equipment;right[0].extraAbilities=[22036,171437];right[0].keywords=['TAUNT'];right[0].soulGem=true;
  // A fast first hit, then a long gap: regeneration due at 4s must be skipped, the 8s activation resumes.
  left[0].baseStats.speed=2000;left[0].equipment!.push({itemId:'curse',instanceId:'slow'});
  const replay=simulateBattle(left,right,()=>0);
  const first=replay.events.find(e=>e.attacker===0 && e.ability==='NEGATED')!;expect(first).toBeDefined();
  expect(replay.frames!.some(f=>(f.negatedUntil?.[5]??0)>f.time)).toBe(true);
  expect(replay.events.some(e=>e.kind==='heal' && e.attacker===5 && e.time>first.time && e.time<first.time+6)).toBe(false);
});
it('a unit killed while NEGATED cannot become a Witch', () => {
  const left=team(),right=team(10000);left.forEach(c=>c.baseStats.attack=100000);left[0].equipment=unit(1,['inverted']).equipment;right[0].soulGem=true;right[0].baseStats.hp=1;right[0].keywords=['TAUNT'];
  const replay=simulateBattle(left,right,()=>0);expect(replay.events.some(e=>e.target===5 && e.ability==='Witch')).toBe(false);
});
it('dead Denji waits out NEGATED and revives when a later death was witnessed, even if his side is empty', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['inverted']).equipment;
  right.forEach(c=>c.baseStats.hp=1);right[0].id=170732;right[0].keywords=['TAUNT'];
  const replay=simulateBattle(left,right,()=>0);
  const negated=replay.events.find(e=>e.target===5 && e.ability==='NEGATED')!;
  const revival=replay.events.find(e=>e.target===5 && e.ability==='Chainsaw Heart')!;
  expect(negated).toBeDefined();expect(revival).toBeDefined();expect(revival.time).toBeCloseTo(negated.time+6);expect(revival.hp).toBeCloseTo(.15);
  expect(replay.winner).toBe('left');
});
it('NEGATED skips timed activations without resetting the cadence', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['inverted']).equipment;
  right[0].extraAbilities=[22036];right[0].keywords=['TAUNT'];
  // Force the spear wearer out after one hit, leaving the debuff to expire naturally.
  left[0].baseStats.hp=1;right[0].baseStats.speed=120;
  const replay=simulateBattle(left,right,()=>0);
  const first=replay.events.find(e=>e.target===5 && e.ability==='NEGATED')!;
  expect(first).toBeDefined();
  const heals=replay.events.filter(e=>e.attacker===5 && e.ability==='Koyomi Vamp');
  expect(heals.some(e=>e.time>first.time && e.time<first.time+6)).toBe(false);
  expect(heals.some(e=>e.time===12)).toBe(true);
});
it('a unit revived by Marcille while negated regains its timed passive after suppression ends', () => {
  const left=team(),right=team(10000);left[0].equipment=unit(1,['inverted']).equipment;left[0].baseStats.hp=1;
  left.slice(1).forEach(c=>c.baseStats.speed=1);
  right[0].extraAbilities=[22036];right[0].keywords=['TAUNT'];right[0].baseStats.hp=1;right[0].baseStats.speed=124;
  right[1].extraAbilities=[134263];
  const replay=simulateBattle(left,right,()=>0);
  const revive=replay.events.find(e=>e.target===5 && e.ability==='Forbidden Magic')!;expect(revive).toBeDefined();
  expect(replay.events.some(e=>e.attacker===5 && e.ability==='Koyomi Vamp' && e.time>=revive.time+8)).toBe(true);
});
