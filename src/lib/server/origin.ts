/** Use a configured public origin behind proxies, never the incoming Origin as authority. */
export function allowedOrigin(requestOrigin: string | null, internalOrigin: string, config: { ORIGIN?: string; RAILWAY_PUBLIC_DOMAIN?: string; RENDER_EXTERNAL_URL?: string; FLY_APP_NAME?: string }): boolean {
  const configured = config.ORIGIN || config.RENDER_EXTERNAL_URL || (config.RAILWAY_PUBLIC_DOMAIN ? `https://${config.RAILWAY_PUBLIC_DOMAIN}` : config.FLY_APP_NAME ? `https://${config.FLY_APP_NAME}.fly.dev` : internalOrigin);
  try { return requestOrigin !== null && requestOrigin === new URL(configured).origin; }
  catch { return false; }
}
