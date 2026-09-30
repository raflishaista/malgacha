import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import { view } from '$lib/server/engine';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    if (typeof body.username !== 'string' || typeof body.includePlanned !== 'boolean' || typeof body.demo !== 'boolean') return json({ error: 'Invalid import settings.' }, { status: 400 });
    return json(view(await engine.create(body.username, body.includePlanned, body.demo)), { status: 202 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not create import.' }, { status: 400 }); }
};
