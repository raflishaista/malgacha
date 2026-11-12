import { ABILITY_RULES } from './config';
import {
  EXPANDED_RULES as R,
  RESET_IDS,
  MAGIC_SERIES,
  MAGICAL_GIRL_SERIES,
  COPY_EXCLUDED
} from './expanded-config';
import { BOSS_ABILITY_RULES, DEOXYS_FORMES, SAHAQUIEL_ID, bossFor } from '../../bosses';
import { abilityIds } from './catalog';
import { abilityFor } from '../../journeys';
import type { AbilityContext, AbilityDefinition } from './types';
import type { JourneyCharacter } from '../../types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if any of the unit's titles match any of the target series names.
 */
function matchesSeries(titles: readonly { name: string }[], seriesNames: readonly string[]): boolean {
  return titles.some(title =>
    seriesNames.some(name => title.name.toLowerCase().includes(name.toLowerCase()))
  );
}

/**
 * Helper to build threshold-triggered abilities (e.g. at 50% HP or 10% HP).
 */
function onceBelowThreshold(
  id: number,
  threshold: number,
  action: (context: AbilityContext, owner: number) => void
): AbilityDefinition {
  return {
    id,
    onUpdate(context, owner) {
      const isAlive = context.hp[owner] > 0;
      const isBelowThreshold = context.hp[owner] <= context.maxHP[owner] * threshold;
      const abilityState = context.state(owner, id);

      if (isAlive && isBelowThreshold && !abilityState.used) {
        abilityState.used = true;
        context.activate(owner, id, [owner], actor => action(context, actor));
      }
    }
  };
}

/**
 * Lind L. Taylor decoy protection (L / Death Note).
 */
function lindDecoyProtection(context: AbilityContext, owner: number, target: number): boolean {
  const abilityState = context.state(owner, 71);
  if (abilityState.used) return false;
  abilityState.used = true;

  return context.activate(owner, 71, [owner, target], actor => {
    context.effect(actor, target, 'INVINCIBLE', 3, 'Lind L. Taylor');
  });
}

/**
 * Millennium Puzzle card deck choices for Yugi (1374) & Yami Yugi (1375).
 */
function planMillenniumCard(context: AbilityContext, owner: number, abilityId: number): number[] {
  const allies = context.allies(owner);
  const injuredAllies = allies.filter((i) => context.hp[i] < context.maxHP[i] * 0.5);
  const canUseCatapult = injuredAllies.length > 0;

  const mahadoUsed = context.state(owner, 26722).used || context.state(owner, 142840).used;
  const sliferUsed = context.state(owner, -3100).used;

  const weights: { card: string; weight: number }[] = [];
  if (!sliferUsed) weights.push({ card: 'Slifer the Sky Dragon', weight: 5 });
  if (!mahadoUsed) weights.push({ card: 'Dark Magic Curtain', weight: 20 });

  const regularCards = [
    'Mirror Force',
    'Swords of Revealing Light',
    'Kuriboh',
    'Monster Reborn'
  ];
  if (canUseCatapult) {
    regularCards.push('Catapult Turtle');
  }

  const baseRemainingWeight = 100 - (sliferUsed ? 0 : 5) - (mahadoUsed ? 0 : 20);
  const perCardWeight = baseRemainingWeight / regularCards.length;
  for (const card of regularCards) {
    weights.push({ card, weight: perCardWeight });
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = context.random() * totalWeight;
  let chosenCard = weights[0].card;
  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) {
      chosenCard = item.card;
      break;
    }
  }

  context.state(owner, abilityId).card = chosenCard;

  if (chosenCard === 'Swords of Revealing Light') {
    return context.enemies(owner);
  }
  if (chosenCard === 'Catapult Turtle') {
    const enemies = context.enemies(owner);
    return enemies.length ? [enemies[Math.floor(context.random() * enemies.length)]] : [];
  }
  return [owner];
}

function playMillenniumCard(context: AbilityContext, owner: number, abilityId: number): void {
  const card = context.state(owner, abilityId).card;
  if (!card) return;
  context.state(owner, abilityId).card = undefined;
  context.emit(owner, owner, 'buff', card);

  switch (card) {
    case 'Mirror Force':
      context.effect(owner, owner, 'REFLECT', 3, card);
      break;

    case 'Swords of Revealing Light':
      for (const target of context.enemies(owner)) {
        context.effect(owner, target, 'STUN', 3, card);
      }
      break;

    case 'Dark Magic Curtain':
      context.state(owner, 26722).used = true;
      context.state(owner, 142840).used = true;
      context.summon(owner, 'mahado');
      break;

    case 'Slifer the Sky Dragon':
      context.state(owner, -3100).used = true;
      context.summon(owner, 'slifer');
      break;

    case 'Kuriboh':
      context.effect(owner, owner, 'KURIBOH', 1e6, card);
      break;

    case 'Monster Reborn': {
      const deadAllies = context.allies(owner, true);
      if (deadAllies.length > 0) {
        const target = deadAllies[Math.floor(context.random() * deadAllies.length)];
        context.revive(owner, target, 1, card);
      }
      break;
    }

    case 'Catapult Turtle': {
      const allies = context.allies(owner);
      const injuredAllies = allies.filter((i) => context.hp[i] < context.maxHP[i] * 0.5);
      const target = context.target(owner);
      if (injuredAllies.length > 0 && target !== undefined) {
        const sacrifice = injuredAllies[Math.floor(context.random() * injuredAllies.length)];
        context.damage(owner, sacrifice, 1, card, true);
        context.damage(owner, target, 0.8, card, true);
      }
      break;
    }
  }
}

