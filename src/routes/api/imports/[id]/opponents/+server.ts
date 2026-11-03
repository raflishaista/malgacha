import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const opponents = await engine.journeyOpponents(params.id);
    return json(opponents);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Could not find opponents.' },
      { status: 400 }
    );
  }
};
