import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ params }) => {
  try { return json(await engine.journeyReset(params.id)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Reset failed.' }, { status: 400 }); }
};
