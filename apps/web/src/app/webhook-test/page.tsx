"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Badge } from "@/components/ui/badge";
import { AuthCard } from "@/components/webhook-test/AuthCard";
import { WebhookSetupCard } from "@/components/webhook-test/WebhookSetupCard";
import { TriggerEventCard } from "@/components/webhook-test/TriggerEventCard";
import { DeliveryPanel } from "@/components/webhook-test/DeliveryPanel";

/**
 * /webhook-test — Admin-only internal webhook debugging tool.
 *
 * Access control:
 *   - Unauthenticated → redirected to /login by middleware
 *   - Authenticated non-ADMIN → redirected to /dashboard by this page
 *   - ADMIN → tool rendered
 *
 * This route is intentionally NOT listed in the sidebar navigation.
 */
export default function WebhookTestPage() {
  const { session, role, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for session to resolve before acting
    if (isLoading) return;

    // Unauthenticated (middleware should catch this first, but handle defensively)
    if (!session) {
      router.replace("/login?next=/webhook-test");
      return;
    }

    // Authenticated but insufficient role
    if (role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [session, isLoading, role, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-4xl p-8">
          <LoadingSkeleton variant="card" />
        </div>
      </div>
    );
  }

  // Not yet redirected (race), render nothing to avoid flash
  if (!session || role !== "ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Webhook Test Tool
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Internal debugging tool — not visible in production UI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="font-mono">
              ADMIN ONLY
            </Badge>
            <Badge variant="outline" className="font-mono text-muted-foreground">
              /webhook-test
            </Badge>
          </div>
        </div>

        {/* ── Row 1: Auth + Webhook Setup ────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AuthCard />
          <WebhookSetupCard />
        </div>

        {/* ── Row 2: Trigger Event ────────────────────────────────────── */}
        <TriggerEventCard />

        {/* ── Row 3: Delivery Debug Panel ─────────────────────────────── */}
        <DeliveryPanel />
      </div>
    </div>
  );
}
