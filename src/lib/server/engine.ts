import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  rollEvents,
  eventCharacter,
  MARINE_IDS,
  CAPTIVE_IDS,
  ROCKET_IDS,
  EVENT_RULES,
  QUIZ_QUESTIONS,
  rollRocketBalls,
  rollGotohSequence,
  initHangman,
  stepHangman,
  type EventAction,
  type JourneyEvent
} from '../events';
import { sample, mergeCast } from '../pool';
import { rollStage, type StageId } from '../stages';
import {
  applyInventoryAction,
  emptySlot,
  inventoryView,
  newUnit,
  randomPoolUnit,
  victoryRerollPool,
  type InventoryAction
} from './inventory';
import { rewardChoices } from '../items';
import { starterTeam, opponentTeams, testingStarterTeam, NEW_TESTING_CHARACTERS, abilityFor } from '../journeys';
import { abilityIds, IMPLEMENTED_ABILITIES } from '../battle/abilities';
import { simulateBattle } from '../battle/engine';
import { isBossFloor, rollBoss } from '../bosses';
import { distributeStats, generateBaseStats } from '../stats';
import { rarityFor } from '../rarity';
import type { JourneyCharacter, Job, JobView } from '../types';
import { bestSource, favoriteTotal } from '../match';
import { titleKey } from '../types';
import { demoCast, demoTitles } from './demo';
import { parseUsername, type Providers } from './providers';
import { Store } from './store';

function rocketUnit(id: number, random: () => number): JourneyCharacter {
  const values = distributeStats({ bst: EVENT_RULES.rocketBst, min: 95, max: 235 }, 4, random);
  return {
    ...newUnit(eventCharacter(id), random),
    statRarity: 'UR',
    baseStats: { hp: values[0], attack: values[1], defense: values[2], speed: values[3] }
  };
}

const ACTIVE_STATES = new Set(['queued', 'listing', 'fetching']);

export function view(job: Job): JobView {
  const { titles, done, pool, failures, listed: _listed, ...rest } = job;
  return {
    ...rest,
    total: titles.length,
    processed: done.length,
    failed: Object.keys(failures).length,
    uniqueCharacters: Object.keys(pool).length,
    ratedFavoriteCounts: Object.values(pool)
      .filter((c) => bestSource(c))
      .map((c) => c.favorites ?? null),
    favoriteCounts: Object.values(pool).flatMap((c) =>
      typeof c.favorites === 'number' ? [c.favorites] : []
    ),
    unknownFavorites: Object.values(pool).filter((c) => typeof c.favorites !== 'number').length,
    failures: Object.entries(failures).map(([key, message]) => ({
      title: titles.find((t) => titleKey(t) === key)?.name || key,
      message
    }))
  };
}

export class Engine {
  private queue: string[] = [];
  private running = false;
  private controllers = new Map<string, AbortController>();
  private initialized?: Promise<void>;
  private mutations: Promise<unknown> = Promise.resolve();

  constructor(
    readonly store: Store,
    private providers: Providers,
    private demoDelay = 1500
  ) {}

  init(): Promise<void> {
    return (this.initialized ??= (async () => {
      const jobs = await this.store.jobs();
      const pendingIds = jobs
        .filter((job) => ACTIVE_STATES.has(job.state))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((job) => job.id);

      this.queue.push(...pendingIds);
      this.kick();
    })());
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutations.then(operation);
    this.mutations = next.catch(() => {});
    return next;
  }

  async create(input: string, includePlanned: boolean, demo: boolean, scope = 'lottery') {
    await this.init();
    return this.serialize(async () => {
      const username = demo ? 'demo' : parseUsername(input);
      const jobs = await this.store.jobs();

      const existing = jobs.find(
        (job) =>
          job.username.toLowerCase() === username.toLowerCase() &&
          (job.scope ?? 'lottery') === scope &&
          job.demo === demo &&
          job.includePlanned === includePlanned &&
          ACTIVE_STATES.has(job.state)
      );
      if (existing) return existing;

      if (jobs.filter((job) => ACTIVE_STATES.has(job.state)).length >= 10) {
        throw new Error('The import queue is full. Please try again later.');
      }

      const now = new Date().toISOString();
      const job: Job = {
        id: randomUUID(),
        username,
        scope,
        demo,
        includePlanned,
        state: 'queued',
        createdAt: now,
        updatedAt: now,
        titles: [],
        listed: false,
        done: [],
        failures: {},
        pool: {},
        message: 'Waiting for the importer.'
      };

      await this.store.saveJob(job);
      this.queue.push(job.id);
      this.kick();
      return job;
    });
  }

