import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * FieldTrack 2.0 Badge — brand-aligned status indicators
 *
 * Variants: default | secondary | destructive | outline
 *           success | warning | error | info
 */
const badgeVariants = cva(
  // Base — consistent pill shape, no border by default
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 " +
  "text-[11px] font-semibold leading-none tracking-wide " +
  "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Brand blue — default status
        default:
          "border-transparent bg-primary/10 text-primary " +
          "dark:bg-primary/20 dark:text-primary",

        // Neutral secondary
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground",

        // Destructive
        destructive:
          "border-transparent bg-destructive/10 text-destructive " +
          "dark:bg-destructive/20",

        // Bordered only
        outline:
          "border-border text-foreground bg-transparent",

        // Status: success (green)
        success:
          "border-transparent bg-green-100 text-green-700 " +
          "dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/20",

        // Status: warning (amber)
        warning:
          "border-transparent bg-amber-100 text-amber-700 " +
          "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20",

        // Status: error (red — distinct from destructive)
        error:
          "border-transparent bg-red-100 text-red-700 " +
          "dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",

        // Status: info (blue-tinted)
        info:
          "border-transparent bg-blue-100 text-blue-700 " +
          "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
