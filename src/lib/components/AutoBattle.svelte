<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import BattleEffectTags from './BattleEffectTags.svelte';
  import BattleAbilityList from './BattleAbilityList.svelte';
  import JourneyPortrait from './JourneyPortrait.svelte';
  import BossAbility from './BossAbility.svelte';
  import KeywordTags from './KeywordTags.svelte';
  import StageBanner from './StageBanner.svelte';
  import EquipmentIcons from './EquipmentIcons.svelte';
  import { unitAtFrame, visibleBattleUnits } from '$lib/battle/presentation';
  import { implementationsFor } from '$lib/battle/abilities';
  import { advanceReplayTime } from '$lib/battle/playback';
  import { bossFor, DEOXYS_FORMES } from '$lib/bosses';
  import { hasAbility } from '$lib/battle/abilities/catalog';
  import { attackInterval, battleHP, activeSeconds } from '$lib/battle/formulas';
  import { ABILITY_RULES } from '$lib/battle/abilities/config';
  import type { BattleFrame, BattleReplay } from '$lib/battle/types';

  let { replay, onfinish }: { replay: BattleReplay; onfinish: () => void } = $props();

  let combatFrame = $state<BattleFrame | undefined>(untrack(() => replay.frames?.[0]));
  const maximumHP = $derived(combatFrame?.maxHP ?? replay.units.map(c => battleHP(c.baseStats.hp)));

  let elapsed = $state(0);
  let hp = $state(untrack(() => replay.units.map(c => battleHP(c.baseStats.hp))));
  let lastAttack = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let lastRumbling = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let attackBonus = $state(Array(untrack(() => replay.units.length)).fill(0) as number[]);
  let floats = $state<{ id: number; unit: number; title: string; time: number }[]>([]);
  let hit = $state(Array(untrack(() => replay.units.length)).fill(-1) as number[]);
  let lines = $state<{ id: number; time: number; x1: number; y1: number; x2: number; y2: number }[]>([]);
  let linkLines = $state<{ source: number; target: number; x1: number; y1: number; x2: number; y2: number }[]>([]);

  let board: HTMLDivElement;
  let paused = $state(false);
  let finished = $state(false);
  let announcement = $state(untrack(() => replay.events.find(e => e.time === 0 && e.ability)?.ability ?? 'Battle started.'));
  let togglePause = $state<() => void>(() => {});

  function skipBattle() {
    elapsed = replay.duration;
    if (replay.frames?.length) {
      combatFrame = replay.frames.at(-1);
      hp = [...combatFrame!.hp];
    } else {
      hp = replay.units.map((_, i) => replay.events.filter(e => e.target === i).at(-1)?.hp ?? hp[i]);
    }
    finished = true;
    onfinish();
  }

  const isBattleRoyale = $derived(
    replay.stage === 'alcatraz' &&
    (replay.teamCounts ? replay.teamCounts.length > 2 : (combatFrame?.sides?.some(s => s >= 2) ?? false))
  );

  function survivorsCount(side: number): number {
    return replay.units.filter((_, i) =>
      (combatFrame?.sides?.[i] ?? (i < (replay.leftCount ?? 5) ? 0 : 1)) === side &&
      hp[i] > 0 &&
      (combatFrame?.participating?.[i] ?? true)
    ).length;
  }

  function teamSize(side: number): number {
    return replay.units.filter((_, i) =>
      (combatFrame?.sides?.[i] ?? (i < (replay.leftCount ?? 5) ? 0 : 1)) === side
    ).length;
  }

  function gauge(unitIndex: number, isRumbling = false): number {
    if (!isRumbling && combatFrame?.inactive?.[unitIndex]) {
      return combatFrame.atb[unitIndex];
    }
    if (isRumbling && combatFrame?.unitOverrides?.[unitIndex]?.negated) {
      return 0;
    }

    if (!combatFrame) {
      if (hp[unitIndex] <= 0) return 0;
      const lastAction = isRumbling ? lastRumbling[unitIndex] : lastAttack[unitIndex];
      const cooldown = isRumbling
        ? ABILITY_RULES.rumblingCooldown
        : attackInterval(replay.units[unitIndex].baseStats.speed);
      return Math.min(1, activeSeconds(lastAction, elapsed, unitIndex, replay.stops) / cooldown);
    }

    // Budokai inactive check
    if (replay.stage === 'budokai') {
      const mySide = combatFrame?.sides?.[unitIndex] ?? 0;
      const myPos = combatFrame?.positions?.[unitIndex];
      const hasOpponent = replay.units.some((_, otherIdx) => {
        const otherSide = combatFrame?.sides?.[otherIdx] ?? (otherIdx < (replay.leftCount ?? 5) ? 0 : 1);
        return (
          otherSide !== mySide &&
          combatFrame?.positions?.[otherIdx] === myPos &&
          hp[otherIdx] > 0
        );
      });
      if (!hasOpponent) return 0;
    }

    if (hp[unitIndex] <= 0) return 0;

    const baseProgress = isRumbling
      ? combatFrame.rumbling[unitIndex]
      : combatFrame.atb[unitIndex];
    const interval = isRumbling
      ? ABILITY_RULES.rumblingCooldown
      : combatFrame.intervals?.[unitIndex] ?? attackInterval(combatFrame.speed[unitIndex]);
    const addedTime = activeSeconds(combatFrame.time, elapsed, unitIndex, replay.stops);

    return Math.min(1, baseProgress + addedTime / interval);
  }

  function isUnitPhased(index: number): boolean {
    const unitEffects = combatFrame?.effects?.[index];
    if (!unitEffects) return false;
    const hasStun = unitEffects.some(e => e.id === 'STUN' && e.until > elapsed);
    const hasInvincible = unitEffects.some(e => e.id === 'INVINCIBLE' && e.until > elapsed);
    return hasStun && hasInvincible;
  }

  function isUnitFrozen(index: number): boolean {
    if (hp[index] <= 0) return false;
    return !!replay.stops?.some(
      stop =>
        stop.owner !== index &&
        (!stop.affected || stop.affected.includes(index)) &&
        elapsed >= stop.start &&
        elapsed < stop.end
    );
  }

  onMount(() => {
    // Preload Deoxys formes if present
    if (replay.units.some(unit => unit.boss && bossFor(unit)?.id === 74017)) {
      for (const form of Object.values(DEOXYS_FORMES)) {
        const portrait = new Image();
        portrait.src = form.image;
      }
    }

    let frameIndex = 0;
    let eventIndex = 0;
    let animFrame = 0;
    let previousTime = performance.now();

    function tick(now: number) {
      if (finished) return;
      const delta = Math.max(0, (now - previousTime) / 1000);
      previousTime = now;

      if (!paused) {
        elapsed = advanceReplayTime(elapsed, delta, replay.duration);

        // Process discrete replay events
        while (eventIndex < replay.events.length && replay.events[eventIndex].time <= elapsed) {
          const event = replay.events[eventIndex];
          if (event.target >= 0 && event.hp !== undefined) {
            hp[event.target] = event.hp;
          }

          if (event.kind === 'capture') {
            announcement = `${event.target >= 0 ? replay.units[event.target]?.name ?? 'Unit' : 'Unit'} is taken by Gun Fiend.`;
            eventIndex++;
            continue;
          }

          if (event.kind === 'environment') {
            if (event.target >= 0) hit[event.target] = eventIndex;
            announcement = event.ability ?? 'The Kōtotsu sweeps through both teams.';
            eventIndex++;
            continue;
          }

          if (!event.kind) lastAttack[event.attacker] = event.time;
          if (event.kind === 'rumbling') lastRumbling[event.attacker] = event.time;
          if (event.attackBonus !== undefined) attackBonus[event.attacker] = event.attackBonus;

          if (event.ability && elapsed - event.time < 6 && !document.hidden) {
            const hasRecentFloat = floats.some(
              f => f.unit === event.attacker && f.title === event.ability && elapsed - f.time < 0.5
            );
            if (!hasRecentFloat) {
              floats.push({
                id: eventIndex,
                unit: event.attacker,
                title: event.ability,
                time: elapsed
              });
            }
          }

          if (
            event.kind &&
            !['rumbling', 'burn', 'shrine', 'boss-attack', 'annihilate'].includes(event.kind)
          ) {
            const actorName = event.attacker >= 0 ? replay.units[event.attacker]?.name ?? 'The stage' : 'The stage';
            announcement = event.ability
              ? (event.attacker >= 0 && !event.ability.includes(' ') && !event.ability.includes('!')
                  ? `${actorName} activates ${event.ability}.`
                  : event.ability)
              : `${actorName} acts.`;
            eventIndex++;
            continue;
          }

          if (event.target >= 0) hit[event.target] = eventIndex;

          // Render attack line
          const fromEl = board?.querySelector(`[data-unit="${event.attacker}"]`)?.getBoundingClientRect();
          const toEl = board?.querySelector(`[data-unit="${event.target}"]`)?.getBoundingClientRect();
          const bounds = board?.getBoundingClientRect();

          if (
            fromEl &&
            toEl &&
            bounds &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            elapsed - event.time < 0.3 &&
            !document.hidden &&
            event.kind !== 'burn' &&
            event.kind !== 'annihilate'
          ) {
            lines.push({
              id: eventIndex,
              time: elapsed,
              x1: ((fromEl.x + fromEl.width / 2 - bounds.x) / bounds.width) * 1000,
              y1: ((fromEl.y + fromEl.height / 2 - bounds.y) / bounds.height) * 1000,
              x2: ((toEl.x + toEl.width / 2 - bounds.x) / bounds.width) * 1000,
              y2: ((toEl.y + toEl.height / 2 - bounds.y) / bounds.height) * 1000
            });
          }

          const attackerName = event.attacker >= 0 ? replay.units[event.attacker]?.name ?? 'The stage' : 'The stage';
          const targetName = event.target >= 0 ? replay.units[event.target]?.name ?? 'A unit' : 'All units';
          const damageStr = (event.damage ?? 0).toFixed(1);
          announcement = `${attackerName} hits ${targetName} for ${damageStr} damage.${event.hp === 0 ? ' Knocked out.' : ''}`;
          eventIndex++;
        }

        // Advance interpolated combat frames
        while (replay.frames && frameIndex < replay.frames.length && replay.frames[frameIndex].time <= elapsed) {
          combatFrame = replay.frames[frameIndex++];
          hp = [...combatFrame.hp];
        }

        floats = floats.filter(item => elapsed - item.time < 6);
        lines = lines.filter(line => elapsed - line.time < 0.3);

        const opponentIndices = replay.teamCounts
          ? replay.units.map((_, idx) => idx).filter(idx => idx >= (replay.teamCounts![0] ?? 5))
          : replay.units.map((_, idx) => idx).filter(idx => idx >= (replay.leftCount ?? 5));
        const allEnemiesDefeated = opponentIndices.length > 0 && opponentIndices.every(idx => (hp[idx] ?? 0) <= 0);

        if (elapsed >= replay.duration || (allEnemiesDefeated && eventIndex >= replay.events.length)) {
          finished = true;
          onfinish();
          return;
        }
      }

      // Update link lines
      if (board) {
        const bounds = board.getBoundingClientRect();
        linkLines = Object.entries(combatFrame?.links ?? {}).flatMap(([source, target]) => {
          const fromEl = board.querySelector(`[data-unit="${source}"]`)?.getBoundingClientRect();
          const toEl = board.querySelector(`[data-unit="${target}"]`)?.getBoundingClientRect();
          if (fromEl && toEl && bounds.width > 0 && bounds.height > 0) {
            return [
              {
                source: Number(source),
                target,
                x1: ((fromEl.x + fromEl.width / 2 - bounds.x) / bounds.width) * 1000,
                y1: ((fromEl.y + fromEl.height / 2 - bounds.y) / bounds.height) * 1000,
                x2: ((toEl.x + toEl.width / 2 - bounds.x) / bounds.width) * 1000,
                y2: ((toEl.y + toEl.height / 2 - bounds.y) / bounds.height) * 1000
              }
            ];
          }
          return [];
        });
      }

      animFrame = requestAnimationFrame(tick);
    }

    function sync() {
      cancelAnimationFrame(animFrame);
      tick(performance.now());
    }

    togglePause = () => {
      sync();
      paused = !paused;
      previousTime = performance.now();
    };

    document.addEventListener('visibilitychange', sync);
    const syncInterval = setInterval(sync, 500);
    animFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrame);
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', sync);
    };
  });
