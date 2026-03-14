"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useOrgSummary, useLeaderboard } from "@/hooks/queries/useAnalytics";
import { useMyDashboard } from "@/hooks/queries/useDashboard";
import { useMyProfile } from "@/hooks/queries/useProfile";
import { useOrgSessions } from "@/hooks/queries/useSessions";
import { useOrgExpenses } from "@/hooks/queries/useExpenses";
import { MetricCard } from "@/components/MetricCard";
import { LeaderboardTable } from "@/components/charts/LeaderboardTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmptyState } from "@/components/EmptyState";
import { StaggerList, StaggerItem, FadeUp } from "@/components/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance, formatDuration, formatCurrency, formatTime } from "@/lib/utils";
import { Activity, MapPin, Clock, Receipt, Users, Trophy, Zap, LogIn, LogOut, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import type { OrgSummaryData, DashboardSummary, EmployeeProfileData } from "@/types";
import { EmployeeIdentity } from "@/components/EmployeeIdentity";
import { cn } from "@/lib/utils";
import { todayRange } from "@/lib/dateRange";

// ─── Helper ───────────────────────────────────────────────────────────────────

function getFirstName(name: string | undefined | null, email: string | undefined | null) {
  if (name) return name.split(" ")[0];
  if (email) return email.split("@")[0];
  return "there";
}

// ─── Admin Hero Card ──────────────────────────────────────────────────────────

function AdminHeroCard({
  summary,
  isLoading,
}: {
  summary?: OrgSummaryData;
  isLoading: boolean;
}) {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const firstName = getFirstName(profile?.name, user?.email);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-violet-600 p-6 text-white shadow-lg shadow-primary/20"
    >
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute right-24 -bottom-8 h-36 w-36 rounded-full bg-white/5" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: greeting */}
        <div>
          <span className="inline-block rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold tracking-wider">
            ADMIN
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Welcome back, {firstName} 👋
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Here&apos;s what&apos;s happening with your field team.
          </p>
        </div>

        {/* Right: key stats */}
        <div className="flex shrink-0 items-center gap-6">
          {isLoading ? (
            <div className="flex gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 w-20 animate-pulse rounded-lg bg-white/10" />
              ))}
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-3xl font-extrabold tabular-nums">
                  {(summary?.activeEmployeesCount ?? 0)}
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/60">Active now</p>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div className="text-center">
                <p className="text-3xl font-extrabold tabular-nums">
                  {(summary?.totalSessions ?? 0).toLocaleString()}
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/60">Sessions today</p>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-extrabold">
                  {summary ? formatDistance(summary.totalDistanceKm) : "—"}
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/60">Distance today</p>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Org metrics grid ─────────────────────────────────────────────────────────

function OrgSummarySection({ summary, isLoading }: { summary?: OrgSummaryData; isLoading: boolean }) {
  const cards = [
    {
      title: "Sessions Today",
      value: summary?.totalSessions.toLocaleString() ?? "—",
      numericValue: summary?.totalSessions,
      icon: <Activity className="h-4 w-4" />,
    },
    {
      title: "Distance Today",
      value: summary ? formatDistance(summary.totalDistanceKm) : "—",
      icon: <MapPin className="h-4 w-4" />,
    },
    {
      title: "Duration Today",
      value: summary ? formatDuration(summary.totalDurationSeconds) : "—",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      title: "Active Now",
      value: summary?.activeEmployeesCount.toLocaleString() ?? "—",
      numericValue: summary?.activeEmployeesCount,
      icon: <Users className="h-4 w-4" />,
      highlighted: true,
    },
    {
      title: "Expenses Today",
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
            numericValue={card.numericValue}
            icon={card.icon}
            highlighted={card.highlighted}
            isLoading={isLoading}
          />
        </StaggerItem>
      ))}
    </StaggerList>
  );
}

// ─── Activity status card ─────────────────────────────────────────────────────

