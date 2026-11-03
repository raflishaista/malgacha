import { env } from '$env/dynamic/private';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from './store';
import { Engine } from './engine';
import { createProviders } from './providers';

const dataDir = process.env.DATA_DIR || (process.env.VERCEL ? resolve(tmpdir(), 'malgacha-data') : resolve('.data'));

// Keep a single worker across development hot reloads as well.
const shared = globalThis as typeof globalThis & { characterRollEngine?: Engine };
export const engine = shared.characterRollEngine ??= new Engine(
  new Store(dataDir),
  createProviders(() => env.MAL_CLIENT_ID)
);

