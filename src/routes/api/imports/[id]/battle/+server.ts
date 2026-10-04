import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    if (body.replace !== undefined && typeof body.replace !== 'string') throw new Error('Invalid team member.');
    if (body.mode !== undefined && !['idle', 'clout'].includes(body.mode)) throw new Error('Invalid battle mode.');
    return json(await engine.journeyBattle(params.id, body.opponent, body.replace, body.mode));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Battle failed.' }, { status: 400 }); }
};
