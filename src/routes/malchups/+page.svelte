<script lang="ts">
import { topPower, powerWinner } from '$lib/power';
import { onMount } from 'svelte';
import LotteryPanel from '$lib/components/LotteryPanel.svelte';
import SiteHeader from '$lib/components/SiteHeader.svelte';
import '../../style.css';
import { favoriteTotal, cloutWinner, writingTotal } from '$lib/match';
import type { PoolCharacter } from '$lib/types';
let { data } = $props();
let count = $state(5);
let panels: HTMLDivElement;
onMount(() => {
 const options = [...panels.querySelectorAll<HTMLElement>('.draw-options')];
 const selector = panels.querySelector<HTMLElement>('.match-selector')!;
 let frame = 0;
 const align = () => {
  if (window.innerWidth <= 760) {
   options.forEach((el) => el.style.paddingTop = '');
   selector.style.top = '';
   return;
  }
  const tops = options.map((el) => el.getBoundingClientRect().top);
  const top = Math.max(...tops);
  options.forEach((el, i) => { el.style.paddingTop = (top - tops[i]) + 'px'; });
  selector.style.top = (top - panels.getBoundingClientRect().top + 20) + 'px';
 };
 const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(align); };
 const observer = new ResizeObserver(schedule);
 panels.querySelectorAll('.draw, .collection, .draw-options').forEach((el) => observer.observe(el));
 window.addEventListener('resize', schedule);
 schedule();
 return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
});
let mode = $state('CLOUTSCALING');
let left = $state<PoolCharacter[]>([]);
let right = $state<PoolCharacter[]>([]);
let outcome = $state('');
const ready = $derived(left.length === count && right.length === count);
const leftTotal = $derived(mode === 'WRITINGSCALING' ? writingTotal(left) : favoriteTotal(left));
const rightTotal = $derived(mode === 'WRITINGSCALING' ? writingTotal(right) : favoriteTotal(right));
function team(side: 'left' | 'right', characters: PoolCharacter[]) { if (side === 'left') left = characters; else right = characters; outcome = ''; }
function fight() {
 if (!ready) return;
 outcome = mode === 'POWERSCALING' ? powerWinner(left, right) : cloutWinner(leftTotal, rightTotal);
}
</script>
<svelte:head><title>MALchups / MALGacha</title><meta name="description" content="Compare character rolls from two MyAnimeList collections." /></svelte:head>
<a class="skip-link" href="#tool">Skip to comparison</a>
<div class="shell match-shell"><SiteHeader configured={data.configured} active="malchups" />
<main id="tool">
<div class="match-intro"><h1>MALchups</h1><p>Import two profiles, roll your teams, and compare.</p>
<div class="match-modes" aria-label="Match mode">{#each ['POWERSCALING', 'CLOUTSCALING', 'WRITINGSCALING'] as option}<button class="mode-button" aria-pressed={mode === option} onclick={() => { left = []; right = []; mode = option; outcome = ''; }}>{option}</button>{/each}</div>
{#if mode === 'POWERSCALING'}<p>Highest tier on each matched profile wins. Tiers load after rolling; missing or ambiguous profiles stay unranked.</p>{/if}
{#if mode === 'WRITINGSCALING'}<p>One score per character: their highest-rated series in your imported collection. Series can contribute more than once. Finish importing before drawing.</p>{/if}
</div>
<div class="match-panels" bind:this={panels}><div class="match-selector"><label for="match-count">Characters per draw</label><select id="match-count" bind:value={count} onchange={() => { left = []; right = []; outcome = ''; }}>{#each [5,6,7,8,9,10] as size}<option value={size}>{size} characters</option>{/each}</select>
</div>
<section class="match-side" aria-labelledby="left-heading"><h2 class="side-heading" id="left-heading">Player 1</h2><LotteryPanel configured={data.configured} panelId="left" storageKey="malchups-left-import" {count} sharedCount writing={mode === 'WRITINGSCALING'} powerscaling={mode === 'POWERSCALING'} onteam={(characters) => team('left', characters)} /></section>

<section class="match-side" aria-labelledby="right-heading"><h2 class="side-heading" id="right-heading">Player 2</h2><LotteryPanel configured={data.configured} panelId="right" storageKey="malchups-right-import" {count} sharedCount writing={mode === 'WRITINGSCALING'} powerscaling={mode === 'POWERSCALING'} onteam={(characters) => team('right', characters)} /></section>
</div><section class="match-battle" aria-label="Battle result"><button class="fight-button" disabled={!ready} onclick={fight}>FIGHT</button>
<p class="match-hint">{ready ? 'Both teams are ready.' : 'Roll both full teams and wait for any tier checks to finish.'}</p>
{#if outcome}<div class="match-outcome" role="status"><strong>{outcome}</strong><p>Player 1: {mode === 'POWERSCALING' ? (topPower(left) ?? 'Unranked') : mode === 'WRITINGSCALING' ? leftTotal.toFixed(2) + ' rating points' : leftTotal.toLocaleString() + ' favorites'}</p><p>Player 2: {mode === 'POWERSCALING' ? (topPower(right) ?? 'Unranked') : mode === 'WRITINGSCALING' ? rightTotal.toFixed(2) + ' rating points' : rightTotal.toLocaleString() + ' favorites'}</p>{#if mode === 'CLOUTSCALING' && [...left, ...right].some((c) => c.favorites == null)}<p class="match-footnote">Unknown favorite counts count as 0.</p>{/if}</div>{/if}
</section></main>
<footer><span>MALGacha / MALchups</span><p>Data: <a href="https://myanimelist.net/">MyAnimeList</a> + <a href="https://api.tenrai.org/">Tenrai</a></p></footer></div>
