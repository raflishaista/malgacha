import { building } from '$app/environment';
import { engine } from '$lib/server/runtime';
import type { Handle } from '@sveltejs/kit';

if (!building) void engine.init().catch((error) => console.error('Cannot resume imports:', error));

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    if (event.request.method === 'POST' && event.request.headers.get('origin') !== event.url.origin) {
      return new Response('Same-origin requests only.', { status: 403 });
    }
    const response = await resolve(event);
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  return resolve(event);
};
