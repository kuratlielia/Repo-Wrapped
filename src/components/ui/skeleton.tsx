import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-black/[0.045] before:to-transparent",
        "before:animate-[shimmer_1.6s_infinite] dark:before:via-white/[0.06]",
        className
      )}
      {...props}
    />
  );
}