function ActivityStatusCard({ summary }: { summary?: OrgSummaryData }) {
  if (!summary) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center p-6 min-h-[180px]">
          <div className="w-full space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-emerald-500" />
          Live Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-5">
        {/* Active count with pulse */}
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Active employees</span>
          </div>
          <span className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
            {summary.activeEmployeesCount}
          </span>
        </div>

        {/* Expense breakdown */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total expenses</span>
            <span className="font-semibold tabular-nums">{summary.totalExpenses.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Approved</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.approvedExpenseAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Rejected</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {formatCurrency(summary.rejectedExpenseAmount)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Admin leaderboard section ────────────────────────────────────────────────

type LeaderboardMetric = "distance" | "sessions" | "duration" | "expenses";

function AdminLeaderboardSection({ from, to }: { from: string; to: string }) {
  const [metric, setMetric] = useState<LeaderboardMetric>("distance");
  const { data, isLoading, error } = useLeaderboard(metric, 10, from, to);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top Performers Today
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
          <LeaderboardTable data={data ?? []} metric={metric} isAdmin />
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

// ─── Live Activity Feed ───────────────────────────────────────────────────────

// Avatar gradient helpers (feed-local, mirrors EmployeeIdentity palette)
const FEED_PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
  "from-amber-500 to-orange-600",
  "from-teal-500 to-cyan-600",
];
function feedGradient(name: string): string {
  const s = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  return FEED_PALETTE[s % FEED_PALETTE.length];
}
function feedInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

type ActivityEventType =
  | "SESSION_CHECKIN"
  | "SESSION_CHECKOUT"
  | "EXPENSE_SUBMITTED"
  | "EXPENSE_APPROVED"
  | "EXPENSE_REJECTED";

interface ActivityFeedEntry {
  id: string;
  eventType: ActivityEventType;
  employeeId: string;
  name: string;
  action: string;
  detail?: string;
  time: string;
  ts: number;
  href: string;
}

const EVENT_CONFIG: Record<
  ActivityEventType,
  { bg: string; fg: string; dot: string; Icon: React.ElementType }
> = {
  SESSION_CHECKIN: {
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    fg: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    Icon: LogIn,
  },
  SESSION_CHECKOUT: {
    bg: "bg-blue-100 dark:bg-blue-950/40",
    fg: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    Icon: LogOut,
  },
  EXPENSE_SUBMITTED: {
    bg: "bg-orange-100 dark:bg-orange-950/40",
    fg: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
    Icon: Receipt,
  },
  EXPENSE_APPROVED: {
    bg: "bg-emerald-100 dark:bg-emerald-950/40",
    fg: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    Icon: CheckCircle2,
  },
  EXPENSE_REJECTED: {
    bg: "bg-rose-100 dark:bg-rose-950/40",
    fg: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    Icon: XCircle,
  },
};

function ActivityFeedItem({
  entry,
  index,
}: {
  entry: ActivityFeedEntry;
  index: number;
}) {
  const cfg = EVENT_CONFIG[entry.eventType];
  const { Icon } = cfg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
    >
      <Link
        href={entry.href}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent/60 active:bg-accent/80 transition-colors group"
      >
        {/* Avatar + event-type badge */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              "bg-gradient-to-br text-white text-xs font-bold shadow-sm",
              feedGradient(entry.name)
            )}
          >
            {feedInitials(entry.name)}
          </div>
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
              cfg.bg
            )}
          >
            <Icon className={cn("h-2.5 w-2.5", cfg.fg)} />
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-snug">
            <span className="font-semibold group-hover:text-primary transition-colors">
              {entry.name}
            </span>{" "}
            <span className="text-muted-foreground">{entry.action}</span>
            {entry.detail && (
              <span className="font-medium text-foreground"> · {entry.detail}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">{entry.time}</p>
        </div>

        {/* Event type dot */}
        <div className={cn("h-2 w-2 shrink-0 rounded-full opacity-70", cfg.dot)} />
      </Link>
    </motion.div>
  );
}

function TodayActivityFeed() {
  const queryClient = useQueryClient();
  const sessions = useOrgSessions(1, 50);
  const expenses = useOrgExpenses(1, 50);

  // Auto-refresh every 30 s so the feed stays live without a page reload
  useEffect(() => {
    const id = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["orgSessions"] });
      void queryClient.invalidateQueries({ queryKey: ["orgExpenses"] });
    }, 30_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const feed = useMemo<ActivityFeedEntry[]>(() => {
    const entries: ActivityFeedEntry[] = [];

    for (const s of sessions.data?.data ?? []) {
      const name = s.employee_name ?? "Unknown";

      // Session check-in
      const checkinTs = new Date(s.checkin_at);
      if (checkinTs >= today) {
        entries.push({
          id: `checkin-${s.id}`,
          eventType: "SESSION_CHECKIN",
          employeeId: s.employee_id,
          name,
          action: "checked in",
          time: formatTime(s.checkin_at),
          ts: checkinTs.getTime(),
          href: "/admin/sessions",
        });
      }

      // Session check-out
      if (s.checkout_at) {
        const checkoutTs = new Date(s.checkout_at);
        if (checkoutTs >= today) {
          entries.push({
            id: `checkout-${s.id}`,
            eventType: "SESSION_CHECKOUT",
            employeeId: s.employee_id,
            name,
            action: "completed session",
            detail:
              s.total_duration_seconds != null
                ? formatDuration(s.total_duration_seconds)
                : undefined,
            time: formatTime(s.checkout_at),
            ts: checkoutTs.getTime(),
            href: "/admin/sessions",
          });
        }
      }
    }

    for (const e of expenses.data?.data ?? []) {
      const name = e.employee_name ?? "Unknown";

      // Expense submitted
      const submittedTs = new Date(e.submitted_at);
      if (submittedTs >= today) {
        entries.push({
          id: `expense-sub-${e.id}`,
          eventType: "EXPENSE_SUBMITTED",
          employeeId: e.employee_id,
          name,
          action: "submitted expense",
          detail: formatCurrency(e.amount),
          time: formatTime(e.submitted_at),
          ts: submittedTs.getTime(),
          href: "/admin/expenses",
        });
      }

      // Expense reviewed (approved / rejected)
      if (e.reviewed_at && (e.status === "APPROVED" || e.status === "REJECTED")) {
        const reviewedTs = new Date(e.reviewed_at);
        if (reviewedTs >= today) {
          entries.push({
            id: `expense-review-${e.id}`,
            eventType:
              e.status === "APPROVED" ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
            employeeId: e.employee_id,
            name,
            action:
              e.status === "APPROVED" ? "expense approved" : "expense rejected",
            detail: formatCurrency(e.amount),
            time: formatTime(e.reviewed_at),
            ts: reviewedTs.getTime(),
            href: "/admin/expenses",
          });
        }
      }
    }

    return entries.sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [sessions.data, expenses.data, today]);

  const isLoading = sessions.isLoading && expenses.isLoading;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Today&apos;s Activity
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto px-3 pb-2">
        {isLoading ? (
          <div className="space-y-1 pt-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded bg-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              No activity yet today
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Field events appear here as employees check in.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <div className="space-y-0.5 pt-1">
              {feed.map((entry, idx) => (
                <ActivityFeedItem key={entry.id} entry={entry} index={idx} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </CardContent>

      {!isLoading && feed.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/40 px-4 pb-3 pt-2">
          <span className="text-xs text-muted-foreground">
            {feed.length} event{feed.length !== 1 ? "s" : ""} today
          </span>
          <Link
            href="/admin/sessions"
            className="text-xs text-primary hover:underline"
          >
            All sessions →
          </Link>
        </div>
      )}
    </Card>
  );
}

// ─── Team Activity Widget ─────────────────────────────────────────────────────

function TeamActivityWidget({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useLeaderboard("sessions", 7, from, to);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-primary" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-2.5 w-14 rounded bg-muted" />
                </div>
                <div className="h-3 w-10 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {(data ?? []).map((entry, idx) => (
              <div
                key={entry.employeeId}
                className="flex items-center justify-between gap-2 rounded-lg hover:bg-accent/50 transition-colors px-1 py-0.5"
              >
                <EmployeeIdentity
                  employeeId={entry.employeeId}
                  name={entry.employeeName}
                  employeeCode={entry.employeeCode}
                  isAdmin
                  showTooltip={false}
                  size="sm"
                />
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {entry.sessions}s
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { from, to } = useMemo(() => todayRange(), []);
  const summary = useOrgSummary(from, to);

  return (
    <div className="space-y-5">
      {summary.error && <ErrorBanner error={summary.error} />}

      {/* Hero banner */}
      <AdminHeroCard summary={summary.data} isLoading={summary.isLoading} />

      {/* Today's metrics row */}
      <OrgSummarySection summary={summary.data} isLoading={summary.isLoading} />

      {/* Today's activity feed + Live status */}
      <FadeUp delay={0.15}>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TodayActivityFeed />
          </div>
          <div className="flex flex-col gap-5">
            <ActivityStatusCard summary={summary.data} />
            <TeamActivityWidget from={from} to={to} />
          </div>
        </div>
      </FadeUp>

      {/* Today's leaderboard */}
      <FadeUp delay={0.25}>
        <AdminLeaderboardSection from={from} to={to} />
      </FadeUp>
    </div>
  );
}

// ─── Employee Hero Card ───────────────────────────────────────────────────────

function EmployeeHeroCard({
  profile,
  dashboard,
  rank,
  isLoading,
}: {
  profile?: EmployeeProfileData;
  dashboard?: DashboardSummary;
  rank?: number;
  isLoading: boolean;
}) {
  const initials = profile?.name
    ? profile.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";

  const statusLabel =
    profile?.activityStatus === "ACTIVE"
      ? "Active"
      : profile?.activityStatus === "RECENT"
      ? "Recently Active"
      : "Inactive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-cyan-500 p-6 text-white shadow-lg shadow-primary/20"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold shadow-inner">
            {isLoading ? "…" : initials}
          </div>
          <div>
            <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider">
              EMPLOYEE
            </span>
            <h2 className="mt-1 text-xl font-bold leading-tight">
              {isLoading ? (
                <span className="inline-block h-5 w-32 animate-pulse rounded bg-white/20" />
              ) : (
                profile?.name ?? "—"
              )}
            </h2>
            {/* Inline status indicator */}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {profile?.activityStatus === "ACTIVE" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white/70" />
              </span>
              <span className="text-xs text-white/80">{statusLabel}</span>
            </div>
          </div>
        </div>

        {/* Rank badge */}
        {rank != null && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 backdrop-blur">
            <Trophy className="h-5 w-5 text-amber-300" />
            <div>
              <p className="text-[10px] text-white/60 font-medium">Distance Rank</p>
              <p className="text-2xl font-extrabold leading-none">#{rank}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
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
          numericValue: dashboard.sessionsThisWeek,
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
          numericValue: dashboard.expensesSubmitted,
          icon: <Receipt className="h-4 w-4" />,
        },
        {
          title: "Expenses Approved",
          value: dashboard.expensesApproved.toLocaleString(),
          numericValue: dashboard.expensesApproved,
          icon: <Receipt className="h-4 w-4" />,
          highlighted: true,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Hero card */}
      <EmployeeHeroCard
        profile={profile}
        dashboard={dashboard}
        rank={myRank}
        isLoading={isLoading}
      />

      {/* Weekly stats */}
      <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <StaggerItem key={s.title}>
            <MetricCard
              title={s.title}
              value={s.value}
              numericValue={s.numericValue}
              icon={s.icon}
              highlighted={s.highlighted}
              isLoading={isLoading}
            />
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Leaderboard preview */}
      <FadeUp delay={0.2}>
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
      </FadeUp>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { permissions } = useAuth();
  return permissions.viewAnalytics ? <AdminDashboard /> : <EmployeeDashboard />;
}

