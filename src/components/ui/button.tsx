"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn-style button, brand palette. Press feedback via active:scale (emil).
const buttonVariants = cva(
  "focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none transition-[transform,background-color,color,border-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-foreground hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
        secondary:
          "bg-surface text-surface-foreground border border-border-strong hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-muted",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-13 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
