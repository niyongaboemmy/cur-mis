-- Migration 113: add 'voided' to service_request_approvals.decision so the
-- VOID_SERVICE_REQUEST permission (seeded in migration 112) has an audit-log
-- decision value to write when a supervisor cancels a request outside the
-- normal approve/reject/changes-requested stage flow.
-- Idempotent — safe to re-run (MySQL allows re-declaring the same ENUM).

ALTER TABLE `service_request_approvals`
  MODIFY COLUMN `decision` ENUM('submitted','approved','rejected','changes_requested','payment_confirmed','voided') NOT NULL;
