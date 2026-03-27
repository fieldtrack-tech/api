"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * FieldTrack 2.0 Button — brand-aligned, premium SaaS style
 *
 * Variants:
 *  default      → Blue primary CTA (brand blue from logo pin)
 *  destructive  → Red danger action
 *  outline      → Neutral bordered
 *  secondary    → Filled neutral surface
 *  ghost        → Transparent minimal
 *  link         → Text link style
 */
const buttonVariants = cva(
  // Base — consistent across all variants
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-medium cursor-pointer select-none",
    "ring-offset-background transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary CTA — brand blue with subtle glow on hover
        default:
          "rounded-lg bg-primary text-primary-foreground shadow-sm " +
          "hover:bg-primary/90 hover:shadow-[0_2px_12px_hsl(var(--primary)/0.35)] " +
          "active:scale-[0.98] active:shadow-none",

        // Destructive — red
        destructive:
          "rounded-lg bg-destructive text-destructive-foreground shadow-sm " +
          "hover:bg-destructive/90 active:scale-[0.98]",

        // Outlined — neutral border, transparent bg
        outline:
          "rounded-lg border border-border bg-transparent text-foreground " +
          "hover:bg-accent hover:border-border/70 active:scale-[0.98]",

        // Secondary — filled neutral surface
        secondary:
          "rounded-lg bg-secondary text-secondary-foreground " +
          "hover:bg-secondary/70 active:scale-[0.98]",

        // Ghost — no background, minimal
        ghost:
          "rounded-lg text-foreground hover:bg-accent hover:text-foreground " +
          "active:scale-[0.98]",

        // Link — text only
        link: "h-auto p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:  "h-9 px-4 py-2",
        sm:       "h-8 rounded-md px-3 text-xs",
        lg:       "h-11 px-6 text-base",
        icon:     "h-9 w-9 rounded-lg",
        "icon-sm": "h-7 w-7 rounded-md text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
