import { ITEMS } from './items';
import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import JourneyInventory from './components/JourneyInventory.svelte';
import JourneyCharacter from './components/JourneyCharacter.svelte';
import ItemReward from './components/ItemReward.svelte';
import JourneyWish from './components/JourneyWish.svelte';
import { newUnit } from './server/inventory';
import { fuseUnits } from './server/item-effects';
const unit = (id: number) => newUnit({id,name:String(id),image:`/${id}.webp`,url:'',favorites:0,titles:[]},()=>.5);
it('reward cards display rarity, names and descriptions', () => {
  const html=render(ItemReward,{props:{choices:['pokeball','dragonball','machine'],busy:false,onchoose(){}}}).body;
  expect(html).toContain('Poké Ball');expect(html).toContain('SSR');expect(html).toContain('UR');expect(html).toContain('Catch rates');
});
it('stacked relics have one icon with a count and show reroll power', () => {
  const html=render(JourneyInventory,{props:{inventory:[{instanceId:'a',itemId:'coin'},{instanceId:'b',itemId:'coin'}],team:[unit(1)],disabled:false,onaction:async()=>true}}).body;
  expect((html.split('aria-label="'+ITEMS.coin.name+'"').slice(1))).toHaveLength(2); // One inventory button and its SVG.
  expect(html).toMatch(/class="count[^"]*"[^>]*>2</);expect(html).toContain('>100 favorites');
});
it('fused portraits retain both images and equipment dodge appears below BST', () => {
  const fused=fuseUnits(unit(1),unit(2));fused.equipment=[{instanceId:'swordfish',itemId:'swordfish'}];
  const html=render(JourneyCharacter,{props:{character:fused}}).body;
  expect(html).toContain('/1.webp');expect(html).toContain('/2.webp');expect(html).toContain('FUSED UNIT');expect(html).toContain('Dodge +10%');
});
it('wish view uses Shen Long, the ally choice and three disabled WIP options', () => {
  const html=render(JourneyWish,{props:{jobId:'test',team:[unit(1)],disabled:false,onaction:async()=>true,oncancel(){}}}).body;
  expect(html).toContain('STATE YOUR WISH');expect(html).toContain('65049.webp');expect(html.match(/>WIP</g)).toHaveLength(3);expect(html).toContain('Give me an ally of my choosing!');
});
