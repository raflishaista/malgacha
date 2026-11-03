<script lang="ts">
  import { EVENTS, type JourneyEvent } from '$lib/events';
  import type { JourneyCharacter } from '$lib/types';
  import Card from './JourneyCharacter.svelte';

  let {
    event,
    team,
    busy,
    error,
    onchoice,
    ontarget,
    onclose
  }: {
    event: JourneyEvent;
    team: JourneyCharacter[];
    busy: boolean;
    error: string;
    onchoice: (choice: 'yes' | 'no') => void;
    ontarget: (id: string) => void;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  });

  function handleCancel(e: Event) {
    e.preventDefault();
    if (!busy && ['choice', 'complete'].includes(event.status)) {
      onclose();
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="event-title" oncancel={handleCancel}>
  <h2 id="event-title">{EVENTS[event.id].title}</h2>

  {#if event.status === 'choice'}
    <p>{EVENTS[event.id].text}</p>
    <div class="choices">
      <button
        class="primary"
        disabled={busy || (event.id === 'creature' && team.every(c => c.empty || c.soulGem))}
        onclick={() => onchoice('yes')}
      >
        Yes
      </button>
      <button disabled={busy} onclick={() => onchoice('no')}>
        No
      </button>
    </div>
    <button class="secondary" disabled={busy} onclick={onclose}>
      Back to pathways
    </button>
  {:else if event.status === 'target'}
    <p>Choose a unit to receive a Soul Gem.</p>
    <p class="description">
      Gain 15% Attack, Defense, and Speed. When it dies, it becomes a Witch that attacks everyone.
    </p>
  {:else if event.status === 'reward'}
    <p>You freed {event.reward?.name}. Choose the team slot they will replace.</p>
    {#if event.reward}
      <div class="rescued">
        <Card character={event.reward} />
      </div>
    {/if}
  {:else if event.status === 'complete'}
    <p>Event complete.</p>
    <button class="primary" onclick={onclose}>
      Continue
    </button>
  {/if}

  {#if ['target', 'reward'].includes(event.status)}
    <div class="units">
      {#each team as unit (unit.instanceId)}
        <button
          disabled={busy || (event.status === 'target' && (unit.empty || unit.soulGem))}
          onclick={() => ontarget(unit.instanceId)}
        >
          {#if unit.image}
            <img src={unit.image} alt={unit.name} />
          {/if}
          <strong>{unit.name}</strong>
          {#if unit.soulGem}
            <span class="soul-gem-badge">Soul Gem</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if event.status === 'target' && team.every(c => c.empty || c.soulGem)}
      <p class="empty-note">No eligible units remain.</p>
    {/if}
  {/if}

  {#if error}
    <p role="alert" class="event-error">{error}</p>
  {/if}
</dialog>

<style>
  dialog {
    width: min(800px, calc(100% - 24px));
    max-height: 90vh;
    overflow: auto;
    border: 2px solid var(--accent);
    background: #101010;
    color: #e8e8e3;
    padding: 24px;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  h2 {
    font-size: clamp(22px, 4vw, 32px);
    color: var(--accent);
    margin: 0 0 16px;
  }

  p {
    margin: 0 0 12px;
    line-height: 1.5;
  }

  .description {
    color: var(--muted);
  }

  .choices {
    display: flex;
    gap: 12px;
    margin: 24px 0 16px;
  }

  .units {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 12px;
    margin: 20px 0;
  }

  .units button {
    display: flex;
    flex-direction: column;
    text-align: left;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--line);
    background: #151515;
  }

  .units button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  img {
    width: 100%;
    max-width: 225px;
    aspect-ratio: var(--character-portrait-ratio);
    object-fit: contain;
    background: #0d0d0d;
  }

  .soul-gem-badge {
    color: #a69cce;
    font: bold 10px var(--mono);
  }

  .rescued {
    width: 160px;
    margin: 20px 0;
  }

  .event-error {
    color: #ff96c8;
    margin-top: 12px;
  }

  .empty-note {
    color: var(--muted);
  }
</style>
