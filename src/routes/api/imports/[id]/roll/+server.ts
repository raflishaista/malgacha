import { json } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { engine } from '$lib/server/runtime';
import { sample, popularityPool, previewCast } from '$lib/pool';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const job = await engine.store.getJob(params.id);
    if (!job) return json({ error: 'Import not found.' }, { status: 404 });
    const { count, minFavorites = null } = await request.json();
    const pool = popularityPool(Object.values(job.pool), minFavorites);
    const random = () => randomInt(0, 2 ** 32) / 2 ** 32;
    const characters = sample(pool, count, random, minFavorites !== null);
    return json({ characters, previews: previewCast(pool, characters, random), partial: job.state !== 'complete', poolSize: pool.length });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not roll.' }, { status: 400 }); }
};
