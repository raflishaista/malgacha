<script lang="ts">
 import LotteryPanel from '$lib/components/LotteryPanel.svelte';
 import SiteHeader from '$lib/components/SiteHeader.svelte';
 import '../style.css';
 let { data } = $props();
</script>
<svelte:head><title>MALGacha</title><meta name="description" content="Roll characters from your MyAnimeList collection." /></svelte:head>
<a class="skip-link" href="#tool">Skip to tool</a>
<div class="shell">
<SiteHeader configured={data.configured} active="lottery" />
<main id="tool"><div class="intro"><h1>MAL Character Lottery</h1><p>Import your MyAnimeList anime and manga lists, then draw 5–10 characters from a pool.</p></div>
<LotteryPanel configured={data.configured} />
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
