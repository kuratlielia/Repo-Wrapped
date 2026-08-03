"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Download,
  LayoutGrid,
  Send,
  Link as LinkIcon,
  Copy,
  Check,
  ChevronLeft,
} from "lucide-react";
import type { Card, WrappedResult } from "@/lib/types";
import { SharePoster, type PosterFormat } from "@/components/story/share-poster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as share from "@/lib/share";

type ThemeChoice = "auto" | "light" | "dark";

export interface ShareHubProps {
  result: WrappedResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DRAWER_EASE = [0.32, 0.72, 0, 1] as const;

/** Default card selection for a carousel export: the punchy, postable ones. */
const DEFAULT_EXPORT_KINDS: Card["kind"][] = [
  "commits",
  "threeAm",
  "streak",
  "worstMessage",
  "personality",
  "summary",
];

export function ShareHub({ result, open, onOpenChange }: ShareHubProps) {
  const reduce = useReducedMotion();
  const [view, setView] = React.useState<"menu" | "carousel">("menu");
  const [copied, setCopied] = React.useState<null | "link" | "image">(null);
  const [format, setFormat] = React.useState<PosterFormat>("x");
  const [themeChoice, setThemeChoice] = React.useState<ThemeChoice>("auto");

  // Resolve the chosen export options; "auto" leaves the theme to the site.
  const posterOpts = React.useCallback(
    () => ({
      theme: themeChoice === "auto" ? undefined : themeChoice,
      format,
    }),
    [themeChoice, format]
  );
  // The carousel export takes an aspect variant; map the poster format onto it.
  const carouselOpts = React.useCallback(
    () => ({
      theme: themeChoice === "auto" ? undefined : themeChoice,
      variant: (format === "square" ? "square" : "portrait") as "portrait" | "square",
    }),
    [themeChoice, format]
  );

  // Reset to the menu whenever the sheet closes.
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setView("menu"), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape to close.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const flashCopied = (which: "link" | "image") => {
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleDownload = () => {
    if (typeof share.downloadSummary === "function") {
      void share.downloadSummary(result, posterOpts());
    }
  };
  const handleCopyLink = async () => {
    if (typeof share.copyLink === "function") {
      const ok = await share.copyLink(result);
      if (ok) flashCopied("link");
    }
  };
  const handleCopyImage = async () => {
    if (typeof share.copyImage === "function") {
      const ok = await share.copyImage(result, posterOpts());
      if (ok) flashCopied("image");
    }
  };
  const handleShareX = () => {
    // Open the X composer inside the click gesture so it isn't popup-blocked.
    // The shared link already unfurls the OG image; on top of that we copy the
    // landscape poster to the clipboard so the user can paste it into the post
    // (X's web intent cannot attach an image itself).
    if (typeof share.shareToX === "function") share.shareToX(result);
    if (typeof share.copyImage === "function") {
      void share
        .copyImage(result, {
          theme: themeChoice === "auto" ? undefined : themeChoice,
          format: "x",
        })
        .then((ok) => {
          if (ok) flashCopied("image");
        });
    }
  };

  const scrimAnim = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const panelAnim = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Scrim */}
          <motion.button
            aria-label="Close share menu"
            {...scrimAnim}
            transition={{ duration: 0.2, ease: DRAWER_EASE }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share"
            {...panelAnim}
            transition={{ duration: 0.34, ease: DRAWER_EASE }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) {
                onOpenChange(false);
              }
            }}
            className="relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-t-xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:max-w-[820px] sm:rounded-xl"
            style={{ willChange: "transform" }}
          >
            {/* Grabber */}
            <div className="flex justify-center pt-3 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-border-strong" />
            </div>

            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-2">
                {view === "carousel" && (
                  <button
                    onClick={() => setView("menu")}
                    aria-label="Back"
                    className="focus-ring -ml-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <h2 className="font-heading text-lg font-semibold">
                  {view === "menu" ? "Share" : "Export carousel"}
                </h2>
              </div>
            </div>

            {view === "menu" ? (
              <ShareMenu
                result={result}
                copied={copied}
                format={format}
                onFormatChange={setFormat}
                themeChoice={themeChoice}
                onThemeChange={setThemeChoice}
                onDownload={handleDownload}
                onExportCarousel={() => setView("carousel")}
                onShareX={handleShareX}
                onCopyLink={handleCopyLink}
                onCopyImage={handleCopyImage}
              />
            ) : (
              <CarouselSelector
                result={result}
                onExport={(kinds) => {
                  if (typeof share.exportCarousel === "function") {
                    void share.exportCarousel(result, kinds, carouselOpts());
                  }
                  onOpenChange(false);
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A compact connected segmented control: shared borders, accent for the active. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex overflow-hidden rounded-md border border-border-strong"
      >
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "focus-ring px-3 py-1.5 text-sm font-medium transition-colors",
                i !== 0 && "border-l border-border-strong",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A live, scaled-down preview of the exact poster that will be exported. */
function PosterPreview({
  result,
  format,
  themeChoice,
}: {
  result: WrappedResult;
  format: PosterFormat;
  themeChoice: ThemeChoice;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Poster intrinsic width per format, and height/width ratio.
  const designW = format === "x" ? 1120 : 520;
  const ratio = format === "x" ? 9 / 16 : format === "square" ? 1 : 5 / 4;
  const scale = width > 0 ? width / designW : 0;
  const previewTheme = themeChoice === "auto" ? undefined : themeChoice;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl"
      style={{ height: scale > 0 ? designW * ratio * scale : 0 }}
    >
      {scale > 0 && (
        <div
          style={{
            width: designW,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <SharePoster
            result={result}
            format={format}
            theme={previewTheme}
            id="share-poster-preview"
          />
        </div>
      )}
    </div>
  );
}

/** A connected grid of share options: cells share borders, read as one unit. */
function ShareMenu({
  result,
  copied,
  format,
  onFormatChange,
  themeChoice,
  onThemeChange,
  onDownload,
  onExportCarousel,
  onShareX,
  onCopyLink,
  onCopyImage,
}: {
  result: WrappedResult;
  copied: null | "link" | "image";
  format: PosterFormat;
  onFormatChange: (format: PosterFormat) => void;
  themeChoice: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  onDownload: () => void;
  onExportCarousel: () => void;
  onShareX: () => void;
  onCopyLink: () => void;
  onCopyImage: () => void;
}) {
  const rows: {
    key: string;
    icon: React.ReactNode;
    label: string;
    desc: string;
    onClick: () => void;
  }[] = [
    {
      key: "download",
      icon: <Download size={20} />,
      label: "Download summary card",
      desc: "A postable image of your wrap.",
      onClick: onDownload,
    },
    {
      key: "carousel",
      icon: <LayoutGrid size={20} />,
      label: "Export carousel",
      desc: "Pick the cards, save them as images.",
      onClick: onExportCarousel,
    },
    {
      key: "x",
      icon: <Send size={20} />,
      label: "Share to X",
      desc: "Post your headline stat with a link.",
      onClick: onShareX,
    },
    {
      key: "link",
      icon:
        copied === "link" ? (
          <Check size={20} className="text-accent" />
        ) : (
          <LinkIcon size={20} />
        ),
      label: copied === "link" ? "Link copied" : "Copy link",
      desc: "Send people straight to this wrap.",
      onClick: onCopyLink,
    },
    {
      key: "image",
      icon:
        copied === "image" ? (
          <Check size={20} className="text-accent" />
        ) : (
          <Copy size={20} />
        ),
      label: copied === "image" ? "Image copied" : "Copy image",
      desc: "Straight to your clipboard.",
      onClick: onCopyImage,
    },
  ];

  return (
    <div className="flex flex-col border-t border-border sm:flex-row">
      {/* Left: settings + options */}
      <div className="flex flex-col sm:flex-1 sm:border-r sm:border-border">
        <div className="flex flex-col gap-3 px-5 py-4">
          <Segmented<PosterFormat>
            label="Format"
            value={format}
            onChange={onFormatChange}
            options={[
              { value: "x", label: "X" },
              { value: "portrait", label: "Portrait" },
              { value: "square", label: "Square" },
            ]}
          />
          <Segmented<ThemeChoice>
            label="Theme"
            value={themeChoice}
            onChange={onThemeChange}
            options={[
              { value: "auto", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 border-t border-border">
          {rows.map((row) => (
            <button
              key={row.key}
              onClick={row.onClick}
              className="focus-ring group flex items-center gap-4 border-b border-border px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted"
            >
              <span className="shrink-0 text-foreground">{row.icon}</span>
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-sm text-muted-foreground">{row.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: live preview of exactly what gets exported */}
      <div className="order-first flex items-center justify-center bg-muted/40 p-5 sm:order-none sm:w-[42%]">
        <PosterPreview result={result} format={format} themeChoice={themeChoice} />
      </div>
    </div>
  );
}

/** Minimal checkbox list to choose which cards go into a carousel export. */
function CarouselSelector({
  result,
  onExport,
}: {
  result: WrappedResult;
  onExport: (kinds: string[]) => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    result.cards.forEach((c) => {
      if (DEFAULT_EXPORT_KINDS.includes(c.kind)) initial.add(c.kind);
    });
    return initial;
  });

  const toggle = (kind: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <div>
      <div className="max-h-[46vh] overflow-y-auto border-t border-border">
        {result.cards.map((card, i) => {
          const checked = selected.has(card.kind);
          return (
            <button
              key={card.kind + i}
              onClick={() => toggle(card.kind)}
              className="focus-ring flex w-full items-center gap-3 border-b border-border px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-muted"
              role="checkbox"
              aria-checked={checked}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
                  checked
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border-strong text-transparent"
                )}
              >
                <Check size={13} strokeWidth={3} />
              </span>
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{card.label}</span>
                <span className="line-clamp-1 text-sm text-muted-foreground">
                  {card.headline}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="text-sm text-muted-foreground tnum">
          {selected.size} selected
        </span>
        <Button
          size="sm"
          onClick={() => onExport(Array.from(selected))}
          disabled={selected.size === 0}
        >
          Export {selected.size > 0 ? selected.size : ""}
        </Button>
      </div>
    </div>
  );
}
