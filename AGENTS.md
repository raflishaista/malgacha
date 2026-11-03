# MALGacha — Project Conventions & Reference

Design and architectural guidelines for MALGacha.

---

## 1. Visual Style

- **Palette**: Dark theme (`#080808` canvas, `#101010` panels/inputs, `#f02d8a` accent, `#e8e8e3` text, `#aaa6ab` muted).
- **Sharp Edges**: `border-radius: 0` across buttons, inputs, cards, and modal dialogs.
- **Button Styling**:
  - Standard buttons: dark charcoal with thin border; hover inverts to accent with dark text.
  - Action buttons (`.mode-button`, `.fight-button`): beveled arcade press:
    - Default: `border: 1px solid #bc8eac; box-shadow: 0 5px 0 #57305e; transform: translateY(-3px);`
    - Active: `transform: translateY(2px); box-shadow: none; background: var(--accent); color: #080808;`
- **Selection**: `::selection { color: #080808; background: var(--accent); }`
- **Accessibility**:
  - Respect `@media (prefers-reduced-motion: reduce)`.
  - Visible focus outlines (`:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }`).
  - Screenreader updates via `aria-live="polite"` and `.sr-only` descriptions.
- **Rarity Hierarchy**:
  - **N (< 200 favs)**: `#9a9a96`
  - **R (≥ 200 favs)**: `#64aaff` (3px border)
  - **SR (≥ 1,000 favs)**: `#cdd5e1` (3px border)
  - **SSR (≥ 5,000 favs)**: `#f4cb62` (5px border + gold glow)
  - **UR (> 10,000 favs)**: `#bff8ff` (conic-gradient rainbow border + glow)
  - **Bosses**: 6px crimson `#ed404a` border with `.boss-tag`
- **Typography**:
  - Display font (`Raglan Punch`): headers (`h1`), `.wordmark`, `.fight-button`, match outcome banner, `.arena`, event titles.
  - Body: `Arial, Helvetica, sans-serif`.
  - Numbers/metadata: monospace (`--mono`).

---

## 2. Combat & Stats

- **Rarity & Base Stat Total (BST)**:
  - Base stats are based on MAL favorites, not canonical character strength.
  - BST by rarity: N (500), R (520), SR (545), SSR (570), UR (600).
  - Stats distributed with Gaussian weighting and variance (`distributeStats`).
  - `baseStats` on a unit are immutable; combat modifiers apply to effective battle stats.
- **Autobattler Mechanics**:
  - ATB interval: `3.6 * Math.sqrt(125 / speed)` seconds.
  - Damage formula: `25 * (2 * Attack) / (Attack + Defense)`.
  - Battle timeout: 120 seconds.
  - Deterministic replay: server simulates and returns timestamped frames/events (`simulateBattle`). Client renders playback.
- **Jobber Journeys**:
  - Team size: 5 units (expandable to 7 with relics `merry` / `sunny`).
  - Lives: 3. A loss costs 1 life; reaching 0 resets the run.
  - Encounters: 3 choices per floor (15% chance to spawn an event).
  - Boss floors: every 10 cleared floors (10, 20, 30...).
  - Item rewards: at `arenaWins % 4 === 0`, pick 1 of 3 items.

---

## 3. Architecture & Code Conventions

- **Svelte 5 Runes**: Use `$state`, `$derived`, `$props`, `$effect`. No legacy Svelte 3/4 syntax.
- **Data Schemas (`src/lib/data/*.json`)**:
  - `abilities.json`: Character passives catalog.
  - `bosses.json`: Boss definitions, stats, and abilities.
  - `items.json`: Equipment, consumables, and relics.
  - `stages.json`: Stage environments and rules.
  - `events.json`: Run events and captive pools.
- **Ability Implementations**:
  - All combat passives, thresholds, timers, and boss scripts are in `src/lib/battle/abilities/definitions.ts`.
  - Registration and catalog lookups are handled through `catalog.ts` and `index.ts`.
- **Persistence**:
  - File-based JSON in `.data/` managed by `Store` (`src/lib/server/store.ts`).
  - Atomic file writes using temporary files and rename.
- **Testing**:
  - Vitest (`npm test`).
  - Type-checking (`npm run check`).
  - Simulation tests must run deterministically. Long tests use explicit timeout configs.
