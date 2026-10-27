import type {AbilityDefinition,AbilityContext} from './types';
import {EXPANDED_RULES as R,RESET_IDS} from './expanded-config';
const onceBelow=(id:number,threshold:number,action:(c:AbilityContext,o:number)=>void):AbilityDefinition=>({id,onUpdate(c,o){if(c.hp[o]>0&&c.hp[o]<=c.maxHP[o]*threshold&&!c.state(o,id).used){c.state(o,id).used=true;c.activate(o,id,[o],actor=>action(c,actor));}}});
export const thresholdAbilities:AbilityDefinition[]=[
 onceBelow(246,.5,(c,o)=>{c.addStats(o,R.gokuBonus,'Super Saiyan');c.effect(o,o,'SUPER SAIYAN',1e6,'Super Saiyan');}),
 onceBelow(913,.1,(c,o)=>{c.addStats(o,R.vegetaBonus,'Zenkai Boost',true);c.effect(o,o,'ZENKAI',1e6,'Zenkai Boost');}),
 onceBelow(132742,.5,(c,o)=>{c.addStats(o,R.ohmaBonus,'Advance');c.effect(o,o,'ADVANCE',R.ohmaDuration,'Advance');}),
 {id:162150,onAnyActivation(c,o){const s=c.state(o,162150);s.count=(s.count??0)+1;if(s.count>=R.oguriActivations&&!s.used){s.used=true;c.effect(o,o,'FESTIVE MIRACLE',1e6,'Festive Miracle');}}},
 {id:422,onFatal(c,o){const s=c.state(o,422);if(s.used)return false;s.used=true;return c.activate(o,422,[o],actor=>c.effect(actor,actor,'STRUGGLER',6,'Struggler'));}},
 {id:89,onFatal(c,o){const s=c.state(o,89);if(s.used)return false;s.used=true;return c.activate(o,89,[o],actor=>{c.addStats(actor,R.shinjiBonus,'Berserk Mode');c.effect(actor,actor,'STRUGGLER',6,'Berserk Mode');c.effect(actor,actor,'RAMPAGE',6,'Berserk Mode');});}},
 {id:2589,onFatal(c,o){if(c.state(o,2589).used)return false;c.state(o,2589).used=true;let survived=false;c.activate(o,2589,[o],actor=>{survived=c.absorb(actor,R.mutationBonus,R.mutationHeal);});return survived;}},
 {id:5578,onFatal(c,o){const s=c.state(o,5578),chance=s.chance??R.kaijiChance;if(c.random()>=chance)return false;s.chance=chance/2;return c.activate(o,5578,[o],actor=>c.emit(actor,actor,'buff','Ultimate Survivor'));}},
 ...RESET_IDS.map(id=>({id,resetsBattle:true})),
 {id:117921}, {id:2867},
 {id:10499,onStart(c,o){const top=Math.max(...c.stats.map(s=>s.attack));if(c.stats[o].attack<top)c.effectiveAttack(o,top+10);c.emit(o,o,'buff','Strongest Creature on Earth');}},
 {id:2819,speedFloor:true}
];
