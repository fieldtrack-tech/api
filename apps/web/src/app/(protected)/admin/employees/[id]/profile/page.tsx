"use client";

import { useParams } from "next/navigation";
import { useEmployeeProfile } from "@/hooks/queries/useProfile";
import { useLeaderboard } from "@/hooks/queries/useAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileView } from "@/components/ProfileView";
import { redirect } from "next/navigation";

export default function AdminEmployeeProfilePage() {
  const { permissions } = useAuth();
  const params = useParams();
  const employeeId = params.id as string;

  if (!permissions.viewAnalytics) {
    redirect("/profile");
  }

  const { data: profile, isLoading: profileLoading, error } = useEmployeeProfile(employeeId);
  const { data: leaderboard } = useLeaderboard("distance", 50);

  const employeeRank = profile && leaderboard
    ? leaderboard.find((e) => e.employeeId === profile.id)?.rank
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Employee Profile</h2>
        <p className="text-muted-foreground text-sm">
          Employee identity, performance, and activity status.
        </p>
      </div>

      {profileLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorBanner error={error} />
      ) : profile ? (
        <ProfileView profile={profile} rank={employeeRank} />
      ) : null}
    </div>
  );
}

