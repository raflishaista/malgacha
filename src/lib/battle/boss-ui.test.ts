import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import AutoBattle from '../components/AutoBattle.svelte';
import BossAbility from '../components/BossAbility.svelte';
import { simulateBattle } from './engine';
import { unitAtFrame } from './presentation';
import { BOSSES, SAHAQUIEL_ID } from '../bosses';
import type { JourneyCharacter } from '../types';
const unit = (id: number, boss = false): JourneyCharacter => ({ id, name: BOSSES.find(b => b.id === id)?.name ?? 'Player', image: null, url: '', titles: [], boss, instanceId: String(id), statRarity: 'N', baseStats: { hp: 10000, attack: 125, defense: 125, speed: 125 } });
const team = () => Array.from({ length: 5 }, (_, i) => unit(900000 + i));

it('renders the absolute Sahaquiel countdown without an attack gauge', () => {
  const replay = simulateBattle(team(), [unit(SAHAQUIEL_ID, true)], () => 0);
  const html = render(AutoBattle, { props: { replay, onfinish() {} } }).body;
  expect(html).toContain('10th Angel countdown'); expect(html).toContain('20.0s');
  expect(html).not.toContain('aria-label="Sahaquiel ATB"');
});
it('renders Deoxys forme text below its boss ability', () => {
  const replay = simulateBattle(team(), [unit(74017, true)], () => 0);
  const frame = replay.frames!.find(frame => frame.time === 3 && frame.unitOverrides?.[5]?.bossForm === 'attack')!;
  const html = render(BossAbility, { props: { unit: unitAtFrame(replay, frame, 5) } }).body;
  expect(html).toContain('Attack Forme');
  expect(html.indexOf('Form Change')).toBeLessThan(html.indexOf('Attack Forme'));
});
it('does not show a future lure portrait before its spawn frame', () => {
  const replay = simulateBattle(team(), [unit(7345, true)], () => 0);
  expect(replay.units.some(unit => unit.name === 'LURE')).toBe(true);
  const html = render(AutoBattle, { props: { replay, onfinish() {} } }).body;
  expect(html).not.toContain('alt="LURE"');
});
