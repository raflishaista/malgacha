import type {AbilityDefinition} from './types';
import {EXPANDED_RULES as R,COPY_EXCLUDED} from './expanded-config';
export const timedCharacters:AbilityDefinition[]=[
 {id:40,cooldown:R.reflectCooldown,targets:'self',onTimed(c,o){c.effect(o,o,'REFLECT',6,'Gear 5');return {nextDelay:R.reflectCooldown};}},
 {id:5,offensive:true,cooldown:R.getsugaCooldown,bossGauge:true,targets:'enemy',onTimed(){return{nextDelay:R.getsugaCooldown,attack:{kind:'boss-attack',title:'Getsuga Tenshou',multiplier:3,single:true}};}},
 {id:417,cooldown:R.geassCooldown,targets:'enemy',onTimed(c,o){const target=c.target(o);if(target!==undefined)c.effect(o,target,'BERSERK',5,'Geass');return{nextDelay:R.geassCooldown};}},
 {id:4003,cooldown:R.jotaroCooldown,targets:'all',onTimed(c,o){c.stopTime(o,R.jotaroDuration);c.emit(o,o,'world','Star Platinum: The World');return{nextDelay:R.jotaroCooldown};}},
 {id:80,offensive:true,cannotAttack:true,cooldown:R.deathNoteDelay,targets:'enemy',selectTarget(c,o){const targets=c.enemies(o);return targets.length?targets.reduce((a,b)=>Object.values(c.stats[b]).reduce((x,y)=>x+y,0)>Object.values(c.stats[a]).reduce((x,y)=>x+y,0)?b:a):undefined;},onTimed(c,o){const target=c.target(o);if(target!==undefined)c.damage(o,target,1,'Death Note',true);return{nextDelay:Infinity};}},
 {id:75216,cooldown:R.somaCooldown,bossGauge:true,targets:'allies',onTimed(c,o){const team=[o,...c.allies(o)];const target=team.reduce((a,b)=>c.hp[b]/c.maxHP[b]<c.hp[a]/c.maxHP[a]?b:a);c.heal(target,.3,'Gotcha Pork Roast');c.emit(o,target,'heal','Gotcha Pork Roast');return{nextDelay:4};}},
 {id:109929,cooldown:1,onStart(c,o){c.setCounter(o,109929,0);},onTimed(c,o){const s=c.state(o,109929);s.count=Math.min(100,(s.count??0)+R.shigeoRate);c.setCounter(o,109929,s.count);if(s.count>=100){c.addStats(o,50,'100%');return{nextDelay:Infinity};}return{nextDelay:1};}},
 {id:203839,cooldown:1,onStart(c,o){c.setCounter(o,203839,0,[0,0,0]);},onTimed(c,o){const s=c.state(o,203839);s.digits??=[0,0,0];s.phase=s.phase??0;s.digits[s.phase]=Math.floor(c.random()*R.hakariDigits)+1;c.setCounter(o,203839,s.phase,[...s.digits]);s.phase++;if(s.phase===3){s.phase=0;if(new Set(s.digits).size===1){c.heal(o,1,'Jackpot');c.addStats(o,77,'Idle Death Gamble');}else c.emit(o,o,'buff','Idle Death Gamble');}return{nextDelay:1};}},
 {id:177491,cooldown:R.isagiCharge,bossGauge:true,onStart(c,o){const s=c.state(o,177491);if(s.ready===undefined){s.ready=true;c.scheduleAbility(o,177491,Infinity);}},onTimed(c,o){c.state(o,177491).ready=true;c.emit(o,o,'buff','Metavision ready');return{nextDelay:Infinity};},onEnemyActivation(c,o){const s=c.state(o,177491);if(s.ready===false)return;s.ready=false;c.scheduleAbility(o,177491,5);c.emit(o,o,'buff','Metavision');return'interrupt';}},
 {id:140046,cooldown:R.regRecharge,bossGauge:true,attackTargets:2,onAttack(c,o){const s=c.state(o,140046);s.hits=(s.hits??0)+1;return{multiplier:2,title:'Incinerator'};},onTimed(c,o){c.state(o,140046).hits=0;c.emit(o,o,'buff','Incinerator recharged');return{nextDelay:Infinity};},onStart(c,o){c.scheduleAbility(o,140046,Infinity);}},
 {id:1374,cooldown:4,activationTargets(c,o){return planCard(c,o,1374);},onTimed(c,o){playCard(c,o,1374);return{nextDelay:4};}},
 {id:1375,cooldown:4,activationTargets(c,o){return planCard(c,o,1375);},onTimed(c,o){playCard(c,o,1375);return{nextDelay:4};}}
];
function planCard(c:import('./types').AbilityContext,o:number,id:number){
 const cards=['Mirror Force','Swords of Revealing Light','Dark Magic Curtain','Kuriboh','Catapult Turtle','Monster Reborn','Slifer the Sky Dragon'];
 const available=cards.filter((_,i)=>i!==2||!c.state(o,142840).used).filter(name=>name!=='Slifer the Sky Dragon'||!c.state(o,-3100).used);
 const card=available[Math.floor(c.random()*available.length)];c.state(o,id).card=card;
 if(card==='Swords of Revealing Light')return c.enemies(o);
 if(card==='Catapult Turtle'){const enemies=c.enemies(o);return enemies.length?[enemies[Math.floor(c.random()*enemies.length)]]:[];}
 return[o];
}
function playCard(c:import('./types').AbilityContext,o:number,id:number){
 const card=c.state(o,id).card;if(!card)return;c.state(o,id).card=undefined;c.emit(o,o,'buff',card);
 if(card==='Mirror Force')c.effect(o,o,'REFLECT',3,card);
 if(card==='Swords of Revealing Light')for(const target of c.enemies(o))c.effect(o,target,'STUN',3,card);
 if(card==='Dark Magic Curtain'){c.state(o,142840).used=true;c.summon(o,'mahad');}
 if(card==='Slifer the Sky Dragon'){c.state(o,-3100).used=true;c.summon(o,'slifer');}
 if(card==='Kuriboh')c.effect(o,o,'KURIBOH',1e6,card);
 if(card==='Monster Reborn'){const dead=c.allies(o,true);if(dead.length)c.revive(o,dead[Math.floor(c.random()*dead.length)],1,card);}
 if(card==='Catapult Turtle'){const allies=c.allies(o),target=c.target(o);if(allies.length&&target!==undefined){const sacrifice=allies[Math.floor(c.random()*allies.length)];c.damage(o,sacrifice,1,card,true);c.damage(o,target,.8,card,true);}}
}
