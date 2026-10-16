<script lang="ts">
  import type { JourneyCharacter } from '$lib/types';
  let { unit }: { unit: JourneyCharacter } = $props();
</script>
{#if unit.fusionImages?.length}
  <span class="fusion">{#each unit.fusionImages.slice(0,2) as image}{#if image}<img src={image} alt="" />{:else}<span>?</span>{/if}{/each}</span>
{:else if unit.image}<img class="single" src={unit.image} alt={unit.name} />{:else}<span>{unit.empty ? 'Empty' : unit.name}</span>{/if}
<style>
  .single { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .fusion { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; }
  .fusion img { position: static; width: 100%; height: 100%; object-fit: cover; min-width: 0; }
  .fusion img + img { border-left: 1px solid #e8e8e3; }
</style>
