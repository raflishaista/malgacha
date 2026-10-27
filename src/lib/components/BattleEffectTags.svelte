<script lang="ts">
 import {EFFECTS} from '$lib/battle/effects';
 import {STATUS_RULES} from '$lib/battle/statuses';
 import type {BattleFrame} from '$lib/battle/types';
 let {frame,index,elapsed,finished}:{frame?:BattleFrame;index:number;elapsed:number;finished:boolean}=$props();
 const tags=$derived([
  ...(frame?.effects?.[index]??[]).filter(e=>e.until>elapsed).map(e=>({label:e.id,...EFFECTS[e.id]})),
  ...((frame?.burnUntil[index]??0)>elapsed?[{label:'BURN',buff:false,color:'#db663c',description:STATUS_RULES.burn.description}]:[]),
  ...((frame?.chillUntil?.[index]??0)>elapsed?[{label:'CHILL',buff:false,color:'#70b6dc',description:STATUS_RULES.chill.description}]:[]),
  ...((frame?.negatedUntil?.[index]??0)>elapsed?[{label:'NEGATED',buff:false,color:'#999',description:STATUS_RULES.negated.description}]:[]),
  ...((frame?.curseStacks?.[index]??0)>0?[{label:'CURSE × '+frame?.curseStacks?.[index],buff:false,color:'#972940',description:STATUS_RULES.curse.description}]:[])
 ]);
</script>
{#if !finished}{#each [true,false] as buff}<div class="tags" data-effect-category={buff?'buff':'debuff'} class:buffs={buff} class:debuffs={!buff}>{#each tags.filter(t=>t.buff===buff) as tag}<span class="tag" style:--effect-color={tag.color}><button aria-describedby={'effect-'+index+'-'+encodeURIComponent(tag.label)}>{tag.label}</button><span role="tooltip" id={'effect-'+index+'-'+encodeURIComponent(tag.label)}>{tag.description}</span></span>{/each}</div>{/each}{/if}
<style>
 .tags {position:absolute;top:0;z-index:8;display:grid;gap:4px;max-width:120px;}
 .buffs {left:-5px;transform:translateX(-15%);} .debuffs {right:-5px;transform:translateX(15%);}
 .tag {position:relative;}button{display:block;min-height:0;padding:3px;border:1px solid var(--effect-color);color:var(--effect-color);font:bold 9px var(--mono);background:#151218;white-space:nowrap;}
 .buffs button{background:#fff;color:#151218;border-width:2px;}
 .debuffs button{color:#fff;}
 button::before{content:'';display:inline-block;width:4px;height:8px;margin-right:4px;background:var(--effect-color);}
 .tag>span{display:none;position:absolute;z-index:20;top:100%;width:min(230px,65vw);background:#151218;color:#e8e8e3;border:1px solid var(--effect-color);padding:10px;font:12px/1.5 Arial,sans-serif;}
 .debuffs .tag>span{right:0;} .tag:hover>span,.tag:focus-within>span{display:block;}
</style>
