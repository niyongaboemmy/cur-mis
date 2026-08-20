-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 132: Leave management — configurable multi-stage approval chain.
-- Date: 2026-08-17
--
-- Refactors leave approvals from a single blanket MANAGE_LEAVE_REQUESTS decision
-- into the same role-driven, per-stage chain the service-request ("mission
-- authorization") platform uses — see migrations 110/111 and
-- App\Services\ServiceRequestService:
--
--   * leave_approval_stages   ≈ service_catalog_stages   (the configurable chain)
--   * leave_request_approvals ≈ service_request_approvals (immutable audit trail)
--   * leave_requests.current_stage_order ≈ service_requests.current_stage_order
--
-- A request walks stage 1 → n; each stage names the permission slug an actor
-- must hold to decide it, and exactly one stage is the final approval (the one
-- that flips the request to Approved and debits the leave balance).
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The configurable chain, one row per (leave type, stage) ───────────────
CREATE TABLE IF NOT EXISTS `leave_approval_stages` (
  `id`                       INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_type_id`            INT(10) UNSIGNED NOT NULL,
  `stage_order`              TINYINT UNSIGNED NOT NULL,
  `stage_key`                VARCHAR(100)     NOT NULL,
  `stage_label`              VARCHAR(150)     NOT NULL,
  `required_permission_slug` VARCHAR(100)     NOT NULL,
  `is_final_approval`        TINYINT(1)       NOT NULL DEFAULT 0,
  `sla_hours`                INT(10) UNSIGNED          DEFAULT NULL,
  `created_at`               TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_las_type_order` (`leave_type_id`, `stage_order`),
  KEY `idx_las_permission` (`required_permission_slug`),
  CONSTRAINT `fk_las_leave_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `leave_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Immutable per-decision audit trail ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_request_approvals` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT(10) UNSIGNED NOT NULL,
  `stage_order`      TINYINT UNSIGNED NOT NULL,
  `stage_key`        VARCHAR(100)     NOT NULL,
  `stage_label`      VARCHAR(150)              DEFAULT NULL,
  `actor_id`         INT(10) UNSIGNED          DEFAULT NULL,
  `actor_name`       VARCHAR(150)              DEFAULT NULL,
  `actor_role`       VARCHAR(100)              DEFAULT NULL,
  `decision`         ENUM('submitted','approved','rejected','changes_requested','resubmitted','cancelled') NOT NULL,
  `comment`          TEXT                      DEFAULT NULL,
  `decided_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lra_request` (`leave_request_id`),
  CONSTRAINT `fk_lra_request` FOREIGN KEY (`leave_request_id`)
    REFERENCES `leave_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. leave_requests: where in the chain the request currently sits ────────
SET @has_cso = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'current_stage_order'
);
SET @sql = IF(@has_cso = 0,
  'ALTER TABLE `leave_requests` ADD COLUMN `current_stage_order` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''Pointer into leave_approval_stages.stage_order'' AFTER `status`',
  'SELECT ''leave_requests.current_stage_order already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 'ChangesRequested' lets a reviewer send a request back to the requester for
-- edits instead of rejecting it outright (the reference flow's
-- 'changes_requested' status). Existing values are preserved.
ALTER TABLE `leave_requests`
  MODIFY `status` ENUM('Pending','ChangesRequested','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending';

SET @has_stage_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND INDEX_NAME = 'idx_lr_status_stage'
);
SET @sql = IF(@has_stage_idx = 0,
  'ALTER TABLE `leave_requests` ADD INDEX `idx_lr_status_stage` (`status`, `current_stage_order`)',
  'SELECT ''idx_lr_status_stage already exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Per-stage approval permissions (mirrors APPROVE_SERVICE_REQUEST_L*) ──
SET @cat_hr = (SELECT `id` FROM `permission_categories` WHERE `name` = 'HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_hr, 'Approve Leave — Stage 1',     'APPROVE_LEAVE_L1',    'Decide leave requests at the first approval stage (supervisor / HOD).'),
  (@cat_hr, 'Approve Leave — Stage 2',     'APPROVE_LEAVE_L2',    'Decide leave requests at the second approval stage (dean / director).'),
  (@cat_hr, 'Approve Leave — Final',       'APPROVE_LEAVE_FINAL', 'Decide leave requests at the final approval stage (HR). Grants the leave and debits the balance.');

-- Preserve current behaviour: every role that could already approve leave
-- (MANAGE_LEAVE_REQUESTS) keeps the ability to decide at any stage.
--
-- 'superadmin' is deliberately excluded. It bypasses permission checks anyway
-- (AuthService::isSuperadmin, and the leave controllers hand it every stage
-- implicitly), so an explicit grant changes no access — but it WOULD make every
-- superadmin an explicit holder of every stage, and therefore a recipient of the
-- "needs your decision" notification for every routine leave request in the
-- institution. NotificationService keeps superadmins as a fallback recipient
-- only; granting the slug outright defeats that.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT rp.`role_id`, p.`id`
FROM `role_permissions` rp
JOIN `roles` r         ON r.`id` = rp.`role_id`
JOIN `permissions` mlr ON mlr.`id` = rp.`permission_id` AND mlr.`slug` = 'MANAGE_LEAVE_REQUESTS'
JOIN `permissions` p   ON p.`slug` IN ('APPROVE_LEAVE_L1', 'APPROVE_LEAVE_L2', 'APPROVE_LEAVE_FINAL')
WHERE r.`name` <> 'superadmin';

-- Undo the grant if an earlier run of this migration made it.
DELETE rp FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'superadmin'
  AND p.`slug` IN ('APPROVE_LEAVE_L1', 'APPROVE_LEAVE_L2', 'APPROVE_LEAVE_FINAL');

-- Give the seeded default chain a distinct owner per level: heads of department
-- sign off stage 1, HR grants at the final stage.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_LEAVE_L1'
WHERE r.`name` IN ('HOD');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_LEAVE_FINAL'
WHERE r.`name` IN ('hr_manager');

-- ── 5. Seed the default two-stage chain for every leave type ────────────────
-- Stage 1: line manager / HOD sign-off.  Stage 2 (final): HR grants the leave.
-- Any leave type can be re-configured later via the stage-config API without
-- touching code.
INSERT IGNORE INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT lt.`id`, 1, 'supervisor_review', 'Supervisor / HOD Review', 'APPROVE_LEAVE_L1', 0, 48
FROM `leave_types` lt;

INSERT IGNORE INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT lt.`id`, 2, 'hr_approval', 'HR Approval', 'APPROVE_LEAVE_FINAL', 1, 48
FROM `leave_types` lt;

-- ── 6. Backfill an audit-trail row for pre-existing requests ───────────────
-- Without this, a request created before this migration would show an empty
-- history in the progress view.
INSERT INTO `leave_request_approvals`
  (`leave_request_id`, `stage_order`, `stage_key`, `stage_label`, `actor_id`, `actor_name`, `actor_role`, `decision`, `comment`, `decided_at`)
SELECT lr.`id`, 1, 'submission', 'Request Submitted', lr.`user_id`, NULL, NULL, 'submitted', NULL, lr.`created_at`
FROM `leave_requests` lr
LEFT JOIN `leave_request_approvals` a ON a.`leave_request_id` = lr.`id`
WHERE a.`id` IS NULL;
