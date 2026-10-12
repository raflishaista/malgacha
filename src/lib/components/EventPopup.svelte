<script lang="ts">
  import { EVENTS, type JourneyEvent } from '$lib/events';
  import type { JourneyCharacter } from '$lib/types';
  import Card from './JourneyCharacter.svelte';
  let { event, team, busy, error, onchoice, ontarget, onclose }: { event: JourneyEvent; team: JourneyCharacter[]; busy: boolean; error: string; onchoice: (choice: 'yes' | 'no') => void; ontarget: (id: string) => void; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  $effect(() => { if (dialog && !dialog.open) dialog.showModal(); });
</script>
<dialog bind:this={dialog} aria-labelledby="event-title" oncancel={(e) => { e.preventDefault(); if (!busy && ['choice', 'complete'].includes(event.status)) onclose(); }}>
  <h2 id="event-title">{EVENTS[event.id].title}</h2>
  {#if event.status === 'choice'}<p>{EVENTS[event.id].text}</p><div class="choices"><button class="primary" disabled={busy || event.id === 'creature' && team.every(c => c.empty || c.soulGem)} onclick={() => onchoice('yes')}>Yes</button><button disabled={busy} onclick={() => onchoice('no')}>No</button></div><button disabled={busy} onclick={onclose}>Back to pathways</button>
  {:else if event.status === 'target'}<p>Choose a unit to receive a Soul Gem.</p><p>Gain 15% Attack, Defense, and Speed. When it dies, it becomes a Witch that attacks everyone.</p>
  {:else if event.status === 'reward'}<p>You freed {event.reward?.name}. Choose the team slot they will replace.</p>{#if event.reward}<div class="rescued"><Card character={event.reward} /></div>{/if}
  {:else if event.status === 'complete'}<p>The event is complete. You can continue to the next floor.</p><button class="primary" onclick={onclose}>Continue</button>{/if}
  {#if ['target', 'reward'].includes(event.status)}<div class="units">{#each team as unit}<button disabled={busy || event.status === 'target' && (unit.empty || unit.soulGem)} onclick={() => ontarget(unit.instanceId)}>{#if unit.image}<img src={unit.image} alt="" />{/if}<strong>{unit.name}</strong>{#if unit.soulGem}<span>Soul Gem</span>{/if}</button>{/each}</div>{#if event.status === 'target' && team.every(c => c.empty || c.soulGem)}<p>No eligible units remain.</p>{/if}{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</dialog>
<style>
  dialog { width: min(800px, calc(100% - 24px)); max-height: 90vh; overflow: auto; border: 2px solid var(--accent); background: #101010; color: #e8e8e3; padding: 24px; }
  h2 { font-size: clamp(22px, 4vw, 32px); color: var(--accent); }
  .choices { display: flex; gap: 12px; margin: 24px 0; }
  .units { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin: 20px 0; }
  .units button { display: flex; flex-direction: column; text-align: left; gap: 8px; padding: 10px; }
  img { width: 100%; max-width: 225px; aspect-ratio: var(--character-portrait-ratio); object-fit: contain; }
  .rescued { width: 160px; margin: 20px 0; }
</style>
