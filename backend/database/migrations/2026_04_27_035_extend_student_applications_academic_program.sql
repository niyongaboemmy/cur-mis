-- 2026_04_27_035_extend_student_applications_academic_program.sql
-- Adds academic-history fields specific to A-level / NESA secondary
-- transcripts (a2_grades, principal_passes, serial_number) and the
-- denormalised program / campus / mode / level the applicant chooses
-- on step 3. All nullable so existing drafts remain valid.
--
-- Idempotent: each ALTER is guarded against the column already existing.

SELECT 'Run via php script — see scripts/migrate_all.php for execution.' AS note;

-- a2_grades VARCHAR(160), principal_passes TINYINT UNSIGNED, serial_number VARCHAR(80)
-- program_id INT (FK options.id), campus_id INT UNSIGNED (FK campuses.id)
-- mode_of_study VARCHAR(40), level_id INT UNSIGNED (FK levels.id)
