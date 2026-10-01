import { env } from '$env/dynamic/private';
export const load = () => ({ configured: Boolean(env.MAL_CLIENT_ID) });
