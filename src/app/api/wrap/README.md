# POST /api/wrap — NDJSON streaming contract

`POST` a JSON body `{ "url": string, "months"?: number }` (default `months` = 12).
The response is `application/x-ndjson`: **one JSON `StreamEvent` per line, `\n`-terminated**. Read it line by line.

Event shapes (see `@/lib/types`):

- **progress** — `{ "type": "progress", "step", "label", "status": "start" | "done" }`
  `step` is one of `resolve | clone | read | crunch | write | done`. `label` is a ready-to-render string. Use these to drive the loading UI.
- **result** (terminal) — `{ "type": "result", "result": WrappedResult }`. Exactly one, then the stream closes.
- **error** (terminal) — `{ "type": "error", "error": WrapError }` where `WrapError = { ok: false, reason, message }`. Exactly one, then the stream closes.

Guarantees: progress events may arrive in any number and order, but the stream **always** ends with exactly one `result` **or** one `error` event. Rate limiting, bad JSON, invalid URLs, private/missing repos, and empty windows all surface as a single `error` event (not an HTTP error status). Cache hits emit a few quick `done` progress beats then the `result` with `meta.cached = true`.

`GET /api/wrap` returns `{ "ok": true }` for health checks.
