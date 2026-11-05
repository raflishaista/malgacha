import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import { view } from '$lib/server/engine';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  await engine.init();
  const job = await engine.store.getJob(params.id);
  if (!job) {
    return json({ error: 'Import not found.' }, { status: 404 });
  }

  if (url.searchParams.get('full') === 'true') {
    return json(job);
  }

  return json(view(job));
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    if (!body?.job || body.job.id !== params.id) {
      return json({ error: 'Invalid job payload.' }, { status: 400 });
    }
    await engine.init();
    await engine.store.saveJob(body.job);
    return json({ ok: true, job: view(body.job) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Sync failed.' },
      { status: 400 }
    );
  }
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
