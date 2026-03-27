import { cn } from "@/lib/utils";

/**
 * Skeleton — shimmer loading placeholder
 * Matches card elevation: bg-muted (darker in dark mode for contrast)
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted",
        // Shimmer sweep
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r before:from-transparent before:via-white/8 before:to-transparent",
        "before:animate-[shimmer_2s_linear_infinite]",
        "before:bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  );
}

/** Skeleton variants for common patterns */
function SkeletonText({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-4 w-full", className)} {...props} />;
}

function SkeletonAvatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-9 w-9 rounded-full shrink-0", className)} {...props} />;
}

function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-5 space-y-3", className)} {...props}>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-3 w-3/5 opacity-60" />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard };
