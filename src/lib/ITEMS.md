# Journey items

Definitions, names, descriptions and rarities are in `data/items.json`. `items.ts` owns reward weights and catch rates. Item instances and team changes are stored with the existing Journey job in `.data`; no additional database is needed.

Rewards appear after every fourth cleared floor, including floors advanced by events. Bosses still appear every tenth floor. Each of three reward cards independently draws R/SR/SSR/UR with 50/30/15/5 percent odds, then chooses uniformly within that rarity. Duplicate choices are possible. Owned unique relics are excluded before the item draw. Dragon Ball Radar changes the conditional SSR pool to 40% Dragon Balls and 60% evenly divided among other eligible SSR items.

## Saved changes

`server/inventory.ts` validates every use, consumes the item only when an action is valid, and saves catches before asking which slot to replace. Failed catches consume the ball; invalid targets do not. Bosses cannot be caught. Caught characters get fresh stats and discard enemy equipment, keywords and other enemy-only modifiers. The catch remains saved until placed; departure is blocked while one is waiting.

Shiraishi Coins raise the favorites threshold of victory rerolls by 50 each. Philosopher’s Stone adds a same-or-higher rarity requirement. If no different imported character qualifies, the reroll fails without spending the victory replacement. Ship relics and wishes can fill slots independently of that reroll filter.

Seven Dragon Balls unlock the Wish view. Searching uses Tenrai's character endpoint, with imported matches as a fallback if the service fails. Searching and canceling cost nothing. The final replacement consumes seven balls atomically. An empty slot is filled automatically; otherwise the user chooses a replacement and can undo the selection before committing.

Sukuna fingers add stacks to the existing unit without changing its original stats or native passives. At twenty stacks only its display identity changes. The native rollable Sukuna is a separate character. Host-derived attacks are not part of the Stand Arrow pool.

Potara creates a new instance, leaves the second slot empty, and consumes both earrings. It combines current base stats at 75% and inherits the higher rarity. It inherits the first passive, first keyword and first non-Potara equipment item of each source. Later fusions use the original first constituent's identity and inherited traits for each fused source, while combining the current sources' base stats. Original constituents are kept in the saved fusion metadata; base stats are never recomputed on reload.

Future Machine No. 8 stays in inventory. It retries the first lost battle of each encounter from its initial state, including stage and ability timers. The retry is a fresh simulation; only its final result changes lives, floor progression and rewards. Its used flag and both replays are saved, preventing repeated HTTP requests or reloads from granting more retries.

## Battle interactions

Flat equipment additions and dodge/armor penetration live in `battle/equipment.ts`. `battle/item-effects.ts` handles Behelit's opening sacrifices, Lifesteal, Curse Nail and Inverted Spear on-hit effects. The scheduler still owns targeting, deaths and stage rules.

- Swordfish dodge applies to attacks, including area attacks, but not Burn, stage damage, opening sacrifices or a decisive boss wipe. A dodged hit applies no on-hit effects.
- Lifesteal uses half the actual HP removed by the attack, capped at maximum HP. It does not count overkill, Curse's extra damage, Burn or stage damage.
- Curse tracks each attacker's hits against a target, resets after every third hit and can trigger repeatedly. Each copy multiplies the HP loss and compounds the ATB penalty. It affects bosses at 15% maximum HP per copy rather than 50%.
- NEGATED suppresses passives and keywords for six simulation seconds. Equipment and stage rules continue. Timers keep counting; activations due while suppressed are skipped, rather than banked for later. Temporary buffs also keep their original expiry.
- An existing Burn is not removed by negating its source. Soul Gem's stat boost disappears during suppression; a unit dying while negated cannot transform into a Witch. Already-transformed Witches remain hostile units.
- Dead Denji retains NEGATED. If another unit dies during suppression, he revives when it expires. Otherwise he waits for a later death as usual. A permanently suppressed Denji cannot revive.
- Hōgyoku suppresses traits for the whole battle while leaving their labels visible. Its bonus counts listed passive abilities, including those whose battle mechanics are not implemented. Keywords do not add to that bonus.
- Behelit resolves after stage participation is chosen. It sacrifices only participating allies in the same active duel. Multiple wearers resolve in slot order; a wearer sacrificed by an earlier one cannot activate. Death and revive hooks still run, and all bonuses are battle-only.

Normal combat, stages, boss effects and replay ordering remain covered by the existing seeded regression suite. New item, catch, persistence, rarity-distribution and rendering tests live beside the relevant modules.
