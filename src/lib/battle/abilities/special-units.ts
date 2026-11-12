import {distributeStats,STAT_KEYS} from '../../stats';
import type {JourneyCharacter} from '../../types';
export const SPECIAL_UNITS = {
  pikachu:{id:3891,name:'Pikachu',image:'https://cdn.myanimelist.net/images/characters/10/289627.webp',bst:620},
  mahado:{id:26722,name:'Mahado',image:'https://cdn.myanimelist.net/images/characters/15/120937.webp',bst:540},
  mahad:{id:26722,name:'Mahado',image:'https://cdn.myanimelist.net/images/characters/15/120937.webp',bst:540},
  slifer:{id:-3100,name:'Slifer the Sky Dragon',image:'/images/units/slifer.png',bst:650},
  faye:{id:2,name:'Valentine, Faye',image:'https://cdn.myanimelist.net/images/characters/15/264961.webp',bst:620},
  jet:{id:3,name:'Black, Jet',image:'https://cdn.myanimelist.net/images/characters/11/253723.webp',bst:620},
  ein:{id:4,name:'Ein',image:'https://cdn.myanimelist.net/images/characters/5/30624.webp',bst:620},
  edward:{id:16,name:'Wong Hau Pepelu Tivrusky IV, Edward',image:'https://cdn.myanimelist.net/images/characters/16/30533.webp',bst:620},
  mahoraga:{id:240069,name:'Eight-Handled Sword Divergent Sila Divine General Mahoraga',image:'https://cdn.myanimelist.net/images/characters/8/625195.webp',bst:620},
  amuro:{id:1335,name:'Ray, Amuro',image:'https://cdn.myanimelist.net/images/characters/11/324745.jpg',bst:570},
  bright:{id:1337,name:'Noa, Bright',image:'https://cdn.myanimelist.net/images/characters/16/306002.jpg',bst:545},
  hathaway:{id:40465,name:'Noa, Hathaway',image:'https://cdn.myanimelist.net/images/characters/12/403871.jpg',bst:545},
  char:{id:1336,name:'Aznable, Char',image:'https://cdn.myanimelist.net/images/characters/6/565387.jpg',bst:570},
  quess:{id:16883,name:'Paraya, Quess',image:'https://cdn.myanimelist.net/images/characters/13/291066.jpg',bst:545},
  gyunei:{id:40993,name:'Guss, Gyunei',image:'https://cdn.myanimelist.net/images/characters/7/571629.jpg',bst:545}
} as const;
export type SummonKind='clone'|keyof typeof SPECIAL_UNITS;
export function specialUnit(kind:Exclude<SummonKind,'clone'>,instanceId:string,random:()=>number):JourneyCharacter {
 const definition=SPECIAL_UNITS[kind], values=distributeStats({bst:definition.bst,min:75,max:240},4,random);
 return {...definition,url:definition.id>0?'https://myanimelist.net/character/'+definition.id:'',titles:[],instanceId,statRarity:'UR',rarityOverride:'UR',baseStats:Object.fromEntries(STAT_KEYS.map((key,i)=>[key,values[i]])) as JourneyCharacter['baseStats']};
}