// ============================================================================
// Core Character Abilities
// ============================================================================

/** Yuji Itadori - Black Flash (163847): 30% chance to triple attack damage */
export const blackFlash: AbilityDefinition = {
  id: 163847,
  onAttack: context =>
    context.random() < ABILITY_RULES.blackFlashChance
      ? { multiplier: 3, title: 'Black Flash' }
      : { multiplier: 1 }
};

/** Dio Brando - The World (4004): Periodic full time stop */
export const theWorld: AbilityDefinition = {
  id: 4004,
  cooldown: ABILITY_RULES.worldCooldown,
  targets: 'all',
  onTimed(context, owner) {
    context.stopTime(owner, ABILITY_RULES.worldDuration);
    context.emit(owner, owner, 'world', 'The World');
    return { nextDelay: ABILITY_RULES.worldCooldown };
  }
};

/** Ken Kaneki - Kakuja (87275): Gains attack bonus and heals on any unit death */
export const kakuja: AbilityDefinition = {
  id: 87275,
  tracksAttackBonus: true,
  onOtherDeath(context, owner) {
    context.addAttack(owner, ABILITY_RULES.kakujaAttack);
    context.heal(owner, ABILITY_RULES.kakujaHeal, 'I am — a ghoul.');
  }
};

/** Eren Yeager - The Rumbling (40882): Full AoE earth-shaking strike */
export const rumbling: AbilityDefinition = {
  id: 40882,
  offensive: true,
  cooldown: ABILITY_RULES.rumblingCooldown,
  gauge: 'rumbling',
  onTimed: () => ({
    nextDelay: ABILITY_RULES.rumblingCooldown,
    attack: { kind: 'rumbling', title: 'Rumbling' }
  })
};

/** Gabimaru - Ascetic Blaze (171437): Inflicts Burn on hit */
export const asceticBlaze: AbilityDefinition = {
  id: 171437,
  onHit(context, owner, target) {
    if (context.hp[target] <= 0) return;
    context.activate(owner, 171437, [target], actor => {
      const victim = actor === owner ? target : owner;
      context.inflictBurn(actor, victim);
      context.emit(actor, victim, 'status', 'Ninpo: Ascetic Blaze');
    });
  }
};

/** Koyomi Araragi - Vampire Regeneration (22036): Periodic heal */
export const koyomiVamp: AbilityDefinition = {
  id: 22036,
  cooldown: ABILITY_RULES.vampCooldown,
  onTimed(context, owner) {
    context.heal(owner, ABILITY_RULES.vampHeal, 'Koyomi Vamp');
    return { nextDelay: ABILITY_RULES.vampCooldown };
  }
};

/** Turbo Granny (196899): High initial speed multiplier for 10 seconds */
export const turboGranny: AbilityDefinition = {
  id: 196899,
  startPriority: 0,
  expiresAt: ABILITY_RULES.turboDuration,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'Turbo Granny'),
  speedMultiplier: time => (time < ABILITY_RULES.turboDuration ? ABILITY_RULES.turboMultiplier : 1)
};

/** God Hand (16412): Taunt keyword and flat 50% damage reduction */
export const godHand: AbilityDefinition = {
  id: 16412,
  startPriority: 2,
  keywords: ['TAUNT'],
  damageReduction: ABILITY_RULES.godHandReduction,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'God Hand')
};

/** Forbidden Magic (134263): Revives the first ally who dies */
export const forbiddenMagic: AbilityDefinition = {
  id: 134263,
  canReviveAlly: (context, owner) => !context.state(owner, 134263).used,
  onAllyDeath(context, owner, victim) {
    context.state(owner, 134263).used = true;
    context.revive(owner, victim, 1, 'Forbidden Magic');
  }
};

/** Driver's High (434): Team aura boosting all stats by 10% */
export const driversHigh: AbilityDefinition = {
  id: 434,
  startPriority: 1,
  auraMultiplier: 1 + ABILITY_RULES.driversHigh,
  onStart: (context, owner) => context.emit(owner, owner, 'buff', 'Driver’s High')
};

/** Denji - Chainsaw Heart (170732): Revives upon death */
export const chainsawHeart: AbilityDefinition = {
  id: 170732,
  onLaterDeath: (context, owner) =>
    context.revive(owner, owner, ABILITY_RULES.chainsawHeal, 'Chainsaw Heart')
};

/** Sukuna - Malevolent Shrine (175198): Domain expansion with successive pulses */
export const malevolentShrine: AbilityDefinition = {
  id: 175198,
  offensive: true,
  cooldown: ABILITY_RULES.shrineCooldown,
  gauge: 'shrine',
  oncePerBattle: true,
  onTimed(context, owner) {
    const state = context.state(owner, 175198);
    if (!state.used) {
      state.used = true;
      state.pulses = ABILITY_RULES.shrineHits;
    }
    state.pulses = (state.pulses ?? 0) - 1;
    return {
      nextDelay: state.pulses > 0 ? ABILITY_RULES.shrineInterval : Infinity,
      attack: { kind: 'shrine', title: 'Malevolent Shrine' }
    };
  }
};

