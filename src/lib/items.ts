import definitions from './data/items.json';
export type ItemCategory = 'relic' | 'equipment' | 'consumable';
export type ItemDefinition = { name: string; category: ItemCategory; unique: boolean; description: string };
export const ITEMS = definitions as { [Id in keyof typeof definitions]: ItemDefinition };
export type ItemId = keyof typeof ITEMS;
export type ItemInstance = { instanceId: string; itemId: ItemId };
export { emptyBoosts, equipmentBonuses } from './battle/equipment';
export function rewardChoices(inventory: ItemInstance[], random = Math.random): ItemId[] {
  const choices = (Object.keys(ITEMS) as ItemId[]).filter(id => !ITEMS[id].unique || !inventory.some(item => item.itemId === id));
  for (let i = 0; i < 3; i++) { const j = i + Math.floor(random() * (choices.length - i)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  return choices.slice(0, 3);
}
