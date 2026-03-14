"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { ApiError } from "@/types";

interface ErrorBannerProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-1 flex-1">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="text-sm opacity-90">{error.message}</p>
        {"requestId" in error && error.requestId && (
          <p className="text-xs opacity-60">Request ID: {error.requestId}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium hover:bg-destructive/10 transition-colors"
          aria-label="Retry"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}
