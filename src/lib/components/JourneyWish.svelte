<script lang="ts">
  import type { JourneyCharacter, PoolCharacter } from '$lib/types';
  import type { InventoryAction } from '$lib/server/inventory';
  import Portrait from './JourneyPortrait.svelte';

  let {
    jobId,
    team,
    disabled,
    onaction,
    oncancel
  }: {
    jobId: string;
    team: JourneyCharacter[];
    disabled: boolean;
    onaction: (action: InventoryAction) => Promise<boolean>;
    oncancel: () => void;
  } = $props();

  let open = $state(false);
  let query = $state('');
  let busy = $state(false);
  let error = $state('');
  let results = $state<PoolCharacter[]>([]);
  let chosen = $state<PoolCharacter | null>(null);
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    }
  });

  async function search() {
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/wish?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Search failed.');
      }
      results = data.characters;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Search failed.';
    } finally {
      busy = false;
    }
  }

  async function select(character: PoolCharacter) {
    const empty = team.find((unit) => unit.empty);
    if (empty) {
      const success = await onaction({
        action: 'wish',
        character: character.id,
        target: empty.instanceId
      });
      if (success) open = false;
    } else {
      chosen = character;
    }
  }

  async function confirmWishSlot(targetId: string) {
    if (!chosen) return;
    const success = await onaction({
      action: 'wish',
      character: chosen.id,
      target: targetId
    });
    if (success) open = false;
  }
</script>

<section class="wish">
  <h2>STATE YOUR WISH</h2>
  <img
    class="shenlong"
    src="https://cdn.myanimelist.net/images/characters/7/65049.webp"
    alt="Shen Long"
  />
  <p>Consumes 7 Dragon Balls to recruit any ally into your team.</p>

  <div class="diamond">
    <button
      class="ally primary"
      disabled={disabled}
      onclick={() => {
        open = true;
        chosen = null;
      }}
    >
      Give me an ally of my choosing!
    </button>
    <button class="left" disabled>WIP</button>
    <button class="right" disabled>WIP</button>
    <button class="bottom" disabled>WIP</button>
    <button class="cancel" onclick={oncancel}>Cancel</button>
  </div>
</section>

{#if open}
  <dialog
    bind:this={dialog}
    oncancel={() => (open = false)}
    aria-labelledby="wish-heading"
  >
    <h2 id="wish-heading">
      {chosen ? 'Choose a team slot to replace' : 'Choose an ally'}
    </h2>

    {#if chosen}
      <p class="chosen-name">{chosen.name}</p>
      <button class="secondary" disabled={disabled} onclick={() => (chosen = null)}>
        Change character
      </button>

      <div class="units">
        {#each team as unit (unit.instanceId)}
          <button disabled={disabled} onclick={() => confirmWishSlot(unit.instanceId)}>
            <span class="portrait">
              <Portrait {unit} />
            </span>
            <span>{unit.name}</span>
          </button>
        {/each}
      </div>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          Character name
          <input bind:value={query} minlength="2" maxlength="80" required />
        </label>
        <button disabled={busy || disabled}>Search</button>
      </form>

      {#if busy}
        <p role="status" class="muted">Searching…</p>
      {/if}

      <div class="results">
        {#each results as character (character.id)}
          <button disabled={disabled} onclick={() => select(character)}>
            {#if character.image}
              <img src={character.image} alt={character.name} />
            {/if}
            <span>
              <strong>{character.name}</strong>
              <small>{character.favorites?.toLocaleString() ?? 'Unknown'} favorites</small>
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if error}
      <p role="alert" class="error">{error}</p>
    {/if}

    <button class="close-button" onclick={() => (open = false)}>Close</button>
  </dialog>
{/if}

<style>
  .wish {
    text-align: center;
    padding: 24px 0;
  }

  h2 {
    font-family: var(--display-font);
    font-weight: 400;
    font-size: clamp(28px, 5vw, 54px);
    margin: 0 0 16px;
  }

  .shenlong {
    height: 230px;
    max-width: 100%;
    object-fit: contain;
  }

  p {
    color: var(--muted);
    margin: 12px 0;
  }

  .diamond {
    display: grid;
    grid-template-columns: 1fr 1.5fr 1fr;
    grid-template-rows: repeat(3, auto);
    gap: 14px;
    max-width: 700px;
    margin: 24px auto;
  }

  .ally {
    grid-area: 1 / 2;
  }

  .left {
    grid-area: 2 / 1;
  }

  .right {
    grid-area: 2 / 3;
  }

  .bottom {
    grid-area: 3 / 2;
  }

  .cancel {
    grid-area: 3 / 3;
  }

  dialog {
    background: #101010;
    color: #e8e8e3;
    border: 1px solid var(--accent);
    width: min(800px, calc(100% - 24px));
    max-height: 90vh;
    padding: 24px;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  dialog h2 {
    font-size: 28px;
    margin-bottom: 16px;
  }

  form {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .units,
  .results {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 20px 0;
  }

  .units > button {
    width: 110px;
    padding: 8px;
    display: grid;
    gap: 6px;
    text-align: left;
  }

  .portrait {
    display: block;
    position: relative;
    width: 100%;
    aspect-ratio: var(--character-portrait-ratio);
    background: #151515;
  }

  .results > button {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    width: 240px;
    padding: 8px;
  }

  .results img {
    width: 50px;
    height: 78px;
    object-fit: contain;
    background: #151515;
  }

  .results span {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .results small {
    color: var(--muted);
  }

  .chosen-name {
    font-size: 18px;
    color: var(--accent);
    margin: 8px 0 16px;
  }

  .error {
    color: #ff96c8;
    margin: 12px 0;
  }

  .close-button {
    margin-top: 16px;
  }

  button:disabled {
    opacity: 0.4;
  }
</style>
