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
    classes: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  RECENT: {
    label: "Recently Active",
    classes: "bg-amber-100 text-amber-800 border border-amber-200",
    dot: "bg-amber-500",
  },
  INACTIVE: {
    label: "Inactive",
    classes: "bg-slate-100 text-slate-600 border border-slate-200",
    dot: "bg-slate-400",
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
