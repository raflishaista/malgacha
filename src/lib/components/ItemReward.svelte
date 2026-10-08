<script lang="ts">
  import { ITEMS, type ItemId } from '$lib/items';
  import Icon from './ItemIcon.svelte';
  let { choices, busy, error = '', onchoose }: { choices: ItemId[]; busy: boolean; error?: string; onchoose: (id: ItemId) => void } = $props();
  let dialog: HTMLDialogElement;
  $effect(() => { if (dialog && !dialog.open) dialog.showModal(); });
</script>
<dialog bind:this={dialog} aria-labelledby="reward-heading" oncancel={(e) => e.preventDefault()}>
  <h2 id="reward-heading">CONGRATULATIONS</h2><p>You have obtained an item.</p><p>Choose 1</p>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="choices">{#each choices as id}<button disabled={busy} onclick={() => onchoose(id)}><div class="graphic"><Icon {id} /></div><strong>{ITEMS[id].name}</strong><p>{ITEMS[id].description}</p></button>{/each}</div>
</dialog>
<style>
  dialog { background: #101010; color: #e8e8e3; border: 2px solid var(--accent); width: min(820px, calc(100% - 24px)); max-height: 90vh; padding: 28px; text-align: center; }
  dialog::backdrop { background: #000c; }
  h2 { color: var(--accent); font-size: clamp(22px, 4vw, 36px); overflow-wrap: anywhere; }
  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 24px; }
  .choices button { padding: 16px; text-align: left; align-content: start; }
  .graphic { width: 80px; height: 80px; margin: 0 auto 16px; } strong { font-size: 17px; } button p { font-weight: normal; color: var(--muted); }
  @media (max-width: 600px) { .choices { grid-template-columns: 1fr; } .graphic { float: left; margin: 0 14px 8px 0; width: 54px; height: 54px; } }
</style>
