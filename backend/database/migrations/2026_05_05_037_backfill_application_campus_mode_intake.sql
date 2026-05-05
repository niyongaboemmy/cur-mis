-- 2026_05_05_037_backfill_application_campus_mode_intake.sql
-- Backfill historical applications that were submitted before the
-- Programme step collected campus / mode of study, and normalise legacy
-- intake labels to match the canonical names in the `intakes` table.
--
-- Idempotent — guards on NULL/legacy values so re-running is a no-op
-- once the rows have been corrected.

-- 1. Backfill default campus for submitted applications missing one.
--    Save Campus (Huye Save) is the institutional default.
SET @save_campus_id := (SELECT id FROM campuses WHERE name = 'Save Campus' LIMIT 1);
UPDATE `student_applications`
SET `campus_id` = @save_campus_id
WHERE `campus_id` IS NULL
  AND `status` <> 'draft'
  AND @save_campus_id IS NOT NULL;

-- 2. Backfill default mode_of_study to 'Day' for submitted applications.
UPDATE `student_applications`
SET `mode_of_study` = 'Day'
WHERE (`mode_of_study` IS NULL OR `mode_of_study` = '')
  AND `status` <> 'draft';

-- 3. Normalise legacy intake labels to the canonical intake names that
--    exist in the `intakes` table today. The legacy alpha-suffix codes
--    ("2026-A", "2026-A (January)", "2026-B (August)") were free-text
--    captures from earlier portal builds and don't match anything in
--    the lookup table — resulting in mismatched filters and labels in
--    the admin views.
UPDATE `student_applications` SET `intake` = 'March Intake - 2026'
WHERE `intake` IN ('2026-A', '2026-A (January)');

UPDATE `student_applications` SET `intake` = 'June Intake - 2026'
WHERE `intake` IN ('2026-B', '2026-B (August)');

UPDATE `student_applications` SET `intake` = 'Sept Intake - 2026'
WHERE `intake` IN ('2026-C', '2026-C (September)');
