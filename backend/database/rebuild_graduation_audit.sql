-- ══════════════════════════════════════════════════════════════════════════════
-- Populate `graduation_audit` directly from SQL.
--
-- The app's "Recompute" button does exactly this. Run it here when that button
-- cannot finish — a shared host whose request budget is shorter than the
-- rebuild, or an environment mid-deploy. Paste into phpMyAdmin → SQL → Go.
--
-- Takes ~3s over 13,707 students and 292,648 marks. Safe to re-run: it clears
-- the table first and rebuilds from scratch, and it only ever writes to
-- `graduation_audit` — no student, marks or curriculum row is touched.
--
-- Needs REGEXP_SUBSTR (MySQL 8+, MariaDB 10.0.5+). If your server is older it
-- fails here with "FUNCTION REGEXP_SUBSTR does not exist" rather than doing
-- anything partial — send me that error and I will swap it for SUBSTRING_INDEX.
--
-- Afterwards the Graduation list is populated; no Recompute needed.
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM `graduation_audit`;

INSERT INTO `graduation_audit` (
                    student_id, regnumber, option_id, started_on, start_source, intake_year,
                    student_state, current_level, programme_level,
                    expected, recorded, passed, failed, exempted, pending, missing, outstanding,
                    percent_complete, is_complete,
                    credits_expected, credits_earned, weighted_avg, computed_at
                 )
                 SELECT
                    stu.student_id, stu.regnumber, stu.option_id,
                    stu.started_on, stu.start_source, stu.intake_year,
                    stu.student_state, stu.current_level, stu.programme_level,

                    COALESCE(cur.n_modules, 0)                       AS expected,
                    COALESCE(mk.passed, 0) + COALESCE(mk.failed, 0)
                        + COALESCE(mk.exempted, 0)                   AS recorded,
                    COALESCE(mk.passed, 0)                           AS passed,
                    COALESCE(mk.failed, 0)                           AS failed,
                    COALESCE(mk.exempted, 0)                         AS exempted,
                    COALESCE(mk.pending, 0)                          AS pending,
                    -- Every curriculum module the student has no mark row for.
                    COALESCE(cur.n_modules, 0) - COALESCE(mk.touched, 0) AS missing,
                    COALESCE(cur.n_modules, 0) - COALESCE(mk.touched, 0)
                        + COALESCE(mk.pending, 0)                    AS outstanding,

                    CASE WHEN COALESCE(cur.n_modules, 0) > 0
                         THEN ROUND((COALESCE(mk.passed, 0) + COALESCE(mk.failed, 0)
                                     + COALESCE(mk.exempted, 0)) / cur.n_modules * 100, 2)
                    END                                              AS percent_complete,
                    CASE WHEN COALESCE(cur.n_modules, 0) > 0
                          AND cur.n_modules - COALESCE(mk.touched, 0) = 0
                          AND COALESCE(mk.pending, 0) = 0
                         THEN 1 ELSE 0 END                           AS is_complete,

                    COALESCE(cur.credits, 0)                         AS credits_expected,
                    COALESCE(mk.credits_earned, 0)                   AS credits_earned,
                    mk.weighted_avg                                  AS weighted_avg,
                    NOW()                                            AS computed_at

                 FROM (SELECT s.id            AS student_id,
                                  s.regnumber,
                                  CAST(NULLIF(REGEXP_SUBSTR(s.std_option, '^[0-9]+'), '') AS UNSIGNED)    AS option_id,
                                  (CASE
                  WHEN (s.registration_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR LEFT(s.registration_date, 4) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))
                    THEN CAST(STR_TO_DATE(LEFT(s.registration_date, 10), '%Y-%m-%d') AS DATE)
                  WHEN (s.registration_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR SUBSTRING_INDEX(s.registration_date, '/', -1) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))
                    THEN CAST(STR_TO_DATE(
                           s.registration_date,
                           IF(CAST(SUBSTRING_INDEX(s.registration_date, '/', 1) AS UNSIGNED) > 12,
                              '%d/%m/%Y', '%m/%d/%Y')
                         ) AS DATE)
                  WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                    THEN CAST(STR_TO_DATE(
                           CONCAT('20', SUBSTRING(s.regnumber, 5, 2), '-09-01'), '%Y-%m-%d'
                         ) AS DATE)
                END)  AS started_on,
                                  (CASE
                  WHEN (s.registration_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR LEFT(s.registration_date, 4) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2)))) OR (s.registration_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR SUBSTRING_INDEX(s.registration_date, '/', -1) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))                        THEN 'registration_date'
                  WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}' THEN 'regnumber'
                  ELSE 'unknown'
                END)     AS start_source,
                                  (CASE WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                     THEN CAST(CONCAT('20', SUBSTRING(s.regnumber, 5, 2)) AS UNSIGNED)
                END)  AS intake_year,
                                  s.student_state,
                                  CAST(NULLIF(REGEXP_SUBSTR(s.current_level, '^[0-9]+'), '') AS UNSIGNED)
                                                  AS current_level,
                                  s.programme_level
                           FROM `student` s ) stu

                 -- 43 rows: what each program requires. Turns "which modules is
                 -- this student missing" into subtraction instead of a join.
                 LEFT JOIN (
                    SELECT mp.option_id,
                           COUNT(*)               AS n_modules,
                           SUM(m.module_credits)  AS credits
                    FROM `module_programs` mp
                    JOIN `modules` m ON m.module_id = mp.module_id
                    GROUP BY mp.option_id
                 ) cur ON cur.option_id = stu.option_id

                 -- What the student actually has, restricted to their own
                 -- curriculum and collapsed to one row per module first.
                 LEFT JOIN (
                    SELECT pm.student_id,
                           COUNT(*)                                            AS touched,
                           SUM(pm.f_passed)                                    AS passed,
                           SUM(NOT pm.f_passed AND pm.f_graded)                AS failed,
                           SUM(NOT pm.f_passed AND NOT pm.f_graded
                               AND pm.f_exempted)                              AS exempted,
                           SUM(NOT pm.f_passed AND NOT pm.f_graded
                               AND NOT pm.f_exempted)                          AS pending,
                           SUM(CASE WHEN pm.f_passed OR pm.f_exempted
                                    THEN pm.module_credits ELSE 0 END)         AS credits_earned,
                           -- Credit-weighted mean of the best attempt at each
                           -- graded module. Modules never sat are excluded
                           -- rather than counted as zero, which would punish a
                           -- part-finished record for marks not yet entered.
                           CASE WHEN SUM(CASE WHEN pm.f_graded THEN pm.module_credits ELSE 0 END) > 0
                                THEN ROUND(
                                       SUM(CASE WHEN pm.f_graded
                                                THEN pm.best_pct * pm.module_credits ELSE 0 END)
                                     / SUM(CASE WHEN pm.f_graded THEN pm.module_credits ELSE 0 END), 2)
                           END                                                 AS weighted_avg
                    FROM (
                       SELECT st.student_id, mp.module_id, m.module_credits,
                              MAX(mm.percentage >= 50)    AS f_passed,
                              MAX(mm.is_exempted = 1)          AS f_exempted,
                              MAX(mm.percentage IS NOT NULL)   AS f_graded,
                              MAX(mm.percentage)               AS best_pct
                       FROM (SELECT s.id            AS student_id,
                                  s.regnumber,
                                  CAST(NULLIF(REGEXP_SUBSTR(s.std_option, '^[0-9]+'), '') AS UNSIGNED)    AS option_id,
                                  (CASE
                  WHEN (s.registration_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR LEFT(s.registration_date, 4) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))
                    THEN CAST(STR_TO_DATE(LEFT(s.registration_date, 10), '%Y-%m-%d') AS DATE)
                  WHEN (s.registration_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR SUBSTRING_INDEX(s.registration_date, '/', -1) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))
                    THEN CAST(STR_TO_DATE(
                           s.registration_date,
                           IF(CAST(SUBSTRING_INDEX(s.registration_date, '/', 1) AS UNSIGNED) > 12,
                              '%d/%m/%Y', '%m/%d/%Y')
                         ) AS DATE)
                  WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                    THEN CAST(STR_TO_DATE(
                           CONCAT('20', SUBSTRING(s.regnumber, 5, 2), '-09-01'), '%Y-%m-%d'
                         ) AS DATE)
                END)  AS started_on,
                                  (CASE
                  WHEN (s.registration_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR LEFT(s.registration_date, 4) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2)))) OR (s.registration_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                 AND (s.regnumber NOT REGEXP '^[0-9]CUR[0-9]{2}'
                      OR SUBSTRING_INDEX(s.registration_date, '/', -1) = CONCAT('20', SUBSTRING(s.regnumber, 5, 2))))                        THEN 'registration_date'
                  WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}' THEN 'regnumber'
                  ELSE 'unknown'
                END)     AS start_source,
                                  (CASE WHEN s.regnumber REGEXP '^[0-9]CUR[0-9]{2}'
                     THEN CAST(CONCAT('20', SUBSTRING(s.regnumber, 5, 2)) AS UNSIGNED)
                END)  AS intake_year,
                                  s.student_state,
                                  CAST(NULLIF(REGEXP_SUBSTR(s.current_level, '^[0-9]+'), '') AS UNSIGNED)
                                                  AS current_level,
                                  s.programme_level
                           FROM `student` s ) st
                       JOIN `module_marks`    mm ON mm.student_regnumber = st.regnumber
                       JOIN `module_programs` mp ON mp.module_id = mm.module_id
                                                AND mp.option_id = st.option_id
                       JOIN `modules`         m  ON m.module_id  = mp.module_id
                       GROUP BY st.student_id, mp.module_id, m.module_credits
                    ) pm
                    GROUP BY pm.student_id
                 ) mk ON mk.student_id = stu.student_id
                 ON DUPLICATE KEY UPDATE
                    regnumber = VALUES(regnumber), option_id = VALUES(option_id),
                    started_on = VALUES(started_on), start_source = VALUES(start_source),
                    intake_year = VALUES(intake_year), student_state = VALUES(student_state),
                    current_level = VALUES(current_level), programme_level = VALUES(programme_level),
                    expected = VALUES(expected), recorded = VALUES(recorded),
                    passed = VALUES(passed), failed = VALUES(failed),
                    exempted = VALUES(exempted), pending = VALUES(pending),
                    missing = VALUES(missing), outstanding = VALUES(outstanding),
                    percent_complete = VALUES(percent_complete), is_complete = VALUES(is_complete),
                    credits_expected = VALUES(credits_expected),
                    credits_earned = VALUES(credits_earned),
                    weighted_avg = VALUES(weighted_avg), computed_at = VALUES(computed_at);

-- Sanity check — expect one row: 13707 students, 731 fully recorded.
SELECT COUNT(*) AS snapshot_rows,
       SUM(started_on IS NOT NULL) AS with_start_date,
       SUM(expected > 0)           AS with_curriculum,
       SUM(recorded > 0)           AS with_any_mark,
       SUM(is_complete = 1)        AS fully_recorded
FROM `graduation_audit`;
