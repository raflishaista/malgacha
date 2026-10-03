<script lang="ts">
  import type { JourneyCharacter } from '$lib/types';
  import { rarityFor } from '$lib/rarity';
  import { STAT_KEYS, STAT_LABELS, STAT_BAR_MAX, statTotal } from '$lib/stats';
  import { abilityFor } from '$lib/journeys';
  let { character, hideFavorites = false }: { character: JourneyCharacter; hideFavorites?: boolean } = $props();
  const rarity = $derived(rarityFor(character.favorites));
  const ability = $derived(abilityFor(character.id));
  let dismissed = $state(false);
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') dismissed = true; }} />
<article class="journey-character character-entry" data-rarity={rarity}>
  <div class="portrait">
    {#if character.image}<img src={character.image} alt={character.name} loading="lazy" />
    {:else}<span class="portrait-fallback">{character.name}</span>{/if}
  </div>
  {#if !hideFavorites}<p class="favorite-count">{typeof character.favorites === 'number' ? character.favorites.toLocaleString() + ' favorites' : 'Favorites unknown'}</p>{/if}
  <h3><a href={character.url} target="_blank" rel="noreferrer">{character.name}</a>{#if rarity}<span class="rarity-label">{rarity}</span>{/if}</h3>
  <ul class="title-list">{#each character.titles.slice(0, 2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul>
  {#if character.titles.length > 2}<details class="more-titles"><summary>{character.titles.length - 2} more titles</summary><ul class="title-list">{#each character.titles.slice(2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul></details>{/if}
  {#if ability}
    <div class="ability" class:dismissed>
      <button type="button" aria-describedby={`ability-${character.instanceId}`} onfocus={() => dismissed = false} onpointerenter={() => dismissed = false} onclick={() => dismissed = false}>{ability.title}</button>
      <div class="ability-popup" id={`ability-${character.id}`} role="tooltip">
        <strong>{ability.title}</strong><p>{ability.description}</p>
      </div>
    </div>
  {/if}
  <details class="base-stats">
    <summary>Base stats <span>BST {statTotal(character.baseStats)}</span></summary>
    {#each STAT_KEYS as key}
      <div class="stat-row"><span>{STAT_LABELS[key]}</span><strong>{character.baseStats[key]}</strong><meter aria-label={STAT_LABELS[key]} min="0" max={STAT_BAR_MAX} value={character.baseStats[key]}>{character.baseStats[key]}</meter></div>
    {/each}
    {#if !rarity}<p>Unknown favorites: N stat budget used.</p>{/if}
    <p>Base values · bars share a 0–{STAT_BAR_MAX} scale.</p>
  </details>
</article>

<style>
  .journey-character { position: relative; min-width: 0; }
  h3 { font-size: 15px; margin: 12px 0 6px; }
  .base-stats { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 10px; font: 12px/1.5 var(--mono); }
  .base-stats summary { cursor: pointer; }
  .base-stats summary span { float: right; color: var(--accent); }
  .stat-row { display: grid; grid-template-columns: 30px 30px 1fr; align-items: center; gap: 6px; margin-top: 10px; }
  meter { width: 100%; height: 10px; border: 0; background: #292329; }
  meter::-webkit-meter-bar { border: 0; border-radius: 0; background: #292329; }
  meter::-webkit-meter-optimum-value { background: var(--rarity-color); }
  meter::-moz-meter-bar { background: var(--rarity-color); }
  .base-stats p { color: var(--muted); font-size: 10px; }
  .ability button { background: none; border: 0; border-bottom: 1px dotted var(--accent); padding: 0; color: var(--accent); text-align: left; }
  .ability-popup { display: none; position: absolute; top: 55%; left: 0; width: min(320px, 80vw); z-index: 5; background: #151015; border: 1px solid var(--accent); padding: 16px; max-height: 300px; overflow-y: auto; }
  .journey-character:hover .ability:not(.dismissed) .ability-popup, .ability:not(.dismissed):focus-within .ability-popup { display: block; }
  .ability-popup strong { color: var(--accent); font-size: 16px; }
  .ability-popup p { white-space: pre-line; margin: 8px 0 0; font-size: 13px; }
  @media (min-width: 901px) { .journey-character:last-child .ability-popup { left: auto; right: 0; } }
  @media (max-width: 900px) { .ability-popup { width: 100%; } }
</style>
