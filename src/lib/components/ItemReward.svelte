<script lang="ts">
  import { ITEMS, ITEM_COLORS, type ItemId } from '$lib/items';
  import Icon from './ItemIcon.svelte';

  let {
    choices,
    busy,
    error = '',
    onchoose
  }: {
    choices: ItemId[];
    busy: boolean;
    error?: string;
    onchoose: (id: ItemId) => void;
  } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (dialog && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }
  });
</script>

<dialog bind:this={dialog} aria-labelledby="reward-heading" oncancel={(e) => e.preventDefault()}>
  <h2 id="reward-heading">Choose an Item</h2>

  {#if error}
    <p role="alert" class="error">{error}</p>
  {/if}

  <div class="choices">
    {#each choices as id, index (`${index}-${id}`)}
      {@const item = ITEMS[id]}
      {@const rarityColor = ITEM_COLORS[item.rarity]}
      <button
        type="button"
        style:border-color={rarityColor}
        disabled={busy}
        onclick={() => onchoose(id)}
      >
        <div class="graphic">
          <Icon {id} />
        </div>
        <span class="rarity" style:color={rarityColor}>{item.rarity}</span>
        <strong>{item.name}</strong>
        <p>{item.description}</p>
      </button>
    {/each}
  </div>
</dialog>

<style>
  dialog {
    background: #101010;
    color: #e8e8e3;
    border: 2px solid var(--accent);
    width: min(820px, calc(100% - 24px));
    max-height: 90vh;
    padding: 28px;
    text-align: center;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  h2 {
    color: var(--accent);
    font-size: clamp(22px, 4vw, 36px);
    margin: 0 0 16px;
  }

  .error {
    color: #ff96c8;
    margin-bottom: 12px;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 16px;
  }

  .choices button {
    padding: 16px;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .graphic {
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
    align-self: center;
  }

  .rarity {
    font: bold 12px var(--mono);
    margin-bottom: 4px;
  }

  strong {
    font-size: 17px;
    margin-bottom: 8px;
  }

  button p {
    font-weight: normal;
    color: var(--muted);
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
  }

  @media (max-width: 600px) {
    .choices {
      grid-template-columns: 1fr;
    }

    .graphic {
      width: 54px;
      height: 54px;
      margin: 0 14px 8px 0;
      float: left;
    }
  }
</style>
