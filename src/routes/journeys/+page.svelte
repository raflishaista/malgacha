<script lang="ts">
  import { onMount } from 'svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import JourneyEncounter from '$lib/components/JourneyEncounter.svelte';
  import type { JobView, JourneyCharacter as JourneyUnit } from '$lib/types';
  import '../../style.css';
  let { data } = $props();
  let username = $state('fhgeh');
  let job = $state<JobView | null>(null);
  let team = $state<JourneyUnit[]>([]);
  let busy = $state(true);
  let error = $state('');
  let alive = true;
  let polling = $state(false);
  const working = $derived(!!job && ['queued', 'listing', 'fetching'].includes(job.state));
  const key = 'malgacha-journeys-import';
  async function api(path: string, body?: unknown) {
    const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => { throw new Error(`Unexpected server response (HTTP ${response.status}). Please retry.`); });
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
  function fail(cause: unknown) { if (alive) error = cause instanceof Error ? cause.message : 'Request failed.'; }
  async function finish(reroll = false) {
    if (!job || job.state !== 'complete') return;
    team = (await api(`/api/imports/${job.id}/starter`, { reroll })).characters;
  }
  async function start(demo = false) {
    busy = true; error = '';
    try {
      job = await api('/api/imports', { username, demo, includePlanned: true, scope: 'journeys' });
      team = [];
      try { localStorage.setItem(key, job!.id); } catch { /* Browser storage is optional. */ }
      await finish();
    } catch (cause) { fail(cause); } finally { busy = false; }
  }
  async function action(action: 'cancel' | 'retry' | 'roll' | 'reroll') {
    if (!job) return;
    busy = true; error = '';
    try {
      if (action === 'roll' || action === 'reroll') await finish(action === 'reroll');
      else job = await api(`/api/imports/${job.id}`, { action });
    } catch (cause) { fail(cause); } finally { busy = false; }
  }
  onMount(() => {
    alive = true;
    void (async () => {
      try {
        let id: string | null = null;
        try { id = localStorage.getItem(key); } catch { /* Browser storage is optional. */ }
        if (id) { job = await api(`/api/imports/${encodeURIComponent(id)}`); username = job!.username; await finish(); }
      } catch (cause) { fail(cause); } finally { if (alive) busy = false; }
    })();
    const timer = setInterval(async () => {
      if (!working || busy || polling || !job) return;
      polling = true;
      const id = job.id;
      try {
        const result = await api(`/api/imports/${id}`);
        if (alive && job?.id === id && !busy) { job = result; error = ''; await finish(); }
      } catch (cause) { fail(cause); } finally { polling = false; }
    }, 1500);
    return () => { alive = false; clearInterval(timer); };
  });
</script>

<svelte:head><title>Jobber Journeys · MALGacha</title></svelte:head>
<a class="skip-link" href="#journey">Skip to tool</a>
<div class="shell">
  <SiteHeader configured={data.configured} active="journeys" />
  <main id="journey">
    <div class="intro"><h1>Jobber Journeys</h1><p>Import your collection and draw a starting team of five. At least one character will have a passive ability.</p></div>
    <form onsubmit={(event) => { event.preventDefault(); void start(); }}>
      <label for="journey-username">MyAnimeList username or profile URL</label>
      <div class="journey-form"><input id="journey-username" bind:value={username} required disabled={busy || working} /><button class="primary" disabled={busy || working || !data.configured}>Import & roll</button><button type="button" class="secondary" disabled={busy || working} onclick={() => start(true)}>Use demo</button></div>
    </form>
    {#if !data.configured}<p class="muted">MAL access is not configured on this server. You can try the demo.</p>{/if}
    {#if job}<section class="journey-progress" aria-live="polite"><p>{job.message}</p><p>{job.processed} / {job.total} titles · {job.uniqueCharacters} unique characters{job.failed ? ` · ${job.failed} failed titles` : ''}</p></section>{/if}
    {#if working}<button class="secondary" disabled={busy} onclick={() => action('cancel')}>Cancel import</button>{/if}
    {#if job && ['partial', 'error', 'cancelled'].includes(job.state)}<p>The import must finish before your team is drawn.</p><button class="secondary" disabled={busy} onclick={() => action('retry')}>Resume import</button>{/if}
    {#if error}<p role="alert" class="journey-error">{error}</p>{#if job?.state === 'complete' && !team.length}<button class="secondary" disabled={busy} onclick={() => action('roll')}>Retry team draw</button>{/if}{/if}
    {#if team.length}
      <section class="journey-team"><h2>Your starting team</h2><button class="secondary" disabled={busy || polling || working} onclick={() => action('reroll')}>Reroll team (testing)</button><p class="muted">Hover over a character with an ability, or tap its ability title to read it. Abilities and base stats do not affect these favorites-based fights.</p>{#key team}{#if job}<JourneyEncounter {team} jobId={job.id} />{/if}{/key}<p class="muted">This team is saved with this import. This browser remembers it; account sign-in is not available yet.</p></section>
    {/if}
  </main>
</div>

<style>
  form { border-top: 1px solid var(--purple-line); padding: 22px 0; }
  .journey-form { display: flex; gap: 12px; align-items: stretch; }
  .journey-form input { max-width: 420px; }
  .journey-form button { white-space: nowrap; }
  .muted, .journey-progress { color: var(--muted); }
  .journey-error { color: #ff96c8; }
  .journey-team { border-top: 1px solid var(--purple-line); margin-top: 28px; padding: 24px 0 70px; }
  @media (max-width: 900px) { .journey-form { flex-wrap: wrap; } }

</style>