// ============================================================================
// Threshold & Reactive Abilities
// ============================================================================

export const thresholdAbilities: AbilityDefinition[] = [
  // Son Goku - Super Saiyan (246): +40 all stats below 50% HP
  onceBelowThreshold(246, 0.5, (context, owner) => {
    context.addStats(owner, R.gokuBonus, 'Super Saiyan');
    context.effect(owner, owner, 'SUPER SAIYAN', 1e6, 'Super Saiyan');
  }),

  // Vegeta - Zenkai Boost (913): Permanent +5 all stats on death
  {
    id: 913,
    onDeath(context, owner) {
      const state = context.state(owner, 913);
      if (!state.used) {
        state.used = true;
        context.addStats(owner, R.vegetaBonus, 'Zenkai Boost', true);
        context.effect(owner, owner, 'ZENKAI', 1e6, 'Zenkai Boost');
      }
      return false;
    }
  },

  // Tokita Ohma - Advance (132742): Stat boost below 50% HP
  onceBelowThreshold(132742, 0.5, (context, owner) => {
    context.addStats(owner, R.ohmaBonus, 'Advance');
    context.effect(owner, owner, 'ADVANCE', R.ohmaDuration, 'Advance');
  }),

  // Oguri Cap - Festive Miracle (162150): Activates after sufficient total ability activations
  {
    id: 162150,
    onAnyActivation(context, owner) {
      const state = context.state(owner, 162150);
      state.count = (state.count ?? 0) + 1;
      if (state.count >= R.oguriActivations && !state.used) {
        state.used = true;
        context.effect(owner, owner, 'FESTIVE MIRACLE', 1e6, 'Festive Miracle');
      }
    }
  },

  // Guts - Struggler (422): Survives fatal damage for 6 seconds
  {
    id: 422,
    onFatal(context, owner) {
      const state = context.state(owner, 422);
      if (state.used) return false;
      state.used = true;
      return context.activate(owner, 422, [owner], actor => {
        context.effect(actor, actor, 'STRUGGLER', 6, 'Struggler');
      });
    }
  },

  // Shinji Ikari - Berserk Mode (89): Survives fatal damage and enters berserk rampage
  {
    id: 89,
    onFatal(context, owner) {
      const state = context.state(owner, 89);
      if (state.used) return false;
      state.used = true;
      return context.activate(owner, 89, [owner], actor => {
        context.addStats(actor, R.shinjiBonus, 'Berserk Mode');
        context.effect(actor, actor, 'STRUGGLER', 6, 'Berserk Mode');
        context.effect(actor, actor, 'RAMPAGE', 6, 'Berserk Mode');
      });
    }
  },

  // Migi - Mutation (2589): Survives fatal blow and absorbs power
  {
    id: 2589,
    onFatal(context, owner) {
      const state = context.state(owner, 2589);
      if (state.used) return false;
      state.used = true;
      let survived = false;
      context.activate(owner, 2589, [owner], actor => {
        survived = context.absorb(actor, R.mutationBonus, R.mutationHeal);
      });
      return survived;
    }
  },

  // Kaiji Itou - Ultimate Survivor (5578): Halving survival probability
  {
    id: 5578,
    onFatal(context, owner) {
      const state = context.state(owner, 5578);
      const chance = state.chance ?? R.kaijiChance;
      if (context.random() >= chance) return false;
      state.chance = chance / 2;
      return context.activate(owner, 5578, [owner], actor => {
        context.emit(actor, actor, 'buff', 'Ultimate Survivor');
      });
    }
  },

  // Battle Reset abilities (Homura, Subaru, Rika)
  ...RESET_IDS.map(id => ({ id, resetsBattle: true })),

  // Mash Burnedead & Tadaomi Karasuma (Pure physical powerhouses)
  { id: 117921 },
  { id: 2867 },

  // Yujiro Hanma - Strongest Creature on Earth (10499)
  {
    id: 10499,
    onStart(context, owner) {
      const topAttack = Math.max(...context.stats.map(s => s.attack));
      if (context.stats[owner].attack < topAttack) {
        context.effectiveAttack(owner, topAttack + 10);
      }
      context.emit(owner, owner, 'buff', 'Strongest Creature on Earth');
    }
  },

  // Simon the Digger (2819): Cannot have speed reduced below baseline
  { id: 2819, speedFloor: true }
];

// ============================================================================
// Timed Characters
// ============================================================================

