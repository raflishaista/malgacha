<script lang="ts">
  import {
    EVENTS,
    QUIZ_QUESTIONS,
    MARINE_IDS,
    ROCKET_IDS,
    eventCharacter,
    type JourneyEvent,
    type EventAction,
    type ButlerName,
    type JankenChoice
  } from '$lib/events';
  import type { JourneyCharacter } from '$lib/types';
  import Card from './JourneyCharacter.svelte';

  let {
    event,
    team,
    busy,
    error,
    onchoice,
    ontarget,
    onaction,
    onclose
  }: {
    event: JourneyEvent;
    team: JourneyCharacter[];
    busy: boolean;
    error: string;
    onchoice: (choice: 'yes' | 'no') => void;
    ontarget: (id: string) => void;
    onaction?: (action: Omit<EventAction, 'index'>) => void;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;

  const isMandatory = $derived(
    (event.id === 'parasyte' || event.id === 'rocket') && event.status !== 'complete'
  );

  // Character portraits for events
  const eventDef = $derived(EVENTS[event.id] as {
    title: string;
    text: string;
    quote?: string;
    characterId?: number;
    characterIds?: number[];
  });

  const leadCharacter = $derived(
    eventDef.characterId ? eventCharacter(eventDef.characterId) : null
  );

  const previewUnits = $derived.by(() => {
    if (event.previewTeam?.length) return event.previewTeam;
    if (event.id === 'marine') return MARINE_IDS.slice(0, 5).map((id) => eventCharacter(id));
    if (event.id === 'rocket') return ROCKET_IDS.map((id) => eventCharacter(id));
    return [];
  });

  // Gotoh Coin Test flashing sequence + 5s timer
  let gotohStep = $state(0);
  let gotohGuessing = $state(false);
  let gotohRemainingMs = $state(5000);

  $effect(() => {
    if (event.id === 'gotoh' && event.status === 'play') {
      const passes = event.gotohPasses ?? [];
      gotohStep = 0;
      gotohGuessing = passes.length === 0;
      gotohRemainingMs = 5000;

      if (passes.length > 0) {
        const interval = setInterval(() => {
          if (gotohStep + 1 < passes.length) {
            gotohStep += 1;
          } else {
            gotohGuessing = true;
            clearInterval(interval);
          }
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  });

  $effect(() => {
    if (event.id === 'gotoh' && event.status === 'play' && gotohGuessing && !busy) {
      const start = performance.now();
      const duration = 5000;
      const timer = setInterval(() => {
        const elapsed = performance.now() - start;
        gotohRemainingMs = Math.max(0, duration - elapsed);
        if (gotohRemainingMs <= 0) {
          clearInterval(timer);
          onaction?.({ butler: 'timeout' });
        }
      }, 50);
      return () => clearInterval(timer);
    }
  });

  // Madaonaire 10s timer
  let madaoRemainingMs = $state(10000);

  $effect(() => {
    if (event.id === 'madao' && event.status === 'play' && !busy) {
      const start = performance.now();
      const duration = 10000;
      madaoRemainingMs = duration;
      const timer = setInterval(() => {
        const elapsed = performance.now() - start;
        madaoRemainingMs = Math.max(0, duration - elapsed);
        if (madaoRemainingMs <= 0) {
          clearInterval(timer);
          onaction?.({ answer: 'timeout' });
        }
      }, 50);
      return () => clearInterval(timer);
    }
  });

  // Janken Boy & Hangman 180s timer
  let longTimerRemainingSec = $state(180);

  $effect(() => {
    if ((event.id === 'janken' || event.id === 'hangman') && event.status === 'play') {
      const deadline = Date.now() + 180_000;
      longTimerRemainingSec = 180;
      const timer = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        longTimerRemainingSec = left;
        if (left <= 0 && !busy) {
          clearInterval(timer);
          if (event.id === 'janken') onaction?.({ janken: 'timeout' });
          else onaction?.({ cardIndex: 'timeout' });
        }
      }, 250);
      return () => clearInterval(timer);
    }
  });

  $effect(() => {
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  });

  function handleCancel(e: Event) {
    e.preventDefault();
    if (!busy && !isMandatory && ['choice', 'complete'].includes(event.status)) {
      onclose();
    }
  }

  function submitJanken(janken: JankenChoice) {
    onaction?.({ janken });
  }

  function submitButler(butler: ButlerName) {
    onaction?.({ butler });
  }

  function submitHangmanCard(cardIndex: number) {
    onaction?.({ cardIndex });
  }

  function submitQuizAnswer(answer: number) {
    onaction?.({ answer });
  }
</script>

<dialog bind:this={dialog} aria-labelledby="event-title" oncancel={handleCancel}>
  <div class="event-window">
    <span class="event-tag">EVENT ENCOUNTER</span>
    <h2 id="event-title">{eventDef.title}</h2>

    <!-- Top Character Portrait(s) -->
    {#if event.id === 'marine' && event.status === 'choice'}
      <div class="portrait-strip" aria-label="Navy captors">
        {#each previewUnits as unit}
          <div class="mini-portrait">
            {#if unit.image}
              <img src={unit.image} alt={unit.name} />
            {/if}
            <span>{unit.name}</span>
          </div>
        {/each}
      </div>
    {:else if event.id === 'rocket' && event.status === 'choice'}
      <div class="portrait-strip" aria-label="Team Rocket">
        {#each previewUnits as unit}
          <div class="mini-portrait">
            {#if unit.image}
              <img src={unit.image} alt={unit.name} />
            {/if}
            <span>{unit.name}</span>
          </div>
        {/each}
      </div>
    {:else if leadCharacter?.image && event.status !== 'reward'}
      <div class="speaker-portrait">
        <img src={leadCharacter.image} alt={leadCharacter.name} />
        <span class="speaker-name">{leadCharacter.name}</span>
      </div>
    {/if}

    <!-- CHOICE STATUS -->
    {#if event.status === 'choice'}
      {#if event.id === 'wildcard'}
        <div class="dialogue-box">
          <p class="quote">{eventDef.quote}</p>
          <p class="prompt-note">Pick one unit from your team (returns after 5 floors with +50 to all stats and the Wild Card keyword):</p>
        </div>

        <div class="units">
          {#each team as unit (unit.instanceId)}
            {@const hasWildCard = unit.keywords?.includes('WILD CARD')}
            <button
              disabled={busy || unit.empty || hasWildCard}
              onclick={() => ontarget(unit.instanceId)}
            >
              {#if unit.image}
                <img src={unit.image} alt={unit.name} />
              {/if}
              <strong>{unit.name}</strong>
              {#if hasWildCard}
                <span class="soul-gem-badge">WILD CARD</span>
              {/if}
            </button>
          {/each}
        </div>

        <div class="choices">
          <button disabled={busy} onclick={() => onchoice('no')}>
            Decline
          </button>
          <button class="secondary" disabled={busy} onclick={onclose}>
            Back to pathways
          </button>
        </div>
      {:else if event.id === 'parasyte'}
        {#if event.targetUnitImage}
          <div class="targeted-unit-box">
            <img src={event.targetUnitImage} alt={event.targetUnitName ?? ''} />
            <span>Target: <strong>{event.targetUnitName}</strong></span>
          </div>
        {/if}
        <div class="dialogue-box">
          <p>
            A Parasyte crawled into <strong>{event.targetUnitName ?? 'your unit'}</strong>’s arm!
            Will it crawl to their head, or will they fight back and prevent it?
          </p>
        </div>
        <div class="choices">
          <button class="primary" disabled={busy} onclick={() => onchoice('yes')}>
            Fight back!
          </button>
        </div>
      {:else if event.id === 'rocket'}
        <div class="dialogue-box motto-box">
          {#each (eventDef.quote ?? '').split('\n') as line}
            <p class="quote-line">{line}</p>
          {/each}
          <p class="target-alert">
            Team Rocket is aiming to steal <strong>{event.targetUnitName ?? 'a unit'}</strong> from your team!
          </p>
        </div>
        {#if event.targetUnitImage}
          <div class="targeted-unit-box">
            <img src={event.targetUnitImage} alt={event.targetUnitName ?? ''} />
            <span>Targeted: <strong>{event.targetUnitName}</strong></span>
          </div>
        {/if}
        <div class="choices">
          <button class="primary" disabled={busy} onclick={() => onchoice('yes')}>
            Battle Team Rocket!
          </button>
        </div>
      {:else}
        <div class="dialogue-box">
          {#if eventDef.quote}
            <p class="quote">{eventDef.quote}</p>
          {/if}
          <p>{eventDef.text}</p>
        </div>
        <div class="choices">
          <button
            class="primary"
            disabled={busy || (event.id === 'creature' && team.every((c) => c.empty || c.soulGem))}
            onclick={() => onchoice('yes')}
          >
            Yes
          </button>
          <button disabled={busy} onclick={() => onchoice('no')}>
            No
          </button>
        </div>
        <button class="secondary" disabled={busy} onclick={onclose}>
          Back to pathways
        </button>
      {/if}

    <!-- CONFIRM STATUS (Ego's Wild Card after selecting unit) -->
    {:else if event.status === 'confirm' && event.id === 'wildcard'}
      {#if event.targetUnitImage}
        <div class="targeted-unit-box">
          <img src={event.targetUnitImage} alt={event.targetUnitName ?? ''} />
          <span>Selected: <strong>{event.targetUnitName}</strong></span>
        </div>
      {/if}
      <div class="dialogue-box">
        <p class="quote">“If I were you, I’d be kicking that trash out.”</p>
        <p class="quote">
          “However… they still have a chance to return to your team if they get ahold of the ‘Wild Card’ in my Blue Lock program. I’ll offer you, and that one, a chance.”
        </p>
      </div>
      <div class="choices">
        <button class="primary" disabled={busy} onclick={() => onchoice('yes')}>
          Accept
        </button>
        <button disabled={busy} onclick={() => onchoice('no')}>
          Decline
        </button>
      </div>

    <!-- PLAY STATUS (Mini-games: Janken, Gotoh, Hangman, Madaonaire) -->
    {:else if event.status === 'play'}
      {#if event.id === 'janken'}
        <div class="timer-pill">Time Remaining: {longTimerRemainingSec}s</div>
        {#if event.jankenTie}
          <div class="dialogue-box tie-alert" role="status">
            <p>
              You played <strong>{event.jankenPlayer?.toUpperCase()}</strong> and the boy played
              <strong>{event.jankenEnemy?.toUpperCase()}</strong>!
            </p>
            <p class="quote">“It’s a tie! Let’s go again!”</p>
          </div>
        {:else}
          <div class="dialogue-box">
            <p class="quote">“Rock, paper, scissors… shoot!”</p>
            <p class="description">Choose your hand:</p>
          </div>
        {/if}
        <div class="janken-cards">
          <button class="janken-card" disabled={busy} onclick={() => submitJanken('rock')}>
            <span class="janken-icon">✊</span>
            <strong>ROCK</strong>
          </button>
          <button class="janken-card" disabled={busy} onclick={() => submitJanken('paper')}>
            <span class="janken-icon">🖐️</span>
            <strong>PAPER</strong>
          </button>
          <button class="janken-card" disabled={busy} onclick={() => submitJanken('scissors')}>
            <span class="janken-icon">✌️</span>
            <strong>SCISSORS</strong>
          </button>
        </div>

      {:else if event.id === 'gotoh'}
        {#if !gotohGuessing}
          <div class="gotoh-flash-box" aria-live="assertive">
            <span class="flash-step">SHUFFLE {gotohStep + 1} / {(event.gotohPasses ?? []).length}</span>
            {#key gotohStep}
              <p class="flash-text">{(event.gotohPasses ?? [])[gotohStep]}</p>
            {/key}
          </div>
        {:else}
          <div class="dialogue-box">
            <p class="quote">“Well? Which one of us has the coin?”</p>
          </div>
          <div class="timer-bar-wrap" aria-label="5 second timer">
            <div class="timer-bar-fill" style="width: {(gotohRemainingMs / 5000) * 100}%"></div>
          </div>
          <span class="timer-readout">{(gotohRemainingMs / 1000).toFixed(1)}s</span>

          <div class="butler-diamond">
            <button
              class="butler-btn butler-top"
              disabled={busy}
              onclick={() => submitButler('Gotoh')}
            >
              Gotoh
            </button>
            <div class="butler-middle-row">
              <button
                class="butler-btn butler-left"
                disabled={busy}
                onclick={() => submitButler('Left Butler')}
              >
                Left Butler
              </button>
              <button
                class="butler-btn butler-right"
                disabled={busy}
                onclick={() => submitButler('Right Butler')}
              >
                Right Butler
              </button>
            </div>
            <button
              class="butler-btn butler-behind"
              disabled={busy}
              onclick={() => submitButler('Behind Butler')}
            >
              Behind Butler
            </button>
          </div>
        {/if}

      {:else if event.id === 'hangman'}
        <div class="timer-pill">Time Remaining: {longTimerRemainingSec}s</div>
        <div class="hangman-board">
          <div class="hangman-zone">
            <span class="zone-label">SADAKUNI’S HAND — CLICK A CARD TO DRAW ({event.hangmanEnemyCount ?? (event.hangmanEnemyHand?.length ?? 0)})</span>
            <div class="card-row">
              {#each Array.from({ length: event.hangmanEnemyCount ?? (event.hangmanEnemyHand?.length ?? 0) }) as _, idx}
                <button
                  class="playing-card card-back"
                  disabled={busy}
                  aria-label={`Draw card ${idx + 1} from Sadakuni`}
                  onclick={() => submitHangmanCard(idx)}
                >
                  <span class="back-emblem">KAKEROU</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="hangman-log" role="status" aria-live="polite">
            {#each event.hangmanLog ?? ['Pairs are being discarded…'] as line}
              <p>{line}</p>
            {/each}
          </div>

          <div class="hangman-zone">
            <span class="zone-label">YOUR HAND ({(event.hangmanPlayerHand ?? []).length})</span>
            <div class="card-row">
              {#each event.hangmanPlayerHand ?? [] as card (card.id)}
                <div
                  class="playing-card card-face"
                  class:heart={card.suit === 'heart'}
                  class:joker={card.suit === 'joker'}
                >
                  <span class="card-rank">{card.label}</span>
                  <span class="card-suit">
                    {card.suit === 'spade' ? '♠' : card.suit === 'heart' ? '♥' : 'JOKER'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        </div>

      {:else if event.id === 'madao'}
        {@const quiz = QUIZ_QUESTIONS[event.quizIndex ?? 0]}
        <div class="dialogue-box">
          <p class="quote">“Answer this question:”</p>
        </div>
        <div class="timer-bar-wrap" aria-label="10 second timer">
          <div class="timer-bar-fill" style="width: {(madaoRemainingMs / 10000) * 100}%"></div>
        </div>
        <span class="timer-readout">{(madaoRemainingMs / 1000).toFixed(1)}s</span>

        <div class="quiz-question-box">
          <p>{quiz.question}</p>
        </div>

        <div class="quiz-options-grid">
          {#each quiz.options as option, idx}
            <button
              class="quiz-option-btn"
              disabled={busy}
              onclick={() => submitQuizAnswer(idx)}
            >
              <span class="option-letter">{['A', 'B', 'C', 'D'][idx]}</span>
              <span>{option}</span>
            </button>
          {/each}
        </div>
      {/if}

    <!-- TARGET STATUS -->
    {:else if event.status === 'target'}
      {#if event.outcome === 'won'}
        <div class="outcome-banner win">
          <strong>YOU WON!</strong>
        </div>
      {/if}
      {#if event.id === 'janken'}
        <div class="dialogue-box">
          <p class="quote">“Waah!”</p>
          <p>Choose a unit on your team to receive <strong>{event.abilityName}</strong>:</p>
        </div>
      {:else if event.id === 'wildcard'}
        <div class="dialogue-box">
          <p class="quote">{eventDef.quote}</p>
          <p>Pick one unit from your team:</p>
        </div>
      {:else}
        <div class="dialogue-box">
          <p>Choose a unit to receive a Soul Gem.</p>
          <p class="description">
            Gain 15% Attack, Defense, and Speed. When it dies, it becomes a Witch that attacks everyone.
          </p>
        </div>
      {/if}

    <!-- REWARD STATUS -->
    {:else if event.status === 'reward'}
      {#if event.outcome === 'won'}
        <div class="outcome-banner win">
          <strong>YOU WON!</strong>
        </div>
      {/if}
      <div class="dialogue-box">
        {#if event.quote}
          <p class="quote">{event.quote}</p>
        {/if}
        <p>
          You got <strong>{event.reward?.name}</strong>! Choose the team slot they will replace.
        </p>
      </div>
      {#if event.reward}
        <div class="rescued">
          <Card character={event.reward} />
        </div>
      {/if}

    <!-- COMPLETE STATUS -->
    {:else if event.status === 'complete'}
      {#if event.outcome === 'won'}
        <div class="outcome-banner win">
          <strong>YOU WON!</strong>
        </div>
      {:else if event.outcome === 'lost' || event.outcome === 'timeout'}
        <div class="outcome-banner loss">
          <strong>YOU LOST!</strong>
        </div>
      {/if}
      {#if event.targetUnitImage}
        <div class="targeted-unit-box">
          <img src={event.targetUnitImage} alt={event.targetUnitName ?? ''} />
          {#if event.targetUnitName}
            <span><strong>{event.targetUnitName}</strong></span>
          {/if}
        </div>
      {/if}
      <div class="dialogue-box">
        {#if event.quote}
          <p class="quote">{event.quote}</p>
        {/if}
        <p>{event.message ?? 'Event complete.'}</p>
      </div>
      <button class="primary" onclick={onclose}>
        Continue
      </button>
    {/if}

    <!-- UNIT PICKER FOR TARGET / REWARD -->
    {#if ['target', 'reward'].includes(event.status)}
      <div class="units">
        {#each team as unit (unit.instanceId)}
          {@const ineligible =
            event.status === 'target' &&
            (unit.empty ||
              (event.id === 'creature' && unit.soulGem) ||
              (event.id === 'wildcard' && unit.keywords?.includes('WILD CARD')))}
          <button disabled={busy || ineligible} onclick={() => ontarget(unit.instanceId)}>
            {#if unit.image}
              <img src={unit.image} alt={unit.name} />
            {/if}
            <strong>{unit.name}</strong>
            {#if unit.soulGem}
              <span class="soul-gem-badge">Soul Gem</span>
            {/if}
            {#if unit.keywords?.includes('WILD CARD')}
              <span class="soul-gem-badge">Wild Card</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if event.status === 'target' && event.id === 'creature' && team.every((c) => c.empty || c.soulGem)}
        <p class="empty-note">No eligible units remain.</p>
      {/if}
    {/if}

    {#if error}
      <p role="alert" class="event-error">{error}</p>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(820px, calc(100% - 24px));
    max-height: 92vh;
    overflow: auto;
    border: 2px solid var(--accent);
    background: #101010;
    color: #e8e8e3;
    padding: 28px 24px;
    box-shadow: 0 0 32px rgba(240, 45, 138, 0.22);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.85);
  }

  .event-window {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    width: 100%;
  }

  .event-tag {
    font: bold 11px var(--mono);
    letter-spacing: 0.14em;
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 3px 10px;
    background: #160c12;
  }

  h2 {
    font-family: 'Raglan Punch', Impact, sans-serif;
    font-size: clamp(24px, 4vw, 34px);
    color: var(--accent);
    margin: 0;
    letter-spacing: 0.03em;
  }

  .outcome-banner {
    width: 100%;
    max-width: 480px;
    padding: 10px 16px;
    text-align: center;
    border-radius: 0;
    font-family: 'Raglan Punch', Impact, sans-serif;
    font-size: clamp(24px, 3.5vw, 32px);
    letter-spacing: 2px;
  }
  .outcome-banner.win {
    background: #0d2818;
    color: #4ade80;
    border: 2px solid #22c55e;
    box-shadow: 0 0 16px rgba(34, 197, 94, 0.35);
  }
  .outcome-banner.loss {
    background: #2a0808;
    color: #f87171;
    border: 2px solid #ef4444;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.35);
  }

  p {
    margin: 0;
    line-height: 1.55;
  }

  .speaker-portrait,
  .targeted-unit-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--line);
    background: #0b0b0b;
  }

  .speaker-portrait img,
  .targeted-unit-box img {
    width: 130px;
    max-height: 185px;
    object-fit: contain;
    background: #080808;
  }

  .speaker-name {
    font: bold 12px var(--mono);
    color: var(--muted);
  }

  .portrait-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 10px;
    background: #0b0b0b;
    border: 1px solid var(--line);
  }

  .mini-portrait {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 96px;
    font-size: 11px;
    color: var(--muted);
  }

  .mini-portrait img {
    width: 84px;
    height: 118px;
    object-fit: cover;
    border: 1px solid var(--line);
    background: #080808;
  }

  .dialogue-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 660px;
    padding: 16px 20px;
    background: #0b0b0b;
    border: 1px solid var(--line);
  }

  .motto-box {
    max-height: 240px;
    overflow-y: auto;
    gap: 4px;
  }

  .quote,
  .quote-line {
    color: #fff;
    font-style: italic;
    font-weight: 600;
  }

  .target-alert {
    margin-top: 8px;
    color: var(--accent);
    font-weight: 700;
  }

  .description,
  .prompt-note {
    color: var(--muted);
    font-size: 14px;
  }

  .choices {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 6px;
  }

  .choices button {
    min-width: 130px;
  }

  .units {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
    gap: 12px;
    width: 100%;
    margin: 8px 0;
  }

  .units button {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--line);
    background: #151515;
  }

  .units button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .units button img {
    width: 100%;
    max-width: 140px;
    aspect-ratio: var(--character-portrait-ratio);
    object-fit: contain;
    background: #0d0d0d;
  }

  .soul-gem-badge {
    color: #a69cce;
    font: bold 10px var(--mono);
  }

  .rescued {
    width: 180px;
    margin: 8px auto;
  }

  /* Timer styles */
  .timer-pill {
    font: bold 13px var(--mono);
    color: var(--accent);
    background: #160c12;
    border: 1px solid var(--accent);
    padding: 4px 12px;
  }

  .timer-bar-wrap {
    width: 100%;
    max-width: 560px;
    height: 10px;
    background: #1c1c1c;
    border: 1px solid var(--line);
    overflow: hidden;
  }

  .timer-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.05s linear;
  }

  .timer-readout {
    font: bold 13px var(--mono);
    color: var(--muted);
  }

  /* Janken Boy UI */
  .janken-cards {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 16px;
    width: 100%;
    margin-top: 8px;
  }

  .janken-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 150px;
    height: 180px;
    background: #151515;
    border: 2px solid var(--line);
    font-size: 16px;
  }

  .janken-card:hover:not(:disabled) {
    border-color: var(--accent);
    transform: translateY(-3px);
  }

  .janken-icon {
    font-size: 44px;
  }

  /* Gotoh Coin Test UI */
  .gotoh-flash-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    max-width: 580px;
    min-height: 150px;
    padding: 24px;
    background: #090909;
    border: 2px solid var(--accent);
  }

  .flash-step {
    font: bold 11px var(--mono);
    color: var(--accent);
  }

  .flash-text {
    font-size: clamp(18px, 3vw, 24px);
    font-weight: 700;
    color: #fff;
    animation: pulseFlash 0.95s ease-in-out;
  }

  @keyframes pulseFlash {
    0% {
      opacity: 0.15;
      transform: scale(0.96);
    }
    25% {
      opacity: 1;
      transform: scale(1);
    }
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0.25;
    }
  }

  .butler-diamond {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    width: 100%;
    max-width: 500px;
    margin-top: 10px;
  }

  .butler-middle-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    gap: 24px;
  }

  .butler-btn {
    min-width: 150px;
    padding: 14px 20px;
    font-weight: 700;
    border: 2px solid var(--line);
    background: #151515;
  }

  .butler-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .butler-behind {
    margin-top: 18px;
  }

  /* Kakerou Hangman Game UI */
  .hangman-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
  }

  .hangman-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px;
    background: #0b0b0b;
    border: 1px solid var(--line);
  }

  .zone-label {
    font: bold 11px var(--mono);
    color: var(--muted);
    letter-spacing: 0.08em;
  }

  .card-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .playing-card {
    width: 64px;
    height: 94px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 2px solid #d8d8d2;
    font-family: var(--mono);
    font-weight: 700;
    padding: 4px;
  }

  .card-back {
    background: repeating-linear-gradient(
      45deg,
      #1a0912,
      #1a0912 6px,
      #2c0e1f 6px,
      #2c0e1f 12px
    );
    border-color: var(--accent);
    color: var(--accent);
    cursor: pointer;
  }

  .card-back:hover:not(:disabled) {
    transform: translateY(-4px);
    background: var(--accent);
    color: #080808;
  }

  .back-emblem {
    font-size: 9px;
    letter-spacing: 0.06em;
  }

  .card-face {
    background: #141414;
    color: #e8e8e3;
  }

  .card-face.heart {
    color: #ff5c77;
    border-color: #ff5c77;
  }

  .card-face.joker {
    background: #230b17;
    color: var(--accent);
    border-color: var(--accent);
  }

  .card-rank {
    font-size: 18px;
  }

  .card-suit {
    font-size: 12px;
  }

  .hangman-log {
    width: 100%;
    max-width: 600px;
    padding: 10px 14px;
    background: #141414;
    border: 1px solid var(--line);
    font: 13px var(--mono);
    color: #e8e8e3;
  }

  /* Madaodog Madaonaire Quiz UI */
  .quiz-question-box {
    width: 100%;
    max-width: 680px;
    padding: 20px;
    background: #0b0b0b;
    border: 2px solid var(--accent);
    font-size: clamp(16px, 2.4vw, 20px);
    font-weight: 700;
  }

  .quiz-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    width: 100%;
    max-width: 680px;
  }

  @media (max-width: 560px) {
    .quiz-options-grid {
      grid-template-columns: 1fr;
    }
  }

  .quiz-option-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 14px 16px;
    background: #151515;
    border: 1px solid var(--line);
    font-size: 14px;
  }

  .quiz-option-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .option-letter {
    font: bold 14px var(--mono);
    color: var(--accent);
    padding: 2px 7px;
    border: 1px solid var(--accent);
    background: #0c0c0c;
  }

  .event-error {
    color: #ff96c8;
    margin-top: 8px;
  }

  .empty-note {
    color: var(--muted);
  }
</style>
