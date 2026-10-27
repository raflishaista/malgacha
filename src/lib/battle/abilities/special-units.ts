import {distributeStats,STAT_KEYS} from '../../stats';
import type {JourneyCharacter} from '../../types';
export const SPECIAL_UNITS = {
  pikachu:{id:3891,name:'Pikachu',image:'https://cdn.myanimelist.net/images/characters/10/289627.webp',bst:620},
  mahad:{id:142840,name:'Mahad',image:'https://cdn.myanimelist.net/images/characters/2/313935.webp',bst:540},
  slifer:{id:-3100,name:'Slifer the Sky Dragon',image:'/images/units/slifer.png',bst:650},
  faye:{id:2,name:'Valentine, Faye',image:'https://cdn.myanimelist.net/images/characters/15/264961.webp',bst:620},
  jet:{id:3,name:'Black, Jet',image:'https://cdn.myanimelist.net/images/characters/11/253723.webp',bst:620},
  ein:{id:4,name:'Ein',image:'https://cdn.myanimelist.net/images/characters/5/30624.webp',bst:620},
  edward:{id:16,name:'Wong Hau Pepelu Tivrusky IV, Edward',image:'https://cdn.myanimelist.net/images/characters/16/30533.webp',bst:620}
} as const;
export type SummonKind='clone'|keyof typeof SPECIAL_UNITS;
export function specialUnit(kind:Exclude<SummonKind,'clone'>,instanceId:string,random:()=>number):JourneyCharacter {
 const definition=SPECIAL_UNITS[kind], values=distributeStats({bst:definition.bst,min:75,max:240},4,random);
 return {...definition,url:definition.id>0?'https://myanimelist.net/character/'+definition.id:'',titles:[],instanceId,statRarity:'UR',rarityOverride:'UR',baseStats:Object.fromEntries(STAT_KEYS.map((key,i)=>[key,values[i]])) as JourneyCharacter['baseStats']};
}