export const timedCharacters: AbilityDefinition[] = [
  // Monkey D. Luffy - Gear 5 (40): Reflect attacks for 6 seconds
  {
    id: 40,
    cooldown: R.reflectCooldown,
    targets: 'self',
    onTimed(context, owner) {
      context.effect(owner, owner, 'REFLECT', 6, 'Gear 5');
      return { nextDelay: R.reflectCooldown };
    }
  },

  // Ichigo Kurosaki - Getsuga Tenshou (5): Periodic triple damage strike
  {
    id: 5,
    offensive: true,
    cooldown: R.getsugaCooldown,
    bossGauge: true,
    targets: 'enemy',
    onTimed: () => ({
      nextDelay: R.getsugaCooldown,
      attack: { kind: 'boss-attack', title: 'Getsuga Tenshou', multiplier: 3, single: true }
    })
  },

  // Lelouch Lamperouge - Geass (417): Inflicts Berserk on enemy
  {
    id: 417,
    cooldown: R.geassCooldown,
    targets: 'enemy',
    onTimed(context, owner) {
      const target = context.target(owner);
      if (target !== undefined) {
        context.effect(owner, target, 'BERSERK', 5, 'Geass');
      }
      return { nextDelay: R.geassCooldown };
    }
  },

  // Jotaro Kujo - Star Platinum: The World (4003): 1.5s time stop
  {
    id: 4003,
    cooldown: R.jotaroCooldown,
    targets: 'all',
    onTimed(context, owner) {
      context.stopTime(owner, R.jotaroDuration);
      context.emit(owner, owner, 'world', 'Star Platinum: The World');
      return { nextDelay: R.jotaroCooldown };
    }
  },

  // Light Yagami - Death Note (80): Eliminates highest-BST enemy periodically after charge delay (15% to bosses)
  {
    id: 80,
    offensive: true,
    cannotAttack: true,
    bossGauge: true,
    cooldown: R.deathNoteDelay,
    targets: 'enemy',
    selectTarget(context, owner) {
      const targets = context.enemies(owner);
      if (!targets.length) return undefined;
      return targets.reduce((best, curr) => {
        const bestTotal = Object.values(context.stats[best]).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(context.stats[curr]).reduce((a, b) => a + b, 0);
        return currTotal > bestTotal ? curr : best;
      });
    },
    onTimed(context, owner) {
      const targets = context.enemies(owner);
      if (!targets.length) return { nextDelay: R.deathNoteDelay };
      const target = targets.reduce((best, curr) => {
        const bestTotal = Object.values(context.stats[best]).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(context.stats[curr]).reduce((a, b) => a + b, 0);
        return currTotal > bestTotal ? curr : best;
      });
      if (target !== undefined) {
        const isBoss = !!context.units[target]?.boss;
        context.damage(owner, target, isBoss ? 0.15 : 1, 'Death Note', true);
      }
      return { nextDelay: R.deathNoteDelay };
    }
  },

  // Souma Yukihira - Gotcha Pork Roast (75216): Heals most wounded ally
  {
    id: 75216,
    cooldown: R.somaCooldown,
    bossGauge: true,
    targets: 'allies',
    onTimed(context, owner) {
      const team = [owner, ...context.allies(owner)];
      const target = team.reduce((lowest, curr) =>
        context.hp[curr] / context.maxHP[curr] < context.hp[lowest] / context.maxHP[lowest] ? curr : lowest
      );
      context.heal(target, 0.3, 'Gotcha Pork Roast');
      context.emit(owner, target, 'heal', 'Gotcha Pork Roast');
      return { nextDelay: 4 };
    }
  },

  // Shigeo Kageyama (Mob) - 100% (109929): Counter ticks up to 100%, then +50 all stats
  {
    id: 109929,
    cooldown: 1 / 6,
    onStart(context, owner) {
      context.setCounter(owner, 109929, 0);
    },
    onTimed(context, owner) {
      const state = context.state(owner, 109929);
      state.count = Math.min(100, (state.count ?? 0) + 1);
      context.setCounter(owner, 109929, state.count);
      if (state.count >= 100) {
        context.addStats(owner, 50, '100%');
        return { nextDelay: Infinity };
      }
      return { nextDelay: 1 / 6 };
    }
  },

  // Kinji Hakari - Idle Death Gamble (203839): Pachinko rolls digits, jackpot grants +77 stats
  {
    id: 203839,
    cooldown: 1,
    onStart(context, owner) {
      context.setCounter(owner, 203839, 0, [0, 0, 0]);
    },
    onTimed(context, owner) {
      const state = context.state(owner, 203839);
      state.phase = state.phase ?? 0;
      if (state.phase === 0) {
        state.digits = [0, 0, 0];
      } else {
        state.digits = state.digits ?? [0, 0, 0];
      }

      if (state.phase === 2 && state.digits[0] === state.digits[1] && state.digits[0] > 0) {
        // Riichi: 50% chance to match the first two digits
        if (context.random() < 0.5) {
          state.digits[2] = state.digits[0];
        } else {
          state.digits[2] = Math.floor(context.random() * R.hakariDigits) + 1;
        }
      } else {
        state.digits[state.phase] = Math.floor(context.random() * R.hakariDigits) + 1;
      }

      if (state.phase === 1 && state.digits[0] === state.digits[1]) {
        context.emit(owner, owner, 'buff', 'Riichi');
      }

      context.setCounter(owner, 203839, state.phase, [...state.digits]);
      state.phase++;

      if (state.phase === 3) {
        state.phase = 0;
        const isJackpot = new Set(state.digits).size === 1;
        if (isJackpot) {
          context.heal(owner, 1, 'Jackpot');
          context.addStats(owner, 77, 'Idle Death Gamble');
        } else {
          context.emit(owner, owner, 'buff', 'Idle Death Gamble');
        }
      }
      return { nextDelay: 1 };
    }
  },

  // Yoichi Isagi - Metavision (177491): Ready to interrupt enemy activations
  {
    id: 177491,
    cooldown: R.isagiCharge,
    bossGauge: true,
    onStart(context, owner) {
      const state = context.state(owner, 177491);
      if (state.ready === undefined) {
        state.ready = true;
        context.scheduleAbility(owner, 177491, Infinity);
      }
    },
    onTimed(context, owner) {
      context.state(owner, 177491).ready = true;
      context.emit(owner, owner, 'buff', 'Metavision ready');
      return { nextDelay: Infinity };
    },
    onEnemyActivation(context, owner) {
      const state = context.state(owner, 177491);
      if (state.ready === false) return;
      state.ready = false;
      context.scheduleAbility(owner, 177491, 5);
      context.emit(owner, owner, 'buff', 'Metavision');
      return 'interrupt';
    }
  },

  // Reg - Incinerator (140046): Strikes two enemies with double damage
  {
    id: 140046,
    cooldown: R.regRecharge,
    bossGauge: true,
    attackTargets: 2,
    onStart(context, owner) {
      context.scheduleAbility(owner, 140046, Infinity);
    },
    onAttack(context, owner) {
      const state = context.state(owner, 140046);
      state.hits = (state.hits ?? 0) + 1;
      return { multiplier: 2, title: 'Incinerator' };
    },
    onTimed(context, owner) {
      context.state(owner, 140046).hits = 0;
      context.emit(owner, owner, 'buff', 'Incinerator recharged');
      return { nextDelay: Infinity };
    }
  },

  // Yugi Muto & Yami Yugi - Millennium Puzzle (1374, 1375)
  {
    id: 1374,
    cooldown: 4,
    activationTargets: (context, owner) => planMillenniumCard(context, owner, 1374),
    onTimed(context, owner) {
      playMillenniumCard(context, owner, 1374);
      return { nextDelay: 4 };
    }
  },
  {
    id: 1375,
    cooldown: 4,
    activationTargets: (context, owner) => planMillenniumCard(context, owner, 1375),
    onTimed(context, owner) {
      playMillenniumCard(context, owner, 1375);
      return { nextDelay: 4 };
    }
  }
];

