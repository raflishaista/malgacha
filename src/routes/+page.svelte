<script lang="ts">
  import { onMount } from 'svelte';
  import type { JobView, PoolCharacter } from '$lib/types';
  import { rarityFor } from '$lib/rarity';
  import '../style.css';

  let { data } = $props();
  let username = $state('fhgeh');
  let includePlanned = $state(true);
  let count = $state(5);
  let job = $state<JobView | null>(null);
  let popularity = $state(false);
  let minFavorites = $state<number | undefined>(500);
  const validThreshold = $derived(Number.isSafeInteger(minFavorites) && minFavorites! >= 0);
  const eligible = $derived(job ? popularity ? (job.favoriteCounts ?? []).filter((n) => validThreshold && n >= minFavorites!).length : job.uniqueCharacters : 0);
  let characters = $state<PoolCharacter[]>([]);
  let busy = $state(false);
  let rolling = $state(false);
  let shuffling = $state(false);
  let settledSlots = $state(0);
  let animationFinal: PoolCharacter[] | null = null;
  let animationTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseAnimation: (() => void) | undefined;
  function stopAnimation() {
    clearTimeout(animationTimer);
    releaseAnimation?.();
    releaseAnimation = undefined;
    if (animationFinal) characters = animationFinal;
    animationFinal = null;
    shuffling = false;
  }
  async function revealRoll(final: PoolCharacter[], current: number, previews: PoolCharacter[] = []) {
    const reel = previews.length > 1 ? previews : [...previews, ...final];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || reel.length < 2) {
      characters = final;
      return;
    }
    // Reuse the returned portraits; animation never makes extra API requests or changes the draw.
    for (const character of [...reel, ...final]) {
      if (character.image) { const image = new Image(); image.src = character.image; }
    }
    shuffling = true;
    animationFinal = final;
    settledSlots = 0;
    rollNote = 'Rolling…';
    const started = performance.now();
    let tick = 0;
    while (current === generation) {
      const elapsed = performance.now() - started;
      settledSlots = Math.min(final.length, Math.max(0, Math.floor((elapsed - 700) / 140) + 1));
      if (settledSlots === final.length) break;
      const offset = tick++ % reel.length;
      characters = final.map((character, index) => index < settledSlots ? character : reel[(index + offset) % reel.length]);
      await new Promise<void>((resolve) => { releaseAnimation = resolve; animationTimer = setTimeout(resolve, 100); });
    }
    if (current === generation) characters = final;
    stopAnimation();
  }
  let error = $state('');
  let rollNote = $state('');
  let rollNumber = $state(0);
  let generation = 0;
  let polling = false;
  const working = $derived(job && ['queued', 'listing', 'fetching'].includes(job.state));
  const progress = $derived(job?.total ? Math.round((job.processed + job.failed) / job.total * 100) : 0);

  async function api(path: string, body?: unknown) {
    const response = await fetch(path, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => {
      throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Please try again or check the deployment logs.`);
    });
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
    return result;
  }
  function remember(id: string) { try { localStorage.setItem('character-roll-import', id); } catch { /* Storage may be disabled. */ } }
  async function start(demo = false) {
    stopAnimation();
    busy = true; error = '';
    const current = ++generation;
    try {
      const result = await api('/api/imports', { username, includePlanned, demo });
      if (current !== generation) return;
      job = result; characters = []; rollNote = ''; rollNumber = 0;
      remember(result.id);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Import failed.'; }
    finally { busy = false; }
  }
  async function refresh() {
    if (!job || polling || !working) return;
    polling = true;
    const id = job.id;
    const current = generation;
    try {
      const result = await api(`/api/imports/${id}`);
      if (current === generation && job?.id === id) { job = result; error = ''; }
    } catch { if (current === generation) error = 'Could not update progress. Retrying automatically; your import is saved.'; }
    finally { polling = false; }
  }
  async function retry() {
    if (!job) return;
    busy = true; error = '';
    try { job = await api(`/api/imports/${job.id}`, {}); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Retry failed.'; }
    finally { busy = false; }
  }
  async function cancel() {
    if (!job) return;
    busy = true; error = '';
    const id = job.id;
    ++generation;
    stopAnimation();
    try { job = await api(`/api/imports/${id}`, { action: 'cancel' }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Cancel failed.'; }
    finally { busy = false; }
  }
  async function roll() {
    if (!job || rolling) return;
    rolling = true; error = '';
    const current = generation;
    try {
      const result = await api(`/api/imports/${job.id}/roll`, { count, minFavorites: popularity ? minFavorites : null });
      if (current !== generation) return;
      await revealRoll(result.characters, current, result.previews);
      if (current !== generation) return;
      rollNumber++;
      rollNote = `${result.partial ? 'Early roll' : 'Full-pool roll'} · sampled from ${result.poolSize.toLocaleString()} unique characters${popularity ? ` with at least ${minFavorites} favorites` : ''}${result.characters.length < count ? ` · only ${result.characters.length} qualify` : ''}`;
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not roll.'; }
    finally { rolling = false; }
  }
  onMount(() => {
    let disposed = false;
    const current = generation;
    try {
      const id = localStorage.getItem('character-roll-import');
      if (id) void api(`/api/imports/${id}`).then((saved) => {
        if (!disposed && current === generation) { job = saved; if (!saved.demo) username = saved.username; includePlanned = saved.includePlanned; }
      }).catch(() => { if (!disposed && current === generation) error = 'Your previous import could not be restored. You can start a new import below.'; });
    } catch { /* App still works without local storage. */ }
    const timer = setInterval(() => void refresh(), 2000);
    return () => { disposed = true; ++generation; stopAnimation(); clearInterval(timer); };
  });
</script>
<svelte:head>
  <title>MALGacha</title>
  <meta name="description" content="Import a MyAnimeList profile and randomly draw 5–10 unique characters from its anime and manga." />
</svelte:head>

<a class="skip-link" href="#tool">Skip to tool</a>
<div class="shell">
  <header class="site-header">
    <a class="wordmark" href="/" aria-label="MALGacha home">MALGacha</a>
    <p class="tagline">Roll for your jobber squad</p>
    <span class="connection">MAL / {data.configured ? 'client configured' : 'setup required'}</span>
  </header>
  <main id="tool">
    <div class="intro">
      <h1>MAL Character Lottery</h1>
      <p>Import your MyAnimeList anime and manga lists, then draw 5–10 characters from a pool</p>
    </div>
    <div class="workspace">
      <section class="collection" id="collection" aria-labelledby="collection-heading">
        <h2 id="collection-heading"><span class="section-number">01</span> Import a collection</h2>
        <p class="section-description">Enter a public profile to collect its characters.</p>
        <form onsubmit={(event) => { event.preventDefault(); void start(); }}>
          <label for="username">MAL username or profile URL</label>
          <input id="username" bind:value={username} placeholder="e.g. fhgeh" required disabled={busy} autocomplete="off" />
          <label class="checkbox"><input type="checkbox" bind:checked={includePlanned} disabled={busy} /><span>Include plan-to-watch and plan-to-read</span></label>
          <div class="form-actions">
            <button type="submit" disabled={busy || !!working || !data.configured}>{busy ? 'Preparing…' : 'Import profile'}</button>
            <button class="text-button" type="button" onclick={() => start(true)} disabled={busy || !!working}>Load demo</button>
          </div>
        </form>
        {#if !data.configured}<p class="setup-note"><strong>Live import is not configured.</strong> Add a MAL client ID using the project README. The demo works without one.</p>{/if}
        <p class="collection-note">Imports are saved as they run. You can leave this page and return to the same pool.</p>
      </section>
      <section class="draw" id="draw" aria-labelledby="draw-heading">
        <div class="section-top">
          <h2 id="draw-heading"><span class="section-number">02</span> Pool & draw</h2>
          <span class="pool-source">{job?.demo ? 'Demo / sample data' : job ? '@' + job.username : 'No profile loaded'}</span>
        </div>
        <dl class="stats">
          <div><dt>Unique characters</dt><dd class="character-count">{job ? job.uniqueCharacters.toLocaleString() : '—'}</dd></div>
          <div><dt>Titles fetched</dt><dd>{job ? job.processed : '—'}{#if job}<span class="total"> / {job.total}</span>{/if}</dd></div>
          <div><dt>Failed titles</dt><dd>{job ? job.failed : '—'}</dd></div>
        </dl>
        {#if job}
          <div class="progress-heading"><span>{job.state === 'cancelled' ? 'Import cancelled' : job.state === 'complete' ? 'Import complete' : job.state === 'partial' ? 'Partial import' : job.state === 'error' ? 'Import needs attention' : job.state === 'queued' ? 'Import queued' : 'Importing'}</span><span>{progress}%</span></div>
          <progress max="100" value={progress} aria-label="Import progress"></progress>
          <p class="progress-message" aria-live="polite">{job.message}</p>
          {#if job.demo}<p class="demo-note">Bundled sample. No API requests; portraits are placeholders.</p>{/if}
          {#if working}<button class="retry-button" disabled={busy} onclick={cancel}>Cancel import</button>{/if}
          {#if job.state === 'partial' || job.state === 'error' || job.state === 'cancelled'}<button class="retry-button" disabled={busy} onclick={retry}>{job.state === 'cancelled' ? 'Resume import' : 'Retry unfinished titles'}</button>{/if}
          {#if job.failed}<details class="failures"><summary>Show {job.failed} failed {job.failed === 1 ? 'title' : 'titles'}</summary><ul>{#each job.failures as failure}<li><b>{failure.title}</b>: {failure.message}</li>{/each}</ul></details>{/if}
        {:else}
          <p class="empty-pool">No characters collected yet. Import a profile or load the demo to begin.</p>
        {/if}
        <div class="popularity-controls">
          <label class="checkbox"><input type="checkbox" bind:checked={popularity} disabled={rolling} /><span>Popularity filter</span></label>
          <label for="min-favorites">Roll characters with at least</label>
          <input id="min-favorites" type="number" min="0" step="1" bind:value={minFavorites} disabled={!popularity || rolling} />
          <span>favorites</span>
        </div>
        {#if popularity}
          <p class="roll-help" aria-live="polite">{validThreshold ? eligible + ' characters qualify. Draws return up to ' + count + ' without duplicates.' : 'Enter a nonnegative whole number.'}</p>
          {#if job?.unknownFavorites}<p class="roll-help">{job.unknownFavorites} characters have no saved favorite count and are excluded. Import the profile again to refresh older data.</p>{/if}
        {/if}
        <div class="roll-controls">
          <div><label for="count">Characters per draw</label><select id="count" bind:value={count}>{#each [5, 6, 7, 8, 9, 10] as size}<option value={size}>{size} characters</option>{/each}</select></div>
          <button class="primary" onclick={roll} disabled={rolling || busy || !job || (popularity ? !validThreshold || eligible === 0 : job.uniqueCharacters < count)}>{rolling ? 'Drawing…' : 'Draw characters'}</button>
        </div>
        <p class="roll-help">{!popularity && job && job.uniqueCharacters < count ? 'Available once ' + count + ' unique characters are ready.' : working ? 'Early draws use only the characters collected so far.' : ''}</p>
      </section>
    </div>
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <section class="results" id="results" aria-labelledby="results-heading">
      {#if characters.length}
        <p class="draw-note" aria-live="polite">{rollNote}{job?.demo ? ' · Demo' : ''}</p>
        <ol class="character-grid" aria-busy={shuffling}>
          {#each characters as character, index (index)}
            {@const rarity = rarityFor(character.favorites)}
            <li class="character-entry" data-rarity={rarity} class:slot-rolling={shuffling && index >= settledSlots}>
              <div class="entry-meta"><span>{String(index + 1).padStart(2, '0')}</span><span>MAL {character.id}</span></div>
              <a class="portrait" href={character.url} target="_blank" rel="noreferrer" aria-label={'View ' + character.name + ' on MyAnimeList (opens in a new tab)'}>
                <span class="portrait-fallback" aria-hidden="true"><span>{character.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><small>No portrait</small></span>
                {#key character.id}{#if character.image}<img src={character.image} alt={character.name} loading={shuffling ? 'eager' : 'lazy'} onerror={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }} />{/if}{/key}
              </a>
              <p class="favorite-count">{typeof character.favorites === 'number' ? character.favorites.toLocaleString() + ' favorites' : 'Favorites unknown'}</p>
              <h3><a href={character.url} target="_blank" rel="noreferrer">{character.name}</a>{#if rarity} <span class="rarity-label" aria-label={rarity + ' rarity'}>{rarity}</span>{/if}</h3>
              <ul class="title-list">{#each character.titles.slice(0, 2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul>
              {#if character.titles.length > 2}<details class="more-titles"><summary>{character.titles.length - 2} more titles</summary><ul class="title-list">{#each character.titles.slice(2) as title}<li><span>{title.kind}</span> {title.name}</li>{/each}</ul></details>{/if}
            </li>
          {/each}
        </ol>
      {:else}<p class="empty-results">Drawn characters will appear here.</p>{/if}
    </section>
    <section class="notes" id="notes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes on the pool</h2>
      <dl>
        <div><dt>Duplicates:</dt><dd>A character appearing in multiple anime or manga is counted once, using their MAL character ID.</dd></div>
        <div><dt>Early draws:</dt><dd>You can draw while an import runs. The selection uses only the characters available at that moment.</dd></div>
        <div><dt>Coverage:</dt><dd>The pool includes characters listed by the source. Missing casts and failed requests can leave gaps. Characters may repeat between draws.</dd></div>
      </dl>
    </section>
  </main>
  <footer><span>MALGacha</span><p>Data: <a href="https://myanimelist.net/">MyAnimeList</a> + <a href="https://api.tenrai.org/">Tenrai</a></p></footer>
</div>
