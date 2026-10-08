<script lang="ts">
  import type { JourneyCharacter } from '$lib/types';
  import { BOSSES } from '$lib/bosses';
  import { abilityIds, keywordsFor } from '$lib/battle-abilities';
  import EquipmentIcons from './EquipmentIcons.svelte';
  import { equipmentBonuses, emptyBoosts } from '$lib/items';
  import { rarityFor } from '$lib/rarity';
  import { STAT_KEYS, STAT_LABELS, STAT_BAR_MAX, statTotal } from '$lib/stats';
  import { abilityFor } from '$lib/journeys';
  let { character, hideFavorites = false, team = [] }: { character: JourneyCharacter; hideFavorites?: boolean; team?: JourneyCharacter[] } = $props();
  const rarity = $derived(character.rarityOverride ?? rarityFor(character.favorites));
  const equipmentBoost = $derived(equipmentBonuses(team.length ? team : [character])[team.length ? team.findIndex(c => c.instanceId === character.instanceId) : 0] ?? emptyBoosts());
  const passives = $derived(character.boss ? [BOSSES.find(b => b.id === character.id)] : abilityIds(character).map(abilityFor));
  let dismissed = $state(false);
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') dismissed = true; }} />
{#if character.empty}<article class="empty-slot"><h3>Empty slot</h3><p>Win a battle to fill this slot with your replacement reward.</p></article>{:else}
<article class="journey-character character-entry" data-rarity={rarity} class:boss={character.boss}>
  <div class="portrait">
    <EquipmentIcons unit={character} />
    {#if character.image}<img src={character.image} alt={character.name} loading="lazy" />
    {:else}<span class="portrait-fallback">{character.name}</span>{/if}
  </div>
  {#if !hideFavorites}<p class="favorite-count">{typeof character.favorites === 'number' ? character.favorites.toLocaleString() + ' favorites' : 'Favorites unknown'}</p>{/if}
  <h3><a href={character.url} target="_blank" rel="noreferrer">{character.name}</a>{#each keywordsFor(character) as keyword}<span class="keyword">{keyword}</span>{/each}{#if character.boss}<span class="boss-tag">BOSS</span>{:else if rarity}<span class="rarity-label">{rarity}</span>{/if}</h3>
  <ul class="title-list">{#each character.titles.slice(0, 2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul>
  {#if character.titles.length > 2}<details class="more-titles"><summary>{character.titles.length - 2} more titles</summary><ul class="title-list">{#each character.titles.slice(2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul></details>{/if}
  {#each passives as ability}{#if ability}
    <div class="ability" class:single={passives.length === 1} class:dismissed>
      <button type="button" aria-describedby={`ability-${character.instanceId}-${ability.title}`} onfocus={() => dismissed = false} onpointerenter={() => dismissed = false} onclick={() => dismissed = false}>{ability.title}</button>
      <div class="ability-popup" id={`ability-${character.instanceId}-${ability.title}`} role="tooltip">
        <strong>{ability.title}</strong><p>{ability.description}</p>
      </div>
    </div>
  {/if}{/each}
  <details class="base-stats">
    <summary>Base stats <span>BST {statTotal(character.baseStats)}</span></summary>
    {#each STAT_KEYS as key}
      {@const gear = equipmentBoost[key]}
      {@const permanent = character.permanentBoosts?.[key] ?? 0}
      {@const scale = Math.max(character.boss && key === 'hp' ? 500 : STAT_BAR_MAX, character.baseStats[key] + gear + permanent)}
      <div class="stat-row"><span>{STAT_LABELS[key]}</span><strong>{character.baseStats[key]}{#if gear}<small class="gear-boost"> (+{Number(gear.toFixed(2))})</small>{/if}{#if permanent}<small class="permanent-boost"> (+{Number(permanent.toFixed(2))})</small>{/if}</strong><div class="stat-bars" role="img" aria-label={STAT_LABELS[key] + ': ' + (character.baseStats[key] + gear + permanent)}><span style:width={character.baseStats[key] / scale * 100 + '%'}></span><span class="gear" style:width={gear / scale * 100 + '%'}></span><span class="permanent" style:width={permanent / scale * 100 + '%'}></span></div></div>
    {/each}
    {#if !rarity && !character.boss}<p>Unknown favorites: N stat budget used.</p>{/if}
    <p>{character.boss ? 'ATK + DEF + SPD: 510 · HP: 500' : `Base values · bars share a 0–${STAT_BAR_MAX} scale.`}</p>
  </details>
</article>{/if}

<style>
  .stat-bars { display: flex; height: 8px; background: #292329; min-width: 30px; }
  .stat-bars span { background: var(--rarity-color); }
  .stat-bars .gear { background: #9bd9ff; } .gear-boost { color: #9bd9ff; }
  .stat-bars .permanent { background: #ffad65; } .permanent-boost { color: #ffad65; }
  .empty-slot { min-height: 160px; padding: 16px; border: 1px dashed #666; color: var(--muted); }
  .keyword { color: #64aaff; font: bold 11px var(--mono); margin-left: 6px; }
  .journey-character { position: relative; min-width: 0; }
  h3 { font-size: 15px; margin: 12px 0 6px; }
  .base-stats { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 10px; font: 12px/1.5 var(--mono); }
  .base-stats summary { cursor: pointer; }
  .base-stats summary span { float: right; color: var(--accent); }
  .stat-row { display: grid; grid-template-columns: 30px minmax(30px, auto) 1fr; align-items: center; gap: 6px; margin-top: 10px; }
  .base-stats p { color: var(--muted); font-size: 10px; }
  .ability button { background: none; border: 0; border-bottom: 1px dotted var(--accent); padding: 0; color: var(--accent); text-align: left; }
  .ability-popup { display: none; position: absolute; top: 55%; left: 0; width: min(320px, 80vw); z-index: 5; background: #151015; border: 1px solid var(--accent); padding: 16px; max-height: 300px; overflow-y: auto; }
  .journey-character:hover .ability.single:not(.dismissed) .ability-popup, .ability:not(.dismissed):hover .ability-popup, .ability:not(.dismissed):focus-within .ability-popup { display: block; }
  .ability-popup strong { color: var(--accent); font-size: 16px; }
  .ability-popup p { white-space: pre-line; margin: 8px 0 0; font-size: 13px; }
  @media (min-width: 901px) { .journey-character:last-child .ability-popup { left: auto; right: 0; } }
  @media (max-width: 900px) { .ability-popup { width: 100%; } }
</style>
