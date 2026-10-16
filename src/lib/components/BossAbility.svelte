<script lang="ts">
  import { bossFor, DEOXYS_FORMES } from '$lib/bosses';
  import { activeSeconds } from '$lib/battle/formulas';
  import type { BattleFrame, TimeStop } from '$lib/battle/types';
  import type { JourneyCharacter } from '$lib/types';
  let { unit, owner, frame, elapsed = 0, stops = [], finished = false }: { unit: JourneyCharacter; owner?: number; frame?: BattleFrame; elapsed?: number; stops?: TimeStop[]; finished?: boolean } = $props();
  const boss = $derived(bossFor(unit));
  const timing = $derived(frame?.bossGauges?.find(gauge => gauge.owner === owner));
  const delta = $derived(!timing || owner === undefined ? 0 : timing.absolute ? Math.max(0, elapsed - (frame?.time ?? 0)) : activeSeconds(frame?.time ?? 0, elapsed, owner, stops));
  const remaining = $derived(Math.max(0, (timing?.remaining ?? 0) - delta));
  const progress = $derived(timing ? Math.min(1, timing.progress + delta / timing.cooldown) : 0);
</script>
{#if boss}
  <div class="boss-ability">
    <button type="button" aria-describedby={'boss-ability-' + unit.instanceId}>{boss.title}</button>
    <div class="description" role="tooltip" id={'boss-ability-' + unit.instanceId}><strong>{boss.title}</strong><p>{boss.description}</p>{#if !boss.active}<p>Preview only. This boss ability is not implemented yet.</p>{/if}</div>
  </div>
  {#if boss.id === 74017}<p class="forme">{DEOXYS_FORMES[unit.bossForm ?? 'normal'].name}</p>{/if}
  {#if timing && !finished}
    <span class="timer">{timing.title} · {remaining.toFixed(1)}s</span>
    <progress class:deadline={timing.absolute} aria-label={timing.title + (timing.absolute ? ' countdown' : ' charge')} max="1" value={progress}></progress>
  {/if}
{/if}
<style>
  .boss-ability { position: relative; margin-top: 6px; }
  button { padding: 0; min-height: 0; background: none; border: 0; border-bottom: 1px dotted #ed404a; color: #f39a9f; font-size: 12px; text-align: left; }
  .description { display: none; position: absolute; top: 100%; left: 0; z-index: 10; width: min(300px, 65vw); padding: 12px; background: #151015; border: 1px solid #ed404a; font-size: 12px; max-height: 260px; overflow: auto; }
  .boss-ability:hover .description, .boss-ability:focus-within .description { display: block; }
  .description p { margin: 8px 0 0; }
  .forme { color: #e8e8e3; margin: 4px 0; font-size: 12px; }
  .timer { font: 11px var(--mono); color: #f39a9f; }
  progress { display: block; width: 100%; height: 8px; margin-top: 4px; background: #292329; border: 0; appearance: none; }
  progress::-webkit-progress-bar { background: #292329; }
  progress::-webkit-progress-value { background: #ed404a; }
  progress::-moz-progress-bar { background: #ed404a; }
</style>
