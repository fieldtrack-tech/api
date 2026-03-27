/**
 * FieldTrack 2.0 — Design System CVA Variant Definitions
 *
 * Centralized variant strings for consistent component styling.
 * Used by Button, Badge, Card, Input, and other primitives.
 */

// ─── Button variants ─────────────────────────────────────────────────────────

export const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium " +
  "ring-offset-background transition-all duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40 " +
  "cursor-pointer select-none";

export const buttonVariantMap = {
  // Blue CTA — primary action
  default:
    "bg-primary text-primary-foreground shadow-sm " +
    "hover:bg-primary/90 hover:shadow-[0_2px_12px_rgba(47,111,235,0.35)] " +
    "active:scale-[0.98]",

  // Destructive — red
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm " +
    "hover:bg-destructive/90 active:scale-[0.98]",

  // Outlined neutral
  outline:
    "border border-border bg-transparent text-foreground " +
    "hover:bg-accent hover:border-border/80 active:scale-[0.98]",

  // Filled neutral surface
  secondary:
    "bg-secondary text-secondary-foreground " +
    "hover:bg-secondary/70 active:scale-[0.98]",

  // Transparent — minimal
  ghost:
    "text-foreground hover:bg-accent hover:text-foreground " +
    "active:scale-[0.98]",

  // Text link
  link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
} as const;

export const buttonSizeMap = {
  default: "h-9 rounded-lg px-4 py-2",
  sm:      "h-8 rounded-md px-3 text-xs",
  lg:      "h-11 rounded-lg px-6 text-base",
  icon:    "h-9 w-9 rounded-lg",
  "icon-sm": "h-7 w-7 rounded-md",
} as const;

// ─── Badge variants ──────────────────────────────────────────────────────────

export const badgeBase =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
  "leading-none tracking-wide transition-colors";

export const badgeVariantMap = {
  default:     "border-transparent bg-primary/10 text-primary dark:bg-primary/20",
  secondary:   "border-border/60 bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  outline:     "border-border text-foreground",
  success:
    "border-transparent bg-green-100 text-green-800 " +
    "dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/20",
  warning:
    "border-transparent bg-amber-100 text-amber-800 " +
    "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20",
  error:
    "border-transparent bg-red-100 text-red-800 " +
    "dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
  info:
    "border-transparent bg-blue-100 text-blue-800 " +
    "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
} as const;

// ─── Card elevation classes ───────────────────────────────────────────────────

export const cardElevation = {
  0: "bg-background border border-border/40",
  1: "bg-card border border-border/60 shadow-sm",
  2: "bg-card border border-border shadow-md",
  3: "bg-card border border-border shadow-lg",
} as const;

// ─── Input variants ───────────────────────────────────────────────────────────

export const inputBase =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background " +
  "placeholder:text-muted-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 " +
  "focus-visible:border-primary/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "transition-colors duration-150";

// ─── Table tokens ─────────────────────────────────────────────────────────────

export const tableTokens = {
  header: "h-9 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
  cell:   "px-3 py-3 text-sm",
  row:    "border-b border-border/40 transition-colors hover:bg-accent/50 data-[state=selected]:bg-primary/5",
} as const;
