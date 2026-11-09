import { expect, it } from 'vitest';
import { allowedOrigin } from './origin';

it('accepts the configured public origin behind an HTTP proxy', () => {
  expect(allowedOrigin('https://app.up.railway.app', 'http://internal:3000', { ORIGIN: 'https://app.up.railway.app/' })).toBe(true);
  expect(allowedOrigin('https://app.up.railway.app', 'http://internal:3000', { RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app' })).toBe(true);
  expect(allowedOrigin('https://malgacha.onrender.com', 'http://internal:10000', { RENDER_EXTERNAL_URL: 'https://malgacha.onrender.com' })).toBe(true);
  expect(allowedOrigin('https://malgacha.fly.dev', 'http://internal:8080', { FLY_APP_NAME: 'malgacha' })).toBe(true);
});
it('rejects foreign and missing origins and respects explicit configuration', () => {
  expect(allowedOrigin('https://evil.example', 'http://internal:3000', { RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app' })).toBe(false);
  expect(allowedOrigin(null, 'http://localhost:5173', {})).toBe(false);
  expect(allowedOrigin('https://app.up.railway.app', 'http://internal:3000', { ORIGIN: 'https://custom.example', RAILWAY_PUBLIC_DOMAIN: 'app.up.railway.app' })).toBe(false);
  expect(allowedOrigin('http://localhost:5173', 'http://localhost:5173', {})).toBe(true);
});