// ============================================================================
// Active & Interactive Characters
// ============================================================================

export const activeCharacters: AbilityDefinition[] = [
  // Naruto Uzumaki - Shadow Clones (17)
  {
    id: 17,
    onStart(context, owner) {
      context.summon(owner, 'clone');
    }
  },

  // Ash Ketchum (2473) & Red (7035) - Summon Pikachu
  {
    id: 2473,
    onStart(context, owner) {
      context.summon(owner, 'pikachu');
    }
  },
  {
    id: 7035,
    onStart(context, owner) {
      context.summon(owner, 'pikachu');
    }
  },

  // Spike Spiegel - Replace Crew (1)
  {
    id: 1,
    startPriority: 10,
    onStart(context, owner) {
      context.replaceCrew(owner);
    }
  },

  // Vash the Stampede - Angel Arm Absorb (2257)
  {
    id: 2257,
    startPriority: 20,
    onStart(context, owner) {
      context.absorb(owner, 50, 0, true);
    }
  },

  // Aoi Todo - Boogie Woogie (136805, 137467): Swap positions with an enemy
  {
    id: 136805,
    targets: 'enemy',
    onStart(context, owner) {
      const target = context.target(owner);
      if (target !== undefined) context.swap(owner, target);
    }
  },
  {
    id: 137467,
    targets: 'enemy',
    onStart(context, owner) {
      const target = context.target(owner);
      if (target !== undefined) context.swap(owner, target);
    }
  },

  // Killua Zoldyck - Godspeed Seal (28): Seals enemy passives
  {
    id: 28,
    targets: 'enemy',
    selectTarget(context, owner) {
      return context.enemies(owner).find(i => abilityIds(context.units[i]).length > 0);
    },
    onStart(context, owner) {
      const target = context.target(owner);
      if (target !== undefined && abilityIds(context.units[target]).length > 0) {
        context.seal(owner, target);
      }
    }
  },

  // Edward Elric - Alchemy Combo (12323): 2 hits per normal attack
  { id: 12323, attackHits: 2 },

  // Asta - Anti Magic (124731): 3x damage against magic series
  {
    id: 124731,
    targetMultiplier(context, _owner, target) {
      return matchesSeries(context.units[target].titles, MAGIC_SERIES) ? 3 : 1;
    }
  },

  // Utena Hiiragi (193067): 3x damage against witches, soul gems, or magical girls
  {
    id: 193067,
    targetMultiplier(context, _owner, target) {
      const unit = context.units[target];
      return unit.witch || unit.soulGem || matchesSeries(unit.titles, MAGICAL_GIRL_SERIES) ? 3 : 1;
    }
  },

  // Hajime Ippo - Dempsey Roll (15): 20% dodge chance, +15 speed on dodge
  {
    id: 15,
    dodgeChance: 0.2,
    onDodge(context, owner) {
      context.addStat(owner, 'speed', 15, 'Dempsey Roll');
    }
  },

  // Tetsuya Kuroko - Misdirection (18769): Untargetable
  { id: 18769, untargetable: true },

  // Misogi Kumagawa - Book Maker (36753): Weaken target every 3 hits
  {
    id: 36753,
    onHit(context, owner, target) {
      const state = context.state(owner, 36753);
      state.hits = (state.hits ?? 0) + 1;
      if (state.hits % 3 === 0) {
        context.activate(owner, 36753, [target], actor => {
          context.effect(actor, actor === owner ? target : owner, 'WEAKENED', 6, 'Book Maker');
        });
      }
    }
  },

  // Kenshiro - Hokuto Hyakuretsu Ken (2511): Death curse on hit
  {
    id: 2511,
    onHit(context, owner, target) {
      context.curse(owner, target, 'Hokuto Hyakuretsu Ken');
    }
  },

  // Himiko Toga - Transform (135879): Transforms into target on hit
  {
    id: 135879,
    onHit(context, owner, target) {
      context.transform(owner, target);
    }
  },

  // Saitama - One Punch Man (65523)
  { id: 65523 },

  // Heero Yuy - Self-Destruct (99): 20% damage to all enemies on death
  {
    id: 99,
    targets: 'enemies',
    onDeath(context, owner) {
      for (const target of context.enemies(owner)) {
        context.damage(owner, target, 0.2, 'Self-Destruct', true);
      }
      return false;
    }
  },

  // Amuro Ray - Last Shooting (1335): 40% damage to enemy on death
  {
    id: 1335,
    targets: 'enemy',
    onDeath(context, owner) {
      const target = context.target(owner);
      if (target !== undefined) {
        context.damage(owner, target, 0.4, 'Last Shooting', true);
      }
      return false;
    }
  },

  // L - Lind L. Taylor Decoy (71): Protects self or ally from death once
  {
    id: 71,
    onFatal: (context, owner) => lindDecoyProtection(context, owner, owner),
    onAllyFatal: lindDecoyProtection
  },

  // Yusei Fudo - Stardust Dragon (9700): Protects dying ally for 4s
  {
    id: 9700,
    cooldown: 4,
    onStart(context, owner) {
      context.scheduleAbility(owner, 9700, Infinity);
    },
    onTimed(context, owner) {
      context.state(owner, 9700).used = false;
      return { nextDelay: Infinity };
    },
    onAllyFatal(context, owner, target) {
      if (context.state(owner, 9700).used) return false;
      context.state(owner, 9700).used = true;
      context.protect(owner, target, 4, 'Stardust Dragon');
      context.scheduleAbility(owner, 9700, 4);
      return true;
    }
  },

  // Meliodas - Full Counter (72921): Reflects enemy ability
  {
    id: 72921,
    onEnemyActivation(context, owner, _source, id, targets) {
      if (
        !abilityFor(id) ||
        COPY_EXCLUDED.has(id) ||
        context.state(owner, 72921).used ||
        !targets.includes(owner)
      ) {
        return;
      }
      context.state(owner, 72921).used = true;
      context.emit(owner, owner, 'buff', 'Full Counter');
      return 'reflect';
    }
  },

  // Chrollo Lucilfer - Skill Hunter (177542): Grants enemy ability on activation
  {
    id: 177542,
    onEnemyActivation(context, owner, _source, id) {
      if (abilityFor(id) && !COPY_EXCLUDED.has(id)) {
        context.grant(owner, id);
      }
    }
  },

  // All For One (141358)
  { id: 141358 },

  // Meruem - Aura Synthesis (23277): Consumes enemies he defeats, gaining their abilities
  {
    id: 23277,
    onKill(context, owner, target) {
      for (const id of abilityIds(context.units[target])) {
        context.grant(owner, id, true);
      }
    }
  },

  // Kakashi Hatake - Copy Ninja (672)
  {
    id: 672,
    onStart(_context, _owner) {
      // Filled by safe registry in battle engine scheduler
    }
  }
];

