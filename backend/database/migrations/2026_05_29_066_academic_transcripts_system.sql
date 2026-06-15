-- =============================================================================
-- Migration 066: Academic Transcripts Management System
-- Creates: transcript_requests, academic_certificates
-- Inserts: new permissions for transcripts, graduands, grading scales,
--          deliberations, and academic certificates
-- =============================================================================

-- ------------------------------------------------------------
-- transcript_requests
-- Students submit official/unofficial transcript requests;
-- registry staff approve and dispatch.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transcript_requests` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED DEFAULT NULL,
  `request_type`     ENUM('official','unofficial') NOT NULL DEFAULT 'official',
  `purpose`          VARCHAR(200)     DEFAULT NULL,
  `copies`           TINYINT(3) UNSIGNED NOT NULL DEFAULT 1,
  `status`           ENUM('pending','approved','dispatched','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by`      INT(10) UNSIGNED DEFAULT NULL,
  `reviewed_at`      DATETIME         DEFAULT NULL,
  `dispatch_notes`   TEXT             DEFAULT NULL,
  `fee_paid`         TINYINT(1)       NOT NULL DEFAULT 0,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tr_student`    (`student_id`),
  KEY `idx_tr_status`     (`status`),
  KEY `idx_tr_year`       (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
-- academic_certificates
-- Tracks issuance and dispatch of degrees, diplomas,
-- certificates, and provisional certificates.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `academic_certificates` (
  `id`                   INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`           INT(10) UNSIGNED NOT NULL,
  `academic_year_id`     INT(10) UNSIGNED DEFAULT NULL,
  `certificate_type`     ENUM('degree','diploma','certificate','provisional') NOT NULL DEFAULT 'degree',
  `certificate_number`   VARCHAR(60)      DEFAULT NULL,
  `degree_class`         VARCHAR(60)      DEFAULT NULL,
  `issue_date`           DATE             DEFAULT NULL,
  `issued_by`            INT(10) UNSIGNED DEFAULT NULL,
  `dispatch_date`        DATE             DEFAULT NULL,
  `dispatch_notes`       TEXT             DEFAULT NULL,
  `is_replacement`       TINYINT(1)       NOT NULL DEFAULT 0,
  `replacement_reason`   TEXT             DEFAULT NULL,
  `status`               ENUM('draft','issued','dispatched','revoked') NOT NULL DEFAULT 'draft',
  `created_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cert_number` (`certificate_number`),
  KEY `idx_ac_student`    (`student_id`),
  KEY `idx_ac_status`     (`status`),
  KEY `idx_ac_year`       (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ------------------------------------------------------------
-- New permissions (category 2 = Academic Registry)
-- ------------------------------------------------------------
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (2, 'Manage Transcript Requests',  'MANAGE_TRANSCRIPT_REQUESTS',   'Approve, reject and dispatch student transcript requests'),
  (2, 'Manage Graduands',            'MANAGE_GRADUANDS',             'Add, approve and manage the graduation list'),
  (2, 'View Graduands',              'VIEW_GRADUANDS',               'View graduation eligibility list and graduation list'),
  (2, 'Manage Grading Scales',       'MANAGE_GRADING_SCALES',        'Configure the institution grading scale'),
  (2, 'Manage Deliberations',        'MANAGE_DELIBERATIONS',         'Create and finalise academic deliberation sessions'),
  (2, 'Manage Academic Certificates','MANAGE_ACADEMIC_CERTIFICATES', 'Issue, dispatch and revoke academic certificates');
