<script lang="ts">
 import LotteryPanel from '$lib/components/LotteryPanel.svelte';
 import SiteHeader from '$lib/components/SiteHeader.svelte';
 import '../style.css';
 let { data } = $props();
</script>
<svelte:head><title>MALGacha</title><meta name="description" content="Roll characters from your MyAnimeList collection" /></svelte:head>
<a class="skip-link" href="#tool">Skip to tool</a>
<div class="shell">
<SiteHeader configured={data.configured} active="lottery" />
<main id="tool"><div class="intro"><h1>MAL Character Lottery</h1><p>Import your combined MyAnimeList anime and manga lists, then draw 5–10 characters from a pool.</p></div>
<LotteryPanel configured={data.configured} />
</main>
<footer><span>MALGacha</span><p>Data: <a href="https://myanimelist.net/">MyAnimeList</a> + <a href="https://api.tenrai.org/">Tenrai</a></p></footer>
</div>
