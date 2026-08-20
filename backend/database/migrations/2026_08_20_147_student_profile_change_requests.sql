-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 147: let students propose changes to their identity fields.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report asked that the student portal be able to
-- change "imyirondoro ye yose" — the student's full personal information.
-- Today StudentController::updateMe() whitelists seven columns (phone,
-- marital status and the five residency fields) and silently drops the rest.
--
-- "Full information" cannot mean every column. `regnumber`, `faculty`,
-- `department`, `std_option`, `current_level`, `student_state` and `sponsor`
-- are the institution's record OF the student, not the student's own details:
-- a student who can edit them can move themselves into another programme or
-- mark themselves active again after exclusion.
--
-- So the fields split three ways, and this table serves the middle tier:
--
--   FREE          phone, email, marital status, spouse, disability and the
--                 five residency fields. Saved immediately by updateMe(), as
--                 today — these are the student's own contact details and a
--                 wrong value harms nobody but them.
--
--   NEEDS PROOF   names, date of birth, gender, nationality, national ID,
--                 parents' names. These print on transcripts, certificates
--                 and the ID card, so a change is proposed here with a
--                 supporting document and applied only once the registry
--                 approves it. ← this table
--
--   LOCKED        the institutional fields listed above. Registry-only,
--                 unchanged.
--
-- The proposed values are stored as JSON rather than as columns because the
-- editable set is a policy decision that will change; a column per field would
-- mean a migration every time the registry revises the list. The server
-- validates each key against its own whitelist on approval, so JSON here is a
-- payload, never a way to reach a field the API does not allow.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `student_profile_change_requests` (
  `id`                      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`              INT(10) UNSIGNED NOT NULL,

  -- {"fname":"...","birthdate":"..."} — only keys the API whitelists survive.
  `proposed`                TEXT         NOT NULL,
  -- The values at the time of the request, so a reviewer sees the change
  -- rather than just the destination, and so an approval that arrives after
  -- the record moved on can be spotted.
  `previous`                TEXT             DEFAULT NULL,
  `reason`                  TEXT             DEFAULT NULL,

  -- Supporting evidence (ID card, birth certificate, deed poll…). Handle +
  -- metadata only; the bytes live on the file server, as everywhere else.
  `document_file_server_id` VARCHAR(191)     DEFAULT NULL,
  `document_original_name`  VARCHAR(255)     DEFAULT NULL,
  `document_mime`           VARCHAR(127)     DEFAULT NULL,
  `document_size`           INT(10) UNSIGNED DEFAULT NULL,

  `status`                  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `review_note`             TEXT             DEFAULT NULL,
  `reviewed_by`             INT(10) UNSIGNED DEFAULT NULL,
  `reviewed_at`             TIMESTAMP    NULL DEFAULT NULL,

  `created_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  -- The student's own history, newest first.
  KEY `idx_spcr_student` (`student_id`, `created_at`),
  -- The registry's queue: every pending request, oldest first.
  KEY `idx_spcr_status`  (`status`, `created_at`),
  KEY `idx_spcr_reviewer`(`reviewed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
