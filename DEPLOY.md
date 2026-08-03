# Deploying Repo Wrapped to Cloudflare

Repo Wrapped runs as a Next.js app on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). The git
archaeology runs inside a **Durable Object** (`Agent`) that owns a
[`@cloudflare/computer`](https://www.npmjs.com/package/@cloudflare/computer)
Workspace attached to the DO's SQLite storage.

On a normal **public** repo the whole pipeline runs **in isolates** — the DO
clones the repo with the isomorphic-git client and runs `git log` through the
worker-shell backend's built-in `git` command. **Zero containers are invoked.**
That is the cost story: a Wrapped costs a fast clone, an isolate `exec`, and
**one** batched Workers AI call.

---

## Prerequisites

- `wrangler` v4 authenticated: `npx wrangler login` (or `CLOUDFLARE_API_TOKEN`).
- Node 20+.

## One-time setup

### 1. Generate binding types

```bash
npm run cf-typegen        # -> wrangler types -> worker-configuration.d.ts
```

This produces the Workers runtime types (`DurableObjectNamespace`, `Ai`, …) that
`src/worker/*.ts` and `src/worker/env.d.ts` rely on. Re-run it whenever you edit
`wrangler.jsonc`.

### 2. Create the AI Gateway

The single caption call routes through AI Gateway so it is cached, rate-limited,
and logged (PRD 6.2.1). The gateway id must match `CF_AI_GATEWAY` in
`wrangler.jsonc` (default: `repo-wrapped`).

```bash
npx wrangler ai-gateway create repo-wrapped
```

(or create it in the dashboard under **AI → AI Gateway**). If you rename it,
update `vars.CF_AI_GATEWAY` in `wrangler.jsonc`.

### 3. Create the incremental-cache R2 bucket

`wrangler.jsonc` declares an R2 bucket for OpenNext's incremental cache. Create
it before the first deploy:

```bash
npx wrangler r2 bucket create repo-wrapped-opennext-cache
```

If you don't want caching, delete the `r2_buckets` block from `wrangler.jsonc`
instead.

### 4. Export the `Agent` DO from the Worker entry

`wrangler.jsonc` binds `class_name: "Agent"` and migrates it as a
`new_sqlite_classes` DO, so the deployed Worker bundle **must export `Agent`**.
OpenNext generates `.open-next/worker.js` and re-exports only *its own* Durable
Objects, not custom ones. Bridge it with one of:

- **Recommended — a thin custom entry.** Add `src/worker/index.ts`:

  ```ts
  export { default } from "../../.open-next/worker.js";
  export { Agent } from "./agent";
  // Re-export OpenNext's DOs too if you enable its DO-backed cache/queue:
  // export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../../.open-next/worker.js";
  ```

  then point `main` in `wrangler.jsonc` at `src/worker/index.ts` (wrangler will
  bundle it). Build first so `.open-next/worker.js` exists.

- **Or** append `export { Agent } from "../../src/worker/agent";` to
  `.open-next/worker.js` as a post-build step.

> This step is required because the current file set keeps `main` pointed at the
> generated `.open-next/worker.js` per the OpenNext defaults.

---

## Local preview

```bash
npm run preview:cf        # opennextjs-cloudflare build && wrangler dev
```

`next dev` alone also works for the UI; `next.config.ts` calls
`initOpenNextCloudflareForDev()` so bindings resolve in the dev server. For
captions in pure `next dev` without the AI binding, `@/lib/captions` falls back
to the AI Gateway REST endpoint using `CF_ACCOUNT_ID` + a `CF_API_TOKEN` secret
(otherwise it degrades to the deterministic fallback quips).

---

## Deploy

```bash
npm run deploy            # opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

---

## Required flags & bindings (and why)

| Config | Why |
| --- | --- |
| `compatibility_flags: nodejs_compat` | Required by both OpenNext and `@cloudflare/computer`. |
| `compatibility_flags: experimental` | Required by the worker-shell backend (the isolate that runs `git`). |
| `compatibility_flags: global_fetch_strictly_public` | OpenNext caching correctness. |
| `worker_loaders: [{ binding: "LOADER" }]` | Backs the worker-shell backend — this is what makes the git archaeology run in an **isolate**, not a container. |
| `durable_objects` + `migrations.new_sqlite_classes: ["Agent"]` | The per-repo agent; SQLite storage backs the Workspace VFS. |
| `ai: { binding: "AI" }` | The one batched caption call, in-worker, no secret needed. |
| `vars.WRAP_MODEL`, `vars.CF_AI_GATEWAY` | Caption model + AI Gateway id. |

## Secrets

None are strictly required in production — captions use the in-worker `AI`
binding. `CF_ACCOUNT_ID` / a `CF_API_TOKEN` secret are only for the local-dev
REST caption fallback:

```bash
npx wrangler secret put CF_API_TOKEN
```

---

## Preview-package caveat

`@cloudflare/computer` is a **preview** (v0.1.x). A couple of call sites in
`src/worker/agent.ts` are marked `// TODO(preview)` — the `GitCloneOptions`
shape and the worker-shell built-in `git` command (including `-C`). If a deploy
surfaces a mismatch, confirm those against the installed package and adjust; the
surrounding wiring stays the same.
