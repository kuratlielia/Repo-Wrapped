// Public leaderboard read endpoint. GET returns the top wrapped repos.
//
// This route never throws to the client: a fresh deploy (or local memory with
// nothing recorded yet) simply returns an empty list, which the UI renders as a
// calm empty state rather than an error.

import { getStore, isLeaderboardCategory, type LeaderboardCategory } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const raw = Number(params.get("limit"));
  const limit =
    Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;

  const categoryParam = params.get("category");
  const category: LeaderboardCategory = isLeaderboardCategory(categoryParam)
    ? categoryParam
    : "wraps";

  try {
    const store = await getStore();
    return Response.json({ entries: await store.top(limit, category), category });
  } catch {
    return Response.json({ entries: [], category });
  }
}
