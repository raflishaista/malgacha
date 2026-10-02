import { tiers } from '../power';
import type { PoolCharacter } from '../types';

export function plain(text: string) {
  return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, '').replace(/<[^>]+>/g, '')
    .replace(/[{}']/g, '').replace(/&nbsp;/g, ' ').trim();
}
export function field(wiki: string, name: string) {
  return wiki.split('\n').map(plain).find((line) => line.startsWith(name + ':'))?.slice(name.length + 1).trim() ?? '';
}
export function parseTier(wiki: string) {
  const raw = field(wiki, 'Tier');
  const found: string[] = raw.match(/(?:High |Low )?(?:1[01]|[1-9])-[ABC]\+?|\b0\b/g) ?? [];
  // Preserve qualifiers in the source text; use only known explicit tier labels.
  const tier = tiers.filter((t) => found.includes(t)).at(-1) ?? null;
  return { tier, raw: raw.slice(0, 1000), key: field(wiki, 'Key').slice(0, 1000) };
}
export function normalized(text: string) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function nameMatches(name: string, title: string) {
  const variants = [name, name.split(',').reverse().join(' ')].map(normalized);
  return variants.includes(normalized(title.replace(/\s*\([^)]*\)\s*$/, '')));
}
export function originMatches(character: PoolCharacter, wiki: string) {
  const origin = normalized(field(wiki, 'Origin'));
  if (!origin) return false;
  return character.titles.some((title) => {
    const name = normalized(title.name);
    return name.length >= 4 && (origin.includes(name) || (origin.length >= 4 && name.includes(origin)));
  });
}
