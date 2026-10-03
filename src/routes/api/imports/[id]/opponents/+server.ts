import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params }) => {
  try { return json({ teams: await engine.journeyOpponents(params.id) }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not find opponents.' }, { status: 400 }); }
};
