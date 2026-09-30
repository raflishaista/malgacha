![MALGacha first look](https://files.catbox.moe/hik7pl.png)

# MALGacha

Roll for your "literally who" squad from animanga

Other sites and other mediums (video games, movies, etc) might get added soon

## Run locally

Requires Node 20.17+ and npm. From this directory:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite. **Try a small demo** works without credentials or external API calls. Its sample characters have placeholder portraits; it is not a real import of the example profile.

For live imports, register your own application at https://myanimelist.net/apiconfig and put its client ID in `.env`:

```dotenv
MAL_CLIENT_ID=your_client_id
```

Restart the dev server, enter a public MAL profile URL, and prepare a pool. The client ID stays in server-only code. Do not commit `.env`. This version reads public lists only; OAuth/private lists are not implemented. Both anime and manga lists must be accessible.

## Implemented behavior

- Imports all pages of both official MAL lists; optional exclusion of planned entries. Dropped/on-hold entries remain included.
- Requests each anime/manga cast from Tenrai; basic card data does not need individual character requests.
- Tenrai's public API requires no extra key. MAL_CLIENT_ID is sent only to MAL. Existing cast caches and character pools remain compatible because Tenrai uses MAL character IDs. Public limits are 120 requests/minute, 4/second, and 40,000/day per IP; this worker keeps conservative 1.1-second pacing. Tenrai is in beta, so catalogue freshness and availability can vary.
- Deduplicates by MAL character ID as results arrive, retaining all title associations.
- Allows rolls once the selected count (5–10) is available. Every unique character has equal odds and appears at most once per draw. Repeats between draws are allowed.
- Labels early rolls, import failures, and demo data explicitly.
- Saves jobs and character pools to `.data/jobs/`; the browser remembers its last import ID.
- Saves successful casts, including empty casts, to `.data/casts/` with a 24-hour expiry for subsequent imports. Existing saved pools remain snapshots until you prepare a new import.
- Resumes queued/interrupted imports on server startup. Closing the browser does not stop the worker; stopping the Node process pauses it until restart.
- Retries transient upstream failures, respects Retry-After, and paces Tenrai calls at least 1.1 seconds apart across the worker. Failed casts remain retryable without losing successful work.
- Reuses an active matching import. After completion, preparing another import reads current lists again and uses fresh cast cache entries where possible. Characters from removed titles do not leak into the new pool.

## Structure

```text
src/lib/server/providers.ts    MAL/Tenrai clients, pagination, rate pacing, retries
src/lib/server/engine.ts       Background queue, progress, resume, cache reuse
src/lib/server/store.ts        Atomic JSON persistence (single process)
src/lib/pool.ts                Deduplication and uniform sampling
src/routes/api/imports/       Create/status/retry/roll endpoints
src/routes/+page.svelte        Minimal working product interface
```

API mutations require a same-origin Origin header. Import IDs are unguessable UUIDs and act as access links; there is no account system. Do not share an ID if you want its imported data to remain unlisted.

## Verify and build

```powershell
npm run check
npm test
npm run build
npm start
```

`npm start` loads `.env` and serves the adapter-node build on port 3000. Set `ORIGIN` to the actual production origin. Tests use temporary storage and fake providers; they do not scrape MAL or consume Tenrai quota.

## Deployment boundary and next steps

This is a **local development foundation**, designed for one long-running Node process with a persistent writable disk. Do not run multiple instances against the same data directory or deploy this background worker into short-lived serverless functions. JSON persistence keeps the starter easy to inspect but is not the final storage layer for a public multi-user service.

Before a public launch, move the store/queue to a transactional database and durable worker, add authentication or per-user quotas, request/body size limits, retention/deletion controls, job cancellation, and operational monitoring. Review provider data/caching and image-use terms for the intended deployment. Avoid full-catalog scraping. The current bounded queue is not a substitute for public-service abuse controls.

Useful next features: per-status filters, main/supporting character filters, optional no-repeat sessions, and MAL OAuth for private-list access. The storage and provider boundaries allow those without replacing the interface.

Source references: [MAL API](https://myanimelist.net/apiconfig/references/api/v2), [Tenrai API](https://api.tenrai.org/documentation), [SvelteKit](https://svelte.dev/docs/kit/introduction).
