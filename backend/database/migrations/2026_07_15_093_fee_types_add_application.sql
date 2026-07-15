-- 2026_07_15_093_fee_types_add_application.sql
-- Add APPLICATION fee type for official fee schedule import.
-- Idempotent: INSERT IGNORE guards against re-runs.

INSERT IGNORE INTO `fee_types` (`code`, `label`, `sort_order`) VALUES
  ('APPLICATION', 'Application Fee', 10);
