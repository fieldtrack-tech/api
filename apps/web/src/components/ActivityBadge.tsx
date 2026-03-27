"use client";

import { ActivityStatus } from "@/types";
import { cn } from "@/lib/utils";

interface ActivityBadgeProps {
  status: ActivityStatus;
  showDot?: boolean;
  className?: string;
}

const config: Record<ActivityStatus, { label: string; classes: string; dot: string }> = {
  ACTIVE: {
    label: "Active",
    classes:
      "bg-emerald-100 text-emerald-700 border border-emerald-200/60 " +
      "dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  RECENT: {
    label: "Recently Active",
    classes:
      "bg-amber-100 text-amber-700 border border-amber-200/60 " +
      "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
  },
  INACTIVE: {
    label: "Inactive",
    classes:
      "bg-muted text-muted-foreground border border-border/60",
    dot: "bg-muted-foreground/50",
  },
};

export function ActivityBadge({ status, showDot = true, className }: ActivityBadgeProps) {
  const { label, classes, dot } = config[status] ?? config.INACTIVE;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        classes,
        className
      )}
    >
      {showDot && (
        status === "ACTIVE" ? (
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} aria-hidden="true" />
        )
      )}
      {label}
    </span>
  );
}
