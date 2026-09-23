-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Billing page financial data (2026-08-20)
--
-- NO-OP. The original migration was committed only as a Git LFS pointer
-- (commit 71d1de8) and its LFS object was never pushed, so the real SQL is
-- unrecoverable. The billing page ("/api/finance/billing/all-students") reads
-- from existing tables (invoices, fee_payments, bursaries) and has been live in
-- production since Aug 2026, so whatever this migration did is already applied
-- there. Replaced with a no-op so the migrate workflow stops failing on the
-- unparseable pointer text. If a missing table/column surfaces, add a new
-- targeted migration for it.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT 'noop: 2026_08_20_140 billing_page_financial_data (original LFS pointer lost)' AS note;
