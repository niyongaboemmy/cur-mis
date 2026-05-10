-- =============================================================================
-- Migration 045: Reporting views + schema catch-up
-- Date: 2026-05-11
--
-- Captures schema state that exists on production cPanel (and on our local
-- DB once it was synced from cPanel) but was never expressed in a
-- migration file. Running this on a fresh DB produces the same shape;
-- running it on an existing DB is idempotent.
--
-- What's in here:
--
--   1. Four reporting views — created without an explicit DEFINER so they
--      execute under whichever DB user runs them, instead of the
--      `curac@localhost` user that only exists on the cPanel host:
--
--        • students                — flat view over the legacy `student`
--                                    table (kept for query compatibility).
--        • v_fee_balances          — per-student fee aggregation. The
--                                    cPanel version still references the
--                                    old `bursary_amount` column; this
--                                    rewrite uses `bursary_applied`, which
--                                    is the canonical column after
--                                    migration 2026_05_09_033.
--        • v_monthly_collections   — month × payment-method roll-up of
--                                    confirmed fee payments.
--        • v_payroll_statutory     — month roll-up of paid HR payroll
--                                    components (gross, PAYE, pension,
--                                    CBHI, maternity, net).
--
-- The migrate_all.php runner swallows duplicate-column / object-already-
-- exists errors, so the explicit DROP-then-CREATE pattern for views is
-- safe to re-run.
--
-- Note: `users.phone` is already in the canonical CREATE TABLE in
-- migration 2026_04_27_027 — no schema patch is needed for that column.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 1. View: students
--      Flat alias over `student` so any legacy SQL that reads `students`
--      (plural) keeps working without joining or renaming.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS `students`;
CREATE
    SQL SECURITY INVOKER
    VIEW `students` AS
SELECT
    `student`.`id`                  AS `id`,
    `student`.`regnumber`           AS `regnumber`,
    `student`.`index_file`          AS `index_file`,
    `student`.`index_number`        AS `index_number`,
    `student`.`fname`               AS `fname`,
    `student`.`lname`               AS `lname`,
    `student`.`father`              AS `father`,
    `student`.`mother`              AS `mother`,
    `student`.`reference`           AS `reference`,
    `student`.`phone`               AS `phone`,
    `student`.`email`               AS `email`,
    `student`.`gender`              AS `gender`,
    `student`.`birthdate`           AS `birthdate`,
    `student`.`id_card`             AS `id_card`,
    `student`.`photo`               AS `photo`,
    `student`.`marital_status`      AS `marital_status`,
    `student`.`spouse`              AS `spouse`,
    `student`.`disability`          AS `disability`,
    `student`.`nationality`         AS `nationality`,
    `student`.`country`             AS `country`,
    `student`.`province`            AS `province`,
    `student`.`district`            AS `district`,
    `student`.`sector`              AS `sector`,
    `student`.`cell`                AS `cell`,
    `student`.`village`             AS `village`,
    `student`.`last_school`         AS `last_school`,
    `student`.`combination`         AS `combination`,
    `student`.`diploma`             AS `diploma`,
    `student`.`transcript`          AS `transcript`,
    `student`.`program`             AS `program`,
    `student`.`faculty`             AS `faculty`,
    `student`.`department`          AS `department`,
    `student`.`std_option`          AS `std_option`,
    `student`.`current_level`       AS `current_level`,
    `student`.`accepted_date`       AS `accepted_date`,
    `student`.`registration_date`   AS `registration_date`,
    `student`.`expire_date`         AS `expire_date`,
    `student`.`sponsor`             AS `sponsor`,
    `student`.`campus`              AS `campus`,
    `student`.`serial_number`       AS `serial_number`,
    `student`.`grades`              AS `grades`,
    `student`.`principle_pass`      AS `principle_pass`,
    `student`.`A2_compl_year`       AS `A2_compl_year`,
    `student`.`last_university`     AS `last_university`,
    `student`.`student_state`       AS `student_state`,
    `student`.`intake`              AS `intake`,
    `student`.`category`            AS `category`,
    `student`.`admitted_by`         AS `admitted_by`,
    `student`.`school_id`           AS `school_id`,
    `student`.`started_at_cur`      AS `started_at_cur`,
    `student`.`full_part_free`      AS `full_part_free`,
    `student`.`acc_year`            AS `acc_year`
