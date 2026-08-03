import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal OpenNext config for the Cloudflare adapter. The defaults are the
// right starting point for Repo Wrapped: the app is largely static plus a
// couple of dynamic routes, and all the heavy work happens in the `Agent`
// Durable Object rather than in Next's server runtime.
//
// Incremental caching (R2 / KV overrides) can be layered in here later; see
// https://opennext.js.org/cloudflare/caching. It is intentionally left at the
// defaults so a first deploy needs no extra bindings beyond the R2 bucket
// declared in wrangler.jsonc.
export default defineCloudflareConfig({});
