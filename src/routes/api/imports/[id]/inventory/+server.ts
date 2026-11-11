import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

const VALID_ACTIONS = [
  'claim',
  'equip',
  'use',
  'catch',
  'replace-catch',
  'place-wildcard',
  'wish',
  'dismiss-fusion'
] as const;

export const GET: RequestHandler = async ({ params }) => {
  try {
    const view = await engine.journeyInventory(params.id);
    return json(view);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Inventory unavailable.' },
      { status: 400 }
    );
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();

    if (!VALID_ACTIONS.includes(body.action)) {
      throw new Error('Invalid item action.');
    }

    const stringKeys = ['item', 'target', 'reward'];
    const hasInvalidString = stringKeys.some(
      (key) => body[key] !== undefined && typeof body[key] !== 'string'
    );

    const intKeys = ['ability', 'character'];
    const hasInvalidInt = intKeys.some(
      (key) => body[key] !== undefined && !Number.isInteger(body[key])
    );

    if (hasInvalidString || hasInvalidInt) {
      throw new Error('Invalid item action parameters.');
    }

    const updated = await engine.journeyInventory(params.id, body);
    return json(updated);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Item action failed.' },
      { status: 400 }
    );
  }
};
