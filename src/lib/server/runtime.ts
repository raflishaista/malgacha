import { env } from '$env/dynamic/private';
import { resolve } from 'node:path';
import { Store } from './store';
import { Engine } from './engine';
import { createProviders } from './providers';

// Keep a single worker across development hot reloads as well.
const shared = globalThis as typeof globalThis & { characterRollEngine?: Engine };
export const engine = shared.characterRollEngine ??= new Engine(
  new Store(resolve('.data')),
  createProviders(() => env.MAL_CLIENT_ID)
);
