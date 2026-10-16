import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params, url }) => {
  try { return json({ characters: await engine.journeySearch(params.id, url.searchParams.get('q') ?? '') }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Search unavailable.' }, {status: 400}); }
};
