import {expect,it} from 'vitest';
import {simulateBattle} from './engine';
import {IMPLEMENTED_ABILITIES} from './abilities';
import {STAT_KEYS,statTotal} from '../stats';
import {SPECIAL_UNITS} from './abilities/special-units';
import catalog from '../data/abilities.json';
import {MAGIC_SERIES} from './abilities/expanded-config';
import type {JourneyCharacter} from '../types';
const unit=(id=900000,hp=10000):JourneyCharacter=>({id,name:String(id),instanceId:'u-'+id,image:null,url:'',titles:[],statRarity:'N',baseStats:{hp,attack:125,defense:125,speed:125}});
const team=(id=900000)=>Array.from({length:5},(_,i)=>unit(id+i));
function match(id:number,random=()=>.1){const left=team(),right=team(910000);left[0].id=id;return simulateBattle(left,right,random);}
it('registers all catalog passives including summons, copies, progression and death reactions',()=>{
 expect(catalog.filter(ability=>!IMPLEMENTED_ABILITIES.includes(ability.characterId)).map(a=>a.title)).toEqual([]);
 for(const id of [17,2473,7035,246,913,40,5,417,4003,38005,118735,35252,2257,109929,124731,1,1374,1375,2589,15,72921,177491,203839,5578,2511,117921,141358,9700,75216,140046,177542,2867,132742,28,193067,135879,36753])expect(IMPLEMENTED_ABILITIES).toContain(id);
});
it('Naruto clones once, without recursion, on either team and restores the original roster',()=>{
 for(const side of [0,1]){const sides=[team(),team(910000)];sides[side][0].id=17;const before=structuredClone(sides);const b=simulateBattle(sides[0],sides[1],()=>.1);expect(b.units.filter(u=>u.summonOwner!==undefined)).toHaveLength(1);expect(b.frames![0].positions!.at(-1)).toBe(5);expect(sides).toEqual(before);}
});
it('Ash and Red summon a 620 BST Pikachu using its verified MAL identity',()=>{
 for(const id of [2473,7035]){const b=match(id),pikachu=b.units.find(u=>u.id===3891)!;expect(pikachu).toBeDefined();expect(statTotal(pikachu.baseStats)).toBe(620);}
});
it('Naruto’s clone retains other passives without inheriting recursive summoning',()=>{
 const left=team(),right=team(910000);left[0].id=17;left[0].extraAbilities=[12323];const b=simulateBattle(left,right,()=>.1);expect(b.units.filter(u=>u.clone)).toHaveLength(1);const hits=b.events.filter(e=>e.attacker===10&&!e.kind);expect(hits.filter(e=>e.time===hits[0].time)).toHaveLength(2);
});
it('summons do not enter Budokai first-five duels',()=>{
 const left=team(),right=team(910000);left[0].id=17;const b=simulateBattle(left,right,()=>.1,'budokai');expect(b.frames![0].participating!.at(-1)).toBe(false);expect(b.events.some(e=>e.attacker===10&&!e.kind)).toBe(false);
});
it('Ichigo charges six seconds and deals triple normal attack damage',()=>{
 const b=match(5);const hit=b.events.find(e=>e.ability==='Getsuga Tenshou')!;expect(hit.time).toBe(6);expect(hit.damage).toBe(75);expect(b.frames![0].bossGauges!.some(g=>g.title==='Getsuga Tenshou')).toBe(true);
});
it('Luffy grants a six-second REFLECT buff and reflected hits cannot recurse',()=>{
 const b=match(40);const frame=b.frames!.find(f=>f.time===10)!;expect(frame.effects![0].find(e=>e.id==='REFLECT')?.until).toBe(16);expect(b.events.some(e=>e.ability==='REFLECT')).toBe(true);expect(b.events.length).toBeLessThan(5000);
});
it('Geass makes an enemy attack its own team for five seconds',()=>{
 const b=match(417);const proc=b.events.find(e=>e.ability==='Geass')!;expect(proc.time).toBe(8);const f=b.frames!.find(f=>f.time===8)!;expect(f.effects![proc.target].find(e=>e.id==='BERSERK')?.until).toBe(13);
 expect(b.events.some(e=>!e.kind&&e.attacker===proc.target&&e.target>=5&&e.time>8&&e.time<13)).toBe(true);
});
it('Jotaro stops time more frequently for a shorter period than Dio',()=>{
 const j=match(4003),d=match(4004);expect(j.stops![0].start).toBe(7);expect(j.stops![0].end-j.stops![0].start).toBe(1.5);expect(d.stops![0].start).toBe(10);
});
it('Goku gets +40 all stats at half HP while Vegeta records a permanent +5 at ten percent',()=>{
 for(const [id,hp,bonus] of [[246,200,40],[913,260,5]]){const left=team(),right=team(910000);left[0].id=id;left[0].baseStats.hp=hp;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.1);expect(b.events.some(e=>e.attacker===0&&e.ability===(id===246?'Super Saiyan':'Zenkai Boost'))).toBe(true);if(id===913)expect(b.updates![left[0].instanceId].permanentBoosts).toEqual({hp:bonus,attack:bonus,defense:bonus,speed:bonus});}
});
it('Oguri gains fourfold Speed after three activations',()=>{
 const left=team(),right=team(910000);left[0].id=162150;left[1].extraAbilities=[22036];const b=simulateBattle(left,right,()=>.1);expect(b.frames!.some(f=>f.speed[0]===500)).toBe(true);
});
it('Guts and Shinji survive fatal damage for six seconds, then expire',()=>{
 for(const id of [422,89]){const left=team(),right=team(910000);left[0].id=id;left[0].baseStats.hp=1;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.1);const proc=b.events.find(e=>e.attacker===0&&e.ability===(id===422?'Struggler':'Berserk Mode'))!;expect(proc).toBeDefined();expect(b.events.some(e=>e.target===0&&e.ability==='Time expired'&&Math.abs(e.time-proc.time-6)<.001)).toBe(true);}
});
it('Heero and Amuro fire percentage death attacks',()=>{
 for(const [id,title,fraction] of [[99,'Self-Destruct',.2],[1335,'Last Shooting',.4]] as const){const left=team(),right=team(910000);left[0].id=id;left[0].baseStats.hp=1;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.1);const hits=b.events.filter(e=>e.ability===title);expect(hits).toHaveLength(id===99?5:1);expect(hits.every(e=>e.damage===10000*fraction)).toBe(true);}
});
it('Simon absorbs allies, gains +50 per ally and inherits their first two passives',()=>{
 const left=team(),right=team(910000);left[0].id=2257;left[1].extraAbilities=[22036];left[2].extraAbilities=[163847];const before=structuredClone(left),b=simulateBattle(left,right,()=>.1);const start=b.frames![0];expect(start.speed[0]).toBe(325);expect(start.unitOverrides![0].extraAbilities).toEqual([22036,163847]);expect(start.hp.slice(1,5)).toEqual([0,0,0,0]);expect(left).toEqual(before);
});
it('Spike replaces only four initial allies with 620 BST Bebop crew members',()=>{
 const left=[...team(),unit(920000)],right=team(910000);left[0].id=1;const b=simulateBattle(left,right,()=>.1),f=b.frames![0];expect([1,2,3,4].map(i=>f.unitOverrides![i].id)).toEqual([2,3,4,16]);expect([1,2,3,4].every(i=>statTotal(f.unitOverrides![i].baseStats!)===620)).toBe(true);expect(f.unitOverrides?.[5]).toBeUndefined();
});
it('Shigeo counts at three points per second and gains +50 all stats at 100',()=>{
 const b=match(109929);expect(b.frames!.find(f=>f.time===1)!.counters![0].value).toBe(3);const f=b.frames!.find(f=>f.counters?.[0]?.value===100)!;expect(f.time).toBe(34);expect(f.speed[0]).toBe(175);
});
it('Asta triples damage against configured magic series; Utena also recognizes Soul Gems',()=>{
 expect(MAGIC_SERIES).toEqual(expect.arrayContaining(['black clover','magi','cardcaptor sakura','little witch academia','ao no exorcist']));
 for(const id of [124731,193067]){const left=team(),right=team(910000);left[0].id=id;right.forEach(c=>{if(id===124731)c.titles=[{id:1,name:'Black Clover',kind:'anime',status:'watching'}];else c.soulGem=true;});const b=simulateBattle(left,right,()=>.1);expect(b.events.find(e=>e.attacker===0&&!e.kind)!.damage).toBeGreaterThan(65);}
});
it('Yugi can summon Mahad and Slifer only once each with the configured BST',()=>{
 for(const [roll,id,bst] of [[.3,142840,540],[.99,-3100,650]] as const){const b=match(1374,()=>roll);const summons=b.units.filter(u=>u.id===id);expect(summons).toHaveLength(1);expect(statTotal(summons[0].baseStats)).toBe(bst);expect(b.events.some(e=>e.ability===(id===142840?'Dark Magic Curtain':'Slifer the Sky Dragon'))).toBe(true);}
});
it('Ippo dodges and gains +15 Speed; Hakari reveals one digit per second and grants +77 on jackpot',()=>{
 const left=team(),right=team(910000);left[0].id=15;left[0].keywords=['TAUNT'];let b=simulateBattle(left,right,()=>0);expect(b.events.some(e=>e.ability==='Dempsey Roll')).toBe(true);expect(b.frames!.some(f=>f.speed[0]>=140)).toBe(true);
 b=match(203839,()=>0);expect(b.frames!.find(f=>f.time===3)!.counters![0].digits).toEqual([1,1,1]);expect(b.frames!.find(f=>f.time===3)!.speed[0]).toBe(202);
});
it('Kenshiro shares the visible curse stack mechanic and triggers percentage damage',()=>{
 const b=match(2511);expect(b.frames!.some(f=>(f.curseStacks?.[5]??0)>0)).toBe(true);expect(b.events.some(e=>e.ability==='Hokuto Hyakuretsu Ken'&&e.damage===5000)).toBe(true);
});
it('Soma heals 30% on a four-second gauge and Reg fires at two targets then recharges',()=>{
 const b=match(75216);expect(b.events.some(e=>e.ability==='Gotcha Pork Roast'&&e.time===4)).toBe(true);
 const r=match(140046);const hits=r.events.filter(e=>e.attacker===0&&!e.kind);expect(hits.filter(e=>e.time===hits[0].time)).toHaveLength(2);expect(r.events.some(e=>e.ability==='Incinerator recharged')).toBe(true);
});
it('Meliodas reflects time stop once and only Meliodas can move',()=>{
 const left=team(),right=team(910000);left[0].id=72921;right[0].id=4004;const b=simulateBattle(left,right,()=>.1);expect(b.events.filter(e=>e.ability==='Full Counter')).toHaveLength(1);expect(b.stops![0].owner).toBe(0);expect(b.events.filter(e=>!e.kind&&e.time>=10&&e.time<13).every(e=>e.attacker===0)).toBe(true);
});
it('Adam copies and immediately activates a character ability, without changing the saved unit',()=>{
 const left=team(),right=team(910000);left[0].id=177542;right[0].id=5;const before=structuredClone(left),b=simulateBattle(left,right,()=>.1);expect(b.frames!.some(f=>f.unitOverrides?.[0]?.extraAbilities?.includes(5))).toBe(true);expect(b.events.some(e=>e.attacker===0&&e.ability==='Getsuga Tenshou'&&e.time===6)).toBe(true);expect(left).toEqual(before);
});
it('Isagi starts charged and interrupts an enemy ability, recharging for five seconds',()=>{
 const left=team(),right=team(910000);left[0].id=177491;right[0].id=5;const b=simulateBattle(left,right,()=>.1);expect(b.frames![0].bossGauges?.find(g=>g.owner===0)?.progress).toBe(1);expect(b.events.some(e=>e.ability==='Metavision'&&e.time===6)).toBe(true);expect(b.events.some(e=>e.attacker===5&&e.ability==='Getsuga Tenshou'&&e.time===6)).toBe(false);
});
it('Kurapika links an enemy passive holder and executes them when it activates',()=>{
 const left=team(),right=team(910000);left[0].id=28;right[0].id=5;const b=simulateBattle(left,right,()=>.1);expect(b.frames![0].links![0]).toBe(5);expect(b.events.some(e=>e.ability==='Judgment Chain'&&e.target===5&&e.hp===0)).toBe(true);
});
it('Himiko transforms once per battle and does not change the saved character',()=>{
 const left=team(),right=team(910000);left[0].id=135879;right.forEach(c=>c.extraAbilities=[22036]);const before=structuredClone(left),b=simulateBattle(left,right,()=>.1);expect(b.events.filter(e=>e.attacker===0&&e.ability==='Transform')).toHaveLength(1);expect(b.frames!.some(f=>f.unitOverrides?.[0]?.removedAbilities?.includes(135879))).toBe(true);expect(left).toEqual(before);
});
it('Kumagawa applies a six-second WEAKENED debuff after every third hit',()=>{
 const b=match(36753);const proc=b.events.find(e=>e.ability==='Book Maker')!;expect(proc).toBeDefined();const f=b.frames!.find(f=>f.time===proc.time&&f.effects?.[proc.target]?.some(e=>e.id==='WEAKENED'))!;expect(f.effects![proc.target].find(e=>e.id==='WEAKENED')?.until).toBeCloseTo(proc.time+6);expect(f.speed[proc.target]).toBe(105);
});
it('Reset is reported on a losing side and GANTZ awards points only on last-hit kills',()=>{
 const left=team(),right=team(910000);left[0].id=38005;left.forEach(c=>c.baseStats.hp=1);let b=simulateBattle(left,right,()=>.1);expect(b.resetSide).toBe(0);
 const a=team(),d=team(910000);a[0].id=2867;a[0].baseStats.attack=10000;a[0].baseStats.speed=10000;d.forEach(c=>c.baseStats.hp=1);b=simulateBattle(a,d,()=>.1);expect(b.updates?.[a[0].instanceId]?.gantzPoints).toBe(25);expect(b.updates?.[a[0].instanceId]?.permanentBoosts?.attack).toBe(30);
});
it('Kaiji starts at 75% survival, then halves his chance after a proc',()=>{
 const left=team(),right=team(910000);left[0].id=5578;left[0].baseStats.hp=1;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.5);expect(b.events.filter(e=>e.ability==='Ultimate Survivor')).toHaveLength(1);
});
it('Yusei becomes inactive and golden-invincible for four seconds when shielding a fatal hit',()=>{
 const left=team(),right=team(910000);left[1].id=9700;left[0].baseStats.hp=1;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.1);const proc=b.events.find(e=>e.ability==='Stardust Dragon')!;expect(proc).toBeDefined();const frame=b.frames!.find(f=>f.time===proc.time&&f.effects?.[1]?.some(e=>e.id==='INVINCIBLE'))!;expect(frame.effects![1].some(e=>e.id==='STUN'&&e.until===proc.time+4)).toBe(true);expect(b.events.slice(b.events.indexOf(proc)+1).filter(e=>!e.kind&&e.attacker===1&&e.time>=proc.time&&e.time<proc.time+4)).toHaveLength(0);
});
it('Tetsuo gains +15 stats per absorbed ally and heals after a fatal hit',()=>{
 const left=team(),right=team(910000);left[0].id=2589;left[0].baseStats.hp=1;left[0].keywords=['TAUNT'];const b=simulateBattle(left,right,()=>.1);expect(b.frames!.some(f=>f.speed[0]===185&&f.hp[0]>0)).toBe(true);expect(b.events.filter(e=>e.ability==='Mutation'&&e.kind==='execute')).toHaveLength(4);
});
it('Advance gains +40 all stats and expires fatally after five seconds',()=>{
 const left=team(),right=team(910000);left[0].id=132742;left[0].baseStats.hp=200;left[0].keywords=['TAUNT'];right.slice(1).forEach(c=>c.baseStats.speed=1);const b=simulateBattle(left,right,()=>.1);const proc=b.events.find(e=>e.ability==='Advance')!;expect(proc).toBeDefined();expect(b.frames!.some(f=>f.speed[0]===165)).toBe(true);expect(b.events.some(e=>e.target===0&&e.ability==='Time expired'&&Math.abs(e.time-proc.time-5)<.001)).toBe(true);
});
it('All For One gains a passive only when it lands the killing hit',()=>{
 const left=team(),right=team(910000);left[0].id=141358;left[0].baseStats.attack=10000;left[0].baseStats.speed=10000;right.forEach(c=>{c.baseStats.hp=1;c.extraAbilities=[22036];});const b=simulateBattle(left,right,()=>.1);expect(b.updates?.[left[0].instanceId]?.extraAbilities).toContain(22036);
 const other=team();other[0].id=141358;other[1].baseStats.attack=10000;other[1].baseStats.speed=10000;const c=simulateBattle(other,right,()=>.1);expect(c.updates?.[other[0].instanceId]?.extraAbilities).toBeUndefined();
});
it('Full Counter does not reflect Yugi self-buffs or boss abilities',()=>{
 const left=team(),right=team(910000);left[0].id=72921;right[0].id=1374;let b=simulateBattle(left,right,()=>0);expect(b.events.some(e=>e.ability==='Mirror Force')).toBe(true);expect(b.events.some(e=>e.ability==='Full Counter')).toBe(false);
 b=simulateBattle(left,[{...unit(7407),boss:true}],()=>.1);expect(b.events.some(e=>e.ability==='Full Counter')).toBe(false);
});
it('Metavision starts charged early enough to interrupt an opposing startup summon',()=>{
 const left=team(),right=team(910000);left[0].id=17;right[0].id=177491;const b=simulateBattle(left,right,()=>.1);expect(b.units.some(u=>u.summonOwner===0)).toBe(false);expect(b.events.some(e=>e.ability==='Metavision'&&e.time===0)).toBe(true);
});
it('Metavision can cancel Sahaquiel’s one-use deadline',()=>{
 const left=team();left[0].id=177491;const b=simulateBattle(left,[{...unit(-1001,100000000),boss:true}],()=>.1);expect(b.duration).toBeGreaterThan(20);expect(b.events.some(e=>e.ability==='10th Angel')).toBe(false);expect(b.events.some(e=>e.ability==='Metavision'&&e.time===20)).toBe(true);
});
