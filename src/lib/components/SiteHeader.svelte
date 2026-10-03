<script lang="ts">
let { configured, active }: { configured: boolean; active: 'lottery' | 'malchups' | 'journeys' } = $props();
</script>
<header class="site-header">
<a class="wordmark" href="/" aria-label="MALGacha home">MALGacha</a>
<nav class="main-nav" aria-label="Main navigation"><a href="/" aria-current={active === 'lottery' ? 'page' : undefined}>Lottery</a><a href="/malchups" aria-current={active === 'malchups' ? 'page' : undefined}>MALchups</a><a href="/journeys" aria-current={active === 'journeys' ? 'page' : undefined}>Jobber Journeys</a></nav>
<span class="connection">MAL / {configured ? 'client configured' : 'setup required'}</span>
</header>
