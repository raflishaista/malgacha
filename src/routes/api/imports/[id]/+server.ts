import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import { view } from '$lib/server/engine';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  await engine.init();
  const job = await engine.store.getJob(params.id);
  if (!job) {
    return json({ error: 'Import not found.' }, { status: 404 });
  }

  return json(view(job));
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const updated =
      body?.action === 'cancel'
        ? await engine.cancel(params.id)
        : await engine.retry(params.id);

    return json(view(updated));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Action failed.' },
      { status: 400 }
    );
  }
};