</script>

<section class="battle" aria-label="Idle battle">
  {#if replay.stage}
    <StageBanner stage={replay.stage} {elapsed} {finished} hellAppeared={combatFrame?.hellAppeared} {replay} />
  {/if}

  <h2 class="arena">
    Heaven's Arena : Floor {(replay.floor ?? 0) + (finished && replay.winner === 'left' ? 1 : 0)}
  </h2>

  <div class="battle-heading">
    <h2>Autobattle · {elapsed.toFixed(1)}s</h2>
    {#if !finished}
      <div class="battle-controls">
        <button type="button" onclick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" class="skip-button" onclick={skipBattle}>Skip</button>
      </div>
    {/if}
  </div>

  {#if replay.stage === 'budokai'}
    <p>
      Duel wins: {combatFrame?.duelWins?.[0] ?? 0} – {combatFrame?.duelWins?.[1] ?? 0} · First to three
    </p>
  {/if}

  {#if replay.stage === 'itomori'}
    <p>
      Remaining HP: {[0, 1]
        .map(side =>
          hp
            .reduce(
              (sum, value, i) =>
                sum +
                ((combatFrame?.sides?.[i] ?? (i < (replay.leftCount ?? 5) ? 0 : 1)) === side &&
                (combatFrame?.participating?.[i] ?? true)
                  ? (value / maximumHP[i]) * 100
                  : 0),
              0
            )
            .toFixed(1) + '%'
        )
        .join(' – ')}
    </p>
  {/if}

{#snippet compactUnit(i: number, side: number)}
  {@const unit = unitAtFrame(replay, combatFrame, i)}
  <div
    class="compact-unit"
    class:boss={unit.boss}
    class:phased={isUnitPhased(i)}
    class:knocked-out={hp[i] <= 0}
    class:frozen={isUnitFrozen(i)}
    class:player-unit={side === 0}
  >
    <div class="compact-portrait" data-unit={i}>
      <EquipmentIcons {unit} />
      {#key hit[i]}
        <div class="portrait-content" class:hit={hit[i] >= 0}>
          <JourneyPortrait {unit} />
        </div>
      {/key}
      {#each floats.filter(item => item.unit === i) as item (item.id)}
        <b class="ability-float compact-float" class:executed={item.title === 'EXECUTED'}>
          <span>{item.title}</span>
        </b>
      {/each}
      <BattleEffectTags frame={combatFrame} index={i} {elapsed} {finished} />
    </div>

    <div class="compact-info">
      <div class="compact-name-row">
        <strong class="compact-name" title={unit.name}>{unit.name}</strong>
        <span class="compact-hp-label">{hp[i] <= 0 ? 'KO' : `${Math.ceil(hp[i])}`}</span>
      </div>
      <progress
        class="health compact-health"
        aria-label={`${unit.name} HP`}
        value={hp[i]}
        max={maximumHP[i]}
      ></progress>
      {#if !implementationsFor(unit).some(ability => ability.cannotAttack)}
        <progress
          class="atb compact-atb"
          aria-label={`${unit.name} ATB`}
          max="1"
          value={gauge(i)}
        ></progress>
      {/if}
    </div>
  </div>
{/snippet}

  <div class="board" class:battle-royale-board={isBattleRoyale} bind:this={board}>
    {#if isBattleRoyale}
      <div class="alcatraz-arena-grid">
        <!-- Top: Team 1 (Opponent 1) -->
        <section class="alcatraz-zone zone-top" aria-label="Team 1">
          <header class="team-header t1">
            <span class="team-badge">TEAM 1</span>
            <h4>Opponent 1</h4>
            <span class="team-survivors">{survivorsCount(1)} alive</span>
          </header>
          <div class="compact-units-row">
            {#each visibleBattleUnits(replay, combatFrame, 1) as i (i)}
              {@render compactUnit(i, 1)}
            {/each}
          </div>
        </section>

        <div class="alcatraz-arena-middle">
          <!-- Left: Team 4 (Opponent 3) -->
          <section class="alcatraz-zone zone-left" aria-label="Team 4">
            <header class="team-header t4">
              <span class="team-badge">TEAM 4</span>
              <h4>Opponent 3</h4>
              <span class="team-survivors">{survivorsCount(3)} alive</span>
            </header>
            <div class="compact-units-col">
              {#each visibleBattleUnits(replay, combatFrame, 3) as i (i)}
                {@render compactUnit(i, 3)}
              {/each}
            </div>
          </section>

          <!-- Center: Battle Arena -->
          <div class="alcatraz-center-ring">
            <span class="ring-title">ALCATRAZ TOWER</span>
            <p class="ring-subtitle">4-WAY BATTLE ROYALE</p>
            <div class="ring-announcement">{announcement}</div>
            <div class="ring-scoreboard">
              <span class="chip t1">T1: {survivorsCount(1)}/5</span>
              <span class="chip t2">T2: {survivorsCount(2)}/5</span>
              <span class="chip t3 player">YOU: {survivorsCount(0)}/{teamSize(0)}</span>
              <span class="chip t4">T4: {survivorsCount(3)}/5</span>
            </div>
          </div>

          <!-- Right: Team 2 (Opponent 2) -->
          <section class="alcatraz-zone zone-right" aria-label="Team 2">
            <header class="team-header t2">
              <span class="team-badge">TEAM 2</span>
              <h4>Opponent 2</h4>
              <span class="team-survivors">{survivorsCount(2)} alive</span>
            </header>
            <div class="compact-units-col">
              {#each visibleBattleUnits(replay, combatFrame, 2) as i (i)}
                {@render compactUnit(i, 2)}
              {/each}
            </div>
          </section>
        </div>

        <!-- Bottom: Team 3 (Your Team) -->
        <section class="alcatraz-zone zone-bottom" aria-label="Team 3 (Your Team)">
          <header class="team-header t3 player">
            <span class="team-badge player">TEAM 3</span>
            <h4>YOUR TEAM</h4>
            <span class="team-survivors">{survivorsCount(0)} alive</span>
          </header>
          <div class="compact-units-row">
            {#each visibleBattleUnits(replay, combatFrame, 0) as i (i)}
              {@render compactUnit(i, 0)}
            {/each}
          </div>
        </section>
      </div>
    {:else}
      {#each [0, 1] as side}
        <section>
          <h3>{side === 0 ? 'Your team' : 'Opponent'}</h3>
          {#each visibleBattleUnits(replay, combatFrame, side) as i (i)}
          {@const unit = unitAtFrame(replay, combatFrame, i)}
          <div
            class="unit"
            class:boss={unit.boss}
            class:phased={isUnitPhased(i)}
            class:witch={unit.witch}
            class:knocked-out={hp[i] <= 0}
            class:frozen={isUnitFrozen(i)}
            class:castle-room-0={replay.stage === 'infinite_castle' && (combatFrame?.castleRooms?.[i] ?? 0) === 0}
            class:castle-room-1={replay.stage === 'infinite_castle' && (combatFrame?.castleRooms?.[i] ?? 0) === 1}
          >
            <div class="portrait" data-unit={i}>
              <EquipmentIcons {unit} />
              {#key hit[i]}
                <div class="portrait-content" class:hit={hit[i] >= 0}>
                  <JourneyPortrait {unit} />
                </div>
              {/key}

              {#each floats.filter(item => item.unit === i) as item (item.id)}
                <b class="ability-float" class:executed={item.title === 'EXECUTED'}>
                  <span>{item.title}</span>
                </b>
              {/each}

              <BattleEffectTags frame={combatFrame} index={i} {elapsed} {finished} />

              {#if combatFrame?.counters?.[i]}
                <div class="counter" class:gamble={combatFrame.counters[i].digits}>
                  {#if combatFrame.counters[i].digits}
                    {@const digits = combatFrame.counters[i].digits!}
                    {@const isRiichi = digits[0] > 0 && digits[0] === digits[1] && digits[2] !== digits[0]}
                    {@const isJackpot = digits[0] > 0 && digits[0] === digits[1] && digits[1] === digits[2]}
                    {#if isRiichi}
                      <span class="riichi-tag">RIICHI!</span>
                    {:else if isJackpot}
                      <span class="jackpot-tag">JACKPOT!</span>
                    {/if}
                    <div class="gamble-slots">
                      {#each digits as digit, j}
                        <span class="slot-digit" class:rolling={!finished && combatFrame.counters[i].value === j}>
                          {digit}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    {Math.floor(combatFrame.counters[i].value)}%
                  {/if}
                </div>
              {/if}
            </div>

            <div class="readout">
              {#if replay.stage === 'budokai'}
                <span class="atb-label">Duel {(combatFrame?.positions?.[i] ?? 0) + 1}</span>
              {:else if replay.stage === 'infinite_castle'}
                <span class="atb-label castle-badge" class:room-0={(combatFrame?.castleRooms?.[i] ?? 0) === 0} class:room-1={(combatFrame?.castleRooms?.[i] ?? 0) === 1}>
                  Room {(combatFrame?.castleRooms?.[i] ?? 0) + 1}
                </span>
              {/if}

              <strong>
                {unit.name}
                <KeywordTags {unit} />
                {#if unit.boss}
                  <span class="boss-tag">BOSS</span>
                {/if}
              </strong>

              <span>
                HP {Math.ceil(hp[i])} / {Math.ceil(maximumHP[i])}{hp[i] <= 0 ? ' · KO' : ''}
              </span>

              <progress class="health" aria-label={`${unit.name} HP`} value={hp[i]} max={maximumHP[i]}>
              </progress>

              {#if !implementationsFor(unit).some(ability => ability.cannotAttack)}
                <span class="atb-label">ATB</span>
                <progress class="atb" aria-label={`${unit.name} ATB`} max="1" value={gauge(i)}>
                </progress>
              {/if}

              {#if !unit.boss}
                {#each combatFrame?.bossGauges?.filter(g => g.owner === i) ?? [] as timing}
                  <span class="atb-label">{timing.title}</span>
                  <progress
                    aria-label={`${timing.title} charge`}
                    max="1"
                    value={finished || hp[i] <= 0
                      ? 0
                      : Math.min(
                          1,
                          timing.progress +
                            activeSeconds(combatFrame?.time ?? 0, elapsed, i, replay.stops) /
                              timing.cooldown
                        )}
                  ></progress>
                {/each}
              {/if}

              {#if unit.boss}
                <BossAbility
                  {unit}
                  owner={i}
                  frame={combatFrame}
                  {elapsed}
                  stops={replay.stops}
                  {finished}
                  gaugeOnly
                />
              {/if}

              {#if hasAbility(unit, 40882)}
                <span class="atb-label">Rumbling</span>
                <progress
                  class="rumbling"
                  aria-label={`${unit.name} Rumbling`}
                  max="1"
                  value={gauge(i, true)}
                ></progress>
              {/if}

              {#if hasAbility(unit, 175198)}
                <span class="atb-label">
                  Malevolent Shrine {combatFrame?.shrineUsed?.[i] ? '· Used' : ''}
                </span>
                <progress
                  aria-label={`${unit.name} Malevolent Shrine`}
                  max="1"
                  value={!unit.negated && !combatFrame?.shrineUsed?.[i] && hp[i] > 0
                    ? Math.min(
                        1,
                        (combatFrame?.shrine?.[i] ?? 0) +
                          activeSeconds(combatFrame?.time ?? 0, elapsed, i, replay.stops) /
                            ABILITY_RULES.shrineCooldown
                      )
                    : 0}
                ></progress>
              {/if}

              <BattleAbilityList {unit} />

              {#if combatFrame?.aura[i]}
                <span>All stats +10% · Driver’s High</span>
              {/if}

              {#if attackBonus[i] > 0}
                <span>ATK +{attackBonus[i]} · Kakuja</span>
              {/if}
            </div>
          </div>
        {/each}
      </section>
    {/each}
  {/if}

    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {#each lines as line (line.id)}
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      {/each}
      {#each linkLines as link}
        <line class="chain" x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} />
      {/each}
    </svg>
  </div>

  <p class="combat-log">{announcement}</p>
  <p class="sr-only" role="status">
    {finished ? 'Battle finished.' : paused ? 'Battle paused.' : 'Battle in progress.'}
  </p>
</section>

<style>
  .chain {
    stroke: #888;
    animation: none;
    stroke-dasharray: none;
    opacity: 0.8;
  }
  .phased .portrait-content {
    filter: grayscale(1);
    opacity: 0.4;
  }
  .portrait-content {
    position: absolute;
    inset: 0;
  }
  .witch .portrait {
    border: 2px solid #ffad65;
  }
  .ability-float.executed {
    color: #ff424b;
  }
  .arena {
    color: var(--accent);
    margin-bottom: 16px;
  }
  .frozen {
    background: #302443;
  }
  .ability-float {
    position: absolute;
    bottom: 70%;
    left: 0;
    z-index: 6;
    white-space: nowrap;
    color: #ffcfec;
    background: #120e18;
    padding: 3px 6px;
    font-size: 12px;
    animation: ability-rise 3s ease-out forwards;
    pointer-events: none;
  }
  @keyframes ability-rise {
    0% {
      transform: translateY(0);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: translateY(-40px);
      opacity: 0;
    }
  }
  .ability-float > span {
    display: inline-block;
    animation: shake 0.3s ease-in-out 3;
  }
  .counter {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    background: #111;
    border: 2px solid var(--accent);
    color: #fff;
    z-index: 9;
    padding: 3px 7px;
    font: bold 16px var(--mono);
    white-space: nowrap;
  }
  .counter.gamble {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
  }
  .gamble-slots {
    display: flex;
    gap: 4px;
  }
  .riichi-tag {
    font: 900 9px var(--mono);
    color: #ffd700;
    letter-spacing: 0.1em;
    text-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
    animation: riichi-pulse 0.4s ease-in-out infinite alternate;
  }
  .jackpot-tag {
    font: 900 9px var(--mono);
    color: var(--accent);
    letter-spacing: 0.1em;
    text-shadow: 0 0 8px var(--accent);
  }
  @keyframes riichi-pulse {
    from {
      opacity: 0.6;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1.05);
    }
  }
  .counter .rolling {
    animation: digit-roll 0.15s steps(2) infinite;
  }
  @keyframes digit-roll {
    50% {
      transform: translateY(-3px);
      opacity: 0.4;
    }
  }
  .rumbling::-webkit-progress-value {
    background: #e5a052;
  }
  .rumbling::-moz-progress-bar {
    background: #e5a052;
  }
  @media (prefers-reduced-motion: reduce) {
    .ability-float,
    .ability-float > span,
    .counter .rolling {
      animation: none;
    }
  }
  .battle {
    margin: 24px 0;
    border-top: 1px solid var(--purple-line);
    padding-top: 20px;
  }
  .battle-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .battle-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .skip-button {
    border-color: var(--accent);
    color: var(--accent);
  }
  .skip-button:hover {
    background: var(--accent);
    color: #080808;
  }
  .board {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .board section {
    min-width: 0;
  }
  .unit {
    display: flex;
    gap: 12px;
    padding: 12px 0;
    min-height: 110px;
    border-bottom: 1px solid var(--line);
    transition: outline 0.3s ease;
  }
  .unit.castle-room-0 {
    outline: 2px solid #eab308;
    outline-offset: -2px;
    padding-left: 8px;
    padding-right: 8px;
    background: rgba(234, 179, 8, 0.04);
  }
  .unit.castle-room-1 {
    outline: 2px solid #38bdf8;
    outline-offset: -2px;
    padding-left: 8px;
    padding-right: 8px;
    background: rgba(56, 189, 248, 0.04);
  }
  .castle-badge.room-0 {
    color: #eab308;
  }
  .castle-badge.room-1 {
    color: #38bdf8;
  }
  .portrait {
    width: 76px;
    height: auto;
    aspect-ratio: var(--character-portrait-ratio);
    align-self: flex-start;
    flex-shrink: 0;
    overflow: visible;
  }
  .portrait span {
    font-size: 11px;
    display: block;
    padding: 4px;
  }
  .readout {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .readout strong {
    overflow-wrap: anywhere;
  }
  progress {
    appearance: none;
    border: 0;
    width: 100%;
    height: 8px;
    background: #292329;
  }
  progress::-webkit-progress-bar {
    background: #292329;
  }
  progress::-webkit-progress-value {
    background: var(--accent);
  }
  progress::-moz-progress-bar {
    background: var(--accent);
  }
  .atb::-webkit-progress-value {
    background: #a69cce;
  }
  .atb::-moz-progress-bar {
    background: #a69cce;
  }
  .atb-label {
    font: 10px var(--mono);
    color: var(--muted);
  }
  .knocked-out {
    opacity: 0.35;
  }
  svg {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
  line {
    stroke: #f02d8a;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 1500;
    animation: strike 0.3s ease-out forwards;
  }
  .hit {
    animation: shake 0.25s ease-out;
  }
  @keyframes strike {
    from {
      stroke-dashoffset: 1500;
      opacity: 1;
    }
    to {
      stroke-dashoffset: 0;
      opacity: 0;
    }
  }
  @keyframes shake {
    25% {
      transform: translateX(-4px);
    }
    50% {
      transform: translateX(4px);
    }
    75% {
      transform: translateX(-2px);
    }
  }
  .combat-log {
    min-height: 3em;
    color: var(--muted);
    font-size: 12px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @media (prefers-reduced-motion: reduce) {
    .hit,
    line {
      animation: none;
    }
  }
  @media (max-width: 620px) {
    .board {
      gap: 14px;
    }
    .unit {
      flex-direction: column;
      min-height: 220px;
    }
    .portrait {
      width: 64px;
    }
  }

  /* 4-Team Battle Royale Styling */
  .battle-royale-board {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    width: 100%;
    background: #080808;
    border: 1px solid #222;
    padding: 8px;
    box-sizing: border-box;
  }
  .alcatraz-arena-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    position: relative;
    z-index: 2;
  }
  .alcatraz-arena-middle {
    display: grid;
    grid-template-columns: 140px 1fr 140px;
    gap: 8px;
    align-items: center;
    min-height: 240px;
  }
  .alcatraz-zone {
    background: #101010;
    border: 1px solid #252525;
    padding: 6px;
    box-sizing: border-box;
  }
  .alcatraz-zone.zone-bottom {
    border-color: #57305e;
    background: #120e14;
  }
  .team-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    margin-bottom: 6px;
    text-transform: uppercase;
    font-family: monospace;
  }
  .team-header h4 {
    margin: 0;
    font-size: 11px;
    color: #e8e8e3;
    font-weight: bold;
  }
  .team-badge {
    padding: 2px 5px;
    font-size: 10px;
    font-weight: bold;
    border: 1px solid #444;
    color: #fff;
  }
  .team-header.t1 .team-badge {
    background: #0369a1;
    border-color: #38bdf8;
    color: #e0f2fe;
  }
  .team-header.t2 .team-badge {
    background: #6b21a8;
    border-color: #c084fc;
    color: #f3e8ff;
  }
  .team-header.t3.player .team-badge {
    background: var(--accent);
    border-color: #ff9ed2;
    color: #080808;
  }
  .team-header.t4 .team-badge {
    background: #854d0e;
    border-color: #facc15;
    color: #fef08a;
  }
  .team-survivors {
    margin-left: auto;
    color: #aaa;
    font-size: 10px;
  }
  .compact-units-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .compact-units-col {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .compact-unit {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    background: #141414;
    border: 1px solid #262626;
    padding: 3px 5px;
    box-sizing: border-box;
    min-width: 115px;
    max-width: 145px;
    flex: 1 1 115px;
  }
  .compact-unit.player-unit {
    border-color: #57305e;
  }
  .compact-unit.knocked-out {
    opacity: 0.35;
    filter: grayscale(1);
    background: #0c0c0c;
  }
  .compact-portrait {
    width: 32px;
    height: 32px;
    min-width: 32px;
    position: relative;
    border: 1px solid #444;
    overflow: hidden;
    background: #000;
  }
  .compact-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .compact-name-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2px;
  }
  .compact-name {
    font-size: 10px;
    color: #e8e8e3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60px;
  }
  .compact-hp-label {
    font-size: 9px;
    font-family: monospace;
    color: #888;
  }
  .compact-unit.knocked-out .compact-hp-label {
    color: #ef4444;
    font-weight: bold;
  }
  .compact-health {
    height: 4px;
    width: 100%;
  }
  .compact-atb {
    height: 3px;
    width: 100%;
  }
  .compact-float {
    font-size: 9px;
    padding: 1px 3px;
    bottom: 80%;
  }
  .alcatraz-center-ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 12px 8px;
    border: 1px dashed #333;
    background: #0a0a0a;
    min-height: 160px;
    gap: 6px;
  }
  .ring-title {
    font-family: 'Raglan Punch', Impact, sans-serif;
    font-size: 18px;
    color: var(--accent);
    letter-spacing: 1px;
  }
  .ring-subtitle {
    font-size: 10px;
    font-family: monospace;
    color: #888;
    margin: 0;
    text-transform: uppercase;
  }
  .ring-announcement {
    font-size: 11px;
    color: #fff;
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    background: #141414;
    border: 1px solid #222;
    max-width: 90%;
  }
  .ring-scoreboard {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .ring-scoreboard .chip {
    font-size: 10px;
    font-family: monospace;
    padding: 2px 5px;
    background: #161616;
    border: 1px solid #333;
  }
  .ring-scoreboard .chip.t1 { border-color: #38bdf8; color: #38bdf8; }
  .ring-scoreboard .chip.t2 { border-color: #c084fc; color: #c084fc; }
  .ring-scoreboard .chip.t3.player {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: bold;
    background: #251020;
  }
  .ring-scoreboard .chip.t4 { border-color: #facc15; color: #facc15; }

  @media (max-width: 640px) {
    .alcatraz-arena-middle {
      grid-template-columns: 110px 1fr 110px;
      gap: 5px;
    }
    .compact-unit {
      min-width: 95px;
      padding: 2px;
    }
    .compact-portrait {
      width: 26px;
      height: 26px;
      min-width: 26px;
    }
    .compact-name {
      max-width: 45px;
      font-size: 9px;
    }
    .ring-title {
      font-size: 15px;
    }
  }
</style>

