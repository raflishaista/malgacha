import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const query = url.searchParams.get('q') ?? '';
    const characters = await engine.journeySearch(params.id, query);
    return json({ characters });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Search unavailable.' },
      { status: 400 }
    );
  }
};
