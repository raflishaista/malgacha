<script lang="ts">
  import Card from './JourneyCharacter.svelte';
  import AutoBattle from './AutoBattle.svelte';
  import type { BattleReplay } from '$lib/autobattle';
  import type { JourneyCharacter } from '$lib/types';
  import { favoriteTotal } from '$lib/match';
  let { team, jobId }: { team: JourneyCharacter[]; jobId: string } = $props();
  let opponents = $state<JourneyCharacter[][]>([]);
  let selected = $state<number | null>(null);
  let fought = $state(false);
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
      result = data.result; rewardUsed = data.rewardUsed; replacementTeam = data.characters;
      if (!replace && data.replay) { replay = data.replay; playing = true; } else fought = true;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Battle failed.'; }
    finally { busy = false; }
  }
  async function depart() {
    busy = true; error = '';
    try {
      const response = await fetch(`/api/imports/${jobId}/opponents`, { method: 'POST' });
      const result = await response.json().catch(() => { throw new Error(`Unexpected response (HTTP ${response.status}).`); });
      if (!response.ok) throw new Error(result.error || 'Could not find opponents.');
      opponents = result.teams; selected = null; fought = false; rewardUsed = false; replay = null; playing = false;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not find opponents.'; }
    finally { busy = false; }
  }
</script>

<fieldset disabled={busy || playing || fought}><legend>Battle mode</legend><label><input type="radio" bind:group={mode} value="idle" /> Autobattler</label><label><input type="radio" bind:group={mode} value="clout" /> Cloutscaling</label></fieldset>
{#if replay}<AutoBattle {replay} onfinish={() => { playing = false; fought = true; }} />{/if}
<div class="encounter" hidden={playing} class:departed={opponents.length > 0}>
  <section aria-label="Your team"><h3>Your team</h3><div class="units">{#each currentTeam as character (character.instanceId)}<div><Card {character} />{#if fought && won && !rewardUsed}<button disabled={busy} onclick={() => battle(character.instanceId)}>Replace this member</button>{/if}</div>{/each}</div></section>
  {#if opponents.length}<section aria-label="Opponents">
    {#if enemy}
      <h3>Opponent {selected! + 1}</h3>
      {#if !fought && !playing}<button disabled={busy} onclick={() => selected = null}>Choose another opponent</button>{/if}
      <div class="units">{#each enemy as character (character.instanceId)}<Card {character} hideFavorites={!fought} />{/each}</div>
    {:else}
      <h3>Choose an opponent</h3>
      <div class="options">{#each opponents as opponent, index}
        <button class="option" onclick={() => { selected = index; fought = false; }}>
          <span>Opponent {index + 1}</span>
          <span class="mini-team">{#each opponent as character}<span>{#if character.image}<img src={character.image} alt="" />{:else}<span class="placeholder">—</span>{/if}<span>{character.name}</span></span>{/each}</span>
        </button>
      {/each}</div>
    {/if}
  </section>{/if}
</div>
{#if error}<p role="alert">{error}</p>{/if}
<div class="actions">
  {#if !opponents.length}<button class="fight-button primary" disabled={busy} onclick={depart}>{busy ? 'Finding opponents…' : 'DEPART'}</button>
  {:else if enemy && !fought && !playing}<button class="fight-button primary" disabled={busy} onclick={() => battle()}>FIGHT</button>
  {:else if fought}
    <div class="result" role="status"><strong>{tied ? 'Draw!' : won ? 'Your team wins!' : 'Opponent wins!'}</strong><p>{left.toLocaleString()} – {right.toLocaleString()} {result?.mode === 'idle' ? 'units remaining' : 'favorites'}</p></div>
    {#if won}<p>{rewardUsed ? 'Replacement saved.' : 'Victory reward: replace one member above, or continue with your team.'}</p>{/if}
    <button class="fight-button primary" disabled={busy} onclick={depart}>{busy ? 'Finding opponents…' : 'CONTINUE'}</button>
  {/if}
</div>
{#if opponents.length}<p class="note">Opponents come from your imported pool. Unknown favorites count as zero. Encounters reset on reload; your saved team stays the same.</p>{/if}

<style>
  .encounter[hidden] { display: none; }
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
  .mini-team img, .placeholder { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background: #222; }
  .actions { text-align: center; margin: 32px 0; }
  .result { font-size: 26px; margin: 24px 0; }
  .result strong { font-size: 34px; color: var(--accent); }
  .note { color: var(--muted); }
  .fight-button:not(:disabled) { box-shadow: 4px 4px 0 #75163f; transform: translate(-2px, -2px); }
  .fight-button:not(:disabled):active { box-shadow: none; transform: translate(2px, 2px); }
  @media (max-width: 800px) { .encounter.departed { grid-template-columns: 1fr; } .departed > section + section { border-left: 0; border-top: 1px solid var(--purple-line); padding: 20px 0 0; } .units { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 480px) { .units, .departed .units { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
