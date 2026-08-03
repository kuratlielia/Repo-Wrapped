import type { RepoStats } from "@/lib/types";
import { dowName, hourLabel, prettyDate } from "@/lib/labels";
import { sanitizeLine, sanitizeName } from "./sanitize";

export interface Quips {
  intro: string;
  commits: string;
  threeAm: string;
  streak: string;
  torturedFile: string;
  peakDay: string;
  worstMessage: string;
  busiest: string;
  topContributor: string;
  personality: string;
  archetypeName: string;
}

// Tiny deterministic PRNG so the same repo always gets the same wording, but
// different repos vary. Seeded by the repo slug.
function seeded(slug: string) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * A genuinely dry, roasting fallback. Every line references a real number so
 * the story still feels personal with no model available. No emojis, no em
 * dashes (enforced again by sanitizeLine).
 */
export function buildFallbackQuips(stats: RepoStats): Quips {
  const r = seeded(stats.repo);
  const {
    totalCommits,
    threeAm,
    longestStreak,
    peakDay,
    worstMessage,
    busiestHour,
    busiestDow,
    topContributor,
  } = stats;

  const intro = pick(r, [
    `Twelve months of ${stats.name}, receipts included.`,
    `Here is what the git history says about ${stats.name}. It remembers everything.`,
    `A year of ${stats.name}, reconstructed from the commits you forgot you wrote.`,
  ]);

  const commits =
    totalCommits === 0
      ? "Zero commits in the window. A quiet year, or a suspicious one."
      : totalCommits < 50
        ? pick(r, [
            `${totalCommits} commits. Quality over quantity, allegedly.`,
            `${totalCommits} commits all year. The repo is basically hibernating.`,
          ])
        : totalCommits < 500
          ? pick(r, [
              `${totalCommits} commits. Steady hands, no drama.`,
              `${totalCommits} commits. Respectable, and nobody got hurt.`,
            ])
          : pick(r, [
              `${totalCommits} commits. Someone clearly needed a hobby.`,
              `${totalCommits} commits. The keyboard has filed a complaint.`,
            ]);

  const threeAmLine =
    threeAm.count === 0
      ? "Zero commits before 5am. Boringly well adjusted."
      : threeAm.percent >= 20
        ? `${threeAm.count} commits before 5am. Sleep is a config you never set.`
        : pick(r, [
            `${threeAm.count} commits between midnight and 5am. The bugs come out at night.`,
            `${threeAm.count} late-night commits. Nothing good is written at 3am, yet here we are.`,
          ]);

  const streak =
    longestStreak.days <= 1
      ? "Longest streak: one day. Commitment issues, literally."
      : longestStreak.days < 7
        ? `${longestStreak.days} days straight. A respectable little run.`
        : pick(r, [
            `${longestStreak.days} days without missing. Touch grass was not in the changelog.`,
            `${longestStreak.days} consecutive days of commits. The streak owned you, not the reverse.`,
          ]);

  const torturedFile = statsTorturedLine(stats, r);

  const peak = pick(r, [
    `${peakDay.count} commits on ${prettyDate(peakDay.date)}. Something was on fire.`,
    `Peak day: ${prettyDate(peakDay.date)}, ${peakDay.count} commits. A deadline, probably.`,
  ]);

  const worst = worstMessage
    ? pick(r, [
        `"${worstMessage.message}" shipped to production. History does not forget.`,
        `Best commit message of the year: "${worstMessage.message}". Shakespeare is safe.`,
      ])
    : "Every commit message was suspiciously coherent. Who are you trying to fool.";

  const busiest = pick(r, [
    `${dowName(busiestDow.dow)} around ${hourLabel(busiestHour.hour)} is when the work actually happens.`,
    `This repo runs on ${dowName(busiestDow.dow)}s and ${hourLabel(busiestHour.hour)} energy.`,
  ]);

  const contributor = topContributor
    ? topContributor.share >= 0.9
      ? `${topContributor.name} wrote ${Math.round(topContributor.share * 100)}% of it. This is a solo album.`
      : `${topContributor.name} carried ${Math.round(topContributor.share * 100)}% of the commits. Bus factor of one, noted.`
    : "Contributions were evenly spread. Suspiciously healthy.";

  const { name: archetypeName, line: personality } = pickArchetype(stats, r);

  const wrap = (s: string) => sanitizeLine(s);
  return {
    intro: wrap(intro),
    commits: wrap(commits),
    threeAm: wrap(threeAmLine),
    streak: wrap(streak),
    torturedFile: wrap(torturedFile),
    peakDay: wrap(peak),
    worstMessage: wrap(worst),
    busiest: wrap(busiest),
    topContributor: wrap(contributor),
    personality: wrap(personality),
    archetypeName: sanitizeName(archetypeName),
  };
}

function statsTorturedLine(stats: RepoStats, r: () => number): string {
  const f = stats.torturedFile;
  if (!f) return "No single file took the brunt. The pain was distributed fairly.";
  const base = f.path.split("/").pop() || f.path;
  return pick(r, [
    `${base} was edited ${f.edits} times. That file needs a lawyer, not a linter.`,
    `${f.edits} edits to ${base}. At this point it is less a file and more a hostage.`,
    `${base} got touched ${f.edits} times. Somewhere it is still crying.`,
  ]);
}

interface Archetype {
  name: string;
  line: string;
  /** Truthy when this repo's numbers fit the archetype. */
  test: (s: RepoStats) => boolean;
  /** Higher = more specific/standout, tried before the generic pool. */
  weight: number;
}

