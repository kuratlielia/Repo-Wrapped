import type { Metadata } from "next";
import { App } from "@/components/app";

type SearchParams = Promise<{ repo?: string | string[] }>;

function readRepo(sp: { repo?: string | string[] }): string | undefined {
  const raw = Array.isArray(sp.repo) ? sp.repo[0] : sp.repo;
  const value = raw?.trim();
  return value ? value : undefined;
}

// Per-repo metadata so a shared /?repo=owner/name link unfurls with the right
// title, description, and OG image on X and elsewhere.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const repo = readRepo(await searchParams);
  const title = repo ? `${repo} — Repo Wrapped` : "Repo Wrapped";
  const description = repo
    ? `The year in ${repo}, wrapped as a swipeable story. Wrap your own repo too.`
    : "Paste a public GitHub repo and get your year in it, one swipeable, screenshot-ready story.";
  const ogImage = repo
    ? `/api/og?repo=${encodeURIComponent(repo)}`
    : "/api/og";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const repo = readRepo(await searchParams);
  return <App initialRepo={repo} />;
}
