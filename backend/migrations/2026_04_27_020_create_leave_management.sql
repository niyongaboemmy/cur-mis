-- ============================================================
-- Migration: 020 — Leave Management
-- Creates: leave_types, leave_requests, leave_balances
-- ============================================================

-- ── 1. Leave Types ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_types` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`         VARCHAR(100) NOT NULL,
    `description`  TEXT         DEFAULT NULL,
    `days_allowed` INT          NOT NULL DEFAULT 0,
    `is_paid`      TINYINT(1)   NOT NULL DEFAULT 1,
    `color`        VARCHAR(30)  NOT NULL DEFAULT '#4FB4FF',
    `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default leave types (skip if already present)
INSERT IGNORE INTO `leave_types` (`id`, `name`, `description`, `days_allowed`, `is_paid`, `color`, `is_active`) VALUES
(1, 'Annual Leave',     'Paid annual leave entitlement',          21, 1, '#10B981', 1),
(2, 'Sick Leave',       'Medical sick leave',                     15, 1, '#F59E0B', 1),
(3, 'Maternity Leave',  'Maternity leave for female employees',   84, 1, '#EC4899', 1),
(4, 'Paternity Leave',  'Paternity leave for male employees',      4, 1, '#6366F1', 1),
(5, 'Unpaid Leave',     'Leave without pay',                      30, 0, '#94A3B8', 1),
(6, 'Compassionate',    'Bereavement / compassionate leave',       5, 1, '#8B5CF6', 1);

-- ── 2. Leave Requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_requests` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`    INT          NOT NULL,
    `leave_type_id`  INT UNSIGNED NOT NULL,
    `start_date`     DATE         NOT NULL,
    `end_date`       DATE         NOT NULL,
    `days_requested` DECIMAL(5,1) NOT NULL DEFAULT 0,
    `reason`         TEXT         DEFAULT NULL,
    `status`         ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
    `reviewed_by`    INT          DEFAULT NULL COMMENT 'users.id of reviewer',
    `reviewed_at`    DATETIME     DEFAULT NULL,
    `review_comment` TEXT         DEFAULT NULL,
    `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_lr_employee`   (`employee_id`),
    KEY `idx_lr_type`       (`leave_type_id`),
    KEY `idx_lr_status`     (`status`),
    KEY `idx_lr_dates`      (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Leave Balances ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `leave_balances` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`   INT          NOT NULL,
    `leave_type_id` INT UNSIGNED NOT NULL,
    `year`          YEAR         NOT NULL,
    `total_days`    DECIMAL(5,1) NOT NULL DEFAULT 0,
    `used_days`     DECIMAL(5,1) NOT NULL DEFAULT 0,
    `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_lb_emp_type_year` (`employee_id`, `leave_type_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Seed new permissions ──────────────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `category`) VALUES
('VIEW_LEAVE_REQUESTS',   'HR Management'),
('MANAGE_LEAVE_REQUESTS', 'HR Management');
