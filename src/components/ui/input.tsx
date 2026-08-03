"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "focus-ring h-13 w-full rounded-lg border border-border-strong bg-surface px-4 text-base text-surface-foreground",
      "placeholder:text-muted-foreground transition-colors duration-150",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
