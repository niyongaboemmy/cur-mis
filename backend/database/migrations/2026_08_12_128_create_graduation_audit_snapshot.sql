-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 128: `graduation_audit` — persisted curriculum-completion snapshot.
-- Date: 2026-08-12
--
-- The completion audit answers "who has a mark for every module their program
-- requires". Computing it live means joining 13.7k students against their
-- curriculum and then against 292k mark rows: ~1s for a single graduation
-- cohort but ~7s for the whole table, which is too slow for a screen the
-- registry filters and re-sorts repeatedly, and slow enough that a broad
-- cut-off date flirts with the request timeout.
--
-- So the result is computed once and kept here, one row per student.
-- `GraduationAuditService::rebuildSnapshot()` fills it; every read is then a
-- single-table indexed query. `computed_at` is surfaced in the UI so nobody
-- mistakes a stale snapshot for live data, and marks entry does not silently
-- invalidate it — a rebuild is an explicit action.
--
-- Denormalised on purpose: regnumber, option, level and enrolment state are
-- copied in so the list, its filters and its sorts never need to touch
-- `student` at all. Hydration for the visible page still joins for names.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is valid on both MySQL 8 (local MAMP)
-- and MariaDB (production cPanel). No ADD COLUMN IF NOT EXISTS anywhere — that
-- form is MariaDB-only and errors 1064 locally.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `graduation_audit` (
  `student_id`       INT(11)      NOT NULL,
  `regnumber`        VARCHAR(250) DEFAULT NULL,
  `option_id`        INT(11)      DEFAULT NULL,

  -- Derived start date. Not a copy of any single column: the regnumber's
  -- intake year leads and `registration_date` only refines it when the two
  -- agree. See GraduationAuditService::startedOnSql().
  `started_on`       DATE         DEFAULT NULL,
  `start_source`     VARCHAR(20)  DEFAULT NULL,
  `intake_year`      SMALLINT(6)  DEFAULT NULL,

  `student_state`    VARCHAR(40)  DEFAULT NULL,
  `current_level`    SMALLINT(6)  DEFAULT NULL,
  `programme_level`  VARCHAR(20)  DEFAULT NULL,

  -- Module buckets. Each curriculum module lands in exactly one of
  -- passed/failed/exempted/pending/missing, so those five sum to `expected`.
  `expected`         INT(11)      NOT NULL DEFAULT 0,
  `recorded`         INT(11)      NOT NULL DEFAULT 0,
  `passed`           INT(11)      NOT NULL DEFAULT 0,
  `failed`           INT(11)      NOT NULL DEFAULT 0,
  `exempted`         INT(11)      NOT NULL DEFAULT 0,
  `pending`          INT(11)      NOT NULL DEFAULT 0,
  `missing`          INT(11)      NOT NULL DEFAULT 0,
  `outstanding`      INT(11)      NOT NULL DEFAULT 0,
  -- No `extra` (marks outside the curriculum) column: finding those needs its
  -- own pass over every mark row, and it is only ever shown in the per-student
  -- drill-down, which computes it live.

  `percent_complete` DECIMAL(5,2) DEFAULT NULL,
  `is_complete`      TINYINT(1)   NOT NULL DEFAULT 0,

  `credits_expected` INT(11)      NOT NULL DEFAULT 0,
  `credits_earned`   INT(11)      NOT NULL DEFAULT 0,
  -- Credit-weighted average of the best attempt per module, 0–100.
  `weighted_avg`     DECIMAL(6,2) DEFAULT NULL,

  `computed_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`student_id`),
  -- The graduation roster: complete students, oldest cohort first.
  KEY `idx_ga_complete_started` (`is_complete`, `started_on`),
  -- The audit list is always bounded by a start date, usually with a state.
  KEY `idx_ga_state_started`    (`student_state`, `started_on`),
  KEY `idx_ga_option`           (`option_id`),
  KEY `idx_ga_outstanding`      (`outstanding`),
  KEY `idx_ga_regnumber`        (`regnumber`(40))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
