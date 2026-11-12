<script lang="ts">
  import {
    ITEMS,
    ITEM_COLORS,
    isBall,
    canUseOn,
    rerollFilter,
    type ItemInstance
  } from '$lib/items';
  import { abilityIds } from '$lib/battle/abilities';
  import { abilityFor } from '$lib/journeys';
  import type { JourneyCharacter } from '$lib/types';
  import type { InventoryAction } from '$lib/server/inventory';
  import Icon from './ItemIcon.svelte';
  import EquipmentIcons from './EquipmentIcons.svelte';
  import Portrait from './JourneyPortrait.svelte';

  let {
    inventory,
    team,
    defeated = [],
    pendingCatch = null,
    notice = '',
    lives = 3,
    disabled,
    onaction
  }: {
    inventory: ItemInstance[];
    team: JourneyCharacter[];
    defeated?: JourneyCharacter[];
    pendingCatch?: JourneyCharacter | null;
    notice?: string;
    lives?: number;
    disabled: boolean;
    onaction: (action: InventoryAction) => Promise<boolean>;
  } = $props();

  let selected = $state<string | null>(null);
  let targeting = $state(false);
  let used = $state(0);
  let drugTarget = $state<JourneyCharacter | null>(null);
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (drugTarget && dialog && !dialog.open) {
      dialog.showModal();
    }
  });

  const selectedItem = $derived(inventory.find((i) => i.instanceId === selected));

  function entries(category: string) {
    const source = inventory.filter((i) => ITEMS[i.itemId].category === category);
    if (category !== 'relic') return source;
    return source.filter(
      (entry, index) => source.findIndex((i) => i.itemId === entry.itemId) === index
    );
  }

  function eligible(unit: JourneyCharacter, dragged?: string) {
    if (pendingCatch) return true;
    const chosen = inventory.find((i) => i.instanceId === (dragged ?? selected));
    return chosen ? canUseOn(chosen.itemId, unit) : !unit.empty;
  }

  async function target(unit: JourneyCharacter, dragged?: string) {
    if (disabled) return;

    if (pendingCatch) {
      await onaction({ action: 'replace-catch', target: unit.instanceId });
      return;
    }

    const chosen = inventory.find((i) => i.instanceId === (dragged ?? selected));
    if (!chosen || !eligible(unit, dragged) || isBall(chosen.itemId)) return;

    const category = ITEMS[chosen.itemId].category;
    if (category !== 'equipment' && !(category === 'consumable' && targeting)) return;

    if (chosen.itemId === 'drug') {
      drugTarget = unit;
      return;
    }

    const success = await onaction({
      action: category === 'equipment' ? 'equip' : 'use',
      item: chosen.instanceId,
      target: unit.instanceId
    });

    if (success) {
      if (category === 'consumable') used++;
      selected = null;
      targeting = false;
    }
  }

  async function removeAbility(id: number) {
    const success = await onaction({
      action: 'use',
      item: selected ?? undefined,
      target: drugTarget?.instanceId,
      ability: id
    });

    if (success) {
      drugTarget = null;
      selected = null;
      targeting = false;
      used++;
    }
  }

  async function handleCatch(targetUnit: JourneyCharacter) {
    if (!selectedItem) return;
    const success = await onaction({
      action: 'catch',
      item: selectedItem.instanceId,
      target: targetUnit.instanceId
    });
    if (success) {
      selected = null;
      targeting = false;
    }
  }
</script>