// A big, deliberately funny pool. Selection collects every archetype whose test
// passes, then seeded-picks one so different repos land on different results and
// the same repo is stable. Dry, roasting, no emojis, no em dashes.
const ARCHETYPES: Archetype[] = [
  {
    name: "The Friday Deploy Menace",
    line: "You ship on Fridays and let the weekend on-call figure it out. Bold.",
    test: (s) => s.busiestDow.dow === 5,
    weight: 5,
  },
  {
    name: "The 3am Philosopher",
    line: "Your best ideas and your worst bugs arrive at the exact same hour.",
    test: (s) => s.threeAm.percent >= 20,
    weight: 6,
  },
  {
    name: "The Nocturne",
    line: "You do your finest work while the rest of the timezone is unconscious.",
    test: (s) => s.nightShare >= 0.4,
    weight: 5,
  },
  {
    name: "The Weekend Warrior",
    line: "Weekdays are for meetings. The actual code happens on your days off.",
    test: (s) => s.weekendShare >= 0.35,
    weight: 5,
  },
  {
    name: "The Monday Grinder",
    line: "You attack the week head first and let it slow you down from there.",
    test: (s) => s.busiestDow.dow === 1,
    weight: 3,
  },
  {
    name: "The Sunday Scaries Coder",
    line: "Nothing says relaxing weekend like a commit at 9pm on a Sunday.",
    test: (s) => s.busiestDow.dow === 0,
    weight: 4,
  },
  {
    name: "The One-Person Army",
    line: "This repo is less a team project and more your diary with version control.",
    test: (s) => (s.topContributor?.share ?? 0) >= 0.85 && s.totalCommits >= 30,
    weight: 6,
  },
  {
    name: "The Benevolent Dictator",
    line: "Other people commit here, technically, but everyone knows whose repo it is.",
    test: (s) => (s.topContributor?.share ?? 0) >= 0.6 && s.contributorCount >= 3,
    weight: 4,
  },
  {
    name: "The Streak Freak",
    line: "Missing a single day would physically hurt you, so you simply never did.",
    test: (s) => s.longestStreak.days >= 14,
    weight: 6,
  },
  {
    name: "The Refactor Addict",
    line: "You cannot leave a working file alone, and honestly we respect the illness.",
    test: (s) => (s.torturedFile?.edits ?? 0) >= 30,
    weight: 5,
  },
  {
    name: "The Commit Machine",
    line: "At this volume it stopped being coding and became cardio for your keyboard.",
    test: (s) => s.totalCommits >= 800,
    weight: 6,
  },
  {
    name: "The Deadline Sprinter",
    line: "One heroic day did most of the work while the calendar quietly panicked.",
    test: (s) => s.peakDay.count >= 15,
    weight: 5,
  },
  {
    name: "The Message Minimalist",
    line: 'Your idea of documentation is a commit that just says "fix" and walking away.',
    test: (s) => !!s.worstMessage && s.worstMessage.message.trim().length <= 5,
    weight: 5,
  },
  {
    name: "The Slow Burn",
    line: "A handful of commits all year. Every one of them clearly agonized over.",
    test: (s) => s.totalCommits > 0 && s.totalCommits < 40,
    weight: 3,
  },
  {
    name: "The 9-to-5 Professional",
    line: "You code during working hours like a functional adult. Suspicious, frankly.",
    test: (s) => s.threeAm.count === 0 && s.weekendShare < 0.15 && s.busiestHour.hour >= 9 && s.busiestHour.hour <= 17,
    weight: 4,
  },
  {
    name: "The Lunch Break Hacker",
    line: "Peak productivity at midday, powered entirely by a sandwich and spite.",
    test: (s) => s.busiestHour.hour >= 11 && s.busiestHour.hour <= 13,
    weight: 3,
  },
  {
    name: "The Early Bird",
    line: "Up and committing before most people have found the coffee. Show off.",
    test: (s) => s.busiestHour.hour >= 5 && s.busiestHour.hour <= 8,
    weight: 4,
  },
  {
    name: "The Midnight Committer",
    line: "The day does not end, it just rolls into another commit. Sleep is a myth here.",
    test: (s) => s.busiestHour.hour >= 22 || s.busiestHour.hour <= 1,
    weight: 4,
  },
];

// Always-eligible funny fallbacks, used when nothing specific fits.
const GENERIC: Archetype[] = [
  {
    name: "The Steady Hand",
    line: "No drama, no 3am panics, just relentless quiet output. Weirdly admirable.",
    test: () => true,
    weight: 1,
  },
  {
    name: "The Mysterious Committer",
    line: "The numbers refuse to explain you, which is its own kind of personality.",
    test: () => true,
    weight: 1,
  },
  {
    name: "The Well-Adjusted Developer",
    line: "Balanced hours, sane messages, no red flags. Deeply unsettling, honestly.",
    test: () => true,
    weight: 1,
  },
];

function pickArchetype(stats: RepoStats, rng: () => number): { name: string; line: string } {
  const matches = ARCHETYPES.filter((a) => a.test(stats));
  // Prefer the more specific/standout matches, but keep enough for variety.
  const topWeight = matches.reduce((m, a) => Math.max(m, a.weight), 0);
  const pool = matches.filter((a) => a.weight >= topWeight - 1);
  const candidates = pool.length ? pool : GENERIC;
  const chosen = pick(rng, candidates);
  return { name: chosen.name, line: chosen.line };
}
