<script lang="ts">
  import { ITEMS, type ItemInstance } from '$lib/items';
  import type { JourneyCharacter } from '$lib/types';
  import type { InventoryAction } from '$lib/server/inventory';
  import Icon from './ItemIcon.svelte';
  import EquipmentIcons from './EquipmentIcons.svelte';
  let { inventory, team, disabled, onaction }: { inventory: ItemInstance[]; team: JourneyCharacter[]; disabled: boolean; onaction: (action: InventoryAction) => Promise<boolean> } = $props();
  let selected = $state<string | null>(null);
  let targeting = $state(false);
  let used = $state(0);
  const item = $derived(inventory.find(i => i.instanceId === selected));
  async function target(unit: JourneyCharacter, dragged?: string) {
    const chosen = inventory.find(i => i.instanceId === (dragged ?? selected));
    if (!chosen || unit.empty || disabled) return;
    const category = ITEMS[chosen.itemId].category;
    if (category !== 'equipment' && !(category === 'consumable' && targeting)) return;
    if (await onaction({ action: category === 'equipment' ? 'equip' : 'use', item: chosen.instanceId, target: unit.instanceId })) {
      if (category === 'consumable') used++;
      selected = null; targeting = false;
    }
  }
</script>
<section aria-label="Inventory">
  <h2>Inventory</h2><p>Drag equipment onto a unit, or select it and click a unit. Equipment stays attached until the unit is replaced. Three items maximum per unit.</p>
  {#each ['relic', 'equipment', 'consumable'] as category}
    <section class="item-group"><h3>{category === 'relic' ? 'Relics' : category === 'equipment' ? 'Equippables' : 'Consumables'}</h3>
      <div class="item-row">{#each inventory.filter(i => ITEMS[i.itemId].category === category) as entry (entry.instanceId)}
        <button class="item" class:selected={selected === entry.instanceId} disabled={disabled} draggable={category === 'equipment' && !disabled} ondragstart={(e) => { selected = entry.instanceId; e.dataTransfer?.setData('text/plain', entry.instanceId); }} onclick={() => { selected = entry.instanceId; targeting = false; }} aria-label={ITEMS[entry.itemId].name}>
          <Icon id={entry.itemId} /><span class="item-tooltip"><strong>{ITEMS[entry.itemId].name}</strong><br />{ITEMS[entry.itemId].description}</span>
        </button>
      {:else}<span class="muted">None yet.</span>{/each}</div>
    </section>
  {/each}
  {#if item}<div class="selection"><strong>{ITEMS[item.itemId].name}</strong><p>{ITEMS[item.itemId].description}</p>
    {#if ITEMS[item.itemId].category === 'consumable'}<button disabled={disabled} onclick={() => targeting = true}>USE</button>{/if}
    {#if targeting}<p role="status">Choose a unit below. This use is permanent.</p>{:else if ITEMS[item.itemId].category === 'equipment'}<p>Choose a unit below to equip.</p>{/if}
  </div>{/if}
  {#key used}{#if used}<p class="used" role="status">Used!</p>{/if}{/key}
  <h3>Your units</h3>
  <div class="inventory-team">{#each team as unit (unit.instanceId)}
    <button class="unit-target" disabled={disabled || unit.empty} onclick={() => target(unit)} ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); void target(unit, e.dataTransfer?.getData('text/plain')); }} aria-label={'Select ' + unit.name}>
      <span class="unit-portrait">{#if unit.image}<img src={unit.image} alt="" />{:else}<span>{unit.empty ? 'Empty' : unit.name}</span>{/if}<EquipmentIcons {unit} /></span>
      <span>{unit.name}</span><small>{unit.equipment?.length ?? 0}/3 equipped</small>
    </button>
  {/each}</div>
</section>
<style>
  h2 { margin-top: 22px; } p, .muted { color: var(--muted); }
  .item-group { border-bottom: 1px solid var(--line); padding: 8px 0 18px; }
  .item-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .item { width: 64px; height: 64px; padding: 0; background: #303034; position: relative; }
  .item.selected { outline: 2px solid var(--accent); }
  .item-tooltip { display: none; position: absolute; left: 0; top: 100%; background: #151515; border: 1px solid #777; padding: 12px; width: min(250px, 70vw); text-align: left; z-index: 10; font-size: 12px; }
  .item:hover .item-tooltip, .item:focus-visible .item-tooltip { display: block; }
  .selection { margin: 18px 0; padding: 12px; border-left: 2px solid var(--accent); }
  .inventory-team { display: flex; flex-wrap: wrap; gap: 16px; margin: 20px 0; }
  .unit-target { width: 110px; padding: 8px; display: grid; gap: 7px; text-align: left; }
  .unit-portrait { display: block; position: relative; height: 100px; background: #181818; }
  img { width: 100%; height: 100%; object-fit: cover; } small { color: var(--muted); }
  .used { color: #ffb078; animation: used-fade 2s forwards; } @keyframes used-fade { to { opacity: 0; } }
</style>
