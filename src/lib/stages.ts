import definitions from './data/stages.json';
export const STAGES = definitions.stages;
export type StageId = keyof typeof STAGES;
export const STAGE_RULES = definitions.rules;
export function rollStage(random = Math.random): StageId {
  const effect = random() < STAGE_RULES.effectChance;
  const choices = (Object.keys(STAGES) as StageId[]).filter(id => STAGES[id].effect === effect);
  return choices[Math.floor(random() * choices.length)];
}
