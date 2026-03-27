"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types";

interface ErrorBannerProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ error, onRetry, className }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/25",
        "bg-destructive/8 dark:bg-destructive/12 p-4 text-destructive",
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <p className="text-sm font-semibold">Something went wrong</p>
        <p className="text-sm opacity-80 break-words">{error.message}</p>
        {"requestId" in error && error.requestId && (
          <p className="text-[11px] opacity-50 mt-0.5">ID: {error.requestId}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-lg border border-destructive/30",
            "px-2.5 py-1.5 text-[11px] font-medium",
            "hover:bg-destructive/10 transition-colors"
          )}
          aria-label="Retry"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}