// ============================================================================
// Sukuna Host Mechanics
// ============================================================================

/** Host of Sukuna - Cleave / World-Cutting Slash (-10) */
export const hostCleave: AbilityDefinition = {
  id: -10,
  offensive: true,
  cooldown: 6,
  bossGauge: true,
  onTimed(context, owner) {
    const isIncarnated = (context.units[owner].sukunaStacks ?? 0) >= 20;
    return {
      nextDelay: 6,
      attack: {
        kind: 'boss-attack',
        title: isIncarnated ? 'World-Cutting Slash' : 'Cleave',
        multiplier: 2,
        single: true,
        defenseIgnore: isIncarnated ? 0.5 : 0
      }
    };
  }
};

/** Host of Sukuna - Malevolent Shrine / Incomplete Shrine (-15) */
export const hostShrine: AbilityDefinition = {
  id: -15,
  offensive: true,
  cooldown: 8,
  bossGauge: true,
  onTimed(context, owner) {
    const state = context.state(owner, -15);
    const maxPulses = (context.units[owner].sukunaStacks ?? 0) >= 20 ? 5 : 3;
    state.pulses = state.pulses ?? maxPulses;
    state.pulses--;

    const nextDelay = state.pulses > 0 ? 0.2 : 8;
    if (!state.pulses) state.pulses = undefined;

    return {
      nextDelay,
      attack: {
        kind: 'boss-attack',
        title: (context.units[owner].sukunaStacks ?? 0) >= 20 ? 'Malevolent Shrine' : 'Incomplete Malevolent Shrine'
      }
    };
  }
};

// ============================================================================
// Boss Abilities
// ============================================================================

/** Grand Fisher (7345) - Lure: Taunt summon shielding the boss */
export const grandFisher: AbilityDefinition = {
  id: 7345,
  cooldown: BOSS_ABILITY_RULES.lureSeconds,
  protectedBySummon: true,
  onTimed(context, owner) {
    context.summonLure(owner);
    return { nextDelay: Infinity };
  },
  onSummonDeath(context, owner) {
    context.scheduleAbility(owner, 7345, BOSS_ABILITY_RULES.lureSeconds);
  }
};

