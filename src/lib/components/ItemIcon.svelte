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
    {:else if ['pokeball','greatball','ultraball','masterball'].includes(id)}<circle cx="32" cy="32" r="22" fill="#dedddd" /><path d="M10 32a22 22 0 0 1 44 0z" fill={id === 'pokeball' ? '#d84f60' : id === 'greatball' ? '#5188dc' : id === 'ultraball' ? '#d3b33b' : '#9a6bd0'} /><path d="M10 32h44" stroke="#202024" stroke-width="4" /><circle cx="32" cy="32" r="7" fill="#fff" stroke="#202024" />{#if id === 'masterball'}<path d="M22 23v-9l5 5 5-5v9" />{/if}
    {:else if id === 'dragonball'}<circle cx="32" cy="32" r="23" fill="#e8a542" /><path d="M32 18l4 9 10 1-8 7 2 11-8-6-9 6 2-11-8-7 11-1z" fill="#bf402f" stroke="none" />
    {:else if id === 'coin'}<ellipse cx="32" cy="32" rx="21" ry="24" fill="#b8b7a5" /><path d="M32 14v36M23 21h17M23 42h17" stroke="#54534a" />
    {:else if id === 'radar'}<circle cx="32" cy="34" r="23" fill="#579477" /><path d="M12 34h40M32 12v44M16 21l32 26" /><circle cx="41" cy="25" r="3" fill="#efd35b" /><path d="M28 5h9v7" />
    {:else if id === 'longinus' || id === 'inverted' || id === 'curse'}<path d="M14 56L43 12" stroke={id === 'curse' ? '#a95265' : '#b9c9d7'} stroke-width="5" /><path d="M34 15L48 6l1 17M41 11l-5-7" stroke={id === 'inverted' ? '#bbb' : '#c7737c'} />
    {:else if id === 'swordfish'}<path d="M6 38l29-20 23 20-23-6-14 12z" fill="#bb3e47" /><path d="M30 21l4-11 6 14M23 42l8 11" />
    {:else if id === 'drug'}<path d="M15 49L44 20l6 6-29 29z" fill="#d4c6e4" /><path d="M41 17l12 12M15 49l-9 9M46 12l10 10" />
    {:else if id === 'journal'}<path d="M14 9h34v47H14z" fill="#8c6259" /><path d="M21 9v47M27 22h15M27 29h15M27 36h10" />
    {:else if id === 'rokkakaka'}<path d="M32 19C9 7 3 41 25 54c9 6 29-7 28-22-1-12-12-18-21-13z" fill="#a98eb2" /><path d="M30 20l4-15 9 1M19 30l5 8M37 27l7 9M27 43l6 7" stroke="#66506c" />
    {:else if id === 'mask'}<path d="M15 9h34l-3 34-14 14-14-14z" fill="#c3bca9" /><path d="M22 26l6 3M37 29l7-3M27 43h10M32 29v8" stroke="#504a42" />
    {:else if id === 'stone' || id === 'hogyoku' || id === 'behelit'}<path d="M17 16l15-9 16 10 5 24-21 16-22-15z" fill={id === 'stone' ? '#c03d56' : id === 'hogyoku' ? '#7667b6' : '#926455'} />{#if id === 'behelit'}<path d="M19 25l8 3M39 33l5-7M25 44l14 2" />{:else}<path d="M20 18l13 27 12-26M12 40h39" />{/if}
    {:else if id === 'potara'}<circle cx="20" cy="15" r="7" stroke="#d8bd68" /><circle cx="44" cy="15" r="7" stroke="#d8bd68" /><path d="M20 22v9M44 22v9" /><ellipse cx="20" cy="42" rx="8" ry="13" fill="#92be87" /><ellipse cx="44" cy="42" rx="8" ry="13" fill="#92be87" />
    {:else if id === 'machine'}<path d="M12 20h40v29H12z" fill="#a4afb1" /><circle cx="32" cy="33" r="11" fill="#4b7486" /><path d="M32 26v8l6 3M20 20V9h24v11M18 55h28" />{/if}
  </g>
</svg>
<style>svg { display: block; width: 100%; height: 100%; }</style>
