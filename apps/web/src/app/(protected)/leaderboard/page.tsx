"use client";

import { useState } from "react";
import { useLeaderboard } from "@/hooks/queries/useAnalytics";
import { useMyProfile } from "@/hooks/queries/useProfile";
import { LeaderboardTable } from "@/components/charts/LeaderboardTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

type Metric = "distance" | "sessions" | "duration" | "expenses";

const METRIC_LABELS: Record<Metric, string> = {
  distance: "Distance",
  sessions: "Sessions",
  duration: "Duration",
  expenses: "Expenses",
};

const METRIC_DESCRIPTIONS: Record<Metric, string> = {
  distance: "Total kilometres covered across all sessions",
  sessions: "Total number of field sessions completed",
  duration: "Total time spent in the field",
  expenses: "Total approved expense amount submitted",
};

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<Metric>("distance");
  const { data, isLoading, error } = useLeaderboard(metric, 50);
  const { data: profile } = useMyProfile();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          Leaderboard
        </h2>
        <p className="text-sm text-muted-foreground">{METRIC_DESCRIPTIONS[metric]}</p>
      </div>

      {/* Top 3 podium (visual if we have data) */}
      {!isLoading && !error && data && data.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {/* 2nd place */}
          <div className="flex flex-col items-center justify-end gap-2 rounded-xl border bg-slate-50 p-4 pt-6">
            <div className="text-3xl">🥈</div>
            <p className="text-center text-sm font-semibold leading-tight">{data[1].employeeName}</p>
            <p className="text-xs text-muted-foreground">#{data[1].employeeCode ?? "—"}</p>
            <div className="mt-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
              #2
            </div>
          </div>
          {/* 1st place — elevated */}
          <div className="flex flex-col items-center justify-end gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 pt-8 shadow-sm">
            <div className="text-4xl">🥇</div>
            <p className="text-center text-sm font-bold leading-tight">{data[0].employeeName}</p>
            <p className="text-xs text-muted-foreground">#{data[0].employeeCode ?? "—"}</p>
            <div className="mt-1 rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-800">
              #1
            </div>
          </div>
          {/* 3rd place */}
          <div className="flex flex-col items-center justify-end gap-2 rounded-xl border bg-orange-50 p-4 pt-6">
            <div className="text-3xl">🥉</div>
            <p className="text-center text-sm font-semibold leading-tight">{data[2].employeeName}</p>
            <p className="text-xs text-muted-foreground">#{data[2].employeeCode ?? "—"}</p>
            <div className="mt-1 rounded-full bg-orange-200 px-2 py-0.5 text-xs font-bold text-orange-700">
              #3
            </div>
          </div>
        </div>
      )}

      {/* Full table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Rankings</CardTitle>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                <TabsTrigger key={m} value={m} className="text-xs">
                  {METRIC_LABELS[m]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {error && <ErrorBanner error={error} />}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <LeaderboardTable
              data={data ?? []}
              metric={metric}
              highlightEmployeeId={profile?.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
