<script lang="ts">
  import { STAGES, STAGE_RULES, type StageId } from '$lib/stages';

  let {
    stage,
    elapsed,
    finished = false,
    rolling = false
  }: {
    stage: StageId;
    elapsed?: number;
    finished?: boolean;
    rolling?: boolean;
  } = $props();
</script>

<div
  class="stage"
  aria-live={rolling || elapsed !== undefined ? 'off' : 'polite'}
  aria-busy={rolling}
>
  <h2>{STAGES[stage].name}</h2>
  <p>{rolling ? 'Choosing a stage…' : STAGES[stage].description}</p>

  {#if !rolling && elapsed !== undefined}
    {#if stage === 'dangai'}
      {@const isSweeping = elapsed >= 5 && elapsed % 5 < 0.9}
      <p class:special={isSweeping}>
        {isSweeping
          ? 'The Kōtotsu is sweeping…'
          : finished
            ? 'The sweep has ended.'
            : `In ${(5 - (elapsed % 5)).toFixed(1)}s, the Kōtotsu will come.`}
      </p>
    {:else if stage === 'colosseum'}
      {@const isAwakened = elapsed >= STAGE_RULES.swapSeconds}
      <p class:special={isAwakened}>
        {isAwakened ? 'Silver Chariot Requiem awakens!' : 'Your team feels drowsy…'}
      </p>
    {:else if stage === 'itomori'}
      {@const isImpact = elapsed >= STAGE_RULES.impactSeconds}
      <p class:special={isImpact}>
        {isImpact ? 'IMPACT' : 'A blue trail appears in the sky.'}
      </p>
      {#if !isImpact}
        <span class="countdown" aria-live="off">
          {Math.max(0, STAGE_RULES.impactSeconds - elapsed).toFixed(3)}s
        </span>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .stage {
    text-align: center;
    border-bottom: 1px solid var(--line);
    padding: 20px 8px;
    color: #f5f5f2;
  }

  h2 {
    font-size: clamp(25px, 4vw, 44px);
    text-transform: uppercase;
    margin: 0 0 10px;
    line-height: 1.1;
  }

  p {
    font-size: 13px;
    margin: 8px auto;
    max-width: 760px;
  }

  .special {
    color: var(--accent);
    font-weight: bold;
    font-size: 17px;
  }

  .countdown {
    font: 22px var(--mono);
    font-variant-numeric: tabular-nums;
  }
</style>
