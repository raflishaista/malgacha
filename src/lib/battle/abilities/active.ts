import type {AbilityDefinition} from './types';
import {abilityIds} from './catalog';
import {abilityFor} from '../../journeys';
import {EXPANDED_RULES as R,MAGIC_SERIES,MAGICAL_GIRL_SERIES,COPY_EXCLUDED} from './expanded-config';
const matches=(titles:readonly {name:string}[],names:readonly string[])=>titles.some(t=>names.some(name=>t.name.toLowerCase().includes(name)));
function lind(c:import('./types').AbilityContext,o:number,t:number){if(c.state(o,71).used)return false;c.state(o,71).used=true;return c.activate(o,71,[o,t],actor=>c.effect(actor,t,'INVINCIBLE',3,'Lind L. Taylor'));}
export const activeCharacters:AbilityDefinition[]=[
 {id:17,onStart(c,o){c.summon(o,'clone');}},
 {id:2473,onStart(c,o){c.summon(o,'pikachu');}},
 {id:7035,onStart(c,o){c.summon(o,'pikachu');}},
 {id:1,startPriority:10,onStart(c,o){c.replaceCrew(o);}},
 {id:2257,startPriority:20,onStart(c,o){c.absorb(o,50,0,true);}},
 {id:136805,targets:'enemy',onStart(c,o){const target=c.target(o);if(target!==undefined)c.swap(o,target);}},
 {id:137467,targets:'enemy',onStart(c,o){const target=c.target(o);if(target!==undefined)c.swap(o,target);}},
 {id:28,targets:'enemy',selectTarget(c,o){return c.enemies(o).find(i=>abilityIds(c.units[i]).length>0);},onStart(c,o){const target=c.target(o);if(target!==undefined&&abilityIds(c.units[target]).length)c.seal(o,target);}},
 {id:12323,attackHits:2},
 {id:124731,targetMultiplier(c,_o,t){return matches(c.units[t].titles,MAGIC_SERIES)?3:1;}},
 {id:193067,targetMultiplier(c,_o,t){return c.units[t].witch||c.units[t].soulGem||matches(c.units[t].titles,MAGICAL_GIRL_SERIES)?3:1;}},
 {id:15,dodgeChance:.2,onDodge(c,o){c.addStat(o,'speed',15,'Dempsey Roll');}},
 {id:18769,untargetable:true},
 {id:36753,onHit(c,o,t){const s=c.state(o,36753);s.hits=(s.hits??0)+1;if(s.hits%3===0)c.activate(o,36753,[t],actor=>c.effect(actor,actor===o?t:o,'WEAKENED',6,'Book Maker'));}},
 {id:2511,onHit(c,o,t){c.curse(o,t,'Hokuto Hyakuretsu Ken');}},
 {id:135879,onHit(c,o,t){c.transform(o,t);}},
 {id:65523},
 {id:99,targets:'enemies',onDeath(c,o){for(const target of c.enemies(o))c.damage(o,target,.2,'Self-Destruct',true);return false;}},
 {id:1335,targets:'enemy',onDeath(c,o){const target=c.target(o);if(target!==undefined)c.damage(o,target,.4,'Last Shooting',true);return false;}},
 {id:71,onFatal(c,o){return lind(c,o,o);},onAllyFatal:lind},
 {id:9700,cooldown:4,onStart(c,o){c.scheduleAbility(o,9700,Infinity);},onTimed(c,o){c.state(o,9700).used=false;return{nextDelay:Infinity};},onAllyFatal(c,o,t){if(c.state(o,9700).used)return false;c.state(o,9700).used=true;c.protect(o,t,4,'Stardust Dragon');c.scheduleAbility(o,9700,4);return true;}},
 {id:72921,onEnemyActivation(c,o,_source,id,targets){if(!abilityFor(id)||COPY_EXCLUDED.has(id)||c.state(o,72921).used||!targets.includes(o))return;c.state(o,72921).used=true;c.emit(o,o,'buff','Full Counter');return'reflect';}},
 {id:177542,onEnemyActivation(c,o,_source,id){if(abilityFor(id)&&!COPY_EXCLUDED.has(id))c.grant(o,id);}},
 {id:141358,onKill(c,o,t){for(const id of abilityIds(c.units[t]))c.grant(o,id,true);}},
 {id:672,onStart(c,o){/* Filled from the safe registry by the scheduler. */}}
];
