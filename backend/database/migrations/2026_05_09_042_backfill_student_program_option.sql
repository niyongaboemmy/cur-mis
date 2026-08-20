-- =============================================================================
--  062  Data fix: every student must carry both `std_option` (program/option)
--       and `department`. Many legacy rows have one but not the other, which
--       breaks the Students list, Program registrations and attendance pages
--       that scope by programme. Each step only updates rows that need it,
--       so re-running this migration is safe.
-- =============================================================================


-- ── Step A: Pull program_id from the admission chain ────────────────────────
--   Students enrolled through the admission portal have an admission_offers
--   row → student_applications.program_id that is the canonical source.
UPDATE `student` s
JOIN `admission_offers`     ao ON ao.student_id = s.id
JOIN `student_applications` sa ON sa.id         = ao.application_id
SET s.std_option = CAST(sa.program_id AS CHAR)
WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
  AND sa.program_id IS NOT NULL;


-- ── Step B: Same idea via applicant_profiles (when the offer link is missing
--    but the profile still points at the application). ───────────────────────
UPDATE `student` s
JOIN `applicant_profiles`   ap ON ap.user_id        = s.user_id
JOIN `student_applications` sa ON sa.id             = ap.application_id
SET s.std_option = CAST(sa.program_id AS CHAR)
WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
  AND s.user_id IS NOT NULL
  AND sa.program_id IS NOT NULL;


-- ── Step C: Match the legacy free-text `student.program` to an option name
--    (case-insensitive, trimmed). Catches imports that stored the name. ─────
UPDATE `student` s
JOIN `options` o ON LOWER(TRIM(o.name)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(s.program)) COLLATE utf8mb4_unicode_ci
SET s.std_option = CAST(o.id AS CHAR)
WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
  AND s.program IS NOT NULL AND TRIM(s.program) <> '';


-- ── Step D: Same idea against options.code and options.acro (acronym). ─────
UPDATE `student` s
JOIN `options` o ON LOWER(TRIM(o.code)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(s.program)) COLLATE utf8mb4_unicode_ci
SET s.std_option = CAST(o.id AS CHAR)
WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
  AND s.program IS NOT NULL AND TRIM(s.program) <> ''
  AND o.code IS NOT NULL AND TRIM(o.code) <> '';

UPDATE `student` s
JOIN `options` o ON LOWER(TRIM(o.acro)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(s.program)) COLLATE utf8mb4_unicode_ci
SET s.std_option = CAST(o.id AS CHAR)
WHERE (s.std_option IS NULL OR s.std_option = '' OR s.std_option = '0')
  AND s.program IS NOT NULL AND TRIM(s.program) <> ''
  AND o.acro IS NOT NULL AND TRIM(o.acro) <> '';


-- ── (Steps E and F removed — they assigned an option based on the
--     student's department, which is a guess when the department has more
--     than one option. Re-add only with explicit confirmation of which
--     option to default to.) ──


-- ── Step G: Now flow the other direction — wherever std_option is set but
--    department isn't, derive department from option.department_id. ────────
UPDATE `student` s
JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = TRIM(s.std_option) COLLATE utf8mb4_unicode_ci
SET s.department = CAST(o.department_id AS CHAR)
WHERE s.std_option IS NOT NULL AND TRIM(s.std_option) <> '' AND TRIM(s.std_option) <> '0'
  AND (s.department IS NULL OR TRIM(s.department) = '' OR TRIM(s.department) = '0');


-- ── Step H: Faculty mirrors department. Pull from departements.fac_id. ────
UPDATE `student` s
JOIN `departements` d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = TRIM(s.department) COLLATE utf8mb4_unicode_ci
SET s.faculty = CAST(d.fac_id AS CHAR)
WHERE s.department IS NOT NULL AND TRIM(s.department) <> ''
  AND (s.faculty IS NULL OR TRIM(s.faculty) = '' OR TRIM(s.faculty) = '0');


-- ── Step I: Free-text `program` should reflect the option name once we have
--    a canonical std_option. Only fills empty cells so legacy labels are
--    preserved when they're already meaningful. ────────────────────────────
UPDATE `student` s
JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = TRIM(s.std_option) COLLATE utf8mb4_unicode_ci
SET s.program = o.name
WHERE s.std_option IS NOT NULL AND TRIM(s.std_option) <> '' AND TRIM(s.std_option) <> '0'
  AND (s.program IS NULL OR TRIM(s.program) = '');
