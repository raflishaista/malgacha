<script lang="ts">
  let { oncontinue }: { oncontinue: () => void } = $props();
  let dialog: HTMLDialogElement;
  $effect(() => { if (dialog && !dialog.open) dialog.showModal(); });
</script>
<dialog bind:this={dialog} aria-labelledby="fusion-heading" oncancel={(e) => e.preventDefault()}><h2 id="fusion-heading">FUSION</h2><p>Your units fused.</p><button class="primary" onclick={oncontinue}>Continue</button></dialog>
<style>dialog { background: #101010; color: #e8e8e3; border: 2px solid var(--accent); padding: 30px; text-align: center; width: min(500px,calc(100% - 24px)); } dialog::backdrop { background: #000c; } h2 { font-size: 42px; }</style>
