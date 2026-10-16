<script lang="ts">
  import { keywordsFor } from '$lib/battle/keywords';
  import { KEYWORD_INFO } from '$lib/battle/keywords';
  import type { JourneyCharacter } from '$lib/types';
  let { unit }: { unit: JourneyCharacter } = $props();
</script>
{#each keywordsFor(unit) as keyword}<span class="tag" class:negated={unit.negated} class:boost={keyword !== 'TAUNT'}><button type="button" aria-describedby={`keyword-${unit.instanceId}-${keyword}`}>{keyword === 'HOST OF SUKUNA' ? `Host of Sukuna × ${unit.sukunaStacks}` : keyword}</button><span role="tooltip" id={`keyword-${unit.instanceId}-${keyword}`}>{KEYWORD_INFO[keyword]}{unit.negated ? ' Currently negated.' : ''}</span></span>{/each}
<style>
  .tag { position: relative; display: inline-block; margin-left: 6px; color: #64aaff; }
  .boost { color: #ffad65; }
  .negated button { text-decoration: line-through; color: #999; }
  button { border: 0; background: transparent; color: inherit; font: bold 10px var(--mono); padding: 2px 0; min-height: 0; border-bottom: 1px dotted currentColor; }
  .tag > span { display: none; position: absolute; z-index: 12; left: 0; top: 100%; width: min(220px, 70vw); padding: 12px; background: #151015; border: 1px solid currentColor; font: normal 12px/1.5 var(--sans); }
  .tag:hover > span, .tag:focus-within > span { display: block; }
</style>
