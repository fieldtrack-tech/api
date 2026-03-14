"use client";

import { motion } from "framer-motion";
import { LeaderboardEntry } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { Trophy } from "lucide-react";
import { formatDistance, formatDuration, formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  metric: string;
  /** If provided, this employee's row is highlighted */
  highlightEmployeeId?: string;
}

// Top-3 row tints — subtle overlay that works in both themes
const TOP3_TINTS: Record<number, string> = {
  1: "bg-amber-400/[0.07] dark:bg-amber-300/[0.07]",
  2: "bg-slate-400/[0.06] dark:bg-slate-300/[0.06]",
  3: "bg-orange-400/[0.06] dark:bg-orange-300/[0.06]",
};

// Avatar gradient per slot — top-3 get special golds, rest cycle through a palette
const AVATAR_GRADIENTS = [
  "from-amber-400 to-orange-500",   // rank 1
  "from-slate-400 to-slate-500",    // rank 2
  "from-amber-600 to-orange-700",   // rank 3
];
const PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
];

function avatarGradient(rank: number, name: string): string {
  if (rank <= 3) return AVATAR_GRADIENTS[rank - 1];
  return PALETTE[name.charCodeAt(0) % PALETTE.length];
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0] ?? "").join("").toUpperCase();
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl leading-none select-none">🥇</span>;
  if (rank === 2) return <span className="text-2xl leading-none select-none">🥈</span>;
  if (rank === 3) return <span className="text-2xl leading-none select-none">🥉</span>;
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] dark:bg-white/[0.06] bg-slate-100 text-xs font-semibold text-muted-foreground ring-1 ring-border/40">
      {rank}
    </span>
  );
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

export function LeaderboardTable({ data, metric, highlightEmployeeId }: LeaderboardTableProps) {
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
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground bg-muted/30">
            <th className="px-4 py-3 font-medium w-14">#</th>
            <th className="px-4 py-3 font-medium">Employee</th>
            <th className="px-4 py-3 font-medium text-right text-foreground">
              {metricLabel(metric)}
            </th>
            <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">
              {metric !== "distance" ? "Distance" : "Sessions"}
            </th>
            <th className="px-4 py-3 font-medium text-right hidden md:table-cell">
              {metric !== "duration" ? "Duration" : "Distance"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {data.map((entry, idx) => {
            const isTop3 = entry.rank <= 3;
            const isHighlighted = entry.employeeId === highlightEmployeeId;

            return (
              <motion.tr
                key={entry.employeeId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: "easeOut" }}
                className={cn(
                  "transition-all duration-200 cursor-default",
                  "hover:bg-muted/60 dark:hover:bg-slate-800/70",
                  isTop3 && TOP3_TINTS[entry.rank],
                  isHighlighted && "ring-1 ring-inset ring-primary/40 bg-primary/[0.05] dark:bg-primary/[0.08]"
                )}
              >
                {/* Rank */}
                <td className="px-4 py-3.5 w-14">
                  <div className="flex items-center justify-center">
                    <RankBadge rank={entry.rank} />
                  </div>
                </td>

                {/* Employee identity */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        "bg-gradient-to-br text-white text-xs font-bold shadow-sm",
                        avatarGradient(entry.rank, entry.employeeName)
                      )}
                    >
                      {getInitials(entry.employeeName)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate leading-snug">
                        {entry.employeeName}
                        {isHighlighted && (
                          <span className="ml-1.5 text-xs text-primary font-normal">(you)</span>
                        )}
                      </p>
                      {entry.employeeCode && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono tracking-wide">
                          #{entry.employeeCode}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Primary metric */}
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                  {formatMetricValue(entry, metric)}
                </td>

                {/* Secondary metric */}
                <td className="px-4 py-3.5 text-right text-muted-foreground hidden sm:table-cell tabular-nums">
                  {metric !== "distance" ? formatDistance(entry.distance) : entry.sessions}
                </td>

                {/* Tertiary metric */}
                <td className="px-4 py-3.5 text-right text-muted-foreground hidden md:table-cell tabular-nums">
                  {metric !== "duration" ? formatDuration(entry.duration) : formatDistance(entry.distance)}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
