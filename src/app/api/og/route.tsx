import { ImageResponse } from "next/og";
import { parseRepoInput, isParsedRepo } from "@/lib/repo";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "local";
}

// A branded 1200x630 unfurl for shared /?repo= links. Deliberately does NOT
// recompute stats (a crawler must not trigger a clone); it is a clean, on-brand
// card carrying the repo name so the link looks intentional on X.
const ACCENT = "#2b7fff"; // the blue accent, in sRGB for the rasterizer
const BG = "#0a0a0a";
const FG = "#f5f5f5";
const MUTED = "#9a9a9a";
const BORDER = "#262626";

export async function GET(request: Request) {
  // Image generation is moderately expensive; keep it behind a light limit.
  const limited = rateLimit(`og:${clientIp(request)}`, { limit: 40, windowMs: 60_000 });
  if (!limited.ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const rawRepo = searchParams.get("repo")?.trim().slice(0, 120);

  let repoLabel = "";
  let owner = "";
  if (rawRepo) {
    const parsed = parseRepoInput(rawRepo);
    if (isParsedRepo(parsed)) {
      repoLabel = parsed.slug;
      owner = parsed.owner;
    } else {
      repoLabel = rawRepo;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: FG,
          padding: "72px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Abstract accent arc bleeding off the top-right corner. */}
        <div
          style={{
            position: "absolute",
            top: "-260px",
            right: "-200px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            border: `2px solid ${ACCENT}`,
            opacity: 0.22,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-120px",
            width: "420px",
            height: "420px",
            borderRadius: "9999px",
            border: `2px solid ${ACCENT}`,
            opacity: 0.16,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 600 }}>
          Repo Wrapped
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: MUTED, marginBottom: 18 }}>
            {rawRepo ? "The year in" : "Your year in a repo, wrapped."}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: rawRepo ? 92 : 76,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              maxWidth: "1000px",
            }}
          >
            {repoLabel || "Paste a repo. Get your story."}
          </div>
          <div style={{ display: "flex", marginTop: 28 }}>
            <div style={{ display: "flex", width: 120, height: 8, background: ACCENT, borderRadius: 9999 }} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 28,
            fontSize: 26,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>{owner ? owner : "repo-wrapped"}</div>
          <div style={{ display: "flex" }}>Wrap your own</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
