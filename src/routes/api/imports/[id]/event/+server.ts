import { json } from '@sveltejs/kit';
import { engine } from '$lib/server/runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();

    const isIndexValid = Number.isInteger(body.index) && body.index >= 0 && body.index <= 2;
    const isChoiceValid = body.choice === undefined || ['yes', 'no'].includes(body.choice);
    const isTargetValid = body.target === undefined || typeof body.target === 'string';
    const isJankenValid =
      body.janken === undefined || ['rock', 'paper', 'scissors', 'timeout'].includes(body.janken);
    const isButlerValid =
      body.butler === undefined ||
      ['Left Butler', 'Gotoh', 'Right Butler', 'Behind Butler', 'timeout'].includes(body.butler);
    const isCardValid =
      body.cardIndex === undefined ||
      body.cardIndex === 'timeout' ||
      (Number.isInteger(body.cardIndex) && body.cardIndex >= 0);
    const isAnswerValid =
      body.answer === undefined ||
      body.answer === 'timeout' ||
      (Number.isInteger(body.answer) && body.answer >= 0 && body.answer <= 3);

    if (
      !isIndexValid ||
      !isChoiceValid ||
      !isTargetValid ||
      !isJankenValid ||
      !isButlerValid ||
      !isCardValid ||
      !isAnswerValid
    ) {
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
