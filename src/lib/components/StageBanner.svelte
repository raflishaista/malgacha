<script lang="ts">
  import { STAGES, STAGE_RULES, type StageId } from '$lib/stages';
  import type { BattleReplay } from '$lib/battle/types';

  let {
    stage,
    elapsed,
    finished = false,
    rolling = false,
    hellAppeared = false,
    replay
  }: {
    stage: StageId;
    elapsed?: number;
    finished?: boolean;
    rolling?: boolean;
    hellAppeared?: boolean;
    replay?: BattleReplay;
  } = $props();

  const moriohMessage = $derived.by(() => {
    const event = replay?.events.find(e => e.ability?.includes('disappear in a quiet explosion…'));
    return event?.ability ?? 'A murderer strikes in a quiet explosion…';
  });

  const tootsukiEating = $derived.by(() => {
    if (!replay || elapsed === undefined) return null;
    const event = replay.events
      .filter(e => e.ability?.includes('A Shokugeki happens!') && e.time <= elapsed)
      .at(-1);
    if (!event) return null;
    return (elapsed - event.time < 3.0) ? event.ability : null;
  });

  const darknessAttacks = $derived.by(() => {
    if (!replay || elapsed === undefined) return [];
    const events = replay.events.filter(
      e => e.ability?.includes('The Darkness Devil cuts off') && e.time <= elapsed
    );
    if (!events.length) return [];
    const latestTime = events.at(-1)!.time;
    if (elapsed - latestTime > 3.8) return [];
    const latestEvents = events.filter(e => e.time === latestTime);
    return [...new Set(latestEvents.map(e => e.ability!))];
  });

  const tracenMessage = $derived.by(() => {
    if (!replay || elapsed === undefined) return null;
    const event = replay.events
      .filter(e => e.ability && (
        e.ability.includes('Gold Ship') ||
        e.ability.includes('Shinko Windy') ||
        e.ability.includes('Agnes Tachyon') ||
        e.ability.includes('Oguri Cap')
      ) && e.time <= elapsed)
      .at(-1);
    if (!event) return null;
    return (elapsed - event.time < 3.5) ? event.ability : null;
  });
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
    {:else if stage === 'hell'}
      <p class:special={hellAppeared}>
        {hellAppeared ? 'The surroundings get dark! Astronauts herald the Darkness Devil!' : 'You see doors all over the sky.'}
      </p>
      {#each darknessAttacks as msg}
        <p class="special">{msg}</p>
      {/each}
    {:else if stage === 'infinite_castle'}
      {@const biwaCycle = (elapsed % (STAGE_RULES.biwaSeconds ?? 8))}
      {@const biwaStrum = elapsed > 0 && biwaCycle < 1.0}
      <p class:special={biwaStrum}>
        {finished ? 'The rooms have settled into silence.' : (biwaStrum ? 'A biwa makes a noise! The rooms change.' : 'The biwa rings faintly across infinite dimensions…')}
      </p>
    {:else if stage === 'inaba'}
      <p>A thick fog obscures the truth of your opponent’s identity…</p>
    {:else if stage === 'alcatraz'}
      <p class="special">The teams are lifted to the top! It’s a Battle Royale duel!</p>
    {:else if stage === 'axis'}
      <p class="special">You and your opponent are reinforced by armies! Additional units join the battle.</p>
    {:else if stage === 'morioh'}
      <p class="special">{moriohMessage}</p>
    {:else if stage === 'tootsuki'}
      <p class="special">
        {finished
          ? 'The Shokugeki has ended.'
          : (tootsukiEating ?? 'The Shokugeki is ongoing...')}
      </p>
    {:else if stage === 'tracen'}
      <p class="special">
        {tracenMessage ?? (finished ? 'The umas go back to their dorm' : 'Umas join the battle!')}
      </p>
    {:else if stage === 'shuchiin'}
      <p>{finished ? 'The student council meeting has adjourned.' : 'The student council observes the battle from the council room.'}</p>
    {:else if stage === 'dusseldorf'}
      <p>{finished ? 'The investigation in Düsseldorf continues...' : 'The quiet streets of Düsseldorf remain undisturbed.'}</p>
    {:else if stage === 'ishigami'}
      <p>{finished ? 'Science triumphs once again in Ishigami Village.' : 'The villagers of Ishigami watch with keen curiosity.'}</p>
    {:else if stage === 'starry'}
      <p>{finished ? 'The live performance at STARRY comes to a close.' : 'The live stage at STARRY is ready for a performance.'}</p>
    {:else if stage === 'the765'}
      <p>{finished ? '765 Production’s idol training concludes for the day.' : '765 Production’s office is buzzing with idol activity.'}</p>
    {:else if stage === 'anteiku'}
      <p>{finished ? 'Envelopes are served.' : 'A peaceful cup of coffee is brewing at Anteiku.'}</p>
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
