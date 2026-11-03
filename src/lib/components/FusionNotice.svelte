<script lang="ts">
  let { oncontinue }: { oncontinue: () => void } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => {
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  });
</script>

<dialog bind:this={dialog} aria-labelledby="fusion-heading" oncancel={(e) => e.preventDefault()}>
  <h2 id="fusion-heading">Potara Fusion</h2>
  <p>Two units wearing Potara earrings have fused into one.</p>
  <button class="primary" onclick={oncontinue}>Continue</button>
</dialog>

<style>
  dialog {
    background: #101010;
    color: #e8e8e3;
    border: 2px solid var(--accent);
    padding: 30px;
    text-align: center;
    width: min(500px, calc(100% - 24px));
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  h2 {
    font-size: 32px;
    color: var(--accent);
    margin: 0 0 12px;
  }

  p {
    color: var(--muted);
    margin: 0 0 24px;
  }
</style>
