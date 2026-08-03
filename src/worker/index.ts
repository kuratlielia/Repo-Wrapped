// Custom Cloudflare Worker entry.
//
// OpenNext generates `.open-next/worker.js` (the Next.js request handler) but
// only re-exports its OWN Durable Objects, not ours. wrangler needs every DO
// named in `migrations` to be exported from the deployed bundle, so this entry
// re-exports OpenNext's default handler plus our two DOs. `main` in
// wrangler.jsonc points here; wrangler bundles it after `opennextjs-cloudflare
// build` has produced `.open-next/worker.js`.

// The generated worker only exists after a build, so this import cannot be
// type-checked in a fresh checkout. `@ts-ignore` (not `@ts-expect-error`) is
// deliberate: post-build the path resolves and an expect-error would itself error.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated at build time by `opennextjs-cloudflare build`.
export { default } from "../../.open-next/worker.js";
export { Agent } from "./agent";
export { LeaderboardDO } from "./leaderboard";
