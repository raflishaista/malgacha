export const EFFECTS = {
  REFLECT: {buff:true,color:'#72c5ef',description:'Incoming attack damage is reflected to its source. Reflected damage cannot reflect again.'},
  INVINCIBLE: {buff:true,color:'#c49d32',description:'Cannot take damage while this buff lasts.'},
  STRUGGLER: {buff:true,color:'#bf773c',description:'Continues fighting after fatal damage. Dies when this buff expires.'},
  'SUPER SAIYAN': {buff:true,color:'#d6b343',description:'+40 to every stat for this battle.'},
  ZENKAI: {buff:true,color:'#aa8adb',description:'Gained +5 permanent stats this battle.'},
  'FESTIVE MIRACLE': {buff:true,color:'#ce88b2',description:'Speed is multiplied by four.'},
  ADVANCE: {buff:true,color:'#dc555e',description:'+40 to every stat. Dies after five seconds.'},
  RAMPAGE: {buff:true,color:'#b1345e',description:'Berserk Mode has a 50% chance to direct each attack at an ally.'},
  BERSERK: {buff:false,color:'#8e2639',description:'Attacks allies instead of enemies.'},
  STUN: {buff:false,color:'#9374b8',description:'Cannot build ATB or attack.'},
  WEAKENED: {buff:false,color:'#355c97',description:'Every stat is reduced by 20.'},
  KURIBOH: {buff:true,color:'#a79773',description:'Blocks the next attack that would deal damage.'}
} as const;
export type EffectId = keyof typeof EFFECTS;
export type TimedEffect = {id:EffectId; until:number; source:number};
export class BattleEffects {
  readonly entries: Map<EffectId,TimedEffect>[];
  constructor(count:number){this.entries=Array.from({length:count},()=>new Map());}
  addUnit(){this.entries.push(new Map());}
  apply(target:number,id:EffectId,time:number,duration:number,source:number){this.entries[target].set(id,{id,until:time+duration,source});}
  has(target:number,id:EffectId,time:number){return (this.entries[target]?.get(id)?.until??0)>time;}
  next(time:number){return Math.min(Infinity,...this.entries.flatMap(map=>[...map.values()].map(e=>e.until).filter(t=>t>time)));}
  expire(time:number){const lethal:number[]=[];this.entries.forEach((map,i)=>{for(const [id,e] of map)if(e.until<=time){map.delete(id);if(id==='STRUGGLER'||id==='ADVANCE')lethal.push(i);}});return lethal;}
  frame(time:number){return this.entries.map(map=>[...map.values()].filter(e=>e.until>time));}
}
