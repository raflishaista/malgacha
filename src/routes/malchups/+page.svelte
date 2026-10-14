<script lang="ts">
import { topPower, powerWinner } from '$lib/power';
import { onMount } from 'svelte';
import LotteryPanelMALchups from '$lib/components/LotteryPanelMALchups.svelte';
import SiteHeader from '$lib/components/SiteHeader.svelte';
import '../../style.css';
import { favoriteTotal, cloutWinner, writingTotal } from '$lib/match';
import type { PoolCharacter } from '$lib/types';
let { data } = $props();
let count = $state(5);
let panels: HTMLDivElement;
onMount(() => {
 const options = [...panels.querySelectorAll<HTMLElement>('.draw-options')];
 const collections = [...panels.querySelectorAll<HTMLElement>('.collection')];
 const draws = [...panels.querySelectorAll<HTMLElement>('.draw')];
 const selector = panels.querySelector<HTMLElement>('.match-selector')!;
 let frame = 0;
 const align = () => {
  if (window.innerWidth <= 760) {
   options.forEach((el) => el.style.paddingTop = '');
   [...collections, ...draws].forEach((el) => el.style.minHeight = '');
   selector.style.top = '';
   return;
  }
  // Measure natural sizes before matching each pair, including when content shrinks.
  [...collections, ...draws].forEach((el) => el.style.minHeight = '');
  options.forEach((el) => el.style.paddingTop = '');
  const collectionHeight = Math.max(...collections.map((el) => el.getBoundingClientRect().height));
  collections.forEach((el) => el.style.minHeight = collectionHeight + 'px');
  const tops = options.map((el) => el.getBoundingClientRect().top);
  const top = Math.max(...tops);
  options.forEach((el, i) => { el.style.paddingTop = (top - tops[i]) + 'px'; });
  const drawHeight = Math.max(...draws.map((el) => el.getBoundingClientRect().height));
  draws.forEach((el) => el.style.minHeight = drawHeight + 'px');
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
let drawingBoth = $state(false);
let leftReady = $state(false);
let rightReady = $state(false);
let drawError = $state('');
let leftPanel = $state<{ roll: () => Promise<PoolCharacter[] | null> }>();
let rightPanel = $state<{ roll: () => Promise<PoolCharacter[] | null> }>();
async function drawAndFight() {
 if (drawingBoth || !leftReady || !rightReady || !leftPanel || !rightPanel) return;
 drawingBoth = true; outcome = ''; drawError = '';
 try {
  const draws = await Promise.allSettled([leftPanel.roll(), rightPanel.roll()]);
  const first = draws[0].status === 'fulfilled' ? draws[0].value : null;
  const second = draws[1].status === 'fulfilled' ? draws[1].value : null;
  if (!first || !second || first.length !== count || second.length !== count) {
   drawError = 'Both draws must finish before comparing. Check each player’s pool or error message, then try again.';
   return;
  }
  left = first; right = second;
  fight();
 } finally { drawingBoth = false; }
}
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
<div class="match-modes" aria-label="Match mode">{#each ['POWERSCALING', 'CLOUTSCALING', 'WRITINGSCALING'] as option}<button class="mode-button" disabled={drawingBoth} aria-pressed={mode === option} onclick={() => { left = []; right = []; mode = option; outcome = ''; drawError = ''; }}>{option}</button>{/each}</div>
{#if mode === 'POWERSCALING'}<p>Highest tier on each matched profile wins. Tiers load after rolling; missing or ambiguous profiles stay unranked.</p>{/if}
{#if mode === 'WRITINGSCALING'}<p>One score per character: their highest-rated series in your imported collection. Series can contribute more than once. Finish importing before drawing.</p>{/if}
</div>
<div class="match-panels" bind:this={panels}><div class="match-selector"><label for="match-count">Characters per draw</label><select id="match-count" disabled={drawingBoth} bind:value={count} onchange={() => { left = []; right = []; outcome = ''; }}>{#each [5,6,7,8,9,10] as size}<option value={size}>{size} characters</option>{/each}</select>
</div>
<section class="match-side" aria-labelledby="left-heading"><h2 class="side-heading" id="left-heading">Player 1</h2><LotteryPanelMALchups bind:this={leftPanel} onready={(ready) => leftReady = ready} locked={drawingBoth} configured={data.configured} panelId="left" storageKey="malchups-left-import" {count} sharedCount writing={mode === 'WRITINGSCALING'} powerscaling={mode === 'POWERSCALING'} onteam={(characters) => team('left', characters)} /></section>

<section class="match-side" aria-labelledby="right-heading"><h2 class="side-heading" id="right-heading">Player 2</h2><LotteryPanelMALchups bind:this={rightPanel} onready={(ready) => rightReady = ready} locked={drawingBoth} configured={data.configured} panelId="right" storageKey="malchups-right-import" {count} sharedCount writing={mode === 'WRITINGSCALING'} powerscaling={mode === 'POWERSCALING'} onteam={(characters) => team('right', characters)} /></section>
</div><section class="match-battle" aria-label="Battle result">
<p class="match-hint" role="status">{drawingBoth ? mode === 'POWERSCALING' ? 'Drawing both teams and checking VS Battles tiers…' : 'Drawing both teams…' : leftReady && rightReady ? '' : 'Import both profiles and make sure each pool can supply a full draw.'}</p>
{#if drawError}<p role="alert">{drawError}</p>{/if}
{#if ready && !drawingBoth}<button onclick={fight}>Compare current draws</button>{/if}
{#if outcome}<div class="match-outcome" role="status"><strong>{outcome}</strong><p>Player 1: {mode === 'POWERSCALING' ? (topPower(left) ?? 'Unranked') : mode === 'WRITINGSCALING' ? leftTotal.toFixed(2) + ' rating points' : leftTotal.toLocaleString() + ' favorites'}</p><p>Player 2: {mode === 'POWERSCALING' ? (topPower(right) ?? 'Unranked') : mode === 'WRITINGSCALING' ? rightTotal.toFixed(2) + ' rating points' : rightTotal.toLocaleString() + ' favorites'}</p>{#if mode === 'CLOUTSCALING' && [...left, ...right].some((c) => c.favorites == null)}<p class="match-footnote">Unknown favorite counts count as 0.</p>{/if}</div>{/if}
<button class="fight-button draw-fight" disabled={drawingBoth || !leftReady || !rightReady} onclick={drawAndFight}>{drawingBoth ? 'DRAWING & COMPARING…' : 'DRAW & FIGHT'}</button>
</section></main>
<footer><span>MALGacha</span><p>Data: <a href="https://myanimelist.net/">MyAnimeList</a> + <a href="https://api.tenrai.org/">Tenrai</a></p></footer></div>
<style>.draw-fight { width: min(440px, 100%); min-height: 76px; font-size: clamp(22px, 3vw, 32px); }</style>
