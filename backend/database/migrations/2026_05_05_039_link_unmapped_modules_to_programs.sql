-- 2026_05_05_039_link_unmapped_modules_to_programs.sql
-- Some legacy modules carry a `department` value that doesn't match any
-- active option (e.g. dept #15 "Education Sciences" — its programmes are
-- spread across other department ids). For those, fall back to linking
-- the module to every option whose name shares the department's name —
-- so an admin sees something on the row instead of "— unassigned —"
-- and can refine from there.
--
-- Idempotent: INSERT IGNORE on the unique (module_id, option_id) pair.

-- Education Sciences modules → every "Education in …" programme.
INSERT IGNORE INTO `module_programs` (`module_id`, `option_id`)
SELECT m.module_id, o.id
FROM `modules` m
JOIN `departements` d ON d.dep_id = m.department
JOIN `options` o      ON o.name LIKE 'Education in %'
WHERE d.dep_name = 'Education Sciences'
  AND NOT EXISTS (
    SELECT 1 FROM `module_programs` mp
    WHERE mp.module_id = m.module_id AND mp.option_id = o.id
  );
