import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    if (!Number.isInteger(body.index) || body.index < 0 || body.index > 2 || body.choice !== undefined && !['yes', 'no'].includes(body.choice) || body.target !== undefined && typeof body.target !== 'string') throw new Error('Invalid event choice.');
    return json(await engine.journeyEvent(params.id, body));
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Event failed.' }, { status: 400 }); }
};