  async retry(id: string) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job) throw new Error('Import not found.');
      if (ACTIVE_STATES.has(job.state) || job.state === 'complete') return job;

      const jobs = await this.store.jobs();
      if (jobs.filter((item) => ACTIVE_STATES.has(item.state)).length >= 10) {
        throw new Error('The import queue is full. Please try again later.');
      }

      job.failures = {};
      job.state = 'queued';
      job.message = 'Retry queued; previously fetched characters are preserved.';
      await this.store.saveJob(job);

      this.queue.push(job.id);
      this.kick();
      return job;
    });
  }

  private prepareEventMetadata(job: Job, event: JourneyEvent, random: () => number) {
    const team = (job.starterTeam ?? []) as JourneyCharacter[];
    const living = team.filter((c) => !c.empty);

    if (event.id === 'marine' && !event.previewTeam) {
      event.previewTeam = sample(MARINE_IDS, 5, random).map((id) => ({
        ...newUnit(eventCharacter(id), random),
        marine: true
      }));
    } else if (event.id === 'parasyte' && !event.targetUnitId && living.length > 0) {
      const target = living[Math.floor(random() * living.length)];
      event.targetUnitId = target.instanceId;
      event.targetUnitName = target.name;
      event.targetUnitImage = target.image;
    } else if (event.id === 'rocket') {
      if (!event.targetUnitId && living.length > 0) {
        const target = living[Math.floor(random() * living.length)];
        event.targetUnitId = target.instanceId;
        event.targetUnitName = target.name;
        event.targetUnitImage = target.image;
      }
      if (!event.previewTeam) {
        event.previewTeam = ROCKET_IDS.map((rid) => rocketUnit(rid, random));
      }
    }
  }

  async journeyOpponents(
    id: string
  ): Promise<{
    teams: JourneyCharacter[][];
    stage?: StageId;
    events?: (JourneyEvent | null)[];
  }> {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys' || job.state !== 'complete' || !job.starterTeam) {
        throw new Error('Roll your starting team before departing.');
      }
      if (job.itemReward) {
        throw new Error('Choose your item reward before continuing.');
      }
      if (job.pendingCatch) {
        throw new Error('Place your caught unit before continuing.');
      }
      if (job.pendingWildCard) {
        throw new Error('Place your returning Wild Card unit before continuing.');
      }
      if (!job.starterTeam.some((c) => !('empty' in c && c.empty))) {
        throw new Error('Your team is empty. Use the testing team reroll to continue.');
      }
      if (
        job.encounter?.selected !== undefined &&
        job.encounter.events?.[job.encounter.selected] &&
        !['complete'].includes(job.encounter.events[job.encounter.selected]!.status) &&
        !job.encounter.gameOver
      ) {
        throw new Error('Finish your event before continuing.');
      }

      const random = () => randomInt(0, 2 ** 32) / 2 ** 32;

      if (isBossFloor(job.arenaWins ?? 0)) {
        const teams = [[rollBoss(randomUUID(), random)]];
        job.encounter = { teams };
        await this.store.saveJob(job);
        return { teams };
      }

      const teams = opponentTeams(Object.values(job.pool), random).map((team) =>
        team.map((character) => {
          const statRarity = rarityFor(character.favorites) ?? 'N';
          return {
            ...character,
            instanceId: randomUUID(),
            statRarity,
            baseStats: generateBaseStats(statRarity, random)
          };
        })
      );

      const events = rollEvents(random);
      for (const ev of events) {
        if (ev) this.prepareEventMetadata(job, ev, random);
      }

      job.encounter = {
        teams,
        stage: rollStage(random),
        events
      };

      await this.store.saveJob(job);
      return {
        teams,
        stage: job.encounter.stage!,
        events: job.encounter.events
      };
    });
  }

  async journeyTeam(id: string, reroll = false): Promise<JourneyCharacter[]> {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys') throw new Error('Journey import not found.');
      if (job.state !== 'complete') {
        throw new Error('Finish importing before rolling your starting team.');
      }

      const random = () => randomInt(0, 2 ** 32) / 2 ** 32;

      if (reroll) {
        for (const char of NEW_TESTING_CHARACTERS) {
          if (!job.pool[char.id]) {
            job.pool[char.id] = char;
          }
        }
      }

      const selected =
        !reroll && job.starterTeam
          ? job.starterTeam
          : reroll
            ? testingStarterTeam(job.pool, random)
            : starterTeam(Object.values(job.pool), random);

      const team = selected.map((character): JourneyCharacter => {
        if ('baseStats' in character && 'instanceId' in character && 'statRarity' in character) {
          return character as JourneyCharacter;
        }
        const statRarity = rarityFor(character.favorites) ?? 'N';
        return {
          ...character,
          instanceId: randomUUID(),
          statRarity,
          baseStats: generateBaseStats(statRarity, random)
        };
      });

      if (reroll) {
        if (job.itemReward) {
          throw new Error('Choose your item reward before rerolling.');
        }
        const extraCount = (job.inventory ?? []).filter(
          (i) => i.itemId === 'merry' || i.itemId === 'sunny'
        ).length;
        for (let i = 0; i < extraCount; i++) {
          team.push(randomPoolUnit(job, random));
        }
      }

      job.starterTeam = team;
      if (reroll) delete job.encounter;

      await this.store.saveJob(job);
      return team;
    });
  }

  async journeyBattle(
    id: string,
    opponent?: number,
    replace?: string,
    mode: 'idle' | 'clout' = 'clout'
  ) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys' || !job.starterTeam || !job.encounter) {
        throw new Error('Depart before fighting.');
      }

      const encounter = job.encounter;

      if (replace !== undefined) {
        if (encounter.gameOver) throw new Error('This run has ended.');
        const battleWon = encounter.result
          ? encounter.result.winner
            ? encounter.result.winner === 'left'
            : encounter.result.left > encounter.result.right
          : false;

        if (!encounter.result || !battleWon || encounter.rewardUsed) {
          throw new Error('One replacement is available after each victory.');
        }

        const index = job.starterTeam.findIndex(
          (c) => 'instanceId' in c && c.instanceId === replace
        );
        if (index < 0) throw new Error('Team member not found.');
        if (encounter.events?.[encounter.selected ?? -1]?.id === 'marine') {
          throw new Error('Choose your rescued character through the event.');
        }

        const pool = victoryRerollPool(job, job.starterTeam[index] as JourneyCharacter);
        if (!pool.length) {
          throw new Error('No different characters match your current reroll filters.');
        }

        const character = pool[randomInt(pool.length)];
        const statRarity = rarityFor(character.favorites) ?? 'N';
        const previous = job.starterTeam[index] as JourneyCharacter;

        const next: JourneyCharacter = {
          ...character,
          instanceId: randomUUID(),
          statRarity,
          baseStats: generateBaseStats(statRarity, () => randomInt(0, 2 ** 32) / 2 ** 32)
        };

        if (abilityIds(previous).includes(117921)) {
          next.extraAbilities = [...new Set(abilityIds(previous))];
          next.permanentBoosts = Object.fromEntries(
            ['hp', 'attack', 'defense', 'speed'].map((key) => [
              key,
              (previous.permanentBoosts?.[key as keyof typeof previous.permanentBoosts] ?? 0) + 3
            ])
          );
        }

        job.starterTeam[index] = next;
        encounter.rewardUsed = true;
      } else {
        if (!Number.isInteger(opponent) || opponent! < 0 || opponent! >= encounter.teams.length) {
          throw new Error('Choose an opponent.');
        }

        const isAlcatrazRoyale = encounter.stage === 'alcatraz' && encounter.teams.length >= 3;
        const event = encounter.events?.[opponent!];
        if (!isAlcatrazRoyale) {
          if (event && event.status !== 'battle' && !encounter.result) {
            throw new Error('This event has no battle ready.');
          }
          if (encounter.selected !== undefined && encounter.selected !== opponent) {
            throw new Error('This pathway is already selected.');
          }
          if (event && !['battle', 'reward', 'complete'].includes(event.status)) {
            throw new Error('Choose an event option first.');
          }
          if (event && !['marine', 'parasyte', 'rocket'].includes(event.id)) {
            throw new Error('This event has no battle.');
          }
        }

        if (!encounter.result) {
          encounter.selected = opponent;
          if (event) mode = 'idle';
          if (encounter.teams[opponent!].some((c) => c.boss)) mode = 'idle';
          if (mode === 'idle') {
            const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
            const extraBattleRoyaleTeams =
              encounter.stage === 'alcatraz' && encounter.teams.length >= 3
                ? [encounter.teams[1], encounter.teams[2]]
                : undefined;
            const primaryOpponent =
              encounter.stage === 'alcatraz' && encounter.teams.length >= 3
                ? encounter.teams[0]
                : encounter.teams[opponent!];

            encounter.replay = simulateBattle(
              job.starterTeam as JourneyCharacter[],
              primaryOpponent,
              random,
              encounter.stage,
              extraBattleRoyaleTeams
            );

            const hasMachine = job.inventory?.some((item) => item.itemId === 'machine');
            const shouldRetry =
              !encounter.machineUsed &&
              (encounter.replay.resetSide !== undefined ||
                (encounter.replay.winner === 'right' && hasMachine));

            if (shouldRetry) {
              encounter.machineUsed = true;
              const initialAttempt = encounter.replay;
              initialAttempt.floor = job.arenaWins ?? 0;

              encounter.replay = simulateBattle(
                job.starterTeam as JourneyCharacter[],
                primaryOpponent,
                random,
                encounter.stage,
                extraBattleRoyaleTeams
              );
              encounter.replay.initialAttempt = initialAttempt;
              encounter.replay.retryTitle =
                initialAttempt.resetSide !== undefined ? 'Reset' : 'Future Machine No. 8';
            }

            const { left, right, winner } = encounter.replay;

            for (const unit of job.starterTeam as JourneyCharacter[]) {
              const update = encounter.replay.updates?.[unit.instanceId];
              if (update) {
                Object.assign(unit, update);
              }
            }

            encounter.replay.floor = job.arenaWins ?? 0;

            if (winner === 'left') {
              this.advanceFloor(job);
              if (event?.id === 'marine') {
                event.reward = newUnit(
                  eventCharacter(CAPTIVE_IDS[randomInt(CAPTIVE_IDS.length)]),
                  random
                );
                event.status = 'reward';
                event.outcome = 'won';
                event.quote = '“Gah… The Marines won’t forget this…”';
                event.message = `You got ${event.reward.name}!`;
                encounter.rewardUsed = true;
              } else if (event?.id === 'parasyte') {
                event.status = 'complete';
                event.outcome = 'won';
                event.quote = '“G-gaah…”';
                event.message = `${event.targetUnitName ?? 'The unit'} was slain.`;
                encounter.rewardUsed = true;
              } else if (event?.id === 'rocket') {
                const balls = rollRocketBalls(EVENT_RULES.rocketBalls, random);
                job.inventory ??= [];
                for (const ball of balls) {
                  job.inventory.push({ instanceId: randomUUID(), itemId: ball });
                }
                event.ballsReward = balls;
                event.status = 'complete';
                event.outcome = 'won';
                event.quote = '“Team Rocket’s blasting off agaaaaain!”';
                event.message = `You protected ${event.targetUnitName ?? 'your unit'} and won 10 Poké Balls!`;
                encounter.rewardUsed = true;
              }
            }

            encounter.result = { left, right, winner, mode };
          } else {
            encounter.result = {
              left: favoriteTotal(job.starterTeam),
              right: favoriteTotal(encounter.teams[opponent!])
            };
          }

          if (event && event.status === 'battle') {
            event.status = 'complete';
          }

          const lost = encounter.result.winner
            ? encounter.result.winner === 'right'
            : encounter.result.left < encounter.result.right;

          if (lost) {
            if (event?.id === 'rocket') {
              const team = job.starterTeam as JourneyCharacter[];
              const stolenIdx = team.findIndex((c) => c.instanceId === event.targetUnitId);
              if (stolenIdx >= 0) {
                team[stolenIdx] = emptySlot();
              }
              event.outcome = 'lost';
              event.quote = '“Boss’ll be happy with this one!”';
              event.message = `${event.targetUnitName ?? 'Your unit'} was stolen by Team Rocket!`;
              this.advanceFloor(job);
              if (!team.some((c) => !c.empty)) {
                job.lives = Math.max(0, (job.lives ?? 3) - 1);
                if (job.lives === 0) {
                  this.resetRun(job);
                  encounter.gameOver = true;
                  job.encounter = encounter;
                }
              }
            } else {
              if (event?.id === 'marine') {
                event.outcome = 'lost';
                event.quote = '“Pirate scum! Take them into custody!”';
                event.message = 'Lose 1 life.';
              } else if (event?.id === 'parasyte') {
                event.outcome = 'lost';
                event.quote = '“Sustenance…”';
                event.message = 'Lose 1 life.';
              }
              job.lives = Math.max(0, (job.lives ?? 3) - 1);
              if (job.lives === 0) {
                this.resetRun(job);
                encounter.gameOver = true;
                job.encounter = encounter;
              }
            }
          }
        }
      }

      await this.store.saveJob(job);
      return {
        lives: job.lives ?? 3,
        gameOver: Boolean(encounter.gameOver),
        result: encounter.result,
        replay: encounter.replay,
        arenaWins: job.arenaWins ?? 0,
        inventory: job.inventory ?? [],
        itemReward: job.itemReward ?? null,
        pendingWildCard: job.pendingWildCard ?? null,
        characters: job.starterTeam,
        encounter: job.encounter,
        rewardUsed: Boolean(encounter.rewardUsed)
      };
    });
  }

  private grantItemReward(job: Job, count = 1) {
    for (let i = 0; i < count; i++) {
      if (!job.itemReward) {
        job.itemReward = {
          id: randomUUID(),
          choices: rewardChoices(job.inventory ?? [], () => randomInt(0, 2 ** 32) / 2 ** 32)
        };
      } else {
        job.pendingItemRewards = (job.pendingItemRewards ?? 0) + 1;
      }
    }
  }

  private checkWildCardReturns(job: Job) {
    if (job.pendingWildCard || !job.wildCardQueue?.length) return;
    const idx = job.wildCardQueue.findIndex((entry) => entry.returnFloor <= (job.arenaWins ?? 0));
    if (idx >= 0) {
      job.pendingWildCard = job.wildCardQueue.splice(idx, 1)[0].unit;
      if (job.wildCardQueue.length === 0) delete job.wildCardQueue;
    }
  }

  private advanceFloor(job: Job) {
    job.arenaWins = (job.arenaWins ?? 0) + 1;
    if (job.arenaWins % 4 === 0) {
      this.grantItemReward(job, 1);
    }
    this.checkWildCardReturns(job);
  }

  async journeyEvent(id: string, action: EventAction) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (
        !job ||
        job.scope !== 'journeys' ||
        !job.starterTeam ||
        !job.encounter ||
        job.encounter.gameOver
      ) {
        throw new Error('Depart before choosing an event.');
      }

      const encounter = job.encounter;
      const event = encounter.events?.[action.index];
      if (!event || (encounter.result && event.status !== 'reward' && event.status !== 'complete')) {
        throw new Error('Event not available.');
      }
      if (encounter.selected !== undefined && encounter.selected !== action.index) {
        throw new Error('This pathway is already selected.');
      }
      if (event.status === 'complete') {
        return inventoryView(job);
      }

      const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
      const team = job.starterTeam as JourneyCharacter[];
      this.prepareEventMetadata(job, event, random);

      if (event.status === 'choice') {
        // Allow picking a target directly on the initial screen for Ego's Wild Card
        if (event.id === 'wildcard' && action.target) {
          const index = team.findIndex(
            (c) =>
              c.instanceId === action.target &&
              !c.empty &&
              !c.keywords?.includes('WILD CARD')
          );
          if (index < 0) {
            throw new Error('Choose an eligible team member without Wild Card.');
          }
          encounter.selected = action.index;
          event.targetUnitId = team[index].instanceId;
          event.targetUnitName = team[index].name;
          event.targetUnitImage = team[index].image;
          event.quote =
            '“If I were you, I’d be kicking that trash out.”\n“However… they still have a chance to return to your team if they get ahold of the ‘Wild Card’ in my Blue Lock program. I’ll offer you and that one a chance.”';
          event.status = 'confirm';
          await this.store.saveJob(job);
          return inventoryView(job);
        }

        if (!['yes', 'no'].includes(action.choice ?? '')) {
          throw new Error('Choose Yes or No.');
        }

        if (action.choice === 'no' && ['parasyte', 'rocket'].includes(event.id)) {
          throw new Error('This event cannot be declined.');
        }

        encounter.selected = action.index;

        if (action.choice === 'no') {
          event.status = 'complete';
          event.outcome = 'declined';
          if (event.id === 'creature') {
            event.message =
              'You hear and see guns shooting toward Kyubey. A black-haired girl warns you, “Stay away from that thing.” Then, she disappears.';
          } else if (event.id === 'marine') {
            event.message = 'You decide to leave.';
            event.quote = '“From now on, we hereby declare the execution of…”';
          } else if (event.id === 'wildcard') {
            event.quote = '“I see. Don’t blame me if they’re deadweight later on.”';
          } else if (event.id === 'janken') {
            event.message = 'You decline the boy’s challenge and continue walking through Morioh.';
          } else if (event.id === 'gotoh') {
            event.message = 'You decide not to pursue Killua and leave the Zoldyck estate.';
          } else if (event.id === 'hangman') {
            event.message = 'You refuse Sadakuni’s Kakerou gamble.';
          } else if (event.id === 'madao') {
            event.quote = '“You might need that money, you know?”';
          }
          this.advanceFloor(job);
        } else if (event.id === 'creature') {
          const eligible = team.some((c) => !c.empty && !c.soulGem);
          if (!eligible) {
            throw new Error('No units are eligible for a Soul Gem. Choose No to continue.');
          }
          event.status = 'target';
        } else if (event.id === 'marine') {
          encounter.teams[action.index] =
            event.previewTeam ??
            sample(MARINE_IDS, 5, random).map((mid) => ({
              ...newUnit(eventCharacter(mid), random),
              marine: true
            }));
          delete encounter.stage;
          event.status = 'battle';
        } else if (event.id === 'wildcard') {
          const eligible = team.some((c) => !c.empty && !c.keywords?.includes('WILD CARD'));
          if (!eligible) {
            throw new Error('No units are eligible for the Wild Card program. Choose No to continue.');
          }
          event.status = 'target';
        } else if (event.id === 'parasyte') {
          const livingIndices = team.flatMap((c, i) => (!c.empty ? [i] : []));
          if (!livingIndices.length) {
            throw new Error('No living units on your team.');
          }
          let targetIdx = team.findIndex(
            (c) => c.instanceId === event.targetUnitId && !c.empty
          );
          if (targetIdx < 0) {
            targetIdx = livingIndices[Math.floor(random() * livingIndices.length)];
          }
          const target = team[targetIdx];
          event.targetUnitId = target.instanceId;
          event.targetUnitName = target.name;
          event.targetUnitImage = target.image;

          if (random() < 0.5) {
            target.extraAbilities = [...new Set([...(target.extraAbilities ?? []), 12323])];
            if (target.removedAbilities) {
              target.removedAbilities = target.removedAbilities.filter((a) => a !== 12323);
            }
            event.status = 'complete';
            event.outcome = 'won';
            event.quote = '“Ah… I failed…”';
            event.message = `${target.name} gets Migi!`;
            this.advanceFloor(job);
          } else {
            const parasyteFoe: JourneyCharacter = {
              ...structuredClone(target),
              instanceId: randomUUID(),
              baseStats: {
                hp: target.baseStats.hp + EVENT_RULES.parasyteStatBoost,
                attack: target.baseStats.attack + EVENT_RULES.parasyteStatBoost,
                defense: target.baseStats.defense + EVENT_RULES.parasyteStatBoost,
                speed: target.baseStats.speed + EVENT_RULES.parasyteStatBoost
              }
            };
            if (livingIndices.length > 1) {
              team[targetIdx] = emptySlot();
            }
            encounter.teams[action.index] = [parasyteFoe];
            delete encounter.stage;
            event.status = 'battle';
          }
        } else if (event.id === 'rocket') {
          encounter.teams[action.index] =
            event.previewTeam ?? ROCKET_IDS.map((rid) => rocketUnit(rid, random));
          delete encounter.stage;
          event.status = 'battle';
        } else if (event.id === 'janken') {
          event.status = 'play';
        } else if (event.id === 'gotoh') {
          const seq = rollGotohSequence(random);
          event.gotohPasses = seq.passes;
          event.gotohAnswer = seq.answer;
          event.status = 'play';
        } else if (event.id === 'hangman') {
          const game = initHangman(random);
          event.hangmanPlayerHand = game.playerHand;
          event.hangmanEnemyHand = game.enemyHand;
          event.hangmanEnemyCount = game.enemyHand.length;
          event.hangmanLog = game.log;
          if (game.winner === 'won') {
            event.status = 'complete';
            event.outcome = 'won';
            event.quote = '“As if I could die at a place like this! Dammit!”';
            event.message = 'You got the wagered money! Gain 3 items.';
            this.grantItemReward(job, 3);
            this.advanceFloor(job);
          } else if (game.winner === 'lost') {
            this.executeRandomUnit(team, event, random);
            event.status = 'complete';
            event.outcome = 'lost';
            event.quote = '“This is your destiny.”';
            event.message = `${event.targetUnitName ?? 'Your unit'} was executed!`;
            this.advanceFloor(job);
          } else {
            event.status = 'play';
          }
        } else if (event.id === 'madao') {
          event.quizIndex = Math.min(
            QUIZ_QUESTIONS.length - 1,
            Math.floor(random() * QUIZ_QUESTIONS.length)
          );
          event.status = 'play';
        }
      } else if (event.status === 'confirm' && event.id === 'wildcard') {
        if (!['yes', 'no'].includes(action.choice ?? '')) {
          throw new Error('Choose Yes or No.');
        }
        if (action.choice === 'no') {
          event.status = 'complete';
          event.outcome = 'declined';
          event.quote = '“I see. Don’t blame me if they’re deadweight later on.”';
          this.advanceFloor(job);
        } else {
          const index = team.findIndex(
            (c) =>
              c.instanceId === event.targetUnitId &&
              !c.empty &&
              !c.keywords?.includes('WILD CARD')
          );
          if (index < 0) {
            throw new Error('Selected unit is no longer eligible.');
          }
          const boosted = structuredClone(team[index]);
          boosted.permanentBoosts = {
            hp: (boosted.permanentBoosts?.hp ?? 0) + EVENT_RULES.wildCardStatBoost,
            attack: (boosted.permanentBoosts?.attack ?? 0) + EVENT_RULES.wildCardStatBoost,
            defense: (boosted.permanentBoosts?.defense ?? 0) + EVENT_RULES.wildCardStatBoost,
            speed: (boosted.permanentBoosts?.speed ?? 0) + EVENT_RULES.wildCardStatBoost
          };
          boosted.keywords = [...new Set([...(boosted.keywords ?? []), 'WILD CARD' as const])];
          team[index] = emptySlot();
          const returnFloor = (job.arenaWins ?? 0) + EVENT_RULES.wildCardFloors;
          job.wildCardQueue ??= [];
          job.wildCardQueue.push({
            unit: boosted,
            returnFloor
          });
          this.advanceFloor(job);
          event.status = 'complete';
          event.outcome = 'accepted';
          event.quote = '“Looks like they have a will. They’ll be back.”';
          event.message = `${boosted.name} entered the Blue Lock Wild Card program and will return in 5 floors.`;
        }
      } else if (event.status === 'play') {
        if (event.id === 'janken') {
          if (!action.janken) throw new Error('Choose Rock, Paper, or Scissors.');
          const choices = ['rock', 'paper', 'scissors'] as const;
          const aiChoice = choices[Math.floor(random() * choices.length)];
          if (action.janken !== 'timeout') {
            event.jankenPlayer = action.janken;
            event.jankenEnemy = aiChoice;
          }
          if (action.janken !== 'timeout' && action.janken === aiChoice) {
            event.jankenTie = true;
            event.message = `Both chose ${action.janken.toUpperCase()}! It’s a tie — choose again!`;
          } else {
            event.jankenTie = false;
            const won =
              action.janken !== 'timeout' &&
              ((action.janken === 'rock' && aiChoice === 'scissors') ||
                (action.janken === 'paper' && aiChoice === 'rock') ||
                (action.janken === 'scissors' && aiChoice === 'paper'));

            if (won) {
              const abilityId =
                IMPLEMENTED_ABILITIES[
                  Math.min(
                    IMPLEMENTED_ABILITIES.length - 1,
                    Math.floor(random() * IMPLEMENTED_ABILITIES.length)
                  )
                ];
              const abilityName = abilityFor(abilityId)?.title ?? String(abilityId);
              event.abilityId = abilityId;
              event.abilityName = abilityName;
              event.outcome = 'won';
              event.quote = '“Waah!”';
              event.message = `You won! Choose a unit on your team to receive ${abilityName}.`;
              event.status = 'target';
            } else {
              const holders = team.filter((c) => !c.empty && abilityIds(c).length > 0);
              if (holders.length > 0) {
                const victim = holders[Math.floor(random() * holders.length)];
                const ids = abilityIds(victim);
                const stolenId = ids[Math.floor(random() * ids.length)];
                if (victim.extraAbilities?.includes(stolenId)) {
                  victim.extraAbilities = victim.extraAbilities.filter((a) => a !== stolenId);
                }
                if (victim.id === stolenId) {
                  victim.removedAbilities = [
                    ...new Set([...(victim.removedAbilities ?? []), stolenId])
                  ];
                }
                const stolenName = abilityFor(stolenId)?.title ?? String(stolenId);
                event.targetUnitId = victim.instanceId;
                event.targetUnitName = victim.name;
                event.targetUnitImage = victim.image;
                event.abilityName = stolenName;
                event.outcome = action.janken === 'timeout' ? 'timeout' : 'lost';
                event.quote = `“I won! I’ll be taking ${stolenName} from ${victim.name}!”`;
                event.message = `${victim.name} gets ${stolenName} taken!`;
              } else {
                event.outcome = action.janken === 'timeout' ? 'timeout' : 'lost';
                event.quote = '“W-what the heck?! That’s cheating!”';
                event.message = 'Your team has no abilities to take!';
              }
              event.status = 'complete';
              this.advanceFloor(job);
            }
          }
        } else if (event.id === 'gotoh') {
          if (!action.butler) throw new Error('Choose a butler.');
          if (action.butler === 'timeout') {
            event.status = 'complete';
            event.outcome = 'timeout';
            event.quote = `“Time’s out. The coin was on ${event.gotohAnswer}. Out.”`;
            event.message = 'You ran out of time.';
            this.advanceFloor(job);
          } else if (action.butler === event.gotohAnswer) {
            event.reward = newUnit(eventCharacter(27), random);
            event.status = 'reward';
            event.outcome = 'won';
            event.quote = '“Correct. Please look after Master Killua.”';
            event.message = 'You got Killua!';
            encounter.rewardUsed = true;
          } else {
            event.status = 'complete';
            event.outcome = 'lost';
            event.quote = `“Wrong. The coin was on ${event.gotohAnswer}. Out.”`;
            event.message = 'You didn’t answer correctly.';
            this.advanceFloor(job);
          }
        } else if (event.id === 'hangman') {
          if (action.cardIndex === undefined) throw new Error('Draw a card.');
          if (action.cardIndex === 'timeout') {
            event.status = 'complete';
            event.outcome = 'timeout';
            event.message = 'The game ends with no winner.';
            this.advanceFloor(job);
          } else {
            const step = stepHangman(
              event.hangmanPlayerHand ?? [],
              event.hangmanEnemyHand ?? [],
              action.cardIndex,
              random
            );
            event.hangmanPlayerHand = step.playerHand;
            event.hangmanEnemyHand = step.enemyHand;
            event.hangmanEnemyCount = step.enemyHand.length;
            event.hangmanLog = step.log;

            if (step.winner === 'won') {
              event.status = 'complete';
              event.outcome = 'won';
              event.quote = '“As if I could die at a place like this! Dammit!”';
              event.message = 'You got the wagered money! Gain 3 items.';
              this.grantItemReward(job, 3);
              this.advanceFloor(job);
            } else if (step.winner === 'lost') {
              this.executeRandomUnit(team, event, random);
              event.status = 'complete';
              event.outcome = 'lost';
              event.quote = '“This is your destiny.”';
              event.message = `${event.targetUnitName ?? 'Your unit'} was executed!`;
              this.advanceFloor(job);
            }
          }
        } else if (event.id === 'madao') {
          if (action.answer === undefined) throw new Error('Choose an answer.');
          const q = QUIZ_QUESTIONS[event.quizIndex ?? 0];
          if (action.answer === 'timeout') {
            event.status = 'complete';
            event.outcome = 'timeout';
            event.message = 'Time’s up.';
            this.advanceFloor(job);
          } else if (action.answer === q.answer) {
            event.status = 'complete';
            event.outcome = 'won';
            event.message = 'Correct! You get 10 million! (One item)';
            event.quote = '“Don’t just change the prize!”';
            this.grantItemReward(job, 1);
            this.advanceFloor(job);
          } else {
            event.status = 'complete';
            event.outcome = 'lost';
            event.message = 'Wrong. You don’t get anything.';
            event.quote = '“There’s more debt?!”';
            this.advanceFloor(job);
          }
        }
      } else if (event.status === 'target' || event.status === 'reward') {
        if (event.status === 'target' && event.id === 'wildcard') {
          const index = team.findIndex(
            (c) =>
              c.instanceId === action.target &&
              !c.empty &&
              !c.keywords?.includes('WILD CARD')
          );
          if (index < 0) {
            throw new Error('Choose an eligible team slot.');
          }
          event.targetUnitId = team[index].instanceId;
          event.targetUnitName = team[index].name;
          event.targetUnitImage = team[index].image;
          event.quote =
            '“If I were you, I’d be kicking that trash out.”\n“However… they still have a chance to return to your team if they get ahold of the ‘Wild Card’ in my Blue Lock program. I’ll offer you and that one a chance.”';
          event.status = 'confirm';
        } else if (event.status === 'target' && event.id === 'janken') {
          const index = team.findIndex((c) => c.instanceId === action.target && !c.empty);
          if (index < 0) {
            throw new Error('Choose an eligible team slot.');
          }
          const unit = team[index];
          if (event.abilityId !== undefined) {
            unit.extraAbilities = [...new Set([...(unit.extraAbilities ?? []), event.abilityId])];
            if (unit.removedAbilities) {
              unit.removedAbilities = unit.removedAbilities.filter((a) => a !== event.abilityId);
            }
          }
          event.targetUnitName = unit.name;
          event.targetUnitImage = unit.image;
          event.quote = '“Waah!”';
          event.message = `${unit.name} got ${event.abilityName}!`;
          event.status = 'complete';
          this.advanceFloor(job);
        } else {
          const index = team.findIndex(
            (c) =>
              c.instanceId === action.target &&
              (event.status === 'reward' || (!c.empty && !c.soulGem))
          );
          if (index < 0) {
            throw new Error('Choose an eligible team slot.');
          }

          if (event.status === 'target') {
            team[index].soulGem = true;
            event.targetUnitName = team[index].name;
            event.targetUnitImage = team[index].image;
            event.quote = `“Great! ${team[index].name} will become a Magical Girl!”`;
            event.message = `${team[index].name} gains the Soul Gem keyword.`;
            event.outcome = 'accepted';
            this.advanceFloor(job);
          } else {
            if (!event.reward) throw new Error('Reward missing.');
            const rewarded = event.reward;
            team[index] = rewarded;
            delete event.reward;
            event.targetUnitName = rewarded.name;
            event.targetUnitImage = rewarded.image;
            if (event.id === 'gotoh') {
              event.quote = '“Correct. Please look after Master Killua.”';
              event.message = 'You got Killua!';
              this.advanceFloor(job);
            } else {
              event.quote = '“Gah… The Marines won’t forget this…”';
              event.message = `You got ${rewarded.name}!`;
            }
          }

          event.status = 'complete';
        }
      } else {
        throw new Error('Fight the enemies to finish this event.');
      }

      await this.store.saveJob(job);
      return inventoryView(job);
    });
  }

  private executeRandomUnit(
    team: JourneyCharacter[],
    event: JourneyEvent,
    random: () => number
  ) {
    const livingIndices = team.flatMap((c, i) => (!c.empty ? [i] : []));
    if (livingIndices.length > 0) {
      const victimIdx = livingIndices[Math.floor(random() * livingIndices.length)];
      const victim = team[victimIdx];
      event.targetUnitId = victim.instanceId;
      event.targetUnitName = victim.name;
      event.targetUnitImage = victim.image;
      team[victimIdx] = emptySlot();
    }
  }

  private resetRun(job: Job) {
    const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
    job.starterTeam = starterTeam(Object.values(job.pool), random).map((c) => newUnit(c, random));
    job.lives = 3;
    job.arenaWins = 0;
    job.inventory = [];
    delete job.itemReward;
    delete job.pendingItemRewards;
    delete job.pendingCatch;
    delete job.pendingWildCard;
    delete job.wildCardQueue;
    delete job.itemNotice;
    delete job.fusionNotice;
    delete job.wishCandidates;
    delete job.encounter;
  }

  async journeyReset(id: string) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys' || job.state !== 'complete' || !job.starterTeam) {
        throw new Error('Roll a team before starting a new run.');
      }
      this.resetRun(job);
      await this.store.saveJob(job);
      return inventoryView(job);
    });
  }

  async journeyInventory(id: string, action?: InventoryAction) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job || job.scope !== 'journeys') throw new Error('Journey not found.');

      if (action) {
        applyInventoryAction(job, action, () => randomInt(0, 2 ** 32) / 2 ** 32);
        await this.store.saveJob(job);
      }

      return inventoryView(job);
    });
  }

  async journeySearch(id: string, query: string) {
    await this.init();
    const source = await this.store.getJob(id);
    const hasDragonBalls =
      (source?.inventory ?? []).filter((item) => item.itemId === 'dragonball').length >= 7;

    if (!source || source.scope !== 'journeys' || !hasDragonBalls) {
      throw new Error('Collect seven Dragon Balls first.');
    }

    query = query.trim();
    if (query.length < 2 || query.length > 80) {
      throw new Error('Enter 2–80 characters.');
    }

    const local = Object.values(source.pool).filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase())
    );

    let remote: import('../types').PoolCharacter[] = [];
    try {
      remote = this.providers.searchCharacters
        ? await this.providers.searchCharacters(query)
        : [];
    } catch (error) {
      if (!local.length) throw error;
    }

    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      const ballsValid =
        (job?.inventory ?? []).filter((item) => item.itemId === 'dragonball').length >= 7;

      if (!job || job.scope !== 'journeys' || !ballsValid) {
        throw new Error('Collect seven Dragon Balls first.');
      }

      job.wishCandidates = [
        ...new Map([...remote, ...local].map((c) => [c.id, c])).values()
      ].slice(0, 12);

      await this.store.saveJob(job);
      return job.wishCandidates;
    });
  }

  async cancel(id: string) {
    await this.init();
    return this.serialize(async () => {
      const job = await this.store.getJob(id);
      if (!job) throw new Error('Import not found.');
      if (!ACTIVE_STATES.has(job.state)) return job;

      this.controllers.get(id)?.abort();
      this.queue = this.queue.filter((queued) => queued !== id);
      job.state = 'cancelled';
      job.message =
        'Import cancelled. Collected characters are saved; you can roll or resume the import.';
      job.updatedAt = new Date().toISOString();

      await this.store.saveJob(job);
      return job;
    });
  }

  private kick() {
    if (this.running) return;
    this.running = true;

    void this.drain()
      .catch((error) => console.error('Import queue stopped:', error))
      .finally(() => {
        this.running = false;
        if (this.queue.length) this.kick();
      });
  }

  private async persist(job: Job, signal: AbortSignal) {
    await this.serialize(async () => {
      signal.throwIfAborted();
      job.updatedAt = new Date().toISOString();
      await this.store.saveJob(job);
    });
  }

  private async drain() {
    while (this.queue.length) {
      const id = this.queue.shift()!;
      const controller = new AbortController();
      this.controllers.set(id, controller);
      const signal = controller.signal;

      const job = await this.store.getJob(id);
      if (!job || !ACTIVE_STATES.has(job.state)) {
        this.controllers.delete(id);
        continue;
      }

      try {
        if (!job.listed) {
          job.state = 'listing';
          job.message = 'Reading anime and manga lists…';
          await this.persist(job, signal);

          job.titles = job.demo
            ? demoTitles
            : await this.providers.lists(job.username, job.includePlanned, signal);
          job.listed = true;
        }

        job.state = 'fetching';
        await this.persist(job, signal);

        for (const title of job.titles) {
          signal.throwIfAborted();
          const key = titleKey(title);
          if (job.done.includes(key)) continue;

          job.message = `Fetching characters from ${title.name}…`;
          await this.persist(job, signal);

          try {
            let cast;
            if (job.demo) {
              await sleep(this.demoDelay, undefined, { signal });
              cast = demoCast(title);
            } else {
              cast = await this.store.cast(key);
              if (cast === null) {
                cast = await this.providers.cast(title, signal);
                await this.store.saveCast(key, cast);
              }
            }

            signal.throwIfAborted();
            mergeCast(job.pool, title, cast);
            job.done.push(key);
            delete job.failures[key];
          } catch (error) {
            signal.throwIfAborted();
            job.failures[key] =
              error instanceof Error ? error.message : 'Could not fetch this cast.';
          }

          await this.persist(job, signal);
        }

        job.state = Object.keys(job.failures).length ? 'partial' : 'complete';
        job.message =
          job.state === 'partial'
            ? 'Some titles could not be fetched. You can roll now or retry them.'
            : job.titles.length
              ? 'Your character pool is ready.'
              : 'No entries matched this import.';

        await this.persist(job, signal);
      } catch (error) {
        if (signal.aborted) continue;
        job.state = 'error';
        job.message = error instanceof Error ? error.message : 'Import failed.';
        await this.persist(job, signal).catch((err) => {
          if (!signal.aborted) throw err;
        });
      } finally {
        this.controllers.delete(id);
      }
    }
  }
}
