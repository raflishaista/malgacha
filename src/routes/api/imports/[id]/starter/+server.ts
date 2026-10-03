import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params, request }) => {
 try {
   const body = await request.json();
   if (body.reroll !== undefined && typeof body.reroll !== 'boolean') return json({ error: 'Invalid reroll setting.' }, { status: 400 });
   return json({ characters: await engine.journeyTeam(params.id, body.reroll === true) });
 }
 catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not roll team.' }, { status: 400 }); }
};
