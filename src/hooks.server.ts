import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { allowedOrigin } from '$lib/server/origin';
import { engine } from '$lib/server/runtime';
import type { Handle } from '@sveltejs/kit';

if (!building) void engine.init().catch((error) => console.error('Cannot resume imports:', error));

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const originConfig = dev ? {} : { ORIGIN: env.ORIGIN, RAILWAY_PUBLIC_DOMAIN: env.RAILWAY_PUBLIC_DOMAIN };
    if (event.request.method === 'POST' && !allowedOrigin(event.request.headers.get('origin'), event.url.origin, originConfig)) {
      return json({ error: 'Request origin does not match the server configuration. Set ORIGIN to the exact public website URL (including https://) and redeploy.' }, { status: 403, headers: { 'cache-control': 'no-store' } });
    }
    const response = await resolve(event);
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  return resolve(event);
};
