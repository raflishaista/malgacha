import { expect, it } from 'vitest';
import { simulateBattle } from './engine';
import { attackInterval, attackDamage } from './formulas';
import type { JourneyCharacter } from '../types';

function createTeam(side: number): JourneyCharacter[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: 900000 + side * 5 + i,
    name: `Unit ${side * 5 + i}`,
    instanceId: String(side * 5 + i),
    image: null,
    url: '',
    titles: [],
    statRarity: 'N' as const,
    baseStats: { hp: 500, attack: 100, defense: 100, speed: 100 }
  }));
}

it('Megumi channels for 5s at half HP or below and summons Mahoraga with 620 BST', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 164470; // Megumi
  left[0].baseStats.hp = 100; // maxHP = 400, threshold = 200
  left[0].baseStats.defense = 100;
  for (let i = 0; i < 5; i++) {
    left[i].baseStats.speed = 10;
  }
  // Right team unit 0 hits for 25 damage every 3.6s
  right[0].baseStats.attack = 100;
  right[0].baseStats.speed = 125;
  for (let i = 1; i < 5; i++) {
    right[i].baseStats.speed = 10;
    right[i].baseStats.attack = 10;
  }

  left[0].keywords = ['TAUNT'];
  const battle = simulateBattle(left, right, () => 0.5);
  const channelEvent = battle.events.find(e => e.kind === 'buff' && e.ability === 'With this treasure I summon...');
  expect(channelEvent).toBeDefined();

  const summonEvent = battle.events.find(e => e.kind === 'summon' && e.ability === 'With this treasure I summon...');
  expect(summonEvent).toBeDefined();
  expect(summonEvent!.time - channelEvent!.time).toBeCloseTo(5, 0.1);

  // Verify Mahoraga summoned with 620 BST
  const mahoraga = battle.units.find(u => u.name.includes('Mahoraga'));
  expect(mahoraga).toBeDefined();
  const totalStats = Object.values(mahoraga!.baseStats).reduce((a, b) => a + b, 0);
  expect(totalStats).toBe(620);
});

it('Gon Jajanken switches between Rock (2x dmg), Scissors (2 targets), and Paper (50% def ignore)', () => {
  // Test Rock: random returns 0.1 (< 1/3)
  {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = 30; // Gon
    const battle = simulateBattle(left, right, () => 0.1);
    const rockAttack = battle.events.find(e => e.ability === 'Jajanken: Rock');
    expect(rockAttack).toBeDefined();
    // 2x attack power
    const normalDmg = attackDamage(100, 100);
    expect(rockAttack!.damage).toBeCloseTo(normalDmg * 2, 0.1);
  }

  // Test Scissors: random returns 0.45 (1/3 to 2/3)
  {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = 30; // Gon
    const battle = simulateBattle(left, right, () => 0.45);
    const scissorsAttacks = battle.events.filter(e => e.ability === 'Jajanken: Scissors');
    expect(scissorsAttacks.length).toBeGreaterThan(0);
    // At least 2 attacks in rapid succession / hitting multiple targets
    const firstTime = scissorsAttacks[0].time;
    const simultaneousHits = battle.events.filter(e => e.attacker === 0 && Math.abs(e.time - firstTime) < 1e-6);
    expect(simultaneousHits.length).toBe(2);
  }

  // Test Paper: random returns 0.8 (> 2/3)
  {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = 30; // Gon
    const battle = simulateBattle(left, right, () => 0.8);
    const paperAttack = battle.events.find(e => e.ability === 'Jajanken: Paper');
    expect(paperAttack).toBeDefined();
    // Paper ignores 50% defense (target def 100 -> effective def 50)
    const expectedDmg = attackDamage(100, 50);
    expect(paperAttack!.damage).toBeCloseTo(expectedDmg, 0.1);
  }
});

it('Killua enters Godspeed periodically, gaining doubled speed and reflecting damage', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 27; // Killua
  const battle = simulateBattle(left, right, () => 0.5);

  // Check Godspeed activation at 8 seconds
  const godspeedBuff = battle.events.find(e => e.ability === 'Godspeed');
  expect(godspeedBuff).toBeDefined();

  // Frame during Godspeed should have doubled speed (100 * 2 = 200)
  const godspeedFrame = battle.frames!.find(f => f.time >= 8 && f.time < 12);
  expect(godspeedFrame).toBeDefined();
  expect(godspeedFrame!.speed[0]).toBe(200);
});

it('Toji & Maki Heavenly Restriction negates keywords, grants +10% stats per keyword, and ignores burn', () => {
  for (const id of [175543, 164482]) {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = id;
    left[0].keywords = ['TAUNT', 'LIFESTEAL'];
    right[0].id = 171437; // Gabimaru (applies burn on hit)

    const battle = simulateBattle(left, right, () => 0.5);

    // Initial keywords should be cleared / negated
    expect(battle.frames![0].speed[0]).toBe(120);

    // Should never receive Burn status from Gabimaru
    const burnTicks = battle.events.filter(e => e.kind === 'burn' && e.target === 0);
    expect(burnTicks).toHaveLength(0);
  }
});