<section aria-label="Inventory">
  <h2>Inventory</h2>
  <p class="guide">
    Drag equipment onto a unit or select it and click. Max 3 items per unit.
  </p>

  {#if rerollFilter(inventory)}
    <p class="filter">Reroll filter: &gt;{rerollFilter(inventory)} favorites</p>
  {/if}

  {#each ['relic', 'equipment', 'consumable'] as category}
    {@const categoryTitle =
      category === 'relic' ? 'Relics' : category === 'equipment' ? 'Equipment' : 'Consumables'}
    <section class="item-group">
      <h3>{categoryTitle}</h3>
      <div class="item-row">
        {#each entries(category) as entry (entry.instanceId)}
          {@const definition = ITEMS[entry.itemId]}
          {@const count = inventory.filter((i) => i.itemId === entry.itemId).length}
          {@const color = ITEM_COLORS[definition.rarity]}
          <button
            class="item"
            style:border-color={color}
            class:selected={selected === entry.instanceId}
            disabled={disabled}
            draggable={category === 'equipment' && !disabled}
            ondragstart={(e) => {
              selected = entry.instanceId;
              e.dataTransfer?.setData('text/plain', entry.instanceId);
            }}
            onclick={() => {
              selected = entry.instanceId;
              targeting = false;
            }}
            aria-label={definition.name}
          >
            <Icon id={entry.itemId} />
            {#if category === 'relic' && !definition.unique}
              <b class="count">{count}</b>
            {/if}
            <span class="item-tooltip">
              <strong style:color={color}>{definition.rarity} · {definition.name}</strong>
              <br />
              {definition.description}
            </span>
          </button>
        {:else}
          <span class="muted">None.</span>
        {/each}
      </div>
    </section>
  {/each}

  {#if selectedItem}
    {@const def = ITEMS[selectedItem.itemId]}
    <div class="selection">
      <strong>{def.rarity} · {def.name}</strong>
      <p class="item-desc">{def.description}</p>

      {#if def.category === 'consumable'}
        {#if selectedItem.itemId === 'senzubean'}
          <button
            disabled={disabled || lives >= 3}
            onclick={async () => {
              const success = await onaction({
                action: 'use',
                item: selectedItem.instanceId
              });
              if (success) {
                used++;
                selected = null;
                targeting = false;
              }
            }}
          >
            {lives >= 3 ? 'Lives Full (3/3)' : 'Consume Senzu Bean (+1 Life)'}
          </button>
        {:else}
          <button disabled={disabled} onclick={() => (targeting = true)}>
            Use item
          </button>
        {/if}
      {/if}

      {#if targeting}
        <p role="status">
          {isBall(selectedItem.itemId)
            ? 'Choose a defeated opponent below.'
            : 'Choose an eligible unit below.'}
        </p>
      {:else if def.category === 'equipment'}
        <p>Choose a unit below to equip.</p>
      {/if}
    </div>
  {/if}

  {#if notice}
    <p role="status" class="notice">{notice}</p>
  {/if}

  {#if pendingCatch}
    <h3>Caught: {pendingCatch.name}</h3>
    <p>Choose a team slot to replace.</p>
  {/if}

  {#if selectedItem && isBall(selectedItem.itemId) && targeting && !pendingCatch}
    <h3>Defeated opponents</h3>
    <div class="inventory-team">
      {#each defeated.filter((c) => !c.boss) as foe (foe.instanceId)}
        <button disabled={disabled} onclick={() => handleCatch(foe)}>
          <span class="unit-portrait">
            <Portrait unit={foe} />
          </span>
          <span>{foe.name} · {foe.statRarity}</span>
        </button>
      {:else}
        <p class="muted">Win a non-boss battle to catch an opponent.</p>
      {/each}
    </div>
  {/if}

  {#key used}
    {#if used}
      <p class="used" role="status">Used!</p>
    {/if}
  {/key}

  <h3>Your units</h3>
  <div class="inventory-team">
    {#each team as unit (unit.instanceId)}
      <button
        class="unit-target"
        disabled={disabled || !eligible(unit)}
        onclick={() => target(unit)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          void target(unit, e.dataTransfer?.getData('text/plain'));
        }}
        aria-label={`Select ${unit.name}`}
      >
        <span class="unit-portrait">
          <Portrait {unit} />
          <EquipmentIcons {unit} />
        </span>
        <span class="unit-name">{unit.name}</span>
        <small>{unit.equipment?.length ?? 0}/3 equipped</small>
      </button>
    {/each}
  </div>

  {#if drugTarget}
    <dialog
      bind:this={dialog}
      oncancel={() => (drugTarget = null)}
      aria-label="Remove a passive ability"
    >
      <h3>Remove an ability from {drugTarget.name}</h3>
      <div class="dialog-abilities">
        {#each abilityIds(drugTarget) as id (id)}
          <button disabled={disabled} onclick={() => removeAbility(id)}>
            {abilityFor(id)?.title ?? id}
          </button>
        {/each}
      </div>
      <button class="secondary" onclick={() => (drugTarget = null)}>Cancel</button>
    </dialog>
  {/if}
</section>

<style>
  h2 {
    margin-top: 22px;
  }

  p,
  .muted {
    color: var(--muted);
  }

  .guide {
    margin-bottom: 16px;
  }

  .filter {
    font: 12px var(--mono);
    color: var(--accent);
  }

  .item-group {
    border-bottom: 1px solid var(--line);
    padding: 8px 0 18px;
  }

  .item-group h3 {
    font-size: 14px;
    margin-bottom: 10px;
    color: #e8e8e3;
  }

  .item-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .item {
    width: 64px;
    height: 64px;
    padding: 0;
    background: #303034;
    position: relative;
    border: 2px solid transparent;
  }

  .item.selected {
    outline: 2px solid var(--accent);
  }

  .count {
    position: absolute;
    bottom: 0;
    left: 3px;
    color: #ffffff;
    font: bold 17px var(--mono);
    -webkit-text-stroke: 0.5px #ffffff;
    text-shadow: 1px 1px #000000;
  }

  .item-tooltip {
    display: none;
    position: absolute;
    left: 0;
    top: 100%;
    background: #18181c;
    border: 1px solid #777777;
    padding: 12px;
    width: min(250px, 70vw);
    text-align: left;
    z-index: 10;
    font-size: 12px;
    color: #ffffff;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
  }

  .item:hover .item-tooltip,
  .item:focus-visible .item-tooltip {
    display: block;
  }

  .selection {
    margin: 18px 0;
    padding: 14px 16px;
    border-left: 3px solid var(--accent);
    background: #161619;
    border-top: 1px solid #2a2a30;
    border-right: 1px solid #2a2a30;
    border-bottom: 1px solid #2a2a30;
  }

  .selection strong {
    color: #ffffff;
    font-size: 14px;
    display: block;
    margin-bottom: 6px;
  }

  .selection .item-desc {
    color: #ffffff;
    font-size: 13px;
    line-height: 1.5;
    margin: 0 0 12px;
  }

  .notice {
    color: var(--accent);
    margin: 12px 0;
  }

  .inventory-team {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 20px 0;
  }

  .inventory-team > button {
    width: 110px;
    padding: 8px;
    display: grid;
    gap: 7px;
    text-align: left;
  }

  .unit-portrait {
    display: block;
    position: relative;
    width: 100%;
    aspect-ratio: var(--character-portrait-ratio);
    background: #181818;
  }

  .unit-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:disabled {
    opacity: 0.35;
  }

  small {
    color: var(--muted);
    font-size: 11px;
  }

  .used {
    color: #ffb078;
    animation: used-fade 2s forwards;
  }

  @keyframes used-fade {
    to {
      opacity: 0;
    }
  }

  dialog {
    background: #101010;
    color: #e8e8e3;
    padding: 24px;
    border: 1px solid var(--accent);
    max-width: min(600px, calc(100% - 24px));
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }

  .dialog-abilities {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
  }

  dialog button {
    margin: 4px 0;
  }
</style>
