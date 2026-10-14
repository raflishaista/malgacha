<script lang="ts">
  import EventPopup from './EventPopup.svelte';
  import { EVENTS, type JourneyEvent, type EventAction } from '$lib/events';
  import StageBanner from './StageBanner.svelte';
  import { STAGES, type StageId } from '$lib/stages';
  import JourneyInventory from './JourneyInventory.svelte';
  import ItemReward from './ItemReward.svelte';
  import type { ItemId, ItemInstance } from '$lib/items';
  import type { InventoryAction } from '$lib/server/inventory';
  import { onMount, tick } from 'svelte';
  import Card from './JourneyCharacter.svelte';
  import AutoBattle from './AutoBattle.svelte';
  import type { BattleReplay } from '$lib/battle/types';
  import type { JourneyCharacter } from '$lib/types';
  import { favoriteTotal } from '$lib/match';
  let { team, jobId, onreroll, parentBusy = false }: { team: JourneyCharacter[]; jobId: string; onreroll?: () => void; parentBusy?: boolean } = $props();
  let view = $state<'adventure' | 'battle' | 'inventory'>('adventure');
  let navigation: HTMLElement;
  let viewTop: HTMLDivElement;
  let lives = $state(3);
  let pendingLives = 3;
  let gameOver = $state(false);
  let resetNotice = $state('');
  let turbo = $state(true);
  function toggleTurbo() {
    turbo = !turbo;
    try { localStorage.setItem('malgacha-turbo-mode', String(turbo)); } catch { /* Storage is optional. */ }
  }
  async function show(next: 'adventure' | 'battle' | 'inventory', focus = false) {
    view = next;
    await tick();
    if (focus) navigation?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    viewTop?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  let inventory = $state<ItemInstance[]>([]);
  let itemReward = $state<{ id: string; choices: ItemId[] } | null>(null);
  async function inventoryAction(action?: InventoryAction): Promise<boolean> {
    busy = true; error = '';
    try {
      const response = await fetch('/api/imports/' + jobId + '/inventory', action ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) } : {});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Inventory unavailable.');
      inventory = data.inventory; itemReward = data.itemReward; replacementTeam = data.characters;
      lives = data.lives ?? 3;
      if (!action && data.encounter) {
        opponents = data.encounter.teams; events = data.encounter.events ?? [];
        stage = data.encounter.stage; displayedStage = stage ?? 'punk'; selected = data.encounter.selected ?? null;
        if (data.encounter.result) { result = data.encounter.result; fought = true; rewardUsed = !!data.encounter.rewardUsed; }
        eventOpen = !!(selected !== null && events[selected] && ['choice', 'target', 'reward'].includes(events[selected]!.status));
      }
      return true;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Inventory unavailable.'; return false; }
    finally { busy = false; }
  }
  onMount(() => {
    try { turbo = localStorage.getItem('malgacha-turbo-mode') !== 'false'; } catch { /* Storage is optional. */ }
    void inventoryAction();
  });
  let opponents = $state<JourneyCharacter[][]>([]);
  let selected = $state<number | null>(null);
  let events = $state<(JourneyEvent | null)[]>([]);
  let eventOpen = $state(false);
  const selectedEvent = $derived(selected === null ? null : events[selected]);
  async function eventAction(action: Omit<EventAction, 'index'>) {
    if (selected === null) return;
    busy = true; error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...action, index: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Event failed.');
      replacementTeam = data.characters; inventory = data.inventory; itemReward = data.itemReward; lives = data.lives;
      events = data.encounter.events; opponents = data.encounter.teams;
      stage = data.encounter.stage; displayedStage = stage ?? 'punk';
      if (events[selected]?.status === 'battle') { eventOpen = false; mode = 'idle'; await show('adventure', true); }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Event failed.'; }
    finally { busy = false; }
  }
  let stage = $state<StageId | undefined>();
  let rollingStage = $state(false);
  let displayedStage = $state<StageId>('punk');
  async function revealStage(value?: StageId) {
    stage = value;
    if (!value) return;
    rollingStage = true;
    const ids = Object.keys(STAGES) as StageId[];
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 12; i++) {
        displayedStage = ids[Math.floor(Math.random() * ids.length)];
        await new Promise(resolve => setTimeout(resolve, turbo ? 42.5 : 85));
      }
    }
    displayedStage = value; rollingStage = false;
  }
  let fought = $state(false);
  const bossEncounter = $derived(opponents.some(t => t.some(c => c.boss)));
  let mode = $state<'idle' | 'clout'>('idle');
  let replay = $state<BattleReplay | null>(null);
  let playing = $state(false);
  let busy = $state(false);
  let error = $state('');
  const enemy = $derived(selected === null ? null : opponents[selected]);
  let replacementTeam = $state<JourneyCharacter[] | null>(null);
  const currentTeam = $derived(replacementTeam ?? team);
  let result = $state<{ left: number; right: number; mode?: string; winner?: string } | null>(null);
  let rewardUsed = $state(false);
  const left = $derived(result?.left ?? favoriteTotal(currentTeam));
  const right = $derived(result?.right ?? (enemy ? favoriteTotal(enemy) : 0));
  const won = $derived(result?.winner ? result.winner === 'left' : left > right);
  const tied = $derived(result?.winner ? result.winner === 'draw' : left === right);
  async function battle(replace?: string) {
    busy = true; error = '';
    try {
      const response = await fetch('/api/imports/' + jobId + '/battle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opponent: selected, replace, mode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Battle failed.');
      inventory = data.inventory ?? inventory; itemReward = data.itemReward ?? null;
      pendingLives = data.lives ?? 3; gameOver = !!data.gameOver;
      events = data.encounter?.events ?? events;
      result = data.result; rewardUsed = data.rewardUsed; replacementTeam = data.characters;
      if (!replace && data.replay) { replay = data.replay; playing = true; void show('battle', true); } else { fought = true; lives = pendingLives; if (gameOver) resetNotice = 'Game over. A new run is ready: three lives, a new team, no items, and the floor counter reset.'; if (!replace) void show('battle', true); }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Battle failed.'; }
    finally { busy = false; }
  }
  async function depart() {
    busy = true; error = '';
    resetNotice = ''; gameOver = false;
    await show('adventure', true);
    try {
      const response = await fetch(`/api/imports/${jobId}/opponents`, { method: 'POST' });
      const result = await response.json().catch(() => { throw new Error(`Unexpected response (HTTP ${response.status}).`); });
      if (!response.ok) throw new Error(result.error || 'Could not find opponents.');
      opponents = result.teams; if (opponents[0]?.[0]?.boss) mode = 'idle'; selected = null; fought = false; rewardUsed = false; replay = null; playing = false; void show('adventure', true);
      events = result.events ?? []; eventOpen = false;
      await revealStage(result.stage);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not find opponents.'; }
    finally { busy = false; }
  }
  function finishBattle() {
    playing = false; fought = true; lives = pendingLives;
    if (gameOver) resetNotice = 'Game over. A new run is ready: three lives, a new team, no items, and the floor counter reset.';
    if (selectedEvent?.status === 'reward') eventOpen = true;
    void show('battle', true);
  }
  function clearEncounter() {
    opponents = []; selected = null; replay = null; playing = false; fought = false;
    result = null; stage = undefined; rollingStage = false; rewardUsed = false; gameOver = false;
    events = []; eventOpen = false;
  }
  function continueRun() {
    if (gameOver) clearEncounter();
    void show('adventure', true);
  }
  async function resetRun() {
    busy = true; error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/reset`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reset failed.');
      clearEncounter(); lives = data.lives; inventory = data.inventory; itemReward = null; replacementTeam = data.characters;
      resetNotice = 'New run started. Three lives, a new team, no items, and the floor counter reset.';
      await show('adventure', true);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Reset failed.'; }
    finally { busy = false; }
  }
</script>

<div bind:this={viewTop} class="view-top"></div>
<nav class="journey-tabs" aria-label="Journey views" bind:this={navigation}><button aria-pressed={view === 'adventure'} onclick={() => show('adventure')}>Adventure</button><button aria-pressed={view === 'battle'} disabled={!replay && !fought} onclick={() => show('battle')}>Battle{playing ? ' · In progress' : ''}</button><button aria-pressed={view === 'inventory'} onclick={() => show('inventory')}>Inventory</button><span class="lives" role="status" aria-label={`${lives} of 3 lives remaining`}>Lives {#each [1, 2, 3] as life}<span class="orb" class:lost={life > lives} aria-hidden="true"></span>{/each}</span></nav>
{#if resetNotice}<p class="reset-notice" role="status">{resetNotice}</p>{/if}
<div class="turbo-controls"><button type="button" aria-pressed={turbo} onclick={toggleTurbo}>Turbo Mode{turbo ? ' · ON' : ' · OFF'}</button><span>{turbo ? '2× battle speed' : 'Normal battle speed'}</span></div>
{#if itemReward && !playing}<ItemReward choices={itemReward.choices} {busy} {error} onchoose={(item) => inventoryAction({ action: 'claim', item, reward: itemReward!.id })} />{/if}
{#if eventOpen && selectedEvent && !playing && !itemReward}<EventPopup event={selectedEvent} team={currentTeam} {busy} {error} onchoice={(choice) => eventAction({ choice })} ontarget={(target) => eventAction({ target })} onclose={() => { eventOpen = false; if (selectedEvent?.status === 'choice') selected = null; }} />{/if}
<section hidden={view !== 'inventory'} aria-label="Inventory view"><JourneyInventory {inventory} team={currentTeam} disabled={busy || playing || parentBusy} onaction={inventoryAction} />{#if error}<p role="alert">{error}</p>{/if}</section>
<section hidden={view !== 'battle'} aria-label="Battle view">
{#if replay}<AutoBattle {replay} {turbo} onfinish={finishBattle} />{/if}
{#if fought}<div class="actions"><div class="result" role="status"><strong>{tied ? 'Draw!' : won ? 'Your team wins!' : 'Opponent wins!'}</strong><p>{left.toLocaleString()} – {right.toLocaleString()} {result?.mode === 'idle' ? 'units remaining' : 'favorites'}</p></div><button class="fight-button primary" onclick={continueRun}>CONTINUE</button></div>{/if}
</section>
<div hidden={view !== 'adventure'}>
<button class="reset-button" disabled={busy || parentBusy} onclick={resetRun}>New game / reset (testing)</button>
<span class="note">Resets your floor, team, lives, and all items.</span>
{#if stage && !bossEncounter}<StageBanner stage={displayedStage} rolling={rollingStage} />{/if}
{#if stage && mode === 'clout'}<p class="note">Stage effects apply to Autobattler. Cloutscaling still compares favorites.</p>{/if}
{#if onreroll}<button disabled={parentBusy || busy || playing} onclick={onreroll}>Reroll team (testing)</button>{/if}
{#if playing}<p role="status">Battle in progress. You can view your team here while it runs.</p>{/if}
<fieldset disabled={busy || playing || fought || bossEncounter || !!selectedEvent}><legend>Battle mode</legend><label><input type="radio" bind:group={mode} value="idle" /> Autobattler</label><label><input type="radio" bind:group={mode} value="clout" /> Cloutscaling</label></fieldset>

<div class="encounter" class:departed={opponents.length > 0}>
  <section aria-label="Your team"><h3>Your team</h3><div class="units">{#each currentTeam as character (character.instanceId)}<div><Card {character} team={currentTeam} />{#if fought && won && !rewardUsed}<button disabled={busy} onclick={() => battle(character.instanceId)}>{character.empty ? 'Fill this slot' : 'Replace this member'}</button>{/if}</div>{/each}</div></section>
  {#if opponents.length && !rollingStage}<section aria-label="Opponents">
    {#if selectedEvent && selectedEvent.status !== 'battle' && !fought}<h3>{EVENTS[selectedEvent.id].title}</h3><p>{selectedEvent.status === 'complete' ? 'Event complete.' : 'Choose an event option to continue.'}</p>{#if selectedEvent.status !== 'complete'}<button onclick={() => eventOpen = true}>Open event</button>{/if}
    {:else if enemy}
      <h3>Opponent {selected! + 1}</h3>
      {#if !fought && !playing && !selectedEvent}<button disabled={busy} onclick={() => selected = null}>Choose another opponent</button>{/if}
      <div class="units">{#each enemy as character (character.instanceId)}<Card {character} team={enemy} hideFavorites={!fought} />{/each}</div>
    {:else}
      <h3>Choose an opponent</h3>
      <div class="options">{#each opponents as opponent, index}
        {#if events[index]}<button class="option event-option" disabled={busy} onclick={() => { selected = index; eventOpen = true; }}>Event!</button>{:else if opponent[0]?.boss}<div class="boss-option"><h2>BOSS</h2><Card character={opponent[0]} hideFavorites /><button class="primary" onclick={() => { selected = index; fought = false; }}>Challenge boss</button><p>Passive preview only; boss abilities are inactive.</p></div>{:else}<button class="option" onclick={() => { selected = index; fought = false; }}>
          <span>Opponent {index + 1}</span>
          <span class="mini-team">{#each opponent as character}<span>{#if character.image}<img src={character.image} alt="" />{:else}<span class="placeholder">—</span>{/if}<span>{character.name}</span></span>{/each}</span>
        </button>{/if}
      {/each}</div>
    {/if}
  </section>{/if}
</div>
{#if error}<p role="alert">{error}</p>{/if}
<div class="actions">
  {#if !opponents.length}<button class="fight-button primary" disabled={busy} onclick={depart}>{busy ? 'Finding opponents…' : 'DEPART'}</button>
  {:else if selectedEvent?.status === 'complete' && !fought}<button class="fight-button primary" disabled={busy || !!itemReward} onclick={depart}>NEXT FLOOR</button>
  {:else if enemy && !fought && !playing}<button class="fight-button primary" disabled={busy} onclick={() => battle()}>FIGHT</button>
  {:else if fought}
    <div class="result" role="status"><strong>{tied ? 'Draw!' : won ? 'Your team wins!' : 'Opponent wins!'}</strong><p>{left.toLocaleString()} – {right.toLocaleString()} {result?.mode === 'idle' ? 'units remaining' : 'favorites'}</p></div>
    {#if won}<p>{rewardUsed ? 'Replacement saved.' : 'Victory reward: replace one member above, or continue with your team.'}</p>{/if}
    <button class="fight-button primary" disabled={busy} onclick={depart}>{busy ? 'Finding opponents…' : 'NEXT OPPONENTS'}</button>
  {/if}
</div>
{#if opponents.length}<p class="note">Opponents come from your imported pool. Unknown favorites count as zero. Encounters reset on reload; your saved team stays the same.</p>{/if}

</div>

<style>
  .view-top { scroll-margin-top: 8px; }
  .turbo-controls { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
  .turbo-controls span { color: var(--muted); font: 12px var(--mono); }
  .turbo-controls button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #080808; }
  .event-option { min-height: 140px; text-align: center; color: var(--accent); font-size: 28px; }
  .lives { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; white-space: nowrap; font-size: 13px; }
  .orb { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: 1px solid var(--accent); }
  .orb.lost { background: transparent; opacity: .3; }
  .reset-button { margin: 14px 10px 14px 0; }
  .reset-notice { border: 1px solid var(--accent); padding: 14px; }
  @media (max-width: 520px) {
    .journey-tabs { gap: 5px; }
    .journey-tabs button { padding: 8px 5px; font-size: 11px; }
    .lives { font-size: 11px; gap: 4px; }
    .orb { width: 10px; height: 10px; }
  }
  [hidden] { display: none !important; }
  .journey-tabs { position: sticky; top: 0; z-index: 20; background: #080808; display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0; border-bottom: 1px solid var(--purple-line); scroll-margin-top: 8px; }
  .journey-tabs button[aria-pressed="true"] { background: var(--accent); color: #080808; border-color: var(--accent); }
  .boss-option { border: 2px solid #ed404a; padding: 18px; max-width: 360px; }
  .boss-option h2 { color: #ed404a; font-size: 32px; margin-bottom: 14px; }
  fieldset { display: flex; gap: 20px; border: 1px solid var(--purple-line); margin: 20px 0; }
  fieldset label { margin: 0; }
  .encounter.departed { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  section { min-width: 0; }
  .departed > section + section { border-left: 1px solid var(--purple-line); padding-left: 28px; }
  .units { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
  .departed .units { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .options { display: grid; gap: 18px; }
  .option { text-align: left; width: 100%; padding: 12px; }
  .option:hover { border-color: var(--accent); }
  .mini-team { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
  .mini-team > span { min-width: 0; font-size: 10px; overflow-wrap: anywhere; }
  .mini-team img, .placeholder { display: block; width: 100%; max-width: 225px; aspect-ratio: var(--character-portrait-ratio); object-fit: contain; background: #222; }
  .actions { text-align: center; margin: 32px 0; }
  .result { font-size: 26px; margin: 24px 0; }
  .result strong { font-size: 34px; color: var(--accent); }
  .note { color: var(--muted); }
  .fight-button:not(:disabled) { box-shadow: 4px 4px 0 #75163f; transform: translate(-2px, -2px); }
  .fight-button:not(:disabled):active { box-shadow: none; transform: translate(2px, 2px); }
  @media (max-width: 800px) { .encounter.departed { grid-template-columns: 1fr; } .departed > section + section { border-left: 0; border-top: 1px solid var(--purple-line); padding: 20px 0 0; } .units { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 480px) { .units, .departed .units { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
