import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import { view } from '$lib/server/engine';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  await engine.init();
  const job = await engine.store.getJob(params.id);
  return job ? json(view(job)) : json({ error: 'Import not found.' }, { status: 404 });
};
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    return json(view(await (body?.action === 'cancel' ? engine.cancel(params.id) : engine.retry(params.id))));
  }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Retry failed.' }, { status: 400 }); }
};
