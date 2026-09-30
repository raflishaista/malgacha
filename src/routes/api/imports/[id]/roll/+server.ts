import { json } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { engine } from '$lib/server/runtime';
import { sample, popularityPool } from '$lib/pool';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const job = await engine.store.getJob(params.id);
    if (!job) return json({ error: 'Import not found.' }, { status: 404 });
    const { count, minFavorites = null } = await request.json();
    const pool = popularityPool(Object.values(job.pool), minFavorites);
    return json({ characters: sample(pool, count, () => randomInt(0, 2 ** 32) / 2 ** 32, minFavorites !== null), partial: job.state !== 'complete', poolSize: pool.length });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not roll.' }, { status: 400 }); }
};
