import { expect, it } from 'vitest';
import { ITEMS, ITEM_RARITY_WEIGHTS, rollItem, rewardChoices, CATCH_RATES, canUseOn, type ItemId } from './items';
import { newUnit, applyInventoryAction, victoryRerollPool, emptySlot } from './server/inventory';
import { fuseUnits } from './server/item-effects';
import { abilityIds } from './battle/abilities';
import { keywordsFor } from './battle/keywords';
import { statTotal } from './stats';
import type { Job, JourneyCharacter } from './types';
function seeded(initial = 17) { let seed = initial; return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32); }
const unit = (id = 9000, favorites = 300) => newUnit({id, favorites, name: 'Unit '+id, image: '/'+id+'.webp', url: '', titles: []}, seeded(id));
function job(): Job { const team = [unit(), unit(9001,2000)]; return {id:'x',username:'demo',demo:true,scope:'journeys',state:'complete',includePlanned:true,createdAt:'',updatedAt:'',titles:[],listed:true,done:[],failures:{},message:'',pool:{},starterTeam:team,inventory:[]}; }
function grant(j: Job, id: ItemId) {const instanceId = `item-${j.inventory!.length}-${id}`; j.inventory!.push({itemId:id,instanceId}); return instanceId;}
it('catalog covers all 27 items, with rarity weights and even within-rarity draws', () => {
  expect(Object.keys(ITEMS)).toHaveLength(27);
  const random=seeded(), totals={R:0,SR:0,SSR:0,UR:0}, counts: Record<string,number>={};
  for(let i=0;i<100000;i++){const id=rollItem([],random);totals[ITEMS[id].rarity]++;counts[id]=(counts[id]??0)+1;}
  for(const tier of ['R','SR','SSR','UR'] as const){expect(totals[tier]/1000).toBeCloseTo(ITEM_RARITY_WEIGHTS[tier],0); const pool=Object.keys(ITEMS).filter(id=>ITEMS[id as ItemId].rarity===tier);for(const id of pool)expect(Math.abs(counts[id]-totals[tier]/pool.length)/(totals[tier]/pool.length)).toBeLessThan(.17);}
});
it('Radar makes Dragon Balls 40% of SSR results and owned unique relics never return', () => {
  const inventory = ['radar','merry','sunny','stone','machine'].map((id,i)=>({itemId:id as ItemId,instanceId:String(i)}));
  const random=seeded();let balls=0;
  for(let i=0;i<20000;i++) {const id=rollItem(inventory,random,'SSR');expect(id).not.toBe('merry');if(id==='dragonball')balls++;}
  expect(balls/20000).toBeCloseTo(.4,2);
  expect(rewardChoices(inventory,()=>.999)).not.toContain('sunny');
});
it('every ball uses the configured catch rates and failure consumes only the ball', () => {
  for(const ball of Object.keys(CATCH_RATES) as (keyof typeof CATCH_RATES)[])for(const tier of ['N','R','SR','SSR','UR'] as const){
    const j=job(), foe={...unit(9900),statRarity:tier};j.encounter={teams:[[foe]],selected:0,result:{left:1,right:0,winner:'left'}};
    const before=structuredClone(j.starterTeam);const rate=CATCH_RATES[ball][tier];
    applyInventoryAction(j,{action:'catch',item:grant(j,ball),target:foe.instanceId},()=>Math.max(0,rate-.0001));
    expect(j.pendingCatch).toBeDefined();expect(j.starterTeam).toEqual(before);expect(j.inventory).toHaveLength(0);
    if(rate<1){delete j.pendingCatch;applyInventoryAction(j,{action:'catch',item:grant(j,ball),target:foe.instanceId},()=>rate);expect(j.pendingCatch).toBeUndefined();expect(j.inventory).toHaveLength(0);}
  }
});
it('bosses cannot be caught and catches survive saving until placed into an empty slot', () => {
  let j=job();const foe={...unit(9900),boss:true};j.encounter={teams:[[foe]],selected:0,result:{left:1,right:0,winner:'left'}};
  const ball=grant(j,'masterball');expect(()=>applyInventoryAction(j,{action:'catch',item:ball,target:foe.instanceId})).toThrow('non-boss');expect(j.inventory).toHaveLength(1);
  foe.boss=false;applyInventoryAction(j,{action:'catch',item:ball,target:foe.instanceId},seeded());j=JSON.parse(JSON.stringify(j));
  const caught=structuredClone(j.pendingCatch!);const slot=emptySlot();j.starterTeam![0]=slot;
  applyInventoryAction(j,{action:'replace-catch',target:slot.instanceId});expect(j.starterTeam![0]).toEqual(caught);expect(j.pendingCatch).toBeUndefined();
});
it('reroll coins and Philosopher’s Stone restrict candidates without changing the import pool', () => {
  const j=job();j.pool=Object.fromEntries([unit(1,50),unit(2,51),unit(3,4000),unit(4,20000)].map(c=>[c.id,c]));
  grant(j,'coin');expect(victoryRerollPool(j,j.starterTeam![0] as JourneyCharacter).map(c=>c.id)).toEqual([2,3,4]);
  grant(j,'stone');expect(victoryRerollPool(j,j.starterTeam![1] as JourneyCharacter).map(c=>c.id)).toEqual([3,4]);expect(Object.keys(j.pool)).toHaveLength(4);
});
it('Drug removes innate abilities permanently and keywords do not stack', () => {
  const j=job();const target=unit(163847);target.extraAbilities=[22036];j.starterTeam![0]=target;
  applyInventoryAction(j,{action:'use',item:grant(j,'drug'),target:target.instanceId,ability:163847});
  expect(abilityIds(JSON.parse(JSON.stringify(target)))).toEqual([22036]);
  applyInventoryAction(j,{action:'use',item:grant(j,'journal'),target:target.instanceId});expect(keywordsFor(target)).toContain('TAUNT');expect(canUseOn('journal',target)).toBe(false);
  applyInventoryAction(j,{action:'use',item:grant(j,'mask'),target:target.instanceId});expect(keywordsFor(target)).toContain('LIFESTEAL');expect(canUseOn('mask',target)).toBe(false);
});
it('Rokkakaka trades a non-N unit for exactly one item of its rarity', () => {
  const j=job(),target=j.starterTeam![1] as JourneyCharacter;const fruit=grant(j,'rokkakaka');
  applyInventoryAction(j,{action:'use',item:fruit,target:target.instanceId},seeded());expect((j.starterTeam![1] as JourneyCharacter).empty).toBe(true);expect(j.inventory).toHaveLength(1);expect(ITEMS[j.inventory![0].itemId].rarity).toBe('SR');expect(canUseOn('rokkakaka',unit(99,0))).toBe(false);
});
it('a ship obtained through Rokkakaka activates its extra-slot effect immediately', () => {
  const j=job(), target=j.starterTeam![0] as JourneyCharacter;target.statRarity='SSR';
  j.pool={'99':unit(99)};
  // The seventh of eight SSR items is Going Merry.
  applyInventoryAction(j,{action:'use',item:grant(j,'rokkakaka'),target:target.instanceId},()=>.8);
  expect(j.inventory![0].itemId).toBe('merry');expect(j.starterTeam).toHaveLength(3);expect((j.starterTeam![0] as JourneyCharacter).empty).toBe(true);expect(j.starterTeam![2].id).toBe(99);
});
it('Potara fuses two units, consumes earrings, leaves an empty slot and persists the new instance', () => {
  const j=job(),team=j.starterTeam as JourneyCharacter[];team[0].extraAbilities=[22036];team[1].extraAbilities=[163847];team[0].keywords=['TAUNT'];team[1].keywords=['LIFESTEAL'];
  const before=structuredClone(team);
  for(const target of before)applyInventoryAction(j,{action:'equip',item:grant(j,'potara'),target:target.instanceId});
  expect(team[0].name).toBe('FUSED UNIT');expect(team[1].empty).toBe(true);expect(team[0].statRarity).toBe('SR');expect(team[0].fusionImages).toEqual(before.map(c=>c.image));expect(team[0].baseStats.hp).toBe((before[0].baseStats.hp+before[1].baseStats.hp)*.75);expect(abilityIds(team[0])).toEqual([22036,163847]);expect(keywordsFor(team[0])).toEqual(expect.arrayContaining(['TAUNT','LIFESTEAL']));expect(j.fusionNotice).toBe(true);
  const fused=JSON.parse(JSON.stringify(team[0]));const again=fuseUnits(fused,unit(3));expect(again.fusionImages![0]).toBe(before[0].image);expect(statTotal(fused.baseStats)).toBe((520+545)*.75);
});
it('a wish consumes seven balls once and gives a fresh instance of the selected character', () => {
  const j=job();for(let i=0;i<8;i++)grant(j,'dragonball');j.wishCandidates=[unit(42,20000)];
  const action={action:'wish' as const,character:42,target:j.starterTeam![0] instanceof Object ? (j.starterTeam![0] as JourneyCharacter).instanceId : ''};
  applyInventoryAction(j,action,seeded());expect(j.inventory).toHaveLength(1);expect(j.starterTeam![0].id).toBe(42);expect((j.starterTeam![0] as JourneyCharacter).statRarity).toBe('UR');expect(()=>applyInventoryAction(j,action)).toThrow('seven');
});
