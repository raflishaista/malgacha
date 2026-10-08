<script lang="ts">
  import type { JourneyCharacter } from '$lib/types';
  import { ITEMS } from '$lib/items';
  import Icon from './ItemIcon.svelte';
  let { unit }: { unit: JourneyCharacter } = $props();
</script>
{#if unit.equipment?.length}<div class="equipment-icons">{#each unit.equipment as item (item.instanceId)}<div title={ITEMS[item.itemId].name + ': ' + ITEMS[item.itemId].description}><Icon id={item.itemId} /></div>{/each}</div>{/if}
<style>.equipment-icons { position: absolute; left: -8px; top: 5px; z-index: 4; display: grid; gap: 3px; }.equipment-icons > div { width: 25px; height: 25px; border: 1px solid #9bc8ed; }</style>
