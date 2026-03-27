"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface MetricCardProps {
  title: string;
  value: string | number;
  /** When provided the displayed value animates from 0 → this number. */
  numericValue?: number;
  icon: React.ReactNode;
  description?: string;
  trend?: { value: number; label: string };
  highlighted?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  numericValue,
  icon,
  description,
  trend,
  highlighted = false,
  isLoading = false,
  className,
}: MetricCardProps) {
  const animated = useAnimatedNumber(numericValue ?? 0);
  const displayValue = numericValue !== undefined ? animated : value;

  if (isLoading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-28 opacity-60" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={cn("rounded-xl h-full", className)}
    >
      <Card
        className={cn(
          "relative overflow-hidden h-full transition-shadow duration-200",
          "hover:shadow-md",
          highlighted &&
            "border-primary/30 bg-primary/5 dark:bg-primary/10 dark:border-primary/25"
        )}
      >
        <CardContent className="p-5">
          {/* Header row: label + icon */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                highlighted
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {icon}
            </div>
          </div>

          {/* Value */}
          <p
            className={cn(
              "text-[26px] font-bold leading-none tracking-tight tabular-nums",
              highlighted ? "text-primary" : "text-foreground"
            )}
          >
            {displayValue}
          </p>

          {/* Description / trend */}
          {description && (
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-2 text-[11px] font-semibold",
                trend.value >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%{" "}
              <span className="font-normal text-muted-foreground">{trend.label}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
