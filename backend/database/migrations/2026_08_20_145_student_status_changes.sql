-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 145: record WHY a student's status changed, and the evidence for it.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report asked the Edit Student screen to offer
-- "Active, innactive, graduand, granduate, Rejected with reason, Drop out with
-- reason, Death with Upload supporting document".
--
-- Commit c7f7e0d already widened the picker (Graduand / Rejected / Dropped
-- out). What is missing is everything after the comma: the *reason*, the
-- *document*, and any record that the change happened at all.
--
-- Today a status change is a bare UPDATE of `student.student_state`, a
-- free-text VARCHAR(40). The previous value is gone, along with who changed it
-- and why. For a rejection or a dropout that is a lost audit trail; for a death
-- it means the certificate that justified the change has nowhere to live.
--
-- This table is the trail. `student.student_state` stays the current value —
-- nothing reads status from here — so every existing query keeps working.
--
-- ON THE DOCUMENT COLUMNS
-- ───────────────────────
-- The file itself goes to the file server (App\Helpers\FileServerClient), the
-- same store student documents and visa scans already use. Only the returned
-- handle and its metadata are kept here, mirroring `student_documents`. There
-- is deliberately no FK to a documents table: a death certificate is evidence
-- for this decision, not part of the student's academic document set, and
-- should not appear in the documents tab alongside their diploma.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `student_status_changes` (
  `id`                      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`              INT(10) UNSIGNED NOT NULL,

  -- Free text, not an ENUM: `student.student_state` is VARCHAR(40) holding a
  -- decade of hand-typed spellings ("ACTIVE", "Graduates", "resume", "XXX").
  -- An ENUM here would reject the very history it exists to preserve.
  `previous_state`          VARCHAR(40)  DEFAULT NULL,
  `new_state`               VARCHAR(40)  NOT NULL,

  -- Required by the API for `rejected` and `dropped`; optional elsewhere.
  `reason`                  TEXT         DEFAULT NULL,

  -- Supporting document (required by the API for `deceased`). Handle +
  -- metadata only; the bytes live on the file server.
  `document_file_server_id` VARCHAR(191) DEFAULT NULL,
  `document_original_name`  VARCHAR(255) DEFAULT NULL,
  `document_mime`           VARCHAR(127) DEFAULT NULL,
  `document_size`           INT(10) UNSIGNED DEFAULT NULL,

  `changed_by`              INT(10) UNSIGNED DEFAULT NULL,
  `changed_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  -- Newest-first history for one student — the only read this table serves.
  KEY `idx_ssc_student`  (`student_id`, `changed_at`),
  -- "every student marked deceased/dropped this year" reporting.
  KEY `idx_ssc_state`    (`new_state`, `changed_at`),
  KEY `idx_ssc_actor`    (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
