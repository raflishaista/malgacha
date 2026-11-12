<script lang="ts">
  import HostAbilities from './HostAbilities.svelte';
  import JourneyPortrait from './JourneyPortrait.svelte';
  import KeywordTags from './KeywordTags.svelte';
  import BossAbility from './BossAbility.svelte';
  import EquipmentIcons from './EquipmentIcons.svelte';
  import { dodgeChance } from '$lib/battle/equipment';
  import { keywordBonuses } from '$lib/battle/keywords';
  import type { JourneyCharacter } from '$lib/types';
  import { BOSS_RULES } from '$lib/bosses';
  import { abilityIds } from '$lib/battle/abilities/catalog';
  import { equipmentBonuses, emptyBoosts } from '$lib/items';
  import { rarityFor } from '$lib/rarity';
  import { STAT_KEYS, STAT_LABELS, STAT_BAR_MAX, statTotal } from '$lib/stats';
  import { abilityFor } from '$lib/journeys';

  let {
    character,
    hideFavorites = false,
    showBst = false,
    team = []
  }: {
    character: JourneyCharacter;
    hideFavorites?: boolean;
    showBst?: boolean;
    team?: JourneyCharacter[];
  } = $props();

  const rarity = $derived(character.rarityOverride ?? rarityFor(character.favorites));
  const equipmentBoost = $derived(
    equipmentBonuses(team.length ? team : [character])[
      team.length ? team.findIndex(c => c.instanceId === character.instanceId) : 0
    ] ?? emptyBoosts()
  );
  const keywordBoost = $derived(keywordBonuses(character, equipmentBoost));
  const passives = $derived(character.boss ? [] : abilityIds(character).map(abilityFor));

  let dismissed = $state(false);
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') dismissed = true;
  }}
/>

