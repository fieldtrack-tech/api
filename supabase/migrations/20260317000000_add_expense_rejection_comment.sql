-- ────────────────────────────────────────────────────────────────────────────
-- Migration: add rejection_comment to expenses
--
-- Phase 11 introduced the requirement that a free-text reason is supplied
-- whenever an admin rejects an expense.  This column was added to the
-- TypeScript types and API logic; this migration backfills the DDL so that
-- fresh installations built from individual migration files are consistent
-- with migration-complete.sql (already patched).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejection_comment TEXT;

COMMENT ON COLUMN public.expenses.rejection_comment IS
  'Free-text reason supplied by the reviewer when an expense is REJECTED. NULL for APPROVED or PENDING expenses.';