FROM `student`;

-- ---------------------------------------------------------------------------
-- 2. View: v_fee_balances
--      Per-student fee summary used by the finance dashboard. Uses
--      `bursary_applied` (post migration 033) so the view doesn't break
--      after the column rename.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS `v_fee_balances`;
CREATE
    SQL SECURITY INVOKER
    VIEW `v_fee_balances` AS
SELECT
    `s`.`id`                                                   AS `student_id`,
    `s`.`regnumber`                                            AS `reg_number`,
    CONCAT(`s`.`fname`, ' ', `s`.`lname`)                      AS `full_name`,
    `s`.`program`                                              AS `program`,
    `s`.`sponsor`                                              AS `sponsor`,
    IFNULL(SUM(`i`.`amount_due`),       0)                     AS `total_invoiced`,
    IFNULL(SUM(`i`.`amount_paid`),      0)                     AS `total_paid`,
    IFNULL(SUM(`i`.`bursary_applied`),  0)                     AS `total_bursary`,
    (IFNULL(SUM(`i`.`amount_due`),  0)
     - IFNULL(SUM(`i`.`amount_paid`),    0)
     - IFNULL(SUM(`i`.`bursary_applied`),0))                   AS `balance_due`,
    IF((IFNULL(SUM(`i`.`amount_due`),0)
        - IFNULL(SUM(`i`.`amount_paid`),    0)
        - IFNULL(SUM(`i`.`bursary_applied`),0)) <= 0,
       'Cleared', 'Pending')                                   AS `clearance_status`
FROM `student` `s`
LEFT JOIN `fee_invoices` `i` ON `i`.`student_id` = `s`.`id`
GROUP BY `s`.`id`;

-- ---------------------------------------------------------------------------
-- 3. View: v_monthly_collections
--      Month × payment-method total of confirmed payments. Drives the
--      finance overview chart.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS `v_monthly_collections`;
CREATE
    SQL SECURITY INVOKER
    VIEW `v_monthly_collections` AS
SELECT
    DATE_FORMAT(`fee_payments`.`paid_at`, '%Y-%m')             AS `month_label`,
    `fee_payments`.`payment_method`                            AS `payment_method`,
    SUM(`fee_payments`.`amount`)                               AS `total_collected`
FROM `fee_payments`
WHERE `fee_payments`.`status` = 'confirmed'
GROUP BY DATE_FORMAT(`fee_payments`.`paid_at`, '%Y-%m'),
         `fee_payments`.`payment_method`;

-- ---------------------------------------------------------------------------
-- 4. View: v_payroll_statutory
--      Monthly statutory roll-up over paid payroll runs. Used by the HR
--      report exporter.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS `v_payroll_statutory`;
CREATE
    SQL SECURITY INVOKER
    VIEW `v_payroll_statutory` AS
SELECT
    `hr_payroll`.`pay_month`                                   AS `pay_month`,
    SUM(`hr_payroll`.`gross`)                                  AS `total_gross`,
    SUM(`hr_payroll`.`tax`)                                    AS `total_paye_withheld`,
    SUM(`hr_payroll`.`pension`)                                AS `employee_pension`,
    SUM(`hr_payroll`.`employer_pension`)                       AS `employer_pension`,
    SUM(`hr_payroll`.`cbhi`)                                   AS `employee_cbhi`,
    SUM(`hr_payroll`.`employer_cbhi`)                          AS `employer_cbhi`,
    SUM(`hr_payroll`.`maternity`)                              AS `employee_maternity`,
    SUM(`hr_payroll`.`employer_maternity`)                     AS `employer_maternity`,
    SUM(`hr_payroll`.`net`)                                    AS `total_net_paid`
FROM `hr_payroll`
WHERE `hr_payroll`.`status` = 'Paid'
GROUP BY `hr_payroll`.`pay_month`;

SET FOREIGN_KEY_CHECKS = 1;
