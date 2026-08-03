# Deploying Repo Wrapped to Cloudflare

Repo Wrapped runs as a Next.js 16 app on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The git
archaeology runs inside a **Durable Object** (`Agent`) that owns a
[`@cloudflare/computer`](https://www.npmjs.com/package/@cloudflare/computer)
Workspace attached to the DO's SQLite storage.

On a public repo the DO clones with the in-isolate isomorphic-git client and
reads `git log` entirely in an isolate. **Zero containers.** If the in-isolate
clone cannot complete, it falls back to the GitHub REST API (still isolate-only,
a few HTTPS calls). Captions are **one** batched Workers AI call.

Live: <https://repo-wrapped.eliaroankuratli.workers.dev>

## Bindings (wrangler.jsonc)

| Binding | Purpose |
| --- | --- |
| `compatibility_flags: nodejs_compat` | Required by OpenNext and `@cloudflare/computer`. |
| `compatibility_flags: global_fetch_strictly_public` | OpenNext caching correctness. |
| `durable_objects` + `migrations` (`Agent`, `LeaderboardDO`, both `new_sqlite_classes`) | The per-repo archaeology agent and the global leaderboard, both SQLite-backed. |
| `ai: { binding: "AI" }` | The one batched caption call, in-worker. |
| `images: { binding: "IMAGES" }` | Next.js image optimization. |
| `vars.WRAP_MODEL` | Caption model (default `@cf/meta/llama-3.2-3b-instruct`; confirm against the live catalog with `wrangler ai models`). |
| `vars.CF_AI_GATEWAY` | AI Gateway id. Optional: if the gateway is absent the caption call retries directly. |

No Worker Loader / `experimental` flag is needed (the DO uses isomorphic-git, not
the worker-shell backend). No R2 bucket is required (OpenNext runs without the
incremental cache; all app routes are dynamic).

## The custom Worker entry

`main` points at `src/worker/index.ts`, which re-exports OpenNext's generated
handler plus both Durable Objects (`Agent`, `LeaderboardDO`) so wrangler can bind
the migrated DO classes:

```ts
// @ts-ignore - generated at build time
export { default } from "../../.open-next/worker.js";
export { Agent } from "./agent";
export { LeaderboardDO } from "./leaderboard";
```

## Deploy

```bash
npm run cf-typegen                    # wrangler types -> worker-configuration.d.ts
npx opennextjs-cloudflare build       # produces .open-next/worker.js
npx wrangler deploy                   # bundles src/worker/index.ts, runs DO migrations
```

`next dev` runs the whole UI locally (it uses the Node git engine: real `git`
binary). The Workers DO path only runs in the deployed runtime.

## Optional

- **AI Gateway** (caching / rate limiting / logging of the caption call): create
  a gateway named to match `CF_AI_GATEWAY` in the dashboard (AI → AI Gateway).
  Without it, captions still come from the model via a direct call.
- **GitHub token** (raises the fallback reader's limit from 60 to 5000 req/hr):
  `npx wrangler secret put GITHUB_TOKEN`.

## Caption model note

The Workers AI catalog changes over time; models get deprecated. If captions
degrade to the deterministic fallback, run `wrangler ai models`, pick a current
small instruct model, and set `vars.WRAP_MODEL`. The caption call uses guided
JSON (`response_format` json_schema) and a per-key quality/safety filter, so a
weak or unavailable model degrades gracefully to the (good) deterministic quips.
