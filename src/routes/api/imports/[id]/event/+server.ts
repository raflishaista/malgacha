import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();

    const isIndexValid = Number.isInteger(body.index) && body.index >= 0 && body.index <= 2;
    const isChoiceValid = body.choice === undefined || ['yes', 'no'].includes(body.choice);
    const isTargetValid = body.target === undefined || typeof body.target === 'string';

    if (!isIndexValid || !isChoiceValid || !isTargetValid) {
      throw new Error('Invalid event choice.');
    }

    const result = await engine.journeyEvent(params.id, body);
    return json(result);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Event failed.' },
      { status: 400 }
    );
  }
};