/** Kurama (7407) - Tailed Beast Bomb: Periodic heavy AoE */
export const kurama: AbilityDefinition = {
  id: 7407,
  offensive: true,
  cooldown: BOSS_ABILITY_RULES.bombSeconds,
  bossGauge: true,
  onTimed: () => ({
    nextDelay: BOSS_ABILITY_RULES.bombSeconds,
    attack: {
      kind: 'boss-attack',
      title: 'Tailed Beast Bomb',
      multiplier: BOSS_ABILITY_RULES.bombMultiplier
    }
  })
};

/** Gun Devil (184112) - Gun Fiend: Possesses player's weakest unit upon dying */
export const gunDevil: AbilityDefinition = {
  id: 184112,
  onDeath(context, owner) {
    const state = context.state(owner, 184112);
    if (state.used) return false;
    state.used = true;
    return context.captureWeakest(owner);
  }
};

/** Deoxys (74017) - Form Change: Periodic transformation into random formes */
export const deoxys: AbilityDefinition = {
  id: 74017,
  cooldown: BOSS_ABILITY_RULES.formeSeconds,
  onTimed(context, owner) {
    const formes = (Object.keys(DEOXYS_FORMES) as NonNullable<JourneyCharacter['bossForm']>[]).filter(
      form => form !== (context.units[owner].bossForm ?? 'normal')
    );
    const chosenForme = formes[Math.floor(context.random() * formes.length)];
    context.changeForm(owner, chosenForme);
    return { nextDelay: BOSS_ABILITY_RULES.formeSeconds };
  }
};

/** Sahaquiel (-1001) - 10th Angel: 20-second apocalyptic doom clock */
export const sahaquiel: AbilityDefinition = {
  id: SAHAQUIEL_ID,
  cooldown: BOSS_ABILITY_RULES.angelSeconds,
  cannotAttack: true,
  absoluteTimer: true,
  bossGauge: true,
  oncePerBattle: true,
  onTimed(context, owner) {
    context.defeatOpponents(owner, '10th Angel');
    return { nextDelay: Infinity };
  }
};

/** Mahoraga (240069) - Adaptation: After being affected by an ability once, becomes immune to that ability */
export const mahoragaAdaptation: AbilityDefinition = {
  id: 240069,
  onEnemyActivation(context, owner, source, id, targets) {
    const s = context.state(owner, 240069);
    s.adapted = s.adapted ?? new Set<number>();
    const title = abilityFor(id)?.title ?? bossFor({ id })?.title ?? 'Ability';

    const affectsOwner =
      targets.includes(owner) ||
      id === 4004 ||
      id === 4003 ||
      context.enemies(source).includes(owner);

    if (!affectsOwner) return;

    if (s.adapted.has(id)) {
      const idx = targets.indexOf(owner);
      if (idx >= 0) targets.splice(idx, 1);
      context.emit(owner, owner, 'buff', 'Immune (' + title + ')');
      if (targets.length === 0) return 'interrupt';
      return;
    }

    s.pendingAdaptation = s.pendingAdaptation ?? new Set<number>();
    s.pendingAdaptation.add(id);
  }
};

// ============================================================================
// New Character Abilities
// ============================================================================

/** Megumi Fushiguro - With this treasure I summon... (164470) */
export const withThisTreasure: AbilityDefinition = {
  id: 164470,
  cooldown: 5,
  bossGauge: true,
  onStart(context, owner) {
    context.scheduleAbility(owner, 164470, Infinity);
  },
  onUpdate(context, owner) {
    const state = context.state(owner, 164470);
    if (!state.used && !state.channeling && context.hp[owner] > 0 && context.hp[owner] <= context.maxHP[owner] * 0.5) {
      state.channeling = true;
      context.scheduleAbility(owner, 164470, 5);
      context.emit(owner, owner, 'buff', 'With this treasure I summon...');
    }
  },
  onTimed(context, owner) {
    const state = context.state(owner, 164470);
    if (state.channeling && !state.used) {
      state.used = true;
      state.channeling = false;
      context.summon(owner, 'mahoraga');
    }
    return { nextDelay: Infinity };
  }
};

/** Gon Freecss - Jajanken (30): Randomly switches between Rock (2x dmg), Scissors (2 targets), Paper (ignores 50% def) */
export const jajanken: AbilityDefinition = {
  id: 30,
  attackTargets(context, owner) {
    const roll = context.random();
    const choice = roll < 1 / 3 ? 'rock' : roll < 2 / 3 ? 'scissors' : 'paper';
    context.state(owner, 30).choice = choice;
    return choice === 'scissors' ? 2 : 1;
  },
  onAttack(context, owner) {
    let choice = context.state(owner, 30).choice;
    if (!choice) {
      const roll = context.random();
      choice = roll < 1 / 3 ? 'rock' : roll < 2 / 3 ? 'scissors' : 'paper';
    }
    context.state(owner, 30).choice = undefined;
    if (choice === 'rock') {
      return { multiplier: 2, title: 'Jajanken: Rock' };
    } else if (choice === 'scissors') {
      return { multiplier: 1, title: 'Jajanken: Scissors' };
    } else {
      return { multiplier: 1, title: 'Jajanken: Paper', defenseIgnore: 0.5 };
    }
  }
};

