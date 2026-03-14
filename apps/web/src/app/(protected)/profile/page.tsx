"use client";

import { useMyProfile } from "@/hooks/queries/useProfile";
import { useLeaderboard } from "@/hooks/queries/useAnalytics";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileView } from "@/components/ProfileView";
import { PageTransition } from "@/components/motion";

export default function MyProfilePage() {
  const { data: profile, isLoading: profileLoading, error } = useMyProfile();
  const { data: leaderboard } = useLeaderboard("distance", 50);

  const myRank = profile && leaderboard
    ? leaderboard.find((e) => e.employeeId === profile.id)?.rank
    : undefined;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Profile</h2>
          <p className="text-muted-foreground text-sm">
            Your identity, activity status, and performance metrics.
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
          <ProfileView profile={profile} rank={myRank} />
        ) : null}
      </div>
    </PageTransition>
  );
}

