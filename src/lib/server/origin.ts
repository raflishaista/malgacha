/** Use a configured public origin behind proxies, never the incoming Origin as authority. */
export function allowedOrigin(requestOrigin: string | null, internalOrigin: string, config: { ORIGIN?: string; RAILWAY_PUBLIC_DOMAIN?: string }): boolean {
  const configured = config.ORIGIN || (config.RAILWAY_PUBLIC_DOMAIN ? `https://${config.RAILWAY_PUBLIC_DOMAIN}` : internalOrigin);
  try { return requestOrigin !== null && requestOrigin === new URL(configured).origin; }
  catch { return false; }
}
