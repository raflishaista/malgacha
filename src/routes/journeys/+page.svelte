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
  let polling = $state(false);
  let alive = true;

  const working = $derived(!!job && ['queued', 'listing', 'fetching'].includes(job.state));
  const STORAGE_KEY = 'malgacha-journeys-import';

  async function api(path: string, body?: unknown) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const result = await response.json().catch(() => {
      throw new Error(`Unexpected server response (HTTP ${response.status}). Please retry.`);
    });

    if (!response.ok) {
      throw new Error(result.error || 'Request failed.');
    }

    return result;
  }

  function setError(cause: unknown) {
    if (alive) {
      error = cause instanceof Error ? cause.message : 'Request failed.';
    }
  }

  async function loadStarterTeam(reroll = false) {
    if (!job || job.state !== 'complete') return;
    const starterResponse = await api(`/api/imports/${job.id}/starter`, { reroll });
    team = starterResponse.characters;
  }

  async function startImport(demo = false) {
    busy = true;
    error = '';
    try {
      job = await api('/api/imports', {
        username,
        demo,
        includePlanned: true,
        scope: 'journeys'
      });
      team = [];
      try {
        localStorage.setItem(STORAGE_KEY, job!.id);
      } catch {
        // Optional localStorage fallback
      }
      await loadStarterTeam();
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function handleImportAction(action: 'cancel' | 'retry' | 'roll' | 'reroll') {
    if (!job) return;
    busy = true;
    error = '';
    try {
      if (action === 'roll' || action === 'reroll') {
        await loadStarterTeam(action === 'reroll');
      } else {
        job = await api(`/api/imports/${job.id}`, { action });
      }
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    alive = true;

    // Restore saved session from localStorage
    void (async () => {
      try {
        let savedId: string | null = null;
        try {
          savedId = localStorage.getItem(STORAGE_KEY);
        } catch {
          // Optional storage
        }

        if (savedId) {
          job = await api(`/api/imports/${encodeURIComponent(savedId)}`);
          username = job!.username;
          await loadStarterTeam();
        }
      } catch (cause) {
        setError(cause);
      } finally {
        if (alive) busy = false;
      }
    })();

    // Poll for import status while processing
    const pollInterval = setInterval(async () => {
      if (!working || busy || polling || !job) return;
      polling = true;
      const currentId = job.id;

      try {
        const updatedJob = await api(`/api/imports/${currentId}`);
        if (alive && job?.id === currentId && !busy) {
          job = updatedJob;
          error = '';
          await loadStarterTeam();
        }
      } catch (cause) {
        setError(cause);
      } finally {
        polling = false;
      }
    }, 1500);

    return () => {
      alive = false;
      clearInterval(pollInterval);
    };
  });
</script>

<svelte:head>
  <title>Jobber Journeys · MALGacha</title>
</svelte:head>

<a class="skip-link" href="#journey">Skip to tool</a>

<div class="shell">
  <SiteHeader configured={data.configured} active="journeys" />

  <main id="journey">
    <div class="intro">
      <h1>Jobber Journeys</h1>
      <p>
        Import your collection and draw a starting team of five. At least one character will
        have a passive ability.
      </p>
    </div>

    <details class="import-settings" open={!team.length}>
      <summary>Collection settings</summary>
      <form onsubmit={(event) => { event.preventDefault(); void startImport(); }}>
        <label for="journey-username">MyAnimeList username or profile URL</label>
        <div class="journey-form">
          <input
            id="journey-username"
            bind:value={username}
            required
            disabled={busy || working}
          />
          <button class="primary" disabled={busy || working || !data.configured}>
            Import & roll
          </button>
          <button
            type="button"
            class="secondary"
            disabled={busy || working}
            onclick={() => startImport(true)}
          >
            Use demo
          </button>
        </div>
      </form>

      {#if !data.configured}
        <p class="muted">MAL access is not configured on this server. You can try the demo.</p>
      {/if}

      {#if job}
        <section class="journey-progress" aria-live="polite">
          <p>{job.message}</p>
          <p>
            {job.processed} / {job.total} titles · {job.uniqueCharacters} unique characters
            {job.failed ? ` · ${job.failed} failed titles` : ''}
          </p>
        </section>
      {/if}

      {#if working}
        <button class="secondary" disabled={busy} onclick={() => handleImportAction('cancel')}>
          Cancel import
        </button>
      {/if}

      {#if job && ['partial', 'error', 'cancelled'].includes(job.state)}
        <p>The import must finish before your team is drawn.</p>
        <button class="secondary" disabled={busy} onclick={() => handleImportAction('retry')}>
          Resume import
        </button>
      {/if}
    </details>

    {#if error}
      <p role="alert" class="journey-error">{error}</p>
      {#if job?.state === 'complete' && !team.length}
        <button class="secondary" disabled={busy} onclick={() => handleImportAction('roll')}>
          Retry team draw
        </button>
      {/if}
    {/if}

    {#if team.length}
      <section class="journey-team">
        {#key team}
          {#if job}
            <JourneyEncounter
              {team}
              jobId={job.id}
              onreroll={() => handleImportAction('reroll')}
              parentBusy={busy || polling || working}
            />
          {/if}
        {/key}
      </section>
    {/if}
  </main>
</div>

<style>
  form {
    border-top: 1px solid var(--purple-line);
    padding: 22px 0;
  }
  .journey-form {
    display: flex;
    gap: 12px;
    align-items: stretch;
  }
  .journey-form input {
    max-width: 420px;
  }
  .journey-form button {
    white-space: nowrap;
  }
  .muted,
  .journey-progress {
    color: var(--muted);
  }
  .journey-error {
    color: #ff96c8;
  }
  .journey-team {
    border-top: 1px solid var(--purple-line);
    margin-top: 28px;
    padding: 24px 0 70px;
  }
  @media (max-width: 900px) {
    .journey-form {
      flex-wrap: wrap;
    }
  }
</style>
