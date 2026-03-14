"use client";

import { useMemo } from "react";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/queries/useProfile";
import { useOrgSummary } from "@/hooks/queries/useAnalytics";
import { SidebarNav } from "@/components/layout/Sidebar";
import { formatDistance } from "@/lib/utils";
import { cn } from "@/lib/utils";

function useTodayString() {
  return useMemo(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString("en-IN", { weekday: "long" });
    const date = now.toLocaleDateString("en-IN", { month: "long", day: "numeric" });
    return `${weekday} • ${date}`;
  }, []);
}

function getFirstName(fullName: string | undefined | null, email: string | undefined | null): string {
  if (fullName) return fullName.split(" ")[0];
  if (email) return email.split("@")[0];
  return "there";
}

export function Header() {
  const { user, role, logout } = useAuth();
  const { data: profile } = useMyProfile();
  const { data: orgSummary } = useOrgSummary();
  const today = useTodayString();

  const isAdmin = role === "ADMIN";
  const firstName = getFirstName(profile?.name, user?.email);
  const displayName = profile?.name ?? user?.email ?? "Account";

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Main bar */}
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        {/* Left: mobile menu + greeting */}
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SheetHeader className="p-6 border-b">
                <SheetTitle className="text-primary">FieldTrack</SheetTitle>
              </SheetHeader>
              <SidebarNav />
            </SheetContent>
          </Sheet>

          <div className="hidden md:block">
            <p className="text-sm font-semibold leading-none text-foreground">
              Hello, {firstName} 👋
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{today}</p>
          </div>
        </div>

        {/* Right: quick stats (admin) + theme toggle + identity */}
        <div className="flex items-center gap-2">
          {/* Admin quick-stat badges */}
          {isAdmin && orgSummary && (
            <div className="hidden lg:flex items-center gap-2 mr-2">
              <StatBadge label="Active" value={String(orgSummary.activeEmployeesCount)} color="emerald" />
              <StatBadge label="Sessions" value={String(orgSummary.totalSessions)} color="blue" />
              <StatBadge label="Distance" value={formatDistance(orgSummary.totalDistanceKm)} color="violet" />
            </div>
          )}

          <ThemeToggle />

          {/* Identity dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-accent"
              >
                {/* Avatar circle */}
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {displayName
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold leading-none">{displayName.split(" ")[0]}</p>
                  <p className={cn(
                    "mt-0.5 text-[10px] font-medium leading-none",
                    isAdmin ? "text-amber-600 dark:text-amber-400" : "text-primary"
                  )}>
                    {role ?? "EMPLOYEE"}
                  </p>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="pb-1">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void logout()} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: "emerald" | "blue" | "violet" }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    violet: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", colorMap[color])}>
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
