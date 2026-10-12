<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import LotteryPanel from './LotteryPanel.svelte';
  import type { PoolCharacter } from '$lib/types';

  let props: ComponentProps<typeof LotteryPanel> = $props();
  let panel: { roll: () => Promise<PoolCharacter[] | null> };

  export async function roll(): Promise<PoolCharacter[] | null> {
    return panel.roll();
  }
</script>

<LotteryPanel {...props} showDrawControls={false} bind:this={panel} />
