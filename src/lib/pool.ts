import { titleKey, type Character, type PoolCharacter, type Title } from './types';

export function mergeCast(pool: Record<string, PoolCharacter>, title: Title, cast: Character[]) {
  for (const character of cast) {
    const existing = pool[character.id];
    if (!existing) pool[character.id] = { ...character, titles: [title] };
    else {
      if (!existing.image && character.image) existing.image = character.image;
      if (!existing.titles.some((item) => titleKey(item) === titleKey(title))) existing.titles.push(title);
    }
  }
}

/** Partial Fisher-Yates: every unique character has equal probability. */
export function sample<T>(items: T[], count: number, random = Math.random): T[] {
  if (!Number.isInteger(count) || count < 5 || count > 10) throw new Error('Choose 5–10 characters.');
  if (items.length < count) throw new Error(`Wait until at least ${count} unique characters are ready.`);
  const copy = [...items];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
