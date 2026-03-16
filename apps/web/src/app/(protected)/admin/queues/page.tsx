"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdminQueues, type QueueStats } from "@/hooks/queries/useQueues";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium">{value.toLocaleString()}</span>
    </div>
  );
}

function QueueCard({ name, stats }: { name: string; stats: QueueStats }) {
  const hasBacklog = stats.waiting > 100 || stats.failed > 5;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base capitalize">{name} Queue</CardTitle>
          <Badge variant={hasBacklog ? "destructive" : "default"}>
            {hasBacklog ? "Attention" : "Healthy"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <StatRow label="Waiting" value={stats.waiting} />
        <StatRow label="Active" value={stats.active} />
        <StatRow label="Completed" value={stats.completed} />
        <StatRow label="Failed" value={stats.failed} />
        {stats.dlq !== undefined && <StatRow label="Dead-letter (DLQ)" value={stats.dlq} />}
      </CardContent>
    </Card>
  );
}

export default function AdminQueuesPage() {
  const { permissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!permissions.viewAnalytics) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const { data, isLoading, error } = useAdminQueues();

  if (!permissions.viewAnalytics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Queue Monitor</h2>
          <p className="text-muted-foreground text-sm">
            BullMQ — refreshes every 30 s
          </p>
        </div>
      </div>

      {error && <ErrorBanner error={error as Error} />}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading queue stats…</p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <QueueCard name="analytics" stats={data.queues.analytics} />
          <QueueCard name="distance" stats={data.queues.distance} />
        </div>
      ) : null}
    </div>
  );
}
