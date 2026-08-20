-- ============================================================
-- Migration 018: Admission Algorithm Settings & Letter Tracking
-- ============================================================

-- 1. Add allowed subject combinations to departments
ALTER TABLE `departements`
    ADD COLUMN `allowed_combinations` JSON NULL
        COMMENT 'Subject combinations accepted for this program (e.g. ["PCM","PCB","MCE"])',
    ADD COLUMN `program_level` ENUM('undergraduate','postgraduate','diploma','certificate')
        NOT NULL DEFAULT 'undergraduate' AFTER `allowed_combinations`;

-- 2. Extend merit_criteria with algorithm type
ALTER TABLE `merit_criteria`
    ADD COLUMN `algorithm_type`
        ENUM('merit_based','manual','first_come_first_served')
        NOT NULL DEFAULT 'merit_based'
        AFTER `is_published`,
    ADD COLUMN `algorithm_notes` TEXT NULL
        COMMENT 'Description / rationale for the algorithm configuration'
        AFTER `algorithm_type`;

-- 3. Track admission letter dispatch on offers
ALTER TABLE `admission_offers`
    ADD COLUMN `letter_sent_at`   DATETIME     NULL AFTER `enrolled_at`,
    ADD COLUMN `letter_sent_by`   INT          NULL AFTER `letter_sent_at`,
    ADD COLUMN `letter_token`     VARCHAR(64)  NULL UNIQUE
        COMMENT 'Secure token for applicant to download letter without login'
        AFTER `letter_sent_by`;

-- 4. New table: manual_admissions — audit log for manual override decisions
CREATE TABLE IF NOT EXISTS `manual_admissions` (
    `id`             INT          NOT NULL AUTO_INCREMENT,
    `application_id` INT          NOT NULL,
    `admitted_by`    INT          NOT NULL,
    `reason`         TEXT         NULL,
    `notes`          TEXT         NULL,
    `admitted_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `offer_id`       INT          NULL,
    PRIMARY KEY (`id`),
    KEY `idx_ma_application` (`application_id`),
    KEY `idx_ma_admitted_by` (`admitted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
