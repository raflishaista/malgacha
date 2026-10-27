# Battle code

`engine.ts` runs the event scheduler, attacks, targeting, death resolution and stage victory rules. It clones incoming units and returns the existing replay format. It never saves a team or changes the original `baseStats`.

| File | Responsibility |
| --- | --- |
| `abilities/` | One implementation per working passive, plus a registry and balance settings |
| `abilities/bosses/` | Boss-only hooks, excluded from normal character and Stand Arrow pools |
| `statuses.ts` | Battle-local Burn/Chill application, refresh, tick, expiry and time-stop behavior |
| `keywords.ts` | Keyword labels and bonuses, independent of event choices |
| `modifiers.ts` | Calculation of effective stats from original stats and bonuses |
| `equipment.ts` | Equipment effect handlers and team support targeting |
| `item-effects.ts` | Battle-start and landed-hit item hooks, including Behelit and negation |
| `stage-effects.ts` | Timed environment effects and impact results |
| `formulas.ts` | Damage, HP conversion, attack intervals and active time |
| `types.ts` | Saved replay/event/frame types |

The older `autobattle.ts` and `battle-abilities.ts` files re-export these modules so existing callers and tests continue to work. Item and event modules also retain their previous helper exports. Catalog text stays in `data/*.json`; listing an ability does not activate its mechanics.

## Boss battles

Boss tuning, portraits and forme definitions live in `bosses.ts`. Grand Fisher, Kurama, Gun Devil, Deoxys and Sahaquiel have active implementations; Mahoraga remains a preview. Sahaquiel uses local ID `-1001` and a local portrait, not a fabricated MAL record.

The ability context exposes battle-only actions for summons, capture, forme changes and a decisive wipe. Each boss implementation owns its timers and triggers. Lures reuse a single summon slot, and carry explicit Taunt rather than inheriting Masaki's catalog abilities. A living lure shields Grand Fisher from newly targeted single-target and area attacks.

Gun Fiend picks the lowest original base BST, with ties resolved in original slot order. It removes that unit only from the battle and uses its current effective stats plus half the defeated boss's effective stats. The host's equipment and modifiers are folded into these values once; its character passives are not copied. The boss keeps its Gun Fiend identity and cannot capture a second time. The original player roster is untouched.

Replay units contain initial identities plus summon templates. Frames carry optional identity/forme overrides and boss gauges. `presentation.ts` ensures summons are not displayed before their spawn frame. These fields are additive, so earlier saved replays still render. Forme changes replace `battleModifiers`, preserve HP percentage and accumulated ATB, and do not overwrite the original rolled stats.

Sahaquiel's 20-second countdown is an absolute battle deadline. It does not attack, The World does not delay the countdown, and the final wipe bypasses revives. Metavision may cancel the one-use deadline before it fires. Journeys always plays at two simulation seconds per real second, so the countdown lasts ten real seconds. There is no speed toggle or saved speed preference. `playback.ts` owns the clock conversion; combat timers, floors, reward milestones and reroll counts retain their existing values.

## Adding an ability

1. Keep its stable MAL character ID and description in `data/abilities.json`.
2. Create an implementation in `abilities/` using `AbilityDefinition`.
3. Register it in `abilities/index.ts`. The implemented-ID list, inventory passive choices and timed-ability list derive from this registry.
4. Add a balance value to `abilities/config.ts` when needed.
5. Test both sides, multiple granted abilities, deaths/revives and any affected stage rules.

Hooks currently supported:

- `onStart`: startup feedback. Existing combinations preserve the prior single-message priority.
- `onTimed`: heal, time stop or an area attack. Return the delay to the next activation. Each ability has its own timer.
- `onAttack`: combine normal-attack damage multipliers after the base damage formula. Random effects roll once per attack, not once per target.
- `onHit`: apply effects such as Burn after normal attack damage.
- `onOtherDeath`: reactions from living units after a death, such as Kakuja.
- `canReviveAlly` / `onAllyDeath`: revive an eligible fallen ally.
- `onLaterDeath`: reactions from units already dead before a damage batch, such as Chainsaw Heart.

Abilities use a typed `AbilityContext` with combat actions instead of reaching into scheduler arrays. Their `state(owner, abilityId)` belongs only to that battle. One-use flags survive a revive within the same battle and reset in the next battle. Add state fields when a new mechanic actually requires them.

Timed hooks schedule their next activation after the current action resolves. Returning `Infinity` ends that ability's schedule. Reviving a unit restarts repeatable timers but does not replenish spent one-use attacks.

## Modifier order

The refactor retains the existing calculation order:

1. Base values + equipment additions + permanent additions.
2. Soul Gem / Marine keyword percentage bonuses.
3. Witch multiplier.
4. Temporary flat Attack additions, such as Kakuja.
5. Ally aura multipliers.
6. Temporary Speed multiplier, such as Turbo Granny.

Same-ability auras do not stack with themselves. Equipment copies do stack. Stat recalculation preserves current HP percentage when maximum HP changes. Chill changes ATB refill rate rather than the stored Speed stat. Damage reduction also applies to Burn as it did before the refactor.

## Death and stage ordering

Death resolution clears attack/status timers and refreshes auras, then runs living death reactions. Soul Gem transformation takes priority over an ally revive. Already-dead Chainsaw Heart holders react afterward. Stage restrictions still determine which units can target, support or revive one another.

Time stop pauses character-inflicted Burn, while stage-inflicted Burn continues. Stage timers are not paused by The World. Boss encounters ignore stages. Itomori ends at impact; a surviving Witch prevents a player victory. These are existing rules, not new balancing choices.

## Verification

Run `npm test` and `npm run check`. `regression.test.ts` retains the 26 plain-combat golden replays and checks deterministic current behavior for 52 mixed-ability scenarios. Black Flash and Sukuna now intentionally differ from the original balance. See `CHARACTER_ABILITIES.md` for the new hooks, defaults and interaction rules.
