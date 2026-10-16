<script lang="ts">
  import { ITEMS, ITEM_COLORS, isBall, canUseOn, rerollFilter, type ItemInstance } from '$lib/items';
  import { abilityIds } from '$lib/battle/abilities';
  import { abilityFor } from '$lib/journeys';
  import type { JourneyCharacter } from '$lib/types';
  import type { InventoryAction } from '$lib/server/inventory';
  import Icon from './ItemIcon.svelte';
  import EquipmentIcons from './EquipmentIcons.svelte';
  import Portrait from './JourneyPortrait.svelte';
  let { inventory, team, defeated = [], pendingCatch = null, notice = '', disabled, onaction }: { inventory: ItemInstance[]; team: JourneyCharacter[]; defeated?: JourneyCharacter[]; pendingCatch?: JourneyCharacter | null; notice?: string; disabled: boolean; onaction: (action: InventoryAction) => Promise<boolean> } = $props();
  let selected = $state<string | null>(null), targeting = $state(false), used = $state(0);
  let drugTarget = $state<JourneyCharacter | null>(null);
  let dialog = $state<HTMLDialogElement>();
  $effect(() => { if (drugTarget && dialog && !dialog.open) dialog.showModal(); });
  const item = $derived(inventory.find(i => i.instanceId === selected));
  function entries(category: string) {
    const source = inventory.filter(i => ITEMS[i.itemId].category === category);
    return category === 'relic' ? source.filter((entry, index) => source.findIndex(i => i.itemId === entry.itemId) === index) : source;
  }
  function eligible(unit: JourneyCharacter, dragged?: string) {
    if (pendingCatch) return true;
    const chosen = inventory.find(i => i.instanceId === (dragged ?? selected));
    return chosen ? canUseOn(chosen.itemId, unit) : !unit.empty;
  }
  async function target(unit: JourneyCharacter, dragged?: string) {
    if (disabled) return;
    if (pendingCatch) { await onaction({action: 'replace-catch', target: unit.instanceId}); return; }
    const chosen = inventory.find(i => i.instanceId === (dragged ?? selected));
    if (!chosen || !eligible(unit, dragged) || isBall(chosen.itemId)) return;
    const category = ITEMS[chosen.itemId].category;
    if (category !== 'equipment' && !(category === 'consumable' && targeting)) return;
    if (chosen.itemId === 'drug') { drugTarget = unit; return; }
    if (await onaction({ action: category === 'equipment' ? 'equip' : 'use', item: chosen.instanceId, target: unit.instanceId })) {
      if (category === 'consumable') used++;
      selected = null; targeting = false;
    }
  }
  async function removeAbility(id: number) {
    if (await onaction({action: 'use', item: selected ?? undefined, target: drugTarget?.instanceId, ability: id})) { drugTarget = null; selected = null; targeting = false; used++; }
  }
