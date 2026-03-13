"use client";

import { EmployeeProfileData } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { ActivityBadge } from "@/components/ActivityBadge";
import { formatDistance, formatDuration, formatDate } from "@/lib/utils";
import { User, Phone, Hash, Activity, MapPin, Clock, Receipt, CheckCircle, Calendar } from "lucide-react";

interface ProfileViewProps {
  profile: EmployeeProfileData;
  /** When provided, shows the user's leaderboard rank */
  rank?: number;
}

export function ProfileView({ profile, rank }: ProfileViewProps) {
  return (
    <div className="space-y-6">
      {/* Identity Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold">
              {profile.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </div>

            {/* Details grid */}
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Full Name</p>
                <p className="font-medium">{profile.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Employee Code</p>
                <p className="font-medium flex items-center gap-1">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  {profile.employee_code ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {profile.phone ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account Status</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    profile.is_active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {profile.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Activity Status</p>
                <ActivityBadge status={profile.activityStatus} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member Since</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {formatDate(profile.created_at)}
                </p>
              </div>
              {profile.last_activity_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Last Active</p>
                  <p className="font-medium">{formatDate(profile.last_activity_at)}</p>
                </div>
              )}
              {rank != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Leaderboard Rank</p>
                  <p className="font-bold text-primary text-lg">#{rank}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Performance
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Total Sessions"
            value={profile.stats.totalSessions.toLocaleString()}
            icon={<Activity className="h-4 w-4" />}
          />
          <MetricCard
            title="Total Distance"
            value={formatDistance(profile.stats.totalDistanceKm)}
            icon={<MapPin className="h-4 w-4" />}
          />
          <MetricCard
            title="Total Duration"
            value={formatDuration(profile.stats.totalDurationSeconds)}
            icon={<Clock className="h-4 w-4" />}
          />
          <MetricCard
            title="Expenses Submitted"
            value={profile.stats.expensesSubmitted.toLocaleString()}
            icon={<Receipt className="h-4 w-4" />}
          />
          <MetricCard
            title="Expenses Approved"
            value={profile.stats.expensesApproved.toLocaleString()}
            icon={<CheckCircle className="h-4 w-4" />}
          />
        </div>
      </div>
    </div>
  );
}
