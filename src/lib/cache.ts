// Repo-level payload cache (PRD 6.3). Popular repos should feel instant, so we
// memoize the whole WrappedResult under a (slug, window) key. Kept simple and
// dependency-free so the same code runs on Cloudflare Workers, where a KV- or
// DO-backed WrapCache can be swapped in behind the same interface.

import type { WrappedResult } from "@/lib/types";

export interface WrapCache {
  get(key: string): Promise<WrappedResult | null>;
  set(key: string, value: WrappedResult): Promise<void>;
}

/** Cache identity: one entry per repo per window length. */
export function cacheKey(slug: string, windowMonths: number): string {
  return `${slug.toLowerCase()}@${windowMonths}`;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_ENTRIES = 200;

interface Entry {
  value: WrappedResult;
  expiresAt: number;
}

class MemoryCache implements WrapCache {
  private store = new Map<string, Entry>();

  async get(key: string): Promise<WrappedResult | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: WrappedResult): Promise<void> {
    // Refresh insertion order so the Map's iteration order stays LRU-ish.
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS });

    // Evict the oldest entries once we cross the soft cap.
    while (this.store.size > MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

/** Process-wide default. On Workers, substitute a durable WrapCache. */
export const memoryCache: WrapCache = new MemoryCache();