/** Killua Zoldyck - Godspeed (27): Periodically gains increased speed and reflects damage */
export const godspeed: AbilityDefinition = {
  id: 27,
  cooldown: 8,
  bossGauge: true,
  targets: 'self',
  onTimed(context, owner) {
    context.effect(owner, owner, 'REFLECT', 4, 'Godspeed');
    return { nextDelay: 8 };
  }
};

/** Toji Fushiguro & Maki Zen'in - Heavenly Restriction (175543, 164482) */
function heavenlyRestriction(id: number): AbilityDefinition {
  return {
    id,
    startPriority: 5,
    onStart(context, owner) {
      const unit = context.units[owner];
      const initialKeywords = [
        ...(unit.keywords ?? []),
        ...(unit.soulGem ? ['SOUL GEM'] : []),
        ...(unit.marine ? ['MARINE SOLIDARITY'] : []),
        ...(unit.sukunaStacks ? ['HOST OF SUKUNA'] : [])
      ];
      const count = initialKeywords.length;
      unit.keywords = [];
      unit.soulGem = false;
      unit.marine = false;
      unit.sukunaStacks = 0;
      if (count > 0) {
        for (const key of ['hp', 'attack', 'defense', 'speed'] as const) {
          context.addStat(owner, key, Math.round(unit.baseStats[key] * 0.1 * count), 'Heavenly Restriction');
        }
      }
      context.emit(owner, owner, 'buff', 'Heavenly Restriction');
    }
  };
}
export const tojiHeavenlyRestriction = heavenlyRestriction(175543);
export const makiHeavenlyRestriction = heavenlyRestriction(164482);

/** Char Aznable - Red Comet (1336): Innately 3x speed, cannot gain speed */
export const redComet: AbilityDefinition = {
  id: 1336,
  onStart(context, owner) {
    context.emit(owner, owner, 'buff', 'Red Comet');
  }
};

/** Mikasa Ackerman - Thunder Spears (40881): Latches BOMB debuff with 5s timer */
export const thunderSpears: AbilityDefinition = {
  id: 40881,
  cooldown: 7,
  bossGauge: true,
  targets: 'enemy',
  onTimed(context, owner) {
    const target = context.target(owner);
    if (target !== undefined) {
      context.effect(owner, target, 'BOMB', 5, 'Thunder Spears');
    }
    return { nextDelay: 7 };
  }
};

/** Armin Arlert - Colossal Titan (46494): Explodes once after 5s for 3x attack damage */
export const colossalTitan: AbilityDefinition = {
  id: 46494,
  offensive: true,
  cooldown: 5,
  oncePerBattle: true,
  bossGauge: true,
  onTimed(context, owner) {
    context.state(owner, 46494).used = true;
    return {
      nextDelay: Infinity,
      attack: {
        kind: 'boss-attack',
        title: 'Colossal Titan',
        multiplier: 3
      }
    };
  }
};

/** Roronoa Zoro - Santoryu (62): +66 to all stats when 3 items equipped */
export const santoryu: AbilityDefinition = {
  id: 62,
  startPriority: 5,
  onStart(context, owner) {
    if ((context.units[owner].equipment?.length ?? 0) >= 3) {
      context.addStats(owner, 66, 'Santoryu');
    }
  }
};

/** Portgas D. Ace - Dai Enkai: Entei (2072): Once per battle 5s AoE that burns */
export const daiEnkaiEntei: AbilityDefinition = {
  id: 2072,
  offensive: true,
  oncePerBattle: true,
  cooldown: 5,
  bossGauge: true,
  onTimed(context, owner) {
    for (const target of context.enemies(owner)) {
      context.inflictBurn(owner, target);
    }
    return {
      nextDelay: Infinity,
      attack: {
        kind: 'boss-attack',
        title: 'Dai Enkai: Entei'
      }
    };
  }
};

/** Sanji - Diable Jambe (305): Periodic 5s single attack for 2x damage that burns */
export const diableJambe: AbilityDefinition = {
  id: 305,
  offensive: true,
  cooldown: 5,
  bossGauge: true,
  targets: 'enemy',
  onTimed(context, owner) {
    const target = context.target(owner);
    if (target !== undefined) {
      context.inflictBurn(owner, target);
    }
    return {
      nextDelay: 5,
      attack: {
        kind: 'boss-attack',
        title: 'Diable Jambe',
        multiplier: 2,
        single: true
      }
    };
  }
};

// ============================================================================
// Consolidated Catalog Collections
// ============================================================================

export const characterAbilities: readonly AbilityDefinition[] = [
  blackFlash,
  theWorld,
  kakuja,
  rumbling,
  asceticBlaze,
  koyomiVamp,
  turboGranny,
  godHand,
  forbiddenMagic,
  driversHigh,
  chainsawHeart,
  malevolentShrine,
  withThisTreasure,
  jajanken,
  godspeed,
  tojiHeavenlyRestriction,
  makiHeavenlyRestriction,
  redComet,
  thunderSpears,
  colossalTitan,
  santoryu,
  daiEnkaiEntei,
  diableJambe,
  ...thresholdAbilities,
  ...timedCharacters,
  ...activeCharacters
];

export const bossAbilities: readonly AbilityDefinition[] = [
  grandFisher,
  kurama,
  gunDevil,
  deoxys,
  sahaquiel,
  mahoragaAdaptation
];
