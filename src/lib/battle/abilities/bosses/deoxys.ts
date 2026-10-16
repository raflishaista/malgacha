import { BOSS_ABILITY_RULES, DEOXYS_FORMES } from '../../../bosses';
import type { JourneyCharacter } from '../../../types';
import type { AbilityDefinition } from '../types';
export const deoxys: AbilityDefinition = {
  id: 74017, cooldown: BOSS_ABILITY_RULES.formeSeconds,
  onTimed(context, owner) {
    const forms = (Object.keys(DEOXYS_FORMES) as NonNullable<JourneyCharacter['bossForm']>[]).filter(form => form !== (context.units[owner].bossForm ?? 'normal'));
    context.changeForm(owner, forms[Math.floor(context.random() * forms.length)]);
    return { nextDelay: BOSS_ABILITY_RULES.formeSeconds };
  }
};
