"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const userRole = await login(email, password);
      const next = searchParams.get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        router.push(next);
      } else if (userRole === "ADMIN") {
        router.push("/dashboard");
      } else {
        router.push("/sessions");
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Login failed"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + wordmark */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-brand">
            <svg viewBox="0 0 28 28" fill="none" className="h-7 w-7">
              <path d="M6 5h16v3H9v4.5H20v3H9v8H6V5z" fill="white" fillOpacity="0.95" />
            </svg>
            <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1A4FD0] ring-2 ring-background">
              <MapPin className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-foreground">FieldTrack</h1>
            <p className="mt-1 text-sm text-muted-foreground">Field workforce tracking &amp; management</p>
          </div>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-md p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-foreground">Sign in to your account</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Enter your credentials to continue</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {error && <ErrorBanner error={error} />}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 mt-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
          FieldTrack 2.0 — Secure field workforce management
        </p>
      </div>
    </div>
  );
}
