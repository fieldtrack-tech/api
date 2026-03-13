"use client";

import { LeaderboardEntry } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { Trophy, Medal } from "lucide-react";
import { formatDistance, formatDuration, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  metric: string;
  /** If provided, this employee's row is highlighted */
  highlightEmployeeId?: string;
}

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: { badge: "bg-amber-100 text-amber-700 border border-amber-300", row: "bg-amber-50/60" },
  2: { badge: "bg-slate-100 text-slate-600 border border-slate-300", row: "bg-slate-50/40" },
  3: { badge: "bg-orange-100 text-orange-700 border border-orange-300", row: "bg-orange-50/40" },
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];

  if (rank <= 3) {
    return (
      <span
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
          style.badge
        )}
      >
        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
      </span>
    );
  }

  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {rank}
    </span>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatMetricValue(entry: LeaderboardEntry, metric: string): string {
  if (metric === "distance") return formatDistance(entry.distance);
  if (metric === "sessions") return String(entry.sessions);
  if (metric === "duration") return formatDuration(entry.duration);
  if (metric === "expenses") return formatCurrency(entry.expenses ?? 0);
  return "—";
}

function metricLabel(metric: string): string {
  if (metric === "distance") return "Distance";
  if (metric === "sessions") return "Sessions";
  if (metric === "duration") return "Duration";
  if (metric === "expenses") return "Expenses";
  return metric;
}

export function LeaderboardTable({
  data,
  metric,
  highlightEmployeeId,
}: LeaderboardTableProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No leaderboard data"
        description="Leaderboard will appear here once employee metrics are computed."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 pr-3 font-medium w-10">#</th>
            <th className="pb-3 pr-4 font-medium">Employee</th>
            <th className="pb-3 pr-4 font-medium text-right text-foreground">
              {metricLabel(metric)}
            </th>
            <th className="pb-3 pr-4 font-medium text-right hidden sm:table-cell">
              {metric !== "distance" ? "Distance" : "Sessions"}
            </th>
            <th className="pb-3 font-medium text-right hidden md:table-cell">
              {metric !== "duration" ? "Duration" : "Distance"}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => {
            const isTop3 = entry.rank <= 3;
            const isHighlighted = entry.employeeId === highlightEmployeeId;
            const rowStyle = RANK_STYLES[entry.rank];

            return (
              <tr
                key={entry.employeeId}
                className={cn(
                  "border-b last:border-0 transition-colors",
                  isTop3 && rowStyle?.row,
                  isHighlighted && "ring-1 ring-inset ring-primary/40 bg-primary/5",
                  !isTop3 && !isHighlighted && "hover:bg-muted/30"
                )}
              >
                <td className="py-3 pr-3">
                  <RankBadge rank={entry.rank} />
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-muted">
                        {getInitials(entry.employeeName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {entry.employeeName}
                        {isHighlighted && (
                          <span className="ml-1.5 text-xs text-primary font-normal">(you)</span>
                        )}
                      </p>
                      {entry.employeeCode && (
                        <p className="text-xs text-muted-foreground">#{entry.employeeCode}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right font-semibold">
                  {formatMetricValue(entry, metric)}
                </td>
                <td className="py-3 pr-4 text-right text-muted-foreground hidden sm:table-cell">
                  {metric !== "distance"
                    ? formatDistance(entry.distance)
                    : entry.sessions}
                </td>
                <td className="py-3 text-right text-muted-foreground hidden md:table-cell">
                  {metric !== "duration"
                    ? formatDuration(entry.duration)
                    : formatDistance(entry.distance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
