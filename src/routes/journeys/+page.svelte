<script lang="ts">
  import { onMount } from 'svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import JourneyEncounter from '$lib/components/JourneyEncounter.svelte';
  import {
    saveJobToClient,
    getJobFromClient,
    toJobView,
    setMeta,
    getMeta
  } from '$lib/client/db';
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

  async function api(path: string, body?: unknown, method?: string) {
    const httpMethod = method ?? (body === undefined ? 'GET' : 'POST');
    const response = await fetch(path, {
      method: httpMethod,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const result = await response.json().catch(() => {
      throw new Error(`Unexpected server response (HTTP ${response.status}). Please retry.`);
    });

    if (!response.ok) {
      // If serverless container restarted and lost job, try auto-restoring from IndexedDB
      if (
        (response.status === 404 || result.error?.includes('not found')) &&
        job?.id
      ) {
        const local = await getJobFromClient(job.id);
        if (local) {
          const syncRes = await fetch(`/api/imports/${encodeURIComponent(job.id)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ job: local })
          });
          if (syncRes.ok) {
            return api(path, body, method);
          }
        }
      }
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
    const local = await getJobFromClient(job.id);
    if (local) {
      local.starterTeam = team;
      await saveJobToClient(local);
    }
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
      await setMeta('active_journey_id', job!.id);
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

    // Restore saved session from IndexedDB first, with localStorage fallback
    void (async () => {
      try {
        let savedId: string | null = null;
        try {
          savedId = localStorage.getItem(STORAGE_KEY);
        } catch {
          // Optional storage
        }
        if (!savedId) {
          savedId = await getMeta('active_journey_id');
        }

        if (savedId) {
          // 1. Fast restore from local IndexedDB
          const localJob = await getJobFromClient(savedId);
          if (localJob && alive) {
            job = toJobView(localJob);
            username = localJob.username;
            if (localJob.starterTeam && localJob.starterTeam.length) {
              team = localJob.starterTeam as JourneyUnit[];
            }
            busy = false;
          }

          // 2. Verify with server or re-hydrate server if server cold-started
          try {
            const serverJob = await api(`/api/imports/${encodeURIComponent(savedId)}`);
            if (alive) {
              job = serverJob;
              username = serverJob.username;
              await loadStarterTeam();
            }
          } catch (serverErr) {
            if (localJob) {
              await fetch(`/api/imports/${encodeURIComponent(savedId)}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ job: localJob })
              });
              if (alive) {
                await loadStarterTeam();
              }
            } else {
              throw serverErr;
            }
          }
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
          const wasNotComplete = job.state !== 'complete';
          job = updatedJob;
          error = '';
          if (wasNotComplete && updatedJob.state === 'complete') {
            try {
              const full = await api(`/api/imports/${currentId}?full=true`);
              if (full && full.id) {
                await saveJobToClient(full);
              }
            } catch {
              // Optional full fetch
            }
          }
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
        Import your collection, draw a team from it, and journey through 200 floors, battling other teams in the way.
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
