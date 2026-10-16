<script lang="ts">
  let { stacks }: { stacks: number } = $props();
</script>
{#if stacks >= 5}<p title="Immune to Poison. Poison is not implemented yet.">King of Poison</p>{/if}
{#if stacks >= 10}<p title={stacks >= 20 ? 'Every 6 seconds, deals a double-power attack that ignores 50% Defense.' : 'Every 6 seconds, deals a double-power attack to one enemy.'}>{stacks >= 20 ? 'World-Cutting Slash' : 'Cleave'}</p>{/if}
{#if stacks >= 15}<p title={stacks >= 20 ? 'Every 8 seconds, attacks all enemies five times.' : 'Every 8 seconds, attacks all enemies three times.'}>{stacks >= 20 ? 'Malevolent Shrine' : 'Incomplete Malevolent Shrine'}</p>{/if}
<style>p { margin: 5px 0; color: var(--accent); font-size: 12px; text-decoration: underline dotted; text-underline-offset: 3px; }</style>
