<script lang="ts">
 import {abilityIds} from '$lib/battle/abilities/catalog';
 import {abilityFor} from '$lib/journeys';
 import {bossFor,DEOXYS_FORMES} from '$lib/bosses';
 import HostAbilities from './HostAbilities.svelte';
 import type {JourneyCharacter} from '$lib/types';
 let {unit}:{unit:JourneyCharacter}=$props();
 const abilities=$derived(unit.boss?[bossFor(unit)].filter(Boolean):abilityIds(unit).map(abilityFor).filter(Boolean));
</script>
<div class="abilities" class:negated={unit.negated}>{#each abilities as ability}{#if ability}<div class="ability"><button aria-describedby={'battle-passive-'+unit.instanceId+'-'+encodeURIComponent(ability.title)}>{ability.title === 'Parody' && unit.parodyAbility ? 'Parody ('+abilityFor(unit.parodyAbility)?.title+')' : ability.title}</button><span role="tooltip" id={'battle-passive-'+unit.instanceId+'-'+encodeURIComponent(ability.title)}>{ability.description}{unit.negated?' Currently negated.':''}</span></div>{/if}{/each}
{#if unit.sukunaStacks}<HostAbilities stacks={unit.sukunaStacks} />{/if}
{#if unit.boss&&(unit.bossId??unit.id)===74017}<span>{DEOXYS_FORMES[unit.bossForm??'normal'].name}</span>{/if}</div>
<style>.abilities{display:grid;gap:4px;margin-top:5px;border-top:1px solid #353035;padding-top:5px;}.ability{position:relative;}button{min-height:0;padding:0;border:0;border-bottom:1px dotted currentColor;background:none;color:var(--accent);font-size:11px;text-align:left;}.ability>span{display:none;position:absolute;z-index:12;bottom:100%;left:0;width:min(270px,65vw);padding:12px;background:#151218;border:1px solid var(--accent);font-size:12px;white-space:pre-line;}.ability:hover>span,.ability:focus-within>span{display:block;}.negated button{text-decoration:line-through;color:#999;}</style>
