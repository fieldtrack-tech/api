"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Clock,
  Receipt,
  BarChart3,
  Users,
  ClipboardList,
  Activity,
  UserCircle,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function SidebarNav() {
  const pathname = usePathname();
  const { permissions } = useAuth();

  const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    { href: "/leaderboard", label: "Leaderboard", icon: <Trophy className="h-5 w-5" /> },
    { href: "/sessions", label: "Sessions", icon: <Clock className="h-5 w-5" /> },
    { href: "/expenses", label: "Expenses", icon: <Receipt className="h-5 w-5" /> },
    { href: "/profile", label: "Profile", icon: <UserCircle className="h-5 w-5" /> },
    ...(permissions.viewOrgSessions
      ? [
          {
            href: "/admin/sessions",
            label: "All Sessions",
            icon: <ClipboardList className="h-5 w-5" />,
          },
        ]
      : []),
    ...(permissions.manageExpenses
      ? [
          {
            href: "/admin/expenses",
            label: "Manage Expenses",
            icon: <Users className="h-5 w-5" />,
          },
        ]
      : []),
    ...(permissions.viewAnalytics
      ? [
          {
            href: "/admin/analytics",
            label: "Analytics",
            icon: <BarChart3 className="h-5 w-5" />,
          },
          {
            href: "/admin/monitoring",
            label: "Monitoring",
            icon: <Activity className="h-5 w-5" />,
          },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-col gap-1 p-2">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <motion.div
            key={item.href}
            whileHover={{ x: isActive ? 0 : 4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          </motion.div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:border-r md:bg-background">
      <div className="flex h-16 items-center px-6 border-b">
        <span className="text-xl font-bold text-primary">FieldTrack</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Separator />
        <SidebarNav />
      </div>
    </aside>
  );
}
