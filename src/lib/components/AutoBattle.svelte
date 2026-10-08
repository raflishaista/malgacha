<script lang="ts">
  import EquipmentIcons from './EquipmentIcons.svelte';
  import { hasAbility, keywordsFor, STATUS_RULES } from '$lib/battle-abilities';
  import { onMount, untrack } from 'svelte';
  import { attackInterval, battleHP, activeSeconds, ABILITY_RULES, type BattleFrame, type BattleReplay } from '$lib/autobattle';
  let { replay, onfinish }: { replay: BattleReplay; onfinish: () => void } = $props();
  let combatFrame = $state<BattleFrame | undefined>(untrack(() => replay.frames?.[0]));
  const maximumHP = $derived(combatFrame?.maxHP ?? replay.units.map(c => battleHP(c.baseStats.hp)));
  function gauge(i: number, rumbling = false) {
    if (!combatFrame) return hp[i] > 0 ? Math.min(1, activeSeconds(rumbling ? lastRumbling[i] : lastAttack[i], elapsed, i, replay.stops) / (rumbling ? ABILITY_RULES.rumblingCooldown : attackInterval(replay.units[i].baseStats.speed))) : 0;
    return hp[i] > 0 ? Math.min(1, (rumbling ? combatFrame.rumbling[i] : combatFrame.atb[i]) + activeSeconds(combatFrame.time, elapsed, i, replay.stops) / (rumbling ? ABILITY_RULES.rumblingCooldown : attackInterval(combatFrame.speed[i]))) : 0;
  }
  let elapsed = $state(0);
  let hp = $state(untrack(() => replay.units.map(c => battleHP(c.baseStats.hp))));
  let lastAttack = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let lastRumbling = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let attackBonus = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let floats = $state<{ id: number; unit: number; title: string; time: number }[]>([]);
  let hit = $state(Array(untrack(() => replay.units.length)).fill(-1) as number[]);
  let lines = $state<{ id: number; time: number; x1: number; y1: number; x2: number; y2: number }[]>([]);
  let board: HTMLDivElement;
  let paused = $state(false);
  let finished = $state(false);
  let announcement = $state('Battle started.');
  let togglePause = $state<() => void>(() => {});
  onMount(() => {
    let frameIndex = 0;
    let frame = 0, index = 0, previous = performance.now();
    function tick(now: number) {
      if (finished) return;
      const delta = Math.max(0, (now - previous) / 1000); previous = now;
      if (!paused) {
        elapsed = Math.min(replay.duration, elapsed + delta);
        while (index < replay.events.length && replay.events[index].time <= elapsed) {
          const event = replay.events[index];
          hp[event.target] = event.hp;
          if (!event.kind) lastAttack[event.attacker] = event.time;
          if (event.kind === 'rumbling') lastRumbling[event.attacker] = event.time;
          if (event.attackBonus !== undefined) attackBonus[event.attacker] = event.attackBonus;
          if (event.ability && elapsed - event.time < 1.5 && !document.hidden) floats.push({ id: index, unit: event.attacker, title: event.ability, time: elapsed });
          if (event.kind && !['rumbling', 'burn', 'shrine'].includes(event.kind)) {
            announcement = replay.units[event.attacker].name + ' activates ' + event.ability + '.';
            index++; continue;
          }
          hit[event.target] = index;
          const from = board.querySelector(`[data-unit="${event.attacker}"]`)?.getBoundingClientRect();
          const to = board.querySelector(`[data-unit="${event.target}"]`)?.getBoundingClientRect();
          const bounds = board.getBoundingClientRect();
          if (from && to && bounds.width > 0 && bounds.height > 0 && elapsed - event.time < 0.3 && !document.hidden && event.kind !== 'burn') lines.push({ id: index, time: elapsed, x1: (from.x + from.width / 2 - bounds.x) / bounds.width * 1000, y1: (from.y + from.height / 2 - bounds.y) / bounds.height * 1000, x2: (to.x + to.width / 2 - bounds.x) / bounds.width * 1000, y2: (to.y + to.height / 2 - bounds.y) / bounds.height * 1000 });
          announcement = `${replay.units[event.attacker].name} hits ${replay.units[event.target].name} for ${event.damage.toFixed(1)} damage.${event.hp === 0 ? ' Knocked out.' : ''}`;
          index++;
        }
        while (replay.frames && frameIndex < replay.frames.length && replay.frames[frameIndex].time <= elapsed) { combatFrame = replay.frames[frameIndex++]; hp = [...combatFrame.hp]; }
        floats = floats.filter(item => elapsed - item.time < 1.5);
        lines = lines.filter(line => elapsed - line.time < 0.3);
        if (elapsed >= replay.duration) { finished = true; onfinish(); return; }
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() { cancelAnimationFrame(frame); tick(performance.now()); }
    togglePause = () => { sync(); paused = !paused; previous = performance.now(); };
    document.addEventListener('visibilitychange', sync);
    const timer = setInterval(sync, 500);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  });
</script>

<section class="battle" aria-label="Idle battle">
  <h2 class="arena">Heaven's Arena : Floor {(replay.floor ?? 0) + (finished && replay.winner === 'left' ? 1 : 0)}</h2>
  <div class="battle-heading"><h2>Autobattle · {elapsed.toFixed(1)}s</h2>{#if !finished}<button onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>{/if}</div>
  <div class="board" bind:this={board}>
    {#each [0, 1] as side}<section><h3>{side === 0 ? 'Your team' : 'Opponent'}</h3>
      {#each (side === 0 ? replay.units.slice(0, replay.leftCount ?? 5) : replay.units.slice(replay.leftCount ?? 5)) as unit, slot}
        {@const i = (side === 0 ? 0 : replay.leftCount ?? 5) + slot}
        <div class="unit" class:boss={unit.boss} class:knocked-out={hp[i] <= 0} class:frozen={hp[i] > 0 && replay.stops?.some(stop => stop.owner !== i && elapsed >= stop.start && elapsed < stop.end)}>
          <div class="portrait" data-unit={i}><EquipmentIcons {unit} />{#key hit[i]}{#if unit.image}<img class:hit={hit[i] >= 0} src={unit.image} alt={unit.name} />{:else}<span class:hit={hit[i] >= 0}>{unit.name}</span>{/if}{/key}{#each floats.filter(item => item.unit === i) as item (item.id)}<b class="ability-float">{item.title}</b>{/each}{#if !finished && hp[i] > 0 && (combatFrame?.burnUntil[i] ?? 0) > elapsed}<div class="status-burn"><button aria-label="Burn status" aria-describedby={'burn-' + i}>BURN</button><span role="tooltip" id={'burn-' + i}>{STATUS_RULES.burn.description}</span></div>{/if}</div>
          <div class="readout"><strong>{unit.name}{#each keywordsFor(unit) as keyword}<span class="keyword">{keyword}</span>{/each}{#if unit.boss}<span class="boss-tag">BOSS</span>{/if}</strong><span>HP {Math.ceil(hp[i])} / {Math.ceil(maximumHP[i])}{hp[i] <= 0 ? ' · KO' : ''}</span>
            <progress class="health" aria-label={`${unit.name} HP`} value={hp[i]} max={maximumHP[i]}></progress>
            <span class="atb-label">ATB</span><progress class="atb" aria-label={`${unit.name} ATB`} max="1" value={gauge(i)}></progress>
            {#if hasAbility(unit, 40882)}<span class="atb-label">Rumbling</span><progress class="rumbling" aria-label={unit.name + ' Rumbling'} max="1" value={gauge(i, true)}></progress>{/if}
            {#if hasAbility(unit, 175198)}<span class="atb-label">Malevolent Shrine {combatFrame?.shrineUsed?.[i] ? '· Used' : ''}</span><progress aria-label={unit.name + ' Malevolent Shrine'} max="1" value={!combatFrame?.shrineUsed?.[i] && hp[i] > 0 ? Math.min(1, (combatFrame?.shrine?.[i] ?? 0) + activeSeconds(combatFrame?.time ?? 0, elapsed, i, replay.stops) / ABILITY_RULES.shrineCooldown) : 0}></progress>{/if}
            {#if combatFrame?.aura[i]}<span>All stats +10% · Driver’s High</span>{/if}
            {#if attackBonus[i] > 0}<span>ATK +{attackBonus[i]} · Kakuja</span>{/if}
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
  .keyword { color: #64aaff; font: bold 11px var(--mono); margin-left: 7px; }
  .status-burn { position: absolute; right: -2px; top: -2px; z-index: 7; }
  .status-burn button { min-height: 0; padding: 3px; border: 1px solid #ff773e; background: #923316; color: #fff0df; font: bold 10px var(--mono); }
  .portrait .status-burn span { display: none; position: absolute; top: 100%; right: 0; width: 190px; padding: 10px; background: #19120e; border: 1px solid #ff773e; color: #fff0df; }
  .portrait .status-burn:hover span, .portrait .status-burn:focus-within span { display: block; }
  .arena { color: var(--accent); margin-bottom: 16px; }
  .frozen { background: #302443; }
  .ability-float { position: absolute; bottom: 70%; left: 0; z-index: 6; white-space: nowrap; color: #ffcfec; background: #120e18; padding: 3px 6px; font-size: 12px; animation: ability-rise 1.5s ease-out forwards; pointer-events: none; }
  @keyframes ability-rise { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-35px); opacity: 0; } }
  .rumbling::-webkit-progress-value { background: #e5a052; }
  .rumbling::-moz-progress-bar { background: #e5a052; }
  @media (prefers-reduced-motion: reduce) { .ability-float { animation: none; } }
  .battle { margin: 24px 0; border-top: 1px solid var(--purple-line); padding-top: 20px; }
  .battle-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .board { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .board section { min-width: 0; }
  .unit { display: flex; gap: 12px; padding: 12px 0; min-height: 110px; border-bottom: 1px solid var(--line); }
  .portrait { width: 76px; height: 90px; flex-shrink: 0; overflow: visible; }
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
