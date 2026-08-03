import type { Card, RepoStats, SummaryData } from "./types";
import type { Quips } from "./captions/fallback";
import { formatNumber } from "./utils";
import { dowName, hourLabel, prettyDate, shortDate } from "./labels";

/**
 * Build the ordered story from computed stats and generated quips. Cards that
 * have no data (e.g. no most-edited file for an empty repo) are dropped, so the
 * story always stays between 8 and 12 readable cards (PRD 5).
 */
export function buildCards(stats: RepoStats, q: Quips): { cards: Card[]; summary: SummaryData } {
  const cards: Card[] = [];

  cards.push({
    kind: "intro",
    label: "Your year in this repo",
    headline: stats.name,
    detail: `${stats.owner} / last ${stats.windowMonths} months`,
    quip: q.intro,
  });

  cards.push({
    kind: "commits",
    label: "Total commits",
    headline: formatNumber(stats.totalCommits),
    headlineNumber: stats.totalCommits,
    headlineSuffix: stats.totalCommits === 1 ? "commit" : "commits",
    quip: q.commits,
  });

  cards.push({
    kind: "threeAm",
    label: "The 3am club",
    headline: formatNumber(stats.threeAm.count),
    headlineNumber: stats.threeAm.count,
    headlineSuffix: "before 5am",
    detail:
      stats.threeAm.count > 0
        ? `${stats.threeAm.percent}% of everything you shipped`
        : "a healthy sleep schedule, apparently",
    quip: q.threeAm,
  });

  cards.push({
    kind: "streak",
    label: "Longest streak",
    headline: formatNumber(stats.longestStreak.days),
    headlineNumber: stats.longestStreak.days,
    headlineSuffix: stats.longestStreak.days === 1 ? "day" : "days",
    detail:
      stats.longestStreak.days > 1
        ? `${shortDate(stats.longestStreak.start)} to ${shortDate(stats.longestStreak.end)}`
        : undefined,
    quip: q.streak,
  });

  if (stats.torturedFile) {
    const base = stats.torturedFile.path.split("/").pop() || stats.torturedFile.path;
    cards.push({
      kind: "torturedFile",
      label: "Most tortured file",
      headline: base,
      detail: `${formatNumber(stats.torturedFile.edits)} edits, and counting`,
      quip: q.torturedFile,
    });
  }

  cards.push({
    kind: "peakDay",
    label: "Peak day",
    headline: formatNumber(stats.peakDay.count),
    headlineNumber: stats.peakDay.count,
    headlineSuffix: stats.peakDay.count === 1 ? "commit" : "commits",
    detail: prettyDate(stats.peakDay.date),
    quip: q.peakDay,
  });

  if (stats.worstMessage) {
    cards.push({
      kind: "worstMessage",
      label: "Worst commit message",
      headline: `"${stats.worstMessage.message}"`,
      detail: `commit ${stats.worstMessage.hash.slice(0, 7)}`,
      quip: q.worstMessage,
    });
  }

  cards.push({
    kind: "busiest",
    label: "Busiest hour",
    headline: `${dowName(stats.busiestDow.dow)}s`,
    detail: `peak activity around ${hourLabel(stats.busiestHour.hour)}`,
    quip: q.busiest,
  });

  if (stats.topContributor && stats.contributorCount > 1) {
    cards.push({
      kind: "topContributor",
      label: "Top contributor",
      headline: stats.topContributor.name,
      detail: `${Math.round(stats.topContributor.share * 100)}% of ${formatNumber(
        stats.totalCommits
      )} commits`,
      quip: q.topContributor,
    });
  }

  cards.push({
    kind: "personality",
    label: "Your coding personality",
    headline: q.archetypeName,
    quip: q.personality,
  });

  const summary: SummaryData = {
    repo: stats.repo,
    archetype: q.archetypeName,
    stats: buildSummaryStats(stats),
  };

  cards.push({
    kind: "summary",
    label: "Repo Wrapped",
    headline: stats.repo,
    detail: q.archetypeName,
    quip: q.personality,
  });

  return { cards, summary };
}

function buildSummaryStats(stats: RepoStats): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [
    { label: "Commits", value: formatNumber(stats.totalCommits) },
    { label: "Longest streak", value: `${stats.longestStreak.days}d` },
    { label: "Before 5am", value: formatNumber(stats.threeAm.count) },
    { label: "Busiest", value: dowName(stats.busiestDow.dow) },
  ];
  return out;
}
