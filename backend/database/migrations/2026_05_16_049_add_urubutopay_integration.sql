-- =============================================================================
-- Migration 049: UrubutoПay integration — schema + permissions
-- Date: 2026-05-16
--
-- Fixes:
--   §1  Creates api_authorization table (missing — breaks all webhook endpoints)
--   §2  Makes fee_payments.recorded_by nullable (system payments have no human recorder)
--   §3  Adds 'cancelled' to fee_invoices.status ENUM (service queries for it)
--   §4  Seeds VIEW_MOBILE_PAYMENTS permission under Finance category
--   §5  Assigns VIEW_MOBILE_PAYMENTS to superadmin, admin, finance_officer roles
--   §6  Ensures student role has ACCESS_STUDENT_PORTAL (idempotent guard)
--
-- Fully idempotent: CREATE TABLE IF NOT EXISTS, MODIFY COLUMN is safe to re-run,
-- INSERT … ON DUPLICATE KEY UPDATE, INSERT IGNORE.
-- =============================================================================

-- ── §1  Create api_authorization table ───────────────────────────────────────
-- Used by UrubutoPayService::authenticateApiUser() and UrubutoPayWebhookMiddleware.
-- Stores the API credential set that UrubutoPay uses to authenticate against us.

CREATE TABLE IF NOT EXISTS `api_authorization` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(80)   NOT NULL,
  `password`      VARCHAR(255)  NOT NULL COMMENT 'plain, MD5, SHA-1, SHA-256, or bcrypt hash',
  `token`         VARCHAR(255)  NOT NULL COMMENT 'Bearer token returned to UrubutoPay after auth',
  `merchant_code` VARCHAR(50)   NULL DEFAULT NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_auth_username` (`username`),
  UNIQUE KEY `uq_api_auth_token`    (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='UrubutoPay (and any future third-party) API credentials';

-- ── §2  Make fee_payments.recorded_by nullable ────────────────────────────────
-- Webhook-triggered payments are system-initiated; there is no human operator
-- to reference. The column stays nullable; manual payments recorded by staff
-- will still carry the finance officer's user ID.

ALTER TABLE `fee_payments`
  MODIFY COLUMN `recorded_by` INT UNSIGNED NULL DEFAULT NULL;

-- ── §3  Add 'cancelled' to fee_invoices.status ENUM ──────────────────────────
-- UrubutoPayService queries: status NOT IN ('paid','waived','cancelled')
-- 'cancelled' was missing from the ENUM definition.

ALTER TABLE `fee_invoices`
  MODIFY COLUMN `status`
    ENUM('unpaid','partial','paid','overdue','waived','cancelled')
    NOT NULL DEFAULT 'unpaid';

-- ── §4  Seed VIEW_MOBILE_PAYMENTS permission ──────────────────────────────────

-- Fall back through likely category names, then any existing category, so
-- this never trips the `category_id` NOT NULL constraint if naming drifted.
SET @cat_finance = (
    SELECT `id` FROM `permission_categories`
    WHERE `name` = 'Finance' LIMIT 1
);
SET @cat_finance = COALESCE(@cat_finance, (
    SELECT `id` FROM `permission_categories`
    WHERE `name` = 'Finance & Accounts' LIMIT 1
));
SET @cat_finance = COALESCE(@cat_finance, (SELECT `id` FROM `permission_categories` ORDER BY `id` LIMIT 1));

INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_finance,
    'View Mobile Payments',
    'VIEW_MOBILE_PAYMENTS',
    'View UrubutoPay USSD / mobile money payment transactions.'
)
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── §5  Assign VIEW_MOBILE_PAYMENTS to superadmin, admin, finance_officer ─────

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'VIEW_MOBILE_PAYMENTS'
WHERE  r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- ── §6  Ensure student role has ACCESS_STUDENT_PORTAL ─────────────────────────

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'ACCESS_STUDENT_PORTAL'
WHERE  r.`name` = 'student';
