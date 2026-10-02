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

const aliases: Record<string, string> = { 'machi komachine': 'machi komacine' };
export function searchName(name: string) { return name.includes(',') ? name.split(',').reverse().join(' ').trim() : name; }
function distance(a: string, b: string) {
 let row = Array.from({ length: b.length + 1 }, (_, i) => i);
 for (let i = 1; i <= a.length; i++) {
  const next = [i];
  for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1]+1, row[j]+1, row[j-1]+Number(a[i-1] !== b[j-1]));
  row = next;
 }
 return row[b.length];
}
export function nameMatches(name: string, title: string) {
 const target = normalized(title.replace(/\s*\([^)]*\)\s*$/, ''));
 return [name, searchName(name)].map(normalized).some((variant) => {
  if (variant === target || aliases[variant] === target) return true;
  if (variant.length < 8 || target.length < 8) return false;
  const a = variant.split(' '), b = target.split(' ');
  if (a.length !== b.length) return false;
  const limit = Math.min(2, Math.floor(Math.min(variant.length, target.length) / 8));
  return distance(variant, target) <= limit && a.every((token, i) => token.length < 4 ? token === b[i] : distance(token, b[i]) <= 1);
 });
}
const franchises = [
 ['kimetsu no yaiba', 'demon slayer'], ['hunter x hunter', 'hunter hunter'],
 ['dragon ball', 'dragon ball z', 'dragon ball super', 'dragon ball gt'],
 ['shingeki no kyojin', 'attack on titan'], ['boku no hero academia', 'my hero academia']
];
function containsPhrase(text: string, phrase: string) { return (' ' + text + ' ').includes(' ' + phrase + ' '); }
export function franchiseNames(name: string) {
 const text = normalized(name);
 const group = franchises.find((names) => names.some((n) => containsPhrase(text, n)));
 return group ? [...new Set([text, ...group])] : [text];
}
export function originMatches(character: PoolCharacter, wiki: string) {
 const origin = normalized(field(wiki, 'Origin'));
 if (!origin) return false;
 return character.titles.some((title) => franchiseNames(title.name).some((name) =>
  name.length >= 4 && (containsPhrase(origin, name) || (origin.length >= 4 && containsPhrase(name, origin)))));
}
export function fallbackQueries(character: PoolCharacter) {
 const name = searchName(character.name);
 const series = [...new Set(character.titles.flatMap((t) => franchiseNames(t.name)))];
 const distinctive = name.split(/\s+/).find((token) => token.length >= 4) || name;
 return [...new Set(series.slice(0, 2).map((s, i) => (i === 0 ? name : distinctive) + ' ' + s))];
}