</script>
<section aria-label="Inventory">
  <h2>Inventory</h2><p>Drag equipment onto a unit, or select it and click a unit. Three items maximum per unit.</p>
  {#if rerollFilter(inventory)}<p class="filter">Current filter power: &gt;{rerollFilter(inventory)} favorites</p>{/if}
  {#each ['relic', 'equipment', 'consumable'] as category}
    <section class="item-group"><h3>{category === 'relic' ? 'Relics' : category === 'equipment' ? 'Equippables' : 'Consumables'}</h3>
      <div class="item-row">{#each entries(category) as entry (entry.instanceId)}
        {@const definition = ITEMS[entry.itemId]}
        {@const amount = inventory.filter(i => i.itemId === entry.itemId).length}
        <button class="item" style:border-color={ITEM_COLORS[definition.rarity]} class:selected={selected === entry.instanceId} disabled={disabled} draggable={category === 'equipment' && !disabled} ondragstart={(e) => { selected = entry.instanceId; e.dataTransfer?.setData('text/plain', entry.instanceId); }} onclick={() => { selected = entry.instanceId; targeting = false; }} aria-label={definition.name}>
          <Icon id={entry.itemId} />{#if category === 'relic' && !definition.unique}<b class="count">{amount}</b>{/if}<span class="item-tooltip"><strong style:color={ITEM_COLORS[definition.rarity]}>{definition.rarity} · {definition.name}</strong><br />{definition.description}</span>
        </button>
      {:else}<span class="muted">None yet.</span>{/each}</div>
    </section>
  {/each}
  {#if item}<div class="selection"><strong>{ITEMS[item.itemId].rarity} · {ITEMS[item.itemId].name}</strong><p>{ITEMS[item.itemId].description}</p>
    {#if ITEMS[item.itemId].category === 'consumable'}<button disabled={disabled} onclick={() => targeting = true}>USE</button>{/if}
    {#if targeting}<p role="status">{isBall(item.itemId) ? 'Choose a defeated opponent below. The ball is consumed even if the catch fails.' : 'Choose an eligible unit below. This use is permanent.'}</p>{:else if ITEMS[item.itemId].category === 'equipment'}<p>Choose a unit below to equip.</p>{/if}
  </div>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if pendingCatch}<h3>Caught: {pendingCatch.name}</h3><p>Choose a team slot below to replace. Your catch is saved until placed.</p>{/if}
  {#if item && isBall(item.itemId) && targeting && !pendingCatch}
    <h3>Defeated opponents</h3><div class="inventory-team">{#each defeated.filter(c => !c.boss) as foe}<button disabled={disabled} onclick={async () => { if (await onaction({action: 'catch', item: item!.instanceId, target: foe.instanceId})) {selected = null; targeting = false;} }}><span class="unit-portrait"><Portrait unit={foe} /></span>{foe.name} · {foe.statRarity}</button>{:else}<p>Win a non-boss battle to catch an opponent.</p>{/each}</div>
  {/if}
  {#key used}{#if used}<p class="used" role="status">Used!</p>{/if}{/key}
  <h3>Your units</h3>
  <div class="inventory-team">{#each team as unit (unit.instanceId)}
    <button class="unit-target" disabled={disabled || !eligible(unit)} onclick={() => target(unit)} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); void target(unit, e.dataTransfer?.getData('text/plain')); }} aria-label={'Select ' + unit.name}>
      <span class="unit-portrait"><Portrait {unit} /><EquipmentIcons {unit} /></span>
      <span>{unit.name}</span><small>{unit.equipment?.length ?? 0}/3 equipped</small>
    </button>
  {/each}</div>
  {#if drugTarget}<dialog bind:this={dialog} oncancel={() => drugTarget = null} aria-label="Remove a passive ability"><h3>Remove an ability from {drugTarget.name}</h3>{#each abilityIds(drugTarget) as id}<button disabled={disabled} onclick={() => removeAbility(id)}>{abilityFor(id)?.title ?? id}</button>{/each}<button onclick={() => drugTarget = null}>Cancel</button></dialog>{/if}
</section>
<style>
  h2 { margin-top: 22px; } p, .muted { color: var(--muted); }
  .item-group { border-bottom: 1px solid var(--line); padding: 8px 0 18px; }
  .item-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .item { width: 64px; height: 64px; padding: 0; background: #303034; position: relative; }
  .item.selected { outline: 2px solid var(--accent); }
  .count { position: absolute; bottom: 0; left: 3px; color: #fff; font: bold 17px var(--mono); -webkit-text-stroke: .5px #fff; text-shadow: 1px 1px #000; }
  .item-tooltip { display: none; position: absolute; left: 0; top: 100%; background: #151515; border: 1px solid #777; padding: 12px; width: min(250px, 70vw); text-align: left; z-index: 10; font-size: 12px; }
  .item:hover .item-tooltip, .item:focus-visible .item-tooltip { display: block; }
  .selection { margin: 18px 0; padding: 12px; border-left: 2px solid var(--accent); }
  .inventory-team { display: flex; flex-wrap: wrap; gap: 16px; margin: 20px 0; }
  .inventory-team > button { width: 110px; padding: 8px; display: grid; gap: 7px; text-align: left; }
  .unit-portrait { display: block; position: relative; width: 100%; aspect-ratio: var(--character-portrait-ratio); background: #181818; }
  button:disabled { opacity: .35; } small { color: var(--muted); }
  .used { color: #ffb078; animation: used-fade 2s forwards; } @keyframes used-fade { to { opacity: 0; } }
  dialog { background: #101010; color: #e8e8e3; padding: 24px; border: 1px solid var(--accent); max-width: min(600px,calc(100% - 24px)); }
  dialog::backdrop { background: #000c; } dialog button { margin: 6px; }
</style>
