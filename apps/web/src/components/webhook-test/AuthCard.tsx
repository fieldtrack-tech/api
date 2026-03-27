"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, LogIn, LogOut, XCircle } from "lucide-react";

export function AuthCard() {
  const { user, role, isLoading, session, login, logout } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const isAuthenticated = !!session;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    try {
      await login(email, password);
      setEmail("");
      setPassword("");
      toast({ title: "Signed in successfully" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    setIsBusy(true);
    try {
      await logout();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔐 Authentication
        </CardTitle>
        <CardDescription>Current session and sign-in controls</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status row */}
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          {isLoading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : isAuthenticated ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className="text-sm font-medium">
            {isLoading
              ? "Loading session…"
              : isAuthenticated
              ? "Authenticated"
              : "Not signed in"}
          </span>
          {role && (
            <Badge
              variant={role === "ADMIN" ? "default" : "secondary"}
              className="ml-auto"
            >
              {role}
            </Badge>
          )}
        </div>

        {/* Signed-in user info */}
        {isAuthenticated && user && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Signed in as </span>
            <span className="font-medium">{user.email}</span>
          </div>
        )}

        {/* Login form */}
        {!isAuthenticated && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="wt-email">Email</Label>
              <Input
                id="wt-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wt-password">Password</Label>
              <Input
                id="wt-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isBusy || isLoading}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {isBusy ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        )}

        {/* Logout */}
        {isAuthenticated && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleLogout}
            disabled={isBusy}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isBusy ? "Signing out…" : "Sign Out"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
