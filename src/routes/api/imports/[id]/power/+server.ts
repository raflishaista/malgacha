import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import { getPower } from '$lib/server/powers';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const { characterId } = await request.json();
    if (!Number.isSafeInteger(characterId) || characterId < 1) return json({ error: 'Invalid character.' }, { status: 400 });
    const job = await engine.store.getJob(params.id);
    const character = job?.pool[characterId];
    if (!character) return json({ error: 'Character not found in this import.' }, { status: 404 });
    return json(await getPower(character));
  } catch { return json({ error: 'Could not check the tier. Please try another roll.' }, { status: 503 }); }
};