{#if character.empty}
  <article class="empty-slot">
    <h3>Empty slot</h3>
    <p>Win a battle to fill this slot with your replacement reward.</p>
  </article>
{:else}
  <article class="journey-character character-entry" data-rarity={rarity} class:boss={character.boss}>
    <div class="portrait">
      <EquipmentIcons unit={character} />
      <JourneyPortrait unit={character} />
    </div>

    {#if !hideFavorites}
      <p class="favorite-count">
        {typeof character.favorites === 'number'
          ? character.favorites.toLocaleString() + ' favorites'
          : 'Favorites unknown'}
      </p>
    {/if}

    <h3>
      {#if character.url}
        <a href={character.url} target="_blank" rel="noreferrer">{character.name}</a>
      {:else}
        {character.name}
      {/if}

      <KeywordTags unit={character} />

      {#if character.boss}
        <span class="boss-tag">BOSS</span>
      {:else if rarity}
        <span class="rarity-label">{rarity}</span>
      {/if}
    </h3>

    <ul class="title-list">
      {#each character.titles.slice(0, 2) as title}
        <li><span>{title.kind}</span> {title.name}</li>
      {/each}
    </ul>

    {#if character.titles.length > 2}
      <details class="more-titles">
        <summary>{character.titles.length - 2} more titles</summary>
        <ul class="title-list">
          {#each character.titles.slice(2) as title}
            <li><span>{title.kind}</span> {title.name}</li>
          {/each}
        </ul>
      </details>
    {/if}

    {#each passives as ability}
      {#if ability}
        <div class="ability" class:single={passives.length === 1} class:dismissed>
          <button
            type="button"
            aria-describedby={`ability-${character.instanceId}-${ability.title}`}
            onfocus={() => (dismissed = false)}
            onpointerenter={() => (dismissed = false)}
            onclick={() => (dismissed = false)}
          >
            {ability.title}
          </button>

          <div
            class="ability-popup"
            id={`ability-${character.instanceId}-${ability.title}`}
            role="tooltip"
          >
            <strong>{ability.title}</strong>
            <p>{ability.description}</p>
          </div>
        </div>
      {/if}
    {/each}

    {#if abilityIds(character).includes(2867)}
      <p>GANTZ: {character.gantzPoints ?? 0} points</p>
    {/if}

    {#if character.boss}
      <BossAbility unit={character} />
    {/if}

    {#if character.sukunaStacks}
      <HostAbilities stacks={character.sukunaStacks} />
    {/if}

    <details class="base-stats" open={showBst || undefined}>
      <summary>
        Base stats <span>BST {statTotal(character.baseStats)}</span>
      </summary>

      {#if dodgeChance(character)}
        <p class="dodge">Dodge +{Math.round(dodgeChance(character) * 100)}%</p>
      {/if}

      {#each STAT_KEYS as key}
        {@const gear = equipmentBoost[key]}
        {@const permanent = character.permanentBoosts?.[key] ?? 0}
        {@const keyword = keywordBoost[key]}
        {@const totalStat = character.baseStats[key] + gear + permanent + keyword}
        {@const scale = Math.max(
          character.boss && key === 'hp' ? 500 : STAT_BAR_MAX,
          totalStat
        )}

        <div class="stat-row">
          <span>{STAT_LABELS[key]}</span>
          <strong>
            {character.baseStats[key]}
            {#if gear}<small class="gear-boost"> (+{Number(gear.toFixed(2))})</small>{/if}
            {#if permanent}<small class="permanent-boost"> (+{Number(permanent.toFixed(2))})</small>{/if}
            {#if keyword}<small class="permanent-boost"> (+{Number(keyword.toFixed(2))})</small>{/if}
          </strong>

          <div
            class="stat-bars"
            role="img"
            aria-label={`${STAT_LABELS[key]}: ${totalStat}`}
          >
            <span style:width={`${(character.baseStats[key] / scale) * 100}%`}></span>
            <span class="gear" style:width={`${(gear / scale) * 100}%`}></span>
            <span class="permanent" style:width={`${((permanent + keyword) / scale) * 100}%`}></span>
          </div>
        </div>
      {/each}

      {#if !rarity && !character.boss}
        <p>Unknown favorites: N stat budget used.</p>
      {/if}
      <p>
        {character.boss
          ? `ATK + DEF + SPD: ${BOSS_RULES.bst} · HP: ${BOSS_RULES.hp}`
          : `Base values · bars share a 0–${STAT_BAR_MAX} scale.`}
      </p>
    </details>
  </article>
{/if}

<style>
  .journey-character {
    position: relative;
    padding-top: 8px;
    border-top: 1px solid #4a3e4c;
  }
  .empty-slot {
    border: 1px dashed var(--line);
    padding: 16px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  .empty-slot h3 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--accent);
  }
  .favorite-count {
    font-size: 11px;
    color: var(--muted);
    margin: 4px 0 6px;
  }
  .ability {
    position: relative;
    margin-top: 6px;
  }
  .ability button {
    padding: 0;
    min-height: 0;
    background: none;
    border: 0;
    border-bottom: 1px dotted var(--accent);
    color: var(--accent);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .ability-popup {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    z-index: 10;
    width: min(280px, 65vw);
    padding: 12px;
    background: #151115;
    border: 1px solid var(--accent);
    font-size: 12px;
  }
  .ability:hover .ability-popup,
  .ability:focus-within .ability-popup {
    display: block;
  }
  .ability.dismissed .ability-popup {
    display: none !important;
  }
  .ability-popup p {
    margin: 6px 0 0;
    color: #e8e8e3;
    font-size: 12px;
    line-height: 1.4;
  }
  .base-stats {
    margin-top: 10px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
    font-size: 12px;
  }
  .base-stats summary {
    display: flex;
    justify-content: space-between;
    cursor: pointer;
    color: #ded8de;
    font-weight: 600;
  }
  .base-stats summary span {
    font-family: var(--mono);
    color: var(--accent);
  }
  .dodge {
    color: #79d5ff;
    font-family: var(--mono);
    font-size: 11px;
    margin: 6px 0 2px;
  }
  .stat-row {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
    font-family: var(--mono);
    font-size: 11px;
  }
  .stat-row strong {
    font-weight: normal;
  }
  .gear-boost {
    color: #79d5ff;
  }
  .permanent-boost {
    color: #ffd875;
  }
  .stat-bars {
    grid-column: 1 / -1;
    display: flex;
    height: 4px;
    background: #201c20;
    margin-bottom: 2px;
  }
  .stat-bars span {
    background: #ded8de;
  }
  .stat-bars .gear {
    background: #79d5ff;
  }
  .stat-bars .permanent {
    background: #ffd875;
  }
  .base-stats p {
    color: var(--muted);
    font-size: 10px;
    margin: 6px 0 0;
    font-family: var(--mono);
  }
</style>