it('Char Aznable Red Comet has fixed 3x speed and cannot gain speed from auras or buffs', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 1336; // Char
  left[1].id = 434;  // Onizuka (Driver's High: +10% aura to allies)

  const battle = simulateBattle(left, right, () => 0.5);

  // Char base speed is 100 -> fixed at 300 (not 330 from Onizuka's 10% aura)
  expect(battle.frames![0].speed[0]).toBe(300);

  // Onizuka's aura still buffs HP, ATK, DEF
  expect(battle.frames![0].hp[0]).toBe(550); // 500 * 1.1
});

it('Mikasa Thunder Spears latches BOMB which detonates after 5s dealing 2x damage to target and adjacent allies', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 40881; // Mikasa (slot 0)
  // Right team slots: 5 (pos 0), 6 (pos 1), 7 (pos 2), 8 (pos 3), 9 (pos 4)
  // Thunder Spears latches at 7s
  const battle = simulateBattle(left, right, () => 0.2);

  const bombEffect = battle.events.find(e => e.ability === 'Thunder Spears');
  expect(bombEffect).toBeDefined();

  // Detonation happens 5s after latch
  const bombExplosions = battle.events.filter(e => e.ability === 'Thunder Spear');
  expect(bombExplosions.length).toBeGreaterThan(0);

  // Verify damage is 2x attack damage
  const expectedDmg = 2 * attackDamage(100, 100);
  expect(bombExplosions[0].damage).toBeCloseTo(expectedDmg, 0.1);
});

it('Armin Colossal Titan explodes after 5s once per battle for 3x attack damage to all enemies', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 46494; // Armin

  const battle = simulateBattle(left, right, () => 0.5);
  const explosions = battle.events.filter(e => e.ability === 'Colossal Titan');
  expect(explosions.length).toBe(1);
  expect(explosions[0].time).toBeCloseTo(5, 0.1);

  // Hit all living enemies on the right side
  const expectedDmg = 3 * attackDamage(100, 100);
  expect(explosions[0].damage).toBeCloseTo(expectedDmg, 0.1);
});

it('Zoro Santoryu grants +66 to all stats when 3 items are equipped', () => {
  // With 3 items
  {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = 62; // Zoro
    left[0].equipment = [
      { itemId: 'nichirin', instanceId: 'eq1' },
      { itemId: 'nichirin', instanceId: 'eq2' },
      { itemId: 'nichirin', instanceId: 'eq3' }
    ];

    const battle = simulateBattle(left, right, () => 0.5);
    // Base 100 + 66 = 166 (speed)
    expect(battle.frames![0].speed[0]).toBe(166);
    // Base 500 + 66 = 566 (HP)
    expect(battle.frames![0].hp[0]).toBe(566);
  }

  // With fewer than 3 items
  {
    const left = createTeam(0);
    const right = createTeam(1);
    left[0].id = 62; // Zoro
    left[0].equipment = [
      { itemId: 'nichirin', instanceId: 'eq1' }
    ];

    const battle = simulateBattle(left, right, () => 0.5);
    expect(battle.frames![0].speed[0]).toBe(100);
    expect(battle.frames![0].hp[0]).toBe(500);
  }
});

it('Ace Dai Enkai: Entei periodically deals AoE damage and inflicts Burn', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 2072; // Ace

  const battle = simulateBattle(left, right, () => 0.5);
  const enteiAttack = battle.events.find(e => e.ability === 'Dai Enkai: Entei');
  expect(enteiAttack).toBeDefined();
  expect(enteiAttack!.time).toBeCloseTo(5, 0.1);

  // All right team units should have received Burn
  const burnEvents = battle.events.filter(e => e.kind === 'burn' && e.target >= 5);
  expect(burnEvents.length).toBeGreaterThan(0);
});

it('Sanji Diable Jambe periodically strikes a single target for 2x damage and inflicts Burn', () => {
  const left = createTeam(0);
  const right = createTeam(1);
  left[0].id = 305; // Sanji

  const battle = simulateBattle(left, right, () => 0.5);
  const diableAttack = battle.events.find(e => e.ability === 'Diable Jambe');
  expect(diableAttack).toBeDefined();
  expect(diableAttack!.time).toBeCloseTo(5, 0.1);

  // 2x attack damage against single target
  const expectedDmg = 2 * attackDamage(100, 100);
  expect(diableAttack!.damage).toBeCloseTo(expectedDmg, 0.1);

  // Target receives Burn
  const burnEvents = battle.events.filter(e => e.kind === 'burn' && e.target >= 5);
  expect(burnEvents.length).toBeGreaterThan(0);
});
