import type { Character, Title } from '../types';

export const demoTitles: Title[] = [
  { id: 1, kind: 'anime', name: 'Cowboy Bebop', status: 'completed' },
  { id: 21, kind: 'anime', name: 'One Piece', status: 'watching' },
  { id: 13, kind: 'manga', name: 'One Piece', status: 'reading' }
];
const character = (id: number, name: string): Character => ({ id, name, image: null, url: `https://myanimelist.net/character/${id}` });
const bebop = [character(1, 'Spiegel, Spike'), character(2, 'Valentine, Faye'), character(3, 'Black, Jet'), character(16, 'Wong Hau Pepelu Tivrusky IV, Edward'), character(4, 'Ein')];
const pirates = [character(40, 'Monkey D. Luffy'), character(62, 'Roronoa Zoro'), character(723, 'Nami'), character(305, 'Sanji'), character(724, 'Usopp')];
export const demoCast = (title: Title) => title.id === 1 && title.kind === 'anime' ? bebop : pirates;
