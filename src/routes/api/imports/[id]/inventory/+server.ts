import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ params }) => {
  try { return json(await engine.journeyInventory(params.id)); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Inventory unavailable.' }, { status: 400 }); }
};
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    if (!['claim', 'equip', 'use'].includes(body.action) || ['item', 'target', 'reward'].some(k => body[k] !== undefined && typeof body[k] !== 'string')) throw new Error('Invalid item action.');
    return json(await engine.journeyInventory(params.id, body));
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Item action failed.' }, { status: 400 }); }
};
