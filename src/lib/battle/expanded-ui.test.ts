import {it,expect} from 'vitest';
import {render} from 'svelte/server';
import AutoBattle from '../components/AutoBattle.svelte';
import BattleEffectTags from '../components/BattleEffectTags.svelte';
import {simulateBattle} from './engine';
import type {JourneyCharacter} from '../types';
const unit=(id:number):JourneyCharacter=>({id,instanceId:String(id),name:String(id),image:null,url:'',titles:[],statRarity:'N',baseStats:{hp:10000,attack:125,defense:125,speed:125}});
it('places the passive description after the character’s special gauge',()=>{
 const left=Array.from({length:5},(_,i)=>unit(900000+i)),right=Array.from({length:5},(_,i)=>unit(910000+i));left[0].id=5;const b=simulateBattle(left,right,()=>.1);const html=render(AutoBattle,{props:{replay:b,onfinish(){}}}).body;expect(html.indexOf('Getsuga Tenshou charge')).toBeLessThan(html.indexOf('battle-passive-900000-Getsuga%20Tenshou'));expect(html).toContain('Every 6 seconds');
});
it('renders distinct buff/debuff sides and accessible effect descriptions',()=>{
 const left=Array.from({length:5},(_,i)=>unit(900000+i)),right=Array.from({length:5},(_,i)=>unit(910000+i));left[0].id=40;const b=simulateBattle(left,right,()=>.1),frame=b.frames!.find(f=>f.time===10)!;const html=render(BattleEffectTags,{props:{frame,index:0,elapsed:10,finished:false}}).body;expect(html).toContain('data-effect-category="buff"');expect(html).toContain('data-effect-category="debuff"');expect(html).toContain('REFLECT');expect(html).toContain('Reflected damage cannot reflect again.');
});
it('renders the numeric portrait counter at battle start',()=>{
 const left=Array.from({length:5},(_,i)=>unit(900000+i)),right=Array.from({length:5},(_,i)=>unit(910000+i));left[0].id=109929;const html=render(AutoBattle,{props:{replay:simulateBattle(left,right,()=>.1),onfinish(){}}}).body;expect(html).toContain('0%');
});
