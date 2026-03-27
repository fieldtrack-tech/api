"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  getWebhookDeliveries,
  retryWebhookDelivery,
  type DeliveryStatus,
  type WebhookDelivery,
} from "@/lib/webhook-api";

const AUTO_REFRESH_INTERVAL_MS = 8_000;

function StatusBadge({ status }: { status: DeliveryStatus }) {
  if (status === "success") {
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        success
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      pending
    </Badge>
  );
}

function DeliveryRow({
  delivery,
  onRetry,
}: {
  delivery: WebhookDelivery;
  onRetry: (id: string) => Promise<void>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry(delivery.id);
    } finally {
      setIsRetrying(false);
    }
  }

  const rowClass =
    delivery.status === "failed"
      ? "bg-red-50/50 dark:bg-red-950/20"
      : undefined;

  return (
    <TableRow className={rowClass}>
      <TableCell className="font-mono text-xs break-all max-w-[8rem] truncate" title={delivery.id}>
        {delivery.id.slice(0, 8)}…
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">
          {delivery.event_type}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={delivery.status} />
      </TableCell>
      <TableCell className="text-center font-mono text-sm">
        {delivery.response_status ?? "—"}
      </TableCell>
      <TableCell className="text-center text-sm">
        {delivery.attempt_count}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {new Date(delivery.created_at).toLocaleString()}
      </TableCell>
      <TableCell>
        {delivery.status === "failed" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 h-7 text-xs"
            onClick={handleRetry}
            disabled={isRetrying}
            title="Retry this delivery"
          >
            <RotateCcw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Retrying…" : "Retry"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function DeliveryPanel() {
  const { toast } = useToast();

  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDeliveries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getWebhookDeliveries();
      // Sort newest first
      setDeliveries(
        [...data].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
      setLastRefreshed(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load deliveries";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    void fetchDeliveries();

    intervalRef.current = setInterval(() => {
      void fetchDeliveries();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDeliveries]);

  async function handleRetry(id: string) {
    try {
      await retryWebhookDelivery(id);
      toast({ title: "Retry queued", description: `Delivery ${id.slice(0, 8)}…` });
      void fetchDeliveries();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Retry failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function handleClear() {
    setDeliveries([]);
    setLastRefreshed(null);
    setError(null);
  }

  const failedCount = deliveries.filter((d) => d.status === "failed").length;
  const successCount = deliveries.filter((d) => d.status === "success").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              📊 Webhook Deliveries
            </CardTitle>
            <CardDescription>
              Live debug panel — auto-refreshes every{" "}
              {AUTO_REFRESH_INTERVAL_MS / 1000}s
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => void fetchDeliveries()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={handleClear}
              disabled={deliveries.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {/* Summary badges */}
        {deliveries.length > 0 && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge variant="outline">{deliveries.length} total</Badge>
            {successCount > 0 && (
              <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">
                {successCount} success
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="destructive">{failedCount} failed</Badge>
            )}
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground ml-auto">
                Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isLoading && deliveries.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <p className="text-sm">No deliveries yet.</p>
            <p className="text-xs mt-1">
              Create a webhook and trigger an event to see deliveries here.
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center w-24">HTTP</TableHead>
                  <TableHead className="text-center w-20">Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <DeliveryRow
                    key={delivery.id}
                    delivery={delivery}
                    onRetry={handleRetry}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
