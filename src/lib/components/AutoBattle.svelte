<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { attackInterval, battleHP, type BattleReplay } from '$lib/autobattle';
  let { replay, onfinish }: { replay: BattleReplay; onfinish: () => void } = $props();
  let elapsed = $state(0);
  let hp = $state(untrack(() => replay.units.map(c => battleHP(c.baseStats.hp))));
  let lastAttack = $state(Array(10).fill(0) as number[]);
  let hit = $state(Array(10).fill(-1) as number[]);
  let lines = $state<{ id: number; time: number; x1: number; y1: number; x2: number; y2: number }[]>([]);
  let board: HTMLDivElement;
  let paused = $state(false);
  let finished = $state(false);
  let announcement = $state('Battle started.');
  onMount(() => {
    let frame = 0, index = 0, previous = performance.now();
    function tick(now: number) {
      const delta = Math.min((now - previous) / 1000, 0.1); previous = now;
      if (!paused) {
        elapsed = Math.min(replay.duration, elapsed + delta);
        while (index < replay.events.length && replay.events[index].time <= elapsed) {
          const event = replay.events[index];
          hp[event.target] = event.hp; lastAttack[event.attacker] = event.time; hit[event.target] = index;
          const from = board.querySelector(`[data-unit="${event.attacker}"]`)?.getBoundingClientRect();
          const to = board.querySelector(`[data-unit="${event.target}"]`)?.getBoundingClientRect();
          const bounds = board.getBoundingClientRect();
          if (from && to) lines.push({ id: index, time: elapsed, x1: (from.x + from.width / 2 - bounds.x) / bounds.width * 1000, y1: (from.y + from.height / 2 - bounds.y) / bounds.height * 1000, x2: (to.x + to.width / 2 - bounds.x) / bounds.width * 1000, y2: (to.y + to.height / 2 - bounds.y) / bounds.height * 1000 });
          announcement = `${replay.units[event.attacker].name} hits ${replay.units[event.target].name} for ${event.damage.toFixed(1)} damage.${event.hp === 0 ? ' Knocked out.' : ''}`;
          index++;
        }
        lines = lines.filter(line => elapsed - line.time < 0.3);
        if (elapsed >= replay.duration) { finished = true; onfinish(); return; }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });
</script>

<section class="battle" aria-label="Idle battle">
  <div class="battle-heading"><h2>Autobattle · {elapsed.toFixed(1)}s</h2>{#if !finished}<button onclick={() => paused = !paused}>{paused ? 'Resume' : 'Pause'}</button>{/if}</div>
  <div class="board" bind:this={board}>
    {#each [0, 1] as side}<section><h3>{side === 0 ? 'Your team' : 'Opponent'}</h3>
      {#each replay.units.slice(side * 5, side * 5 + 5) as unit, slot}
        {@const i = side * 5 + slot}
        <div class="unit" class:knocked-out={hp[i] <= 0}>
          <div class="portrait" data-unit={i}>{#key hit[i]}{#if unit.image}<img class:hit={hit[i] >= 0} src={unit.image} alt={unit.name} />{:else}<span class:hit={hit[i] >= 0}>{unit.name}</span>{/if}{/key}</div>
          <div class="readout"><strong>{unit.name}</strong><span>HP {Math.ceil(hp[i])} / {battleHP(unit.baseStats.hp)}{hp[i] <= 0 ? ' · KO' : ''}</span>
            <progress class="health" aria-label={`${unit.name} HP`} value={hp[i]} max={battleHP(unit.baseStats.hp)}></progress>
            <span class="atb-label">ATB</span><progress class="atb" aria-label={`${unit.name} ATB`} max="1" value={hp[i] > 0 ? Math.min(1, (elapsed - lastAttack[i]) / attackInterval(unit.baseStats.speed)) : 0}></progress>
          </div>
        </div>
      {/each}
    </section>{/each}
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{#each lines as line (line.id)}<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />{/each}</svg>
  </div>
  <p class="combat-log">{announcement}</p>
  <p class="sr-only" role="status">{finished ? 'Battle finished.' : paused ? 'Battle paused.' : 'Battle in progress.'}</p>
</section>

<style>
  .battle { margin: 24px 0; border-top: 1px solid var(--purple-line); padding-top: 20px; }
  .battle-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .board { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .board section { min-width: 0; }
  .unit { display: flex; gap: 12px; padding: 12px 0; min-height: 110px; border-bottom: 1px solid var(--line); }
  .portrait { width: 76px; height: 90px; flex-shrink: 0; overflow: hidden; }
  .portrait span { font-size: 11px; display: block; padding: 4px; }
  .readout { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .readout strong { overflow-wrap: anywhere; }
  progress { appearance: none; border: 0; width: 100%; height: 8px; background: #292329; }
  progress::-webkit-progress-bar { background: #292329; }
  progress::-webkit-progress-value { background: var(--accent); }
  progress::-moz-progress-bar { background: var(--accent); }
  .atb::-webkit-progress-value { background: #a69cce; }
  .atb::-moz-progress-bar { background: #a69cce; }
  .atb-label { font: 10px var(--mono); color: var(--muted); }
  .knocked-out { opacity: 0.35; }
  svg { position: absolute; width: 100%; height: 100%; inset: 0; pointer-events: none; overflow: visible; }
  line { stroke: #f02d8a; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-dasharray: 1500; animation: strike .3s ease-out forwards; }
  .hit { animation: shake .25s ease-out; }
  @keyframes strike { from { stroke-dashoffset: 1500; opacity: 1; } to { stroke-dashoffset: 0; opacity: 0; } }
  @keyframes shake { 25% { transform: translateX(-4px); } 50% { transform: translateX(4px); } 75% { transform: translateX(-2px); } }
  .combat-log { min-height: 3em; color: var(--muted); font-size: 12px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (prefers-reduced-motion: reduce) { .hit, line { animation: none; } }
  @media (max-width: 620px) { .board { gap: 14px; } .unit { flex-direction: column; min-height: 220px; } .portrait { width: 64px; height: 72px; } }
</style>
