<script lang="ts">
  import { ITEMS, type ItemId } from '$lib/items';
  let { id }: { id: ItemId } = $props();
</script>
<svg viewBox="0 0 64 64" role="img" aria-label={ITEMS[id].name}>
  <rect width="64" height="64" fill="#303034" />
  <g stroke="#e8e8e3" stroke-width="2.5" stroke-linejoin="round" fill="none">
    {#if id === 'merry' || id === 'sunny'}
      <path d="M9 43h47l-9 12H20z" fill="#9f6848" /><path d="M31 9v34M30 12L12 36h18M34 14l17 22H34" fill={id === 'merry' ? '#e9dbb9' : '#f0b650'} />
      {#if id === 'sunny'}<circle cx="52" cy="42" r="6" fill="#f0b650" />{/if}
    {:else if id === 'nichirin'}<path d="M22 42L49 8l-9 24-13 15z" fill="#8cbfdb" /><path d="M17 39l14 12M14 55l9-12" stroke="#ed7069" stroke-width="5" />
    {:else if id === 'whistle'}<path d="M17 30l6-15h18l7 15-9 22H26z" fill="#dedddd" /><circle cx="28" cy="30" r="3" fill="#303034" /><circle cx="38" cy="30" r="3" fill="#303034" /><path d="M30 39h7M31 16V6" stroke="#555" />
    {:else if id === 'airgear'}<path d="M17 14h14v17l21 9v8H12V31z" fill="#8cbfdb" /><circle cx="22" cy="53" r="5" /><circle cx="44" cy="53" r="5" /><path d="M23 24h10M23 30h10" />
    {:else if id === 'finger'}<path d="M27 53l-6-24 4-15 7-7 8 4 3 18-4 25z" fill="#a7575e" /><path d="M27 20h11M25 31l14 3M29 44h10M30 9l2 8" stroke="#2b1723" />
    {:else if id === 'arrow'}<path d="M18 55L43 12" stroke="#eac567" stroke-width="5" /><path d="M33 13L51 6l-2 20-8-5z" fill="#eac567" /><path d="M13 45l10 6M17 38l10 6" />
    {:else}<circle cx="32" cy="32" r="22" fill="#dedddd" /><path d="M10 32a22 22 0 0 1 44 0z" fill="#9a6bd0" /><path d="M10 32h44" stroke="#202024" stroke-width="4" /><circle cx="32" cy="32" r="7" fill="#fff" stroke="#202024" /><path d="M22 23v-9l5 5 5-5v9" />{/if}
  </g>
</svg>
<style>svg { display: block; width: 100%; height: 100%; }</style>
