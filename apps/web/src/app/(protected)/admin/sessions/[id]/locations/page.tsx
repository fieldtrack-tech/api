"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSessionLocations } from "@/hooks/queries/useSessionLocations";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin } from "lucide-react";
import { formatDate } from "@/lib/utils";

function formatCoord(n: number, decimals = 6) {
  return n.toFixed(decimals);
}

export default function SessionLocationsPage() {
  const { permissions } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params.id ?? null;

  useEffect(() => {
    if (!permissions.viewAnalytics) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const { data: locations, isLoading, error } = useSessionLocations(sessionId);

  if (!permissions.viewAnalytics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Session Route</h2>
          <p className="text-muted-foreground text-sm font-mono truncate max-w-xs">
            {sessionId}
          </p>
        </div>
      </div>

      {error && <ErrorBanner error={error as Error} />}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              GPS Points
            </CardTitle>
            {!isLoading && locations && (
              <Badge variant="outline">{locations.length} point{locations.length !== 1 ? "s" : ""}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading route…</div>
          ) : !locations || locations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No GPS points recorded for this session.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-3 px-4">#</th>
                    <th className="text-left py-3 px-4">Recorded At</th>
                    <th className="text-left py-3 px-4">Latitude</th>
                    <th className="text-left py-3 px-4">Longitude</th>
                    <th className="text-left py-3 px-4">Accuracy (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc, idx) => (
                    <tr key={loc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4 text-muted-foreground font-mono text-xs">
                        {loc.sequence_number ?? idx + 1}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs whitespace-nowrap">
                        {formatDate(loc.recorded_at)}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">
                        {formatCoord(loc.latitude)}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">
                        {formatCoord(loc.longitude)}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">
                        {loc.accuracy !== null ? loc.accuracy.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
