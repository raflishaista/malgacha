import type { JourneyCharacter } from '../types';
import type { StageId } from '../stages';
export type BattleEvent = { time: number; attacker: number; target: number; damage: number; hp: number; kind?: 'heal' | 'world' | 'rumbling' | 'burn' | 'revive' | 'buff' | 'status' | 'shrine' | 'environment' | 'execute' | 'transform'; ability?: string; attackBonus?: number };
export type TimeStop = { start: number; end: number; owner: number; affected?: number[] };
export type BattleFrame = { witches?: boolean[]; time: number; hp: number[]; maxHP: number[]; speed: number[]; atb: number[]; rumbling: number[]; burnUntil: number[]; aura: boolean[]; shrine?: number[]; shrineUsed?: boolean[]; chillUntil?: number[]; sides?: number[]; positions?: number[]; participating?: boolean[]; intervals?: number[]; duelWins?: number[] };
export type BattleReplay = { stage?: StageId; frames?: BattleFrame[]; leftCount?: number; units: JourneyCharacter[]; events: BattleEvent[]; stops?: TimeStop[]; floor?: number; duration: number; winner: 'left' | 'right' | 'draw'; left: number; right: number };
