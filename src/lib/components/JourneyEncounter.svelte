<script lang="ts">
  import { onMount, tick } from 'svelte';
  import FusionNotice from './FusionNotice.svelte';
  import JourneyWish from './JourneyWish.svelte';
  import EventPopup from './EventPopup.svelte';
  import StageBanner from './StageBanner.svelte';
  import JourneyInventory from './JourneyInventory.svelte';
  import ItemReward from './ItemReward.svelte';
  import Card from './JourneyCharacter.svelte';
  import AutoBattle from './AutoBattle.svelte';
  import { relicCount, rerollFilter, type ItemId, type ItemInstance } from '$lib/items';
  import { bossFor } from '$lib/bosses';
  import { STAGE_REVEAL_STEP_MS } from '$lib/battle/playback';
  import { EVENTS, eventCharacter, type JourneyEvent, type EventAction } from '$lib/events';
  import { STAGES, type StageId } from '$lib/stages';
  import type { InventoryAction } from '$lib/server/inventory';
  import type { BattleReplay } from '$lib/battle/types';
  import type { JourneyCharacter } from '$lib/types';
  import { favoriteTotal } from '$lib/match';

  let {
    team,
    jobId,
    onreroll,
    parentBusy = false
  }: {
    team: JourneyCharacter[];
    jobId: string;
    onreroll?: () => void;
    parentBusy?: boolean;
  } = $props();

  // Navigation & Views
  let view = $state<'adventure' | 'battle' | 'inventory' | 'wish'>('adventure');
  let navigation: HTMLElement;
  let viewTop: HTMLDivElement;

  async function showView(next: 'adventure' | 'battle' | 'inventory' | 'wish', focus = false) {
    view = next;
    await tick();
    if (focus) {
      navigation?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    }
    viewTop?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  // Inventory & Rewards
  let inventory = $state<ItemInstance[]>([]);
  let itemReward = $state<{ id: string; choices: ItemId[] } | null>(null);
  let pendingCatch = $state<JourneyCharacter | null>(null);
  let pendingWildCard = $state<JourneyCharacter | null>(null);
  let itemNotice = $state('');
  let fusionNotice = $state(false);
  const egoNpc = eventCharacter(178715);

  // Run Life & Progression
  let lives = $state(3);
  let pendingLives = 3;
  let gameOver = $state(false);
  let resetNotice = $state('');

  // Encounters & Enemies
  let opponents = $state<JourneyCharacter[][]>([]);
  let selected = $state<number | null>(null);
  let events = $state<(JourneyEvent | null)[]>([]);
  let eventOpen = $state(false);
  const selectedEvent = $derived(selected === null ? null : events[selected]);

  // Stage selection
  let stage = $state<StageId | undefined>();
  let rollingStage = $state(false);
  let displayedStage = $state<StageId>('punk');

  // Combat State
  let fought = $state(false);
  const bossEncounter = $derived(opponents.some(t => t.some(c => c.boss)));
  let mode = $state<'idle' | 'clout'>('idle');
  let replay = $state<BattleReplay | null>(null);
  let retryReplay = $state<BattleReplay | null>(null);
  let playing = $state(false);
  let busy = $state(false);
  let error = $state('');

  let replacementTeam = $state<JourneyCharacter[] | null>(null);
  const currentTeam = $derived(replacementTeam ?? team);
  const enemy = $derived(selected === null ? null : opponents[selected]);

  let result = $state<{ left: number; right: number; mode?: string; winner?: string } | null>(null);
  let rewardUsed = $state(false);
  const left = $derived(result?.left ?? favoriteTotal(currentTeam));
  const right = $derived(result?.right ?? (enemy ? favoriteTotal(enemy) : 0));
  const won = $derived(result?.winner ? result.winner === 'left' : left > right);
  const tied = $derived(result?.winner ? result.winner === 'draw' : left === right);

  async function inventoryAction(action?: InventoryAction): Promise<boolean> {
    busy = true;
    error = '';
    try {
      const response = await fetch(
        `/api/imports/${jobId}/inventory`,
        action
          ? {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(action)
            }
          : {}
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Inventory unavailable.');

      inventory = data.inventory;
      itemReward = data.itemReward;
      replacementTeam = data.characters;
      pendingCatch = data.pendingCatch;
      pendingWildCard = data.pendingWildCard ?? null;
      itemNotice = data.itemNotice;
      fusionNotice = data.fusionNotice;

      if (view === 'wish' && relicCount(inventory, 'dragonball') < 7) {
        void showView('inventory');
      }
      lives = data.lives ?? 3;

      if (!action && data.encounter) {
        opponents = data.encounter.teams;
        events = data.encounter.events ?? [];
        stage = data.encounter.stage;
        displayedStage = stage ?? 'punk';
        selected = data.encounter.selected ?? null;

        if (data.encounter.result) {
          result = data.encounter.result;
          fought = true;
          rewardUsed = !!data.encounter.rewardUsed;
        }
        eventOpen = !!(
          selected !== null &&
          events[selected] &&
          ['choice', 'target', 'confirm', 'play', 'reward'].includes(events[selected]!.status)
        );
      }
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Inventory unavailable.';
      return false;
    } finally {
      busy = false;
    }
  }

  async function eventAction(action: Omit<EventAction, 'index'>) {
    if (selected === null) return;
    busy = true;
    error = '';
    let startEventBattle = false;
    try {
      const response = await fetch(`/api/imports/${jobId}/event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...action, index: selected })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Event failed.');

      replacementTeam = data.characters;
      inventory = data.inventory;
      itemReward = data.itemReward;
      pendingWildCard = data.pendingWildCard ?? null;
      lives = data.lives;
      events = data.encounter.events;
      opponents = data.encounter.teams;
      stage = data.encounter.stage;
      displayedStage = stage ?? 'punk';

      if (events[selected]?.status === 'battle') {
        eventOpen = false;
        mode = 'idle';
        startEventBattle = true;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Event failed.';
    } finally {
      busy = false;
    }
    if (startEventBattle) {
      await battle();
    }
  }

  async function revealStage(value?: StageId) {
    stage = value;
    if (!value) return;
    rollingStage = true;
    const ids = Object.keys(STAGES) as StageId[];

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 12; i++) {
        displayedStage = ids[Math.floor(Math.random() * ids.length)];
        await new Promise(resolve => setTimeout(resolve, STAGE_REVEAL_STEP_MS));
      }
    }
    displayedStage = value;
    rollingStage = false;
  }

  async function battle(replace?: string) {
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/battle`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opponent: selected, replace, mode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Battle failed.');

      inventory = data.inventory ?? inventory;
      itemReward = data.itemReward ?? null;
      pendingWildCard = data.pendingWildCard ?? null;
      pendingLives = data.lives ?? 3;
      gameOver = !!data.gameOver;
      events = data.encounter?.events ?? events;
      result = data.result;
      rewardUsed = data.rewardUsed;
      replacementTeam = data.characters;

      if (!replace && data.replay) {
        retryReplay = data.replay.initialAttempt ? data.replay : null;
        replay = data.replay.initialAttempt ?? data.replay;
        playing = true;
        void showView('battle', true);
      } else {
        fought = true;
        lives = pendingLives;
        if (gameOver) {
          resetNotice = 'Game over. A new run is ready: three lives, a new team, no items, and the floor counter reset.';
        }
        if (!replace) void showView('battle', true);
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Battle failed.';
    } finally {
      busy = false;
    }
  }

  async function depart() {
    busy = true;
    error = '';
    resetNotice = '';
    gameOver = false;
    await showView('adventure', true);

    try {
      const response = await fetch(`/api/imports/${jobId}/opponents`, { method: 'POST' });
      const res = await response.json().catch(() => {
        throw new Error(`Unexpected response (HTTP ${response.status}).`);
      });
      if (!response.ok) throw new Error(res.error || 'Could not find opponents.');

      opponents = res.teams;
      if (opponents[0]?.[0]?.boss) mode = 'idle';
      selected = null;
      fought = false;
      rewardUsed = false;
      replay = null;
      playing = false;
      void showView('adventure', true);
      events = res.events ?? [];
      eventOpen = false;
      await revealStage(res.stage);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not find opponents.';
    } finally {
      busy = false;
    }
  }

  function finishBattle() {
    if (retryReplay) {
      replay = retryReplay;
      retryReplay = null;
      itemNotice = (replay.retryTitle ?? 'Future Machine No. 8') + ' resets the battle. The first attempt costs no life.';
      return;
    }
    playing = false;
    fought = true;
    lives = pendingLives;

    if (gameOver) {
      resetNotice = 'Game over. A new run is ready: three lives, a new team, no items, and the floor counter reset.';
    }
    if (
      selectedEvent &&
      (selectedEvent.status === 'reward' ||
        (selectedEvent.status === 'complete' && selectedEvent.outcome))
    ) {
      eventOpen = true;
    }
    void showView('battle', true);
  }

  function clearEncounter() {
    opponents = [];
    selected = null;
    replay = null;
    playing = false;
    fought = false;
    result = null;
    stage = undefined;
    rollingStage = false;
    rewardUsed = false;
    gameOver = false;
    retryReplay = null;
    events = [];
    eventOpen = false;
  }

  function continueRun() {
    if (gameOver) clearEncounter();
    void showView('adventure', true);
  }

  async function resetRun() {
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/reset`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reset failed.');

      clearEncounter();
      lives = data.lives;
      inventory = data.inventory;
      itemReward = null;
      replacementTeam = data.characters;
      pendingCatch = null;
      pendingWildCard = null;
      itemNotice = '';
      fusionNotice = false;
      resetNotice = 'New run started. Three lives, a new team, no items, and the floor counter reset.';
      await showView('adventure', true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Reset failed.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void inventoryAction();
  });
</script>

<div bind:this={viewTop} class="view-top"></div>

<nav class="journey-tabs" aria-label="Journey views" bind:this={navigation}>
  <button aria-pressed={view === 'adventure'} onclick={() => showView('adventure')}>
    Adventure
  </button>
  <button
    aria-pressed={view === 'battle'}
    disabled={!replay && !fought}
    onclick={() => showView('battle')}
  >
    Battle{playing ? ' · In progress' : ''}
  </button>
  <button aria-pressed={view === 'inventory'} onclick={() => showView('inventory')}>
    Inventory
  </button>
  {#if relicCount(inventory, 'dragonball') >= 7}
    <button aria-pressed={view === 'wish'} onclick={() => showView('wish')}>
      Wish
    </button>
  {/if}

  <span class="lives" role="status" aria-label={`${lives} of 3 lives remaining`}>
    Lives
    {#each [1, 2, 3] as life}
      <span class="orb" class:lost={life > lives} aria-hidden="true"></span>
    {/each}
  </span>
</nav>

{#if resetNotice}
  <p class="reset-notice" role="status">{resetNotice}</p>
{/if}

{#if fusionNotice}
  <FusionNotice oncontinue={() => inventoryAction({ action: 'dismiss-fusion' })} />
{/if}

{#if eventOpen && selectedEvent && !playing}
  <EventPopup
    event={selectedEvent}
    team={currentTeam}
    {busy}
    {error}
    onchoice={(choice) => eventAction({ choice })}
    ontarget={(target) => eventAction({ target })}
    onaction={(act) => eventAction(act)}
    onclose={() => {
      eventOpen = false;
      if (
        selectedEvent?.status === 'choice' &&
        selectedEvent.id !== 'parasyte' &&
        selectedEvent.id !== 'rocket'
      ) {
        selected = null;
      }
    }}
  />
{/if}

{#if itemReward && !playing && !eventOpen}
  <ItemReward
    choices={itemReward.choices}
    {busy}
    {error}
    onchoose={(item) => inventoryAction({ action: 'claim', item, reward: itemReward!.id })}
  />
{/if}

{#if pendingWildCard && !playing && !eventOpen && !itemReward}
  <div class="wildcard-backdrop" role="presentation">
    <dialog class="wildcard-modal" open aria-labelledby="wildcard-return-title">
      <header class="wildcard-header">
        <span class="wildcard-kicker">WILD CARD RETURN</span>
        <h2 id="wildcard-return-title">Ego’s Wild Card</h2>
      </header>
      <div class="wildcard-body">
        {#if egoNpc.image}
          <figure class="wildcard-npc">
            <img src={egoNpc.image} alt={egoNpc.name} />
            <figcaption>{egoNpc.name}</figcaption>
          </figure>
        {/if}
        <div class="wildcard-quote-box">
          <p class="wildcard-quote">“Your {pendingWildCard.name} is back. A beast is born.”</p>
          <p class="wildcard-sub">{pendingWildCard.name} returned with +50 to all stats and the WILD CARD keyword!</p>
        </div>
        <div class="wildcard-featured">
          <Card character={pendingWildCard} />
        </div>
        <p class="wildcard-prompt">Choose a slot for {pendingWildCard.name} to reclaim:</p>
        <div class="wildcard-units">
          {#each currentTeam as unit (unit.instanceId)}
            <div class="wildcard-slot">
              <Card character={unit} team={currentTeam} />
              <button
                class="primary"
                disabled={busy}
                onclick={() => inventoryAction({ action: 'place-wildcard', target: unit.instanceId })}
              >
                {unit.empty ? 'Fill empty slot' : `Replace ${unit.name}`}
              </button>
            </div>
          {/each}
        </div>
        {#if error}
          <p role="alert" class="wildcard-error">{error}</p>
        {/if}
      </div>
    </dialog>
  </div>
{/if}

<section hidden={view !== 'inventory'} aria-label="Inventory view">
  <JourneyInventory
    {inventory}
    team={currentTeam}
    defeated={fought && won ? enemy ?? [] : []}
    {pendingCatch}
    notice={itemNotice}
    disabled={busy || playing || parentBusy}
    onaction={inventoryAction}
  />
  {#if error}
    <p role="alert">{error}</p>
  {/if}
</section>

<section hidden={view !== 'battle'} aria-label="Battle view">
  {#if replay}
    {#key replay}
      <AutoBattle {replay} onfinish={finishBattle} />
    {/key}
  {/if}

  {#if itemNotice}
    <p role="status">{itemNotice}</p>
  {/if}

  {#if fought}
    <div class="actions">
      <div class="result" role="status">
        <strong>{tied ? 'Draw!' : won ? 'Your team wins!' : 'Opponent wins!'}</strong>
        <p>
          {left.toLocaleString()} – {right.toLocaleString()}
          {result?.mode === 'idle' ? 'units remaining' : 'favorites'}
        </p>
      </div>
      <button class="fight-button primary" onclick={continueRun}>CONTINUE</button>
    </div>
  {/if}
</section>

<section hidden={view !== 'wish'}>
  {#if relicCount(inventory, 'dragonball') >= 7}
    <JourneyWish
      {jobId}
      team={currentTeam}
      disabled={busy || playing}
      onaction={inventoryAction}
      oncancel={() => showView('adventure')}
    />
  {/if}
</section>

<div hidden={view !== 'adventure'}>
  <button class="reset-button" disabled={busy || parentBusy} onclick={resetRun}>
    New game / reset (testing)
  </button>
  <span class="note">Resets your floor, team, lives, and all items.</span>

  {#if stage && !bossEncounter}
    <StageBanner stage={displayedStage} rolling={rollingStage} />
  {/if}

  {#if stage && mode === 'clout'}
    <p class="note">Stage effects apply to Autobattler. Cloutscaling still compares favorites.</p>
  {/if}

  {#if playing}
    <p role="status">Battle in progress. You can view your team here while it runs.</p>
  {/if}

  <fieldset disabled={busy || playing || fought || bossEncounter || !!selectedEvent}>
    <legend>Battle mode</legend>
    <label><input type="radio" bind:group={mode} value="idle" /> Autobattler</label>
    <label><input type="radio" bind:group={mode} value="clout" /> Cloutscaling</label>
  </fieldset>

  <div class="encounter" class:departed={opponents.length > 0}>
    <section aria-label="Your team">
      <h3>Your team</h3>
      {#if fought && won && !rewardUsed && rerollFilter(inventory)}
        <p>Current filter power: &gt;{rerollFilter(inventory)} favorites</p>
      {/if}

      <div class="units">
        {#each currentTeam as character (character.instanceId)}
          <div>
            <Card {character} team={currentTeam} />
            {#if fought && won && !rewardUsed}
              <button disabled={busy} onclick={() => battle(character.instanceId)}>
                {character.empty ? 'Fill this slot' : 'Replace this member'}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    {#if opponents.length && !rollingStage}
      <section aria-label="Opponents">
        {#if stage === 'alcatraz' && opponents.length >= 3 && !fought}
          <div class="alcatraz-preview-screen">
            <div class="alcatraz-preview-header">
              <span class="alcatraz-badge">BATTLE ROYALE</span>
              <h3>Alcatraz Tower: 4-Way Battle Royale</h3>
              <p>All teams on this floor will battle each other simultaneously!</p>
            </div>
            <div class="alcatraz-preview-layout">
              <!-- Top: Team 1 (Opponent 1) -->
              <div class="alcatraz-preview-team top-team">
                <span class="team-tag t1">TEAM 1 (OPPONENT 1)</span>
                <div class="team-chips">
                  {#each opponents[0] as c}
                    <span class="chip">{c.name}</span>
                  {/each}
                </div>
              </div>

              <div class="alcatraz-preview-middle">
                <!-- Left: Team 4 (Opponent 3) -->
                <div class="alcatraz-preview-team left-team">
                  <span class="team-tag t4">TEAM 4 (OPPONENT 3)</span>
                  <div class="team-chips vertical">
                    {#each opponents[2] as c}
                      <span class="chip">{c.name}</span>
                    {/each}
                  </div>
                </div>

                <!-- Center: Arena preview -->
                <div class="alcatraz-preview-arena">
                  <span class="swords">⚔️</span>
                  <strong>FREE-FOR-ALL</strong>
                  <span>4 TEAMS · 20 HEROES</span>
                </div>

                <!-- Right: Team 2 (Opponent 2) -->
                <div class="alcatraz-preview-team right-team">
                  <span class="team-tag t2">TEAM 2 (OPPONENT 2)</span>
                  <div class="team-chips vertical">
                    {#each opponents[1] as c}
                      <span class="chip">{c.name}</span>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Bottom: Team 3 (Your Team) -->
              <div class="alcatraz-preview-team bottom-team">
                <span class="team-tag t3 player">TEAM 3 (YOUR TEAM)</span>
                <div class="team-chips">
                  {#each currentTeam as c}
                    <span class="chip player-chip">{c.name}</span>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {:else if selectedEvent && selectedEvent.status !== 'battle' && !fought}
          <h3>{EVENTS[selectedEvent.id].title}</h3>
          <p>{selectedEvent.status === 'complete' ? 'Event complete.' : 'Choose an event option to continue.'}</p>
          {#if selectedEvent.status !== 'complete'}
            <button onclick={() => (eventOpen = true)}>Open event</button>
          {/if}
        {:else if enemy}
          <h3>Opponent {selected! + 1}</h3>
          {#if !fought && !playing && !selectedEvent}
            <button disabled={busy} onclick={() => (selected = null)}>
              Choose another opponent
            </button>
          {/if}
          <div class="units">
            {#if stage === 'inaba' && !fought}
              <div class="inaba-selected-box">
                <span class="inaba-mystery-large">???</span>
                <p>A thick fog obscures the truth of your opponent’s identity…</p>
              </div>
            {:else}
              {#each enemy as character (character.instanceId)}
                <Card {character} team={enemy} hideFavorites={!fought} />
              {/each}
            {/if}
          </div>
        {:else}
          <h3>Choose an opponent</h3>
          <div class="options">
            {#each opponents as opponent, index}
              {#if events[index]}
                <button
                  class="option event-option"
                  disabled={busy}
                  onclick={() => {
                    selected = index;
                    eventOpen = true;
                  }}
                >
                  Event!
                </button>
              {:else if opponent[0]?.boss}
                <div class="boss-option">
                  <h2>BOSS</h2>
                  <Card character={opponent[0]} hideFavorites />
                  <button class="primary" onclick={() => { selected = index; fought = false; }}>
                    Challenge boss
                  </button>
                  {#if !bossFor(opponent[0])?.active}
                    <p>Passive preview only; this boss ability is inactive.</p>
                  {/if}
                </div>
              {:else}
                <button
                  class="option"
                  onclick={() => {
                    selected = index;
                    fought = false;
                  }}
                >
                  <span>Opponent {index + 1}</span>
                  {#if stage === 'inaba'}
                    <div class="inaba-box">
                      <span class="inaba-mystery">???</span>
                    </div>
                  {:else}
                    <span class="mini-team">
                      {#each opponent as character}
                        <span>
                          {#if character.image}
                            <img src={character.image} alt="" />
                          {:else}
                            <span class="placeholder">—</span>
                          {/if}
                          <span>{character.name}</span>
                        </span>
                      {/each}
                    </span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>

  {#if error}
    <p role="alert">{error}</p>
  {/if}

  <div class="actions">
    {#if !opponents.length}
      <button class="fight-button primary" disabled={busy || !!itemReward || !!pendingWildCard} onclick={depart}>
        {busy
          ? 'Finding opponents…'
          : itemReward
            ? 'CLAIM REWARD TO PROCEED'
            : pendingWildCard
              ? 'PLACE WILD CARD TO PROCEED'
              : 'DEPART'}
      </button>
    {:else if selectedEvent?.status === 'complete' && !fought}
      <button class="fight-button primary" disabled={busy || !!itemReward || !!pendingWildCard} onclick={depart}>
        {itemReward
          ? 'CLAIM REWARD TO PROCEED'
          : pendingWildCard
            ? 'PLACE WILD CARD TO PROCEED'
            : 'NEXT FLOOR'}
      </button>
    {:else if stage === 'alcatraz' && !fought && !playing}
      <button class="fight-button primary" disabled={busy || !!itemReward || !!pendingWildCard} onclick={() => { selected = 0; void battle(); }}>
        ENTER BATTLE ROYALE
      </button>
    {:else if enemy && !fought && !playing}
      <button class="fight-button primary" disabled={busy || !!itemReward || !!pendingWildCard} onclick={() => battle()}>
        FIGHT
      </button>
    {:else if fought}
      <div class="result" role="status">
        <strong>{tied ? 'Draw!' : won ? 'Your team wins!' : 'Opponent wins!'}</strong>
        <p>
          {left.toLocaleString()} – {right.toLocaleString()}
          {result?.mode === 'idle' ? 'units remaining' : 'favorites'}
        </p>
      </div>

      {#if won && !bossEncounter}
        <button onclick={() => showView('inventory')}>
          Use a ball on a defeated opponent
        </button>
      {/if}
      {#if won && !selectedEvent}
        <p>
          {rewardUsed
            ? 'Replacement saved.'
            : 'Victory reward: replace one member above, or continue with your team.'}
        </p>
      {/if}

      <button class="fight-button primary" disabled={busy || !!itemReward || !!pendingWildCard} onclick={depart}>
        {busy
          ? 'Finding opponents…'
          : itemReward
            ? 'CLAIM REWARD TO PROCEED'
            : pendingWildCard
              ? 'PLACE WILD CARD TO PROCEED'
              : 'NEXT OPPONENTS'}
      </button>
    {/if}
  </div>

</div>

<style>
  .view-top {
    scroll-margin-top: 8px;
  }
  .event-option {
    min-height: 140px;
    text-align: center;
    color: var(--accent);
    font-size: 28px;
  }
  .lives {
    margin-left: auto;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    white-space: nowrap;
    font-size: 13px;
  }
  .orb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 1px solid var(--accent);
  }
  .orb.lost {
    background: transparent;
    opacity: 0.3;
  }
  .reset-button {
    margin: 14px 10px 14px 0;
  }
  .reset-notice {
    border: 1px solid var(--accent);
    padding: 14px;
  }
  @media (max-width: 520px) {
    .journey-tabs {
      gap: 5px;
    }
    .journey-tabs button {
      padding: 8px 5px;
      font-size: 11px;
    }
    .lives {
      font-size: 11px;
      gap: 4px;
    }
    .orb {
      width: 10px;
      height: 10px;
    }
  }
  [hidden] {
    display: none !important;
  }
  .journey-tabs {
    position: sticky;
    top: 0;
    z-index: 20;
    background: #080808;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 0;
    border-bottom: 1px solid var(--purple-line);
    scroll-margin-top: 8px;
  }
  .journey-tabs button[aria-pressed='true'] {
    background: var(--accent);
    color: #080808;
    border-color: var(--accent);
  }
  .boss-option {
    border: 2px solid #ed404a;
    padding: 18px;
    max-width: 360px;
  }
  .boss-option h2 {
    color: #ed404a;
    font-size: 32px;
    margin-bottom: 14px;
  }
  fieldset {
    display: flex;
    gap: 20px;
    border: 1px solid var(--purple-line);
    margin: 20px 0;
  }
  fieldset label {
    margin: 0;
  }
  .encounter.departed {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  section {
    min-width: 0;
  }
  .departed > section + section {
    border-left: 1px solid var(--purple-line);
    padding-left: 28px;
  }
  .units {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
    margin: 24px 0;
  }
  .departed .units {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .options {
    display: grid;
    gap: 18px;
  }
  .option {
    text-align: left;
    width: 100%;
    padding: 12px;
  }
  .option:hover {
    border-color: var(--accent);
  }
  .mini-team {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .mini-team > span {
    min-width: 0;
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .mini-team img,
  .placeholder {
    display: block;
    width: 100%;
    max-width: 225px;
    aspect-ratio: var(--character-portrait-ratio);
    object-fit: contain;
    background: #222;
  }
  .actions {
    text-align: center;
    margin: 32px 0;
  }
  .result {
    font-size: 26px;
    margin: 24px 0;
  }
  .result strong {
    font-size: 34px;
    color: var(--accent);
  }
  .note {
    color: var(--muted);
  }
  .fight-button:not(:disabled) {
    box-shadow: 4px 4px 0 #75163f;
    transform: translate(-2px, -2px);
  }
  .fight-button:not(:disabled):active {
    box-shadow: none;
    transform: translate(2px, 2px);
  }
  .inaba-box {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }
  .inaba-mystery {
    font-family: var(--punch);
    font-size: 28px;
    letter-spacing: 4px;
    color: #a3a3a3;
  }
  .inaba-selected-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    grid-column: 1 / -1;
    width: 100%;
    min-height: 200px;
    background: #101010;
    border: 1px solid var(--line);
    padding: 32px 16px;
    text-align: center;
  }
  .inaba-mystery-large {
    font-family: var(--punch);
    font-size: 48px;
    letter-spacing: 8px;
    color: #e5e5e5;
    margin-bottom: 12px;
  }
  .inaba-selected-box p {
    color: var(--muted);
    font-size: 14px;
    max-width: 320px;
    margin: 0;
  }
  @media (max-width: 800px) {
    .encounter.departed {
      grid-template-columns: 1fr;
    }
    .departed > section + section {
      border-left: 0;
      border-top: 1px solid var(--purple-line);
      padding: 20px 0 0;
    }
    .units {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 480px) {
    .units,
    .departed .units {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Alcatraz Encounter Preview */
  .alcatraz-preview-screen {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #0d0d0d;
    border: 1px solid #2a2a2a;
    padding: 14px;
    box-sizing: border-box;
  }
  .alcatraz-preview-header {
    text-align: center;
    border-bottom: 1px solid #222;
    padding-bottom: 10px;
  }
  .alcatraz-badge {
    background: var(--accent);
    color: #080808;
    font-size: 11px;
    font-family: monospace;
    font-weight: bold;
    padding: 2px 6px;
    letter-spacing: 1px;
  }
  .alcatraz-preview-header h3 {
    margin: 8px 0 4px;
    font-size: 18px;
    color: #e8e8e3;
    font-family: 'Raglan Punch', Impact, sans-serif;
  }
  .alcatraz-preview-header p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .alcatraz-preview-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  .alcatraz-preview-middle {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    align-items: center;
  }
  .alcatraz-preview-team {
    background: #141414;
    border: 1px solid #222;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .alcatraz-preview-team.bottom-team {
    border-color: #57305e;
    background: #161016;
  }
  .team-tag {
    font-size: 10px;
    font-family: monospace;
    font-weight: bold;
    padding: 2px 5px;
    width: fit-content;
  }
  .team-tag.t1 { background: #0369a1; color: #e0f2fe; }
  .team-tag.t2 { background: #6b21a8; color: #f3e8ff; }
  .team-tag.t3.player { background: var(--accent); color: #080808; }
  .team-tag.t4 { background: #854d0e; color: #fef08a; }
  .team-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .team-chips.vertical {
    flex-direction: column;
  }
  .team-chips .chip {
    font-size: 11px;
    background: #1e1e1e;
    padding: 3px 6px;
    border: 1px solid #333;
    color: #ccc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .team-chips .chip.player-chip {
    border-color: #bc8eac;
    color: #fff;
  }
  .alcatraz-preview-arena {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    border: 1px dashed #444;
    background: #090909;
    min-width: 130px;
    text-align: center;
    gap: 4px;
  }
  .alcatraz-preview-arena .swords {
    font-size: 20px;
  }
  .alcatraz-preview-arena strong {
    font-family: 'Raglan Punch', Impact, sans-serif;
    color: var(--accent);
    font-size: 14px;
    letter-spacing: 1px;
  }
  .alcatraz-preview-arena span {
    font-size: 9px;
    font-family: monospace;
    color: #777;
  }
  @media (max-width: 580px) {
    .alcatraz-preview-middle {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }

  /* Wild Card Return Modal */
  .wildcard-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    display: grid;
    place-items: center;
    padding: 20px;
    z-index: 45;
  }
  .wildcard-modal {
    position: static;
    margin: 0;
    width: min(880px, 100%);
    max-height: 92vh;
    overflow-y: auto;
    border: 2px solid var(--accent);
    background: #101010;
    color: var(--ink);
    padding: 0;
    box-shadow: 0 0 36px rgba(240, 45, 138, 0.22);
    border-radius: 0;
  }
  .wildcard-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--purple-line);
    background: #0b0b0b;
  }
  .wildcard-kicker {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 2px 8px;
    margin-bottom: 6px;
  }
  .wildcard-header h2 {
    margin: 0;
    font-family: var(--punch);
    font-size: clamp(28px, 4vw, 38px);
    color: var(--accent);
  }
  .wildcard-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px;
    gap: 18px;
  }
  .wildcard-npc {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 120px;
  }
  .wildcard-npc img {
    width: 100%;
    aspect-ratio: var(--character-portrait-ratio, 225 / 350);
    object-fit: cover;
    border: 2px solid var(--accent);
    background: #080808;
  }
  .wildcard-npc figcaption {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
  }
  .wildcard-quote-box {
    max-width: 620px;
    background: #080808;
    border: 1px solid var(--purple-line);
    border-left: 3px solid var(--accent);
    border-right: 3px solid var(--accent);
    padding: 14px 20px;
  }
  .wildcard-quote {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
  }
  .wildcard-sub {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .wildcard-featured {
    width: 180px;
  }
  .wildcard-prompt {
    margin: 0;
    font-weight: 700;
    color: var(--accent);
  }
  .wildcard-units {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }
  .wildcard-slot {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wildcard-slot button {
    width: 100%;
  }
  .wildcard-error {
    margin: 8px 0 0;
    color: #ef4444;
    font-weight: bold;
    font-size: 14px;
  }
  @media (max-width: 720px) {
    .wildcard-units {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>

