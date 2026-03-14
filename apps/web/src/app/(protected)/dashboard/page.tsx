"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOrgSummary, useSessionTrend, useLeaderboard } from "@/hooks/queries/useAnalytics";
import { useMyDashboard } from "@/hooks/queries/useDashboard";
import { useMyProfile } from "@/hooks/queries/useProfile";
import { MetricCard } from "@/components/MetricCard";
import { ActivityBadge } from "@/components/ActivityBadge";
import { SessionTrendChart } from "@/components/charts/SessionTrendChart";
import { LeaderboardTable } from "@/components/charts/LeaderboardTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StaggerList, StaggerItem, FadeUp } from "@/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance, formatDuration, formatCurrency } from "@/lib/utils";
import { Activity, MapPin, Clock, Receipt, Users, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import type { OrgSummaryData } from "@/types";

// ─── Admin dashboard ───────────────────────────────────────────────────────────

function OrgSummarySection({ summary, isLoading }: { summary?: OrgSummaryData; isLoading: boolean }) {
  const cards = [
    {
      title: "Total Sessions",
      value: summary?.totalSessions.toLocaleString() ?? "—",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      title: "Total Distance",
      value: summary ? formatDistance(summary.totalDistanceKm) : "—",
      icon: <MapPin className="h-4 w-4" />,
    },
    {
      title: "Total Duration",
      value: summary ? formatDuration(summary.totalDurationSeconds) : "—",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      title: "Active Employees",
      value: summary?.activeEmployeesCount.toLocaleString() ?? "—",
      icon: <Users className="h-4 w-4" />,
      highlighted: true,
    },
    {
      title: "Approved Expenses",
      value: summary ? formatCurrency(summary.approvedExpenseAmount) : "—",
      icon: <Receipt className="h-4 w-4" />,
    },
  ];

  return (
    <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <StaggerItem key={card.title}>
          <MetricCard
            title={card.title}
            value={card.value}
            icon={card.icon}
            highlighted={card.highlighted}
            isLoading={isLoading}
          />
        </StaggerItem>
      ))}
    </StaggerList>
  );
}

type LeaderboardMetric = "distance" | "sessions" | "duration" | "expenses";

function AdminLeaderboardSection() {
  const [metric, setMetric] = useState<LeaderboardMetric>("distance");
  const { data, isLoading, error } = useLeaderboard(metric, 10);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Employee Leaderboard
        </CardTitle>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as LeaderboardMetric)}>
          <TabsList className="h-8">
            <TabsTrigger value="distance" className="text-xs px-2">Distance</TabsTrigger>
            <TabsTrigger value="sessions" className="text-xs px-2">Sessions</TabsTrigger>
            <TabsTrigger value="duration" className="text-xs px-2">Duration</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs px-2">Expenses</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner error={error} />}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <LeaderboardTable data={data ?? []} metric={metric} />
        )}
        <div className="mt-4 text-right">
          <Link href="/leaderboard" className="text-xs text-primary hover:underline">
            View full leaderboard →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivitySnapshotSection({ summary }: { summary?: OrgSummaryData }) {
  if (!summary) return null;

  const total = summary.activeEmployeesCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Activity Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <ActivityBadge status="ACTIVE" />
          <span className="font-semibold tabular-nums">{total}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Employees active in the past 24 hours.
        </p>
        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
          Total expenses: {summary.totalExpenses.toLocaleString()} &bull; Approved:{" "}
          {formatCurrency(summary.approvedExpenseAmount)}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const summary = useOrgSummary();
  const sessionTrend = useSessionTrend();

  return (
    <div className="space-y-6">
      {summary.error && <ErrorBanner error={summary.error} />}

      {/* Org summary cards */}
      <OrgSummarySection summary={summary.data} isLoading={summary.isLoading} />

      {/* Session trend chart */}
      <FadeUp delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Session Trend
            </CardTitle>
          </CardHeader>
        <CardContent>
          {sessionTrend.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : sessionTrend.error ? (
            <ErrorBanner error={sessionTrend.error} />
          ) : (
            <SessionTrendChart data={sessionTrend.data ?? []} />
          )}
        </CardContent>
      </Card>
      </FadeUp>

      {/* Leaderboard + Activity snapshot */}
      <FadeUp delay={0.25}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AdminLeaderboardSection />
          </div>
          <div>
            <ActivitySnapshotSection summary={summary.data} />
          </div>
        </div>
      </FadeUp>
    </div>
  );
}

// ─── Employee dashboard ────────────────────────────────────────────────────────

function EmployeeDashboard() {
  const { data: dashboard, isLoading: dashLoading, error: dashError } = useMyDashboard();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard("distance", 10);

  const myRank = profile
    ? leaderboard?.find((e) => e.employeeId === profile.id)?.rank
    : undefined;

  const isLoading = dashLoading || profileLoading;

  if (dashError) return <ErrorBanner error={dashError} />;

  const stats = dashboard
    ? [
        {
          title: "Sessions This Week",
          value: dashboard.sessionsThisWeek.toLocaleString(),
          icon: <Activity className="h-4 w-4" />,
        },
        {
          title: "Distance This Week",
          value: formatDistance(dashboard.distanceThisWeek),
          icon: <MapPin className="h-4 w-4" />,
        },
        {
          title: "Hours Worked",
          value: `${dashboard.hoursThisWeek.toFixed(1)} hrs`,
          icon: <Clock className="h-4 w-4" />,
        },
        {
          title: "Expenses Submitted",
          value: dashboard.expensesSubmitted.toLocaleString(),
          icon: <Receipt className="h-4 w-4" />,
        },
        {
          title: "Expenses Approved",
          value: dashboard.expensesApproved.toLocaleString(),
          icon: <Receipt className="h-4 w-4" />,
          highlighted: true,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Greeting + rank */}
      {profile && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-muted-foreground text-sm">
              Welcome back, <span className="font-semibold text-foreground">{profile.name}</span>
            </p>
            <div className="mt-1 flex items-center gap-2">
              <ActivityBadge status={profile.activityStatus} />
            </div>
          </div>
          {myRank != null && (
            <div className="flex items-center gap-2 rounded-xl border bg-amber-50 px-4 py-2 text-amber-700">
              <Trophy className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-amber-600">Your Rank</p>
                <p className="text-xl font-bold leading-none">#{myRank}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekly stats */}
      <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <StaggerItem key={s.title}>
            <MetricCard
              title={s.title}
              value={s.value}
              icon={s.icon}
              highlighted={s.highlighted}
              isLoading={isLoading}
            />
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Leaderboard preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-500" />
            Distance Leaderboard
          </CardTitle>
          <Link href="/leaderboard" className="text-xs text-primary hover:underline">
            Full leaderboard →
          </Link>
        </CardHeader>
        <CardContent>
          {lbLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <LeaderboardTable
              data={(leaderboard ?? []).slice(0, 5)}
              metric="distance"
              highlightEmployeeId={profile?.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { permissions } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          {permissions.viewAnalytics
            ? "Organization overview and key metrics."
            : "Your personal activity summary for the week."}
        </p>
      </div>

      {permissions.viewAnalytics ? <AdminDashboard /> : <EmployeeDashboard />}
    </div>
  );
}
