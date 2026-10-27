# Character ability implementation

Catalog names and descriptions remain in `data/abilities.json`. Mechanics are registered through `battle/abilities/index.ts`; the full current character catalog now has implementations. Boss preview entries remain separate.

| File | Mechanics |
| --- | --- |
| `abilities/thresholds.ts` | Goku, Vegeta, Oguri, Guts, Shinji, Tetsuo, Kaiji, Reset, Yuujirou and Takumi |
| `abilities/timed.ts` | Gear 5, Ichigo, Geass, Jotaro, Death Note, Soma, Shigeo, Hakari, Isagi, Reg and Yugi |
| `abilities/active.ts` | Summons, absorption, crew replacement, targeting, hit/death reactions, Full Counter and Adam |
| `abilities/expanded-config.ts` | New balance defaults, copy exclusions, magic-series and magical-girl name pools |
| `abilities/special-units.ts` | Verified MAL identities, portraits and exact special-unit BST budgets |
| `battle/effects.ts` | Battle-local buffs/debuffs, duration and visual metadata |
| `server/engine.ts` | Saving permanent rewards, One For All inheritance and one encounter retry |

Existing character implementation files remain in place. Each definition uses typed combat actions and owns its state. No new dependencies or external battle-data requests are needed.

## Presentation

Activation labels remain visible for about three real seconds at the fixed 2× playback rate, with a short shake before fading. Reduced-motion preferences disable the animation. Repeated identical messages in a short interval share one label.

All passive titles and their descriptions appear below the ATB and special gauges. Buffs use white boxes on the left of portraits; debuffs use dark boxes on the right. Shigeo's percentage and Hakari's digits appear at the bottom center. Judgment Chain has a persistent gray link between the bound units.

## Timing and defaults

Times below are simulation seconds; Journeys plays at two simulation seconds per real second.

- Gear 5: every 10 seconds, REFLECT lasts 6 seconds.
- Ichigo: a 6-second gauge, triple normal attack damage.
- Geass: every 8 seconds, 5 seconds of BERSERK.
- Jotaro: every 7 seconds, a 1.5-second time stop. Dio retains 10 seconds / 3 seconds.
- Death Note: one activation after 12 seconds; selects highest current total stats, with slot order breaking ties.
- Shigeo: rises from 0 to 100 at three points per second, then gains +50 all stats. This interprets “reaches 100” as an increasing percentage counter.
- Hakari: one digit per second from 1–7; a completed three-digit jackpot heals to full and adds +77 all stats for the battle.
- Reg: double-power attacks against up to two enemies; after five attack actions, recharges for 5 seconds.
- Yugi: one uniformly selected eligible card every 4 seconds. Mahad and Slifer each leave the card pool after being summoned once. Cards requiring an unavailable target can have no effect.
- Book Maker: every third attack applies −20 to every stat for 6 seconds.
- Shinji: +25 all stats during his six-second last stand, with a 50% chance per attack to target allies.
- Kaiji: initial 75% fatal-hit survival, halved after each success.
- GANTZ: 25 points per last-hit kill. Spend 100 to revive an ally; otherwise, a battle without allied deaths can spend 100 for +30 permanent all stats.

These defaults are centralized for later balancing.

## Summons, absorption and transformations

Naruto clones once at startup. Ash and Red summon Pikachu (MAL 3891, 620 BST). Clones retain other passives but cannot summon recursively. Summons occupy extra slots, and do not participate in Budokai's first-five duels or Valley's selected duel. Existing permanent extra slots are retained.

Yugi can summon Mahad (MAL 142840, 540 BST) and Slifer (local special-unit ID, 650 BST, supplied portrait) once each. Special BST allocation uses the existing bounded generator with a configurable budget.

Spike changes up to four allies in the original first five slots to Faye (2), Jet (3), Ein (4), and Edward (16), each at 620 BST. Extra permanent units are not replaced. Simon absorbs other participating allies, receives +50 all stats per ally, inherits keywords and the first two available passives overall, and receives up to three absorbed items only if initially unequipped. Startup priority resolves ordinary summons, then crew replacement, then Simon's absorption.

Tetsuo gains +15 all stats and heals 25% maximum HP for each absorbed ally. Himiko transforms once, loses Transform for that battle and returns to her saved identity afterward. Battle-only summons, crew replacements, swaps, absorption, copied abilities, stat buffs and transformations never overwrite the saved roster.

## Reflection, copying and interruptions

Full Counter and Adam act on enemy character abilities. Items, stages, boss abilities and other copying/reflection abilities are excluded. Full Counter is once per battle. A reflected time stop makes Meliodas the sole moving unit. Yugi's actual card is selected before checking targets, so a self-buff is not incorrectly reflected.

Adam gains copied abilities for the current battle and immediately invokes timed/startup effects when applicable. Passive traits apply to later qualifying actions. Duplicate grants and bounded activation depth prevent copy loops. Parody uses the same safe character pool and displays its chosen title.

REFLECT reflects attack damage once; it does not bounce repeatedly between reflect holders. Existing items and statuses keep their existing negation rules. NEGATED suppresses new passive activations and keywords, but does not erase effects already produced; those keep their expiry. Swords and Stardust pause ATB and delay charged offensive attacks until the stun ends.

Metavision starts charged, including for opposing startup abilities, and takes 5 seconds to recharge after blocking an activation. It may cancel Sahaquiel's deadline, as requested. Canceled one-use abilities, including the native Sukuna Shrine and Sahaquiel's deadline, are spent for that battle. Instant-kill character abilities are allowed against bosses. The original native Sukuna Shrine now has three pulses; the separate 20-stack Host of Sukuna upgrade still has five.

Judgment Chain executes its linked target before that target's activation resolves, while Kurapika remains active. Normal fatal-hit protections can respond to lethal character damage; a fired Sahaquiel wipe still bypasses revives. Guts and Shinji's final expiry is fatal rather than another preventable attack.

Asta and Utena use configurable series-name pools already present on imported characters. Five extra magic series include Black Clover, Magi, Cardcaptor Sakura, Little Witch Academia and Blue Exorcist. Utena also recognizes Witch and Soul Gem flags. This is a curated pool, not an automatic MAL theme lookup.

## Saving and retry behavior

Vegeta's permanent +5, All For One's acquired passives and GANTZ points/upgrades are returned as updates keyed by original unit instance ID. The server applies only the final attempt's updates once. All For One follows the existing three-passive limit and requires the final killing hit.

One For All victory rerolls inherit other passives, retain accumulated permanent bonuses, and add +3 to every stat. Fresh base stats are still rolled normally; equipment is not inherited.

Reset uses the existing saved encounter-retry mechanism. Either losing side can trigger one retry. It shares the encounter retry limit with Future Machine No. 8, preventing endless restarts. Only the final attempt changes lives, progression and permanent rewards. The retry label identifies Reset rather than incorrectly naming the item.

## Checks

The suite covers character behavior, same-time death ordering, copy exclusions, reflection targeting, startup interruption, one-use cancellation, stage participation, save/load idempotency and battle readout rendering. The older plain-combat golden replays remain checked unchanged; mixed-ability scenarios now check deterministic current behavior because Black Flash and Sukuna's intentional balance changes alter their old results.
