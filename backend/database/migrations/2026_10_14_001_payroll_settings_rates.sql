-- 2026_10_14_001_payroll_settings_rates.sql
-- Moves the CUR payroll numbers (contribution rates, PAYE bands, responsibility
-- allowance amounts) into payroll_config so HR can change them on the Payroll
-- Settings page. The formulas stay in PayrollCalculator.
--
-- Rates are percentages (6 = 6%). Amounts are in RWF.
-- Safe to re-run: INSERT IGNORE never overwrites a value that is already stored.
-- Defaults match PayrollSettings::defaults() in code.

INSERT IGNORE INTO `payroll_config` (`config_key`, `config_value`) VALUES
  -- Contribution rates (percent of the base shown in the procedure)
  ('rssb_employee_rate',         '6'),     -- step 10: pension, employee
  ('rssb_employer_rate',         '6'),     -- step 12: pension, CUR share
  ('occupational_employer_rate', '2'),     -- step 11: occupational hazard, CUR only
  ('maternity_employee_rate',    '0.3'),   -- step 13: maternity, employee
  ('maternity_employer_rate',    '0.3'),   -- step 14: maternity, CUR share
  ('rama_employee_rate',         '7.5'),   -- step 16: RAMA, employee
  ('rama_employer_rate',         '7.5'),   -- step 17: RAMA, CUR share
  ('cbhi_employee_rate',         '0.5'),   -- step 19: CBHI, on net salary
  ('cbhi_employer_rate',         '0.5'),   -- employer CBHI share, on gross salary

  -- PAYE bands (step 8). Band 4 has no upper limit.
  ('paye_band_1_upper',          '60000'),
  ('paye_band_1_rate',           '0'),
  ('paye_band_2_upper',          '100000'),
  ('paye_band_2_rate',           '10'),
  ('paye_band_3_upper',          '200000'),
  ('paye_band_3_rate',           '20'),
  ('paye_band_4_rate',           '30'),

  -- Responsibility allowances (step 5), keyed by role code
  ('resp_academic_secretary',          '120000'),
  ('resp_dean',                        '150000'),
  ('resp_registrar',                   '150000'),
  ('resp_director_research',           '150000'),
  ('resp_cpa_coordinator',             '150000'),
  ('resp_international_student_coord', '150000'),
  ('resp_planning_cooperation',        '150000'),
  ('resp_internal_auditor',            '150000'),
  ('resp_sponsored_student_coord',     '150000'),
  ('resp_head_of_unit',                '150000'),
  ('resp_head_of_department',          '100000');
