-- =============================================================================
-- HR MONITORING SYSTEM - SAMPLE DATA SEEDER
-- Date: 2026-09-06
-- Purpose: Populate monitoring tables with realistic sample data for testing
-- =============================================================================

-- =============================================================================
-- 1. PERFORMANCE APPRAISALS (Sample Data)
-- =============================================================================

INSERT INTO `performance_appraisals`
(`employee_id`, `appraisal_period`, `appraisal_date`, `rating`, `comments`, `appraiser_id`, `status`)
VALUES
(1, '2026-Q2', '2026-06-30', 4.2, 'Excellent performance. Strong teaching delivery and student engagement. Needs to improve on research publications.', 5, 'completed'),
(2, '2026-Q2', '2026-06-28', 3.8, 'Good administrative support. Reliable and punctual. Can improve communication with stakeholders.', 6, 'completed'),
(3, '2026-Q2', '2026-07-05', 3.5, 'Satisfactory performance. Meets expectations. Encourage participation in professional development.', 7, 'completed'),
(4, '2026-Q3', '2026-09-01', 4.5, 'Outstanding performance in curriculum development. Mentors junior staff effectively.', 8, 'draft'),
(5, '2026-Q3', '2026-09-03', 3.2, 'Below expectations. Needs improvement in punctuality and student relations.', 9, 'draft');

-- =============================================================================
-- 2. PERFORMANCE TARGETS
-- =============================================================================

INSERT INTO `performance_targets`
(`employee_id`, `academic_year_id`, `target_description`, `target_metric`, `target_value`, `actual_value`, `achievement_date`, `status`)
VALUES
(1, 1, 'Publish 2 peer-reviewed articles', 'Publications', 2, 1, NULL, 'in_progress'),
(1, 1, 'Develop new course curriculum', 'Courses', 1, 1, '2026-08-15', 'completed'),
(2, 1, 'Process 500 applications', 'Applications', 500, 485, NULL, 'in_progress'),
(3, 1, 'Mentor 3 junior staff members', 'Mentees', 3, 2, NULL, 'in_progress'),
(4, 1, 'Achieve 95% attendance rate', 'Attendance %', 95, 96, '2026-07-30', 'completed');

-- =============================================================================
-- 3. RECRUITMENT POSTS
-- =============================================================================

INSERT INTO `recruitment_posts`
(`position_title`, `department_id`, `position_level`, `vacancy_count`, `posting_date`, `closing_date`, `status`, `description`)
VALUES
(1, 'Lecturer in Computer Science', 1, 'Lecturer', 2, '2026-08-15', '2026-10-15', 'open',
 'We seek experienced lecturers to teach programming and software engineering courses. Minimum 3 years experience required.'),
(2, 'Senior Administrator', 2, 'Senior Officer', 1, '2026-08-20', '2026-09-20', 'open',
 'Finance administrator to manage institutional budgets and reporting.'),
(3, 'Research Assistant', 3, 'Assistant', 3, '2026-07-01', '2026-09-01', 'closed',
 'Research support for faculty research projects.');

-- =============================================================================
-- 4. RECRUITMENT CANDIDATES
-- =============================================================================

INSERT INTO `recruitment_candidates`
(`recruitment_post_id`, `candidate_name`, `candidate_email`, `candidate_phone`, `application_date`, `stage`, `status`, `interview_date`)
VALUES
(1, 'John Mwizerwa', 'john.mwizerwa@email.com', '+250788123456', '2026-08-25', 'Interview', 'pending', '2026-09-15 10:00:00'),
(1, 'Grace Umutesi', 'grace.umutesi@email.com', '+250787654321', '2026-08-28', 'Screening', 'pending', NULL),
(1, 'Peter Habimana', 'peter.habimana@email.com', '+250789123456', '2026-09-02', 'Application', 'applied', NULL),
(2, 'Alice Nyinawamwali', 'alice.nyin@email.com', '+250788456789', '2026-08-30', 'Interview', 'pending', '2026-09-18 14:00:00'),
(3, 'Emmanuel Rurangwa', 'emmanuel.rua@email.com', '+250787789012', '2026-08-15', 'Hired', 'hired', '2026-08-29 09:00:00');

-- =============================================================================
-- 5. PROBATION RECORDS
-- =============================================================================

INSERT INTO `probation_records`
(`employee_id`, `probation_start_date`, `probation_end_date`, `probation_status`, `supervisor_comments`, `recommendation`, `completion_date`)
VALUES
(10, '2026-07-01', '2026-10-01', 'in_progress', 'Good integration into team. Learning quickly. Maintains high standards.', NULL, NULL),
(11, '2026-08-01', '2026-11-01', 'in_progress', 'Excellent administrative skills. Strong communication.', NULL, NULL),
(12, '2026-06-01', '2026-09-01', 'completed', 'Successfully completed probation. Recommended for confirmation.', 'confirm', '2026-09-01');

-- =============================================================================
-- 6. PAYROLL AUDITS
-- =============================================================================

INSERT INTO `payroll_audits`
(`payroll_period_id`, `audit_date`, `auditor_id`, `total_employees_paid`, `total_amount_paid`, `discrepancies_found`, `issues_notes`, `status`)
VALUES
(1, '2026-08-05', 5, 150, 45000000, 0, 'All salaries processed correctly. No discrepancies found.', 'completed'),
(2, '2026-09-05', 6, 152, 45600000, 2, 'Two employees had incorrect deduction amounts. Corrected in next cycle.', 'completed');

-- =============================================================================
-- 7. BENEFITS TRACKING
-- =============================================================================

INSERT INTO `benefits_tracking`
(`employee_id`, `benefit_type`, `benefit_amount`, `start_date`, `end_date`, `status`, `verification_date`, `verified_by`)
VALUES
(1, 'Health Insurance', 500000, '2026-01-01', NULL, 'active', '2026-08-01', 5),
(2, 'RSBB', 2500000, '2026-01-01', NULL, 'active', '2026-08-15', 6),
(3, 'Housing Allowance', 1500000, '2026-01-01', NULL, 'active', '2026-07-20', 5),
(4, 'Transport Allowance', 500000, '2026-06-01', NULL, 'active', '2026-08-01', 7),
(5, 'Health Insurance', 500000, '2026-01-01', '2026-08-31', 'inactive', '2026-09-01', 8);

-- =============================================================================
-- 8. POLICY COMPLIANCE AUDITS
-- =============================================================================

INSERT INTO `policy_compliance_audits`
(`policy_name`, `audit_date`, `auditor_id`, `compliance_percentage`, `findings`, `recommendations`, `status`, `follow_up_date`)
VALUES
('HR Charter Compliance', '2026-08-10', 5, 92.5, 'Most provisions well-implemented. Minor gaps in grievance documentation.',
 'Strengthen grievance record-keeping procedures. Implement digital tracking system.', 'completed', '2026-10-10'),
('Leave Management Policy', '2026-08-15', 6, 95.0, 'Leave records accurate. All approvals documented properly.',
 'No immediate action needed. Continue current practices.', 'completed', NULL),
('Code of Conduct', '2026-09-01', 7, 88.0, 'Few violations detected. Two disciplinary cases pending.',
 'Conduct staff training on code of conduct. Strengthen awareness campaigns.', 'pending', '2026-11-01');

-- =============================================================================
-- 9. GRIEVANCES
-- =============================================================================

INSERT INTO `grievances`
(`employee_id`, `grievance_date`, `grievance_type`, `grievance_description`, `status`, `assigned_to`, `resolution_date`, `resolution_notes`, `satisfaction_rating`)
VALUES
(2, '2026-08-10', 'Salary Dispute', 'August salary received with incorrect deduction', 'resolved', 6, '2026-08-15', 'Deduction corrected. Arrears paid.', 4),
(3, '2026-08-20', 'Work Conditions', 'Office lacks basic equipment for work', 'resolved', 5, '2026-08-28', 'Equipment provided. Office renovated.', 5),
(4, '2026-08-25', 'Leave Denial', 'Annual leave request denied without explanation', 'pending', 7, NULL, NULL, NULL),
(5, '2026-09-01', 'Promotion', 'Passed over for promotion twice', 'filed', 8, NULL, NULL, NULL);

-- =============================================================================
-- 10. CONFLICT RESOLUTIONS
-- =============================================================================

INSERT INTO `conflict_resolutions`
(`conflict_date`, `parties_involved`, `conflict_description`, `resolution_method`, `mediator_id`, `resolution_outcome`, `status`, `follow_up_date`)
VALUES
('2026-08-05', 'Department A vs Department B', 'Dispute over shared resource allocation', 'Mediation', 5,
 'Agreement reached. Resource sharing schedule established.', 'resolved', NULL),
('2026-08-18', 'Staff Member X vs Supervisor', 'Communication breakdown affecting work', 'One-on-one Discussion', 6,
 'Understanding improved. Weekly check-ins scheduled.', 'resolved', NULL),
('2026-08-30', 'Multiple departments', 'Disagreement on budget allocation for new projects', 'Team Meeting', 7,
 'Compromise reached. Budget distributed fairly.', 'pending', '2026-10-01');

-- =============================================================================
-- 11. STAFF SATISFACTION SURVEYS
-- =============================================================================

INSERT INTO `staff_satisfaction_surveys`
(`survey_date`, `survey_topic`, `total_respondents`, `satisfaction_score`, `key_findings`, `recommendations`, `status`)
VALUES
('2026-08-01', 'Workplace Environment', 120, 3.6,
 'Staff appreciate collaborative culture but want better facilities. IT infrastructure needs upgrade.',
 'Invest in office renovation. Upgrade IT systems. Improve internet connectivity.', 'completed'),
('2026-08-15', 'Management and Leadership', 115, 3.8,
 'Leadership is accessible and fair. Some concerns about strategic direction clarity.',
 'Improve communication on institutional strategy. Regular town halls recommended.', 'completed');

-- =============================================================================
-- 12. COUNSELING RECORDS
-- =============================================================================

INSERT INTO `counseling_records`
(`employee_id`, `counselor_id`, `counseling_date`, `session_topic`, `session_notes`, `follow_up_required`, `follow_up_date`)
VALUES
(2, 5, '2026-08-10', 'Work-life Balance', 'Employee stressed due to workload. Discussed time management strategies.', 1, '2026-09-10'),
(3, 6, '2026-08-20', 'Career Development', 'Exploring promotion opportunities and skill development paths.', 1, '2026-09-20'),
(4, 7, '2026-08-25', 'Personal Issues', 'Family-related stress affecting work. Referred to employee assistance program.', 1, '2026-09-15');

-- =============================================================================
-- 13. HR DATA AUDITS
-- =============================================================================

INSERT INTO `hr_data_audits`
(`audit_date`, `auditor_id`, `data_category`, `total_records`, `records_verified`, `discrepancies_found`, `accuracy_percentage`, `findings`, `corrective_actions`, `status`)
VALUES
('2026-08-15', 5, 'Employee Records', 150, 148, 2, 98.67,
 'Two records missing phone numbers. One employee with duplicate entry.',
 'Updated missing phone numbers. Removed duplicate record.', 'completed'),
('2026-08-25', 6, 'Leave Records', 150, 145, 3, 96.67,
 'Three records with inconsistent date formats.',
 'Standardized date format across all leave records.', 'completed'),
('2026-09-01', 7, 'Payroll Data', 152, 151, 1, 99.34,
 'One employee with incorrect tax code.',
 'Updated tax code. Corrected in next payroll run.', 'pending');

-- =============================================================================
-- 14. EXIT INTERVIEWS
-- =============================================================================

INSERT INTO `exit_interviews`
(`employee_id`, `exit_date`, `reason_for_leaving`, `interviewer_id`, `job_satisfaction`, `management_satisfaction`, `work_environment_satisfaction`, `comments`, `would_rehire`)
VALUES
(20, '2026-08-31', 'Better opportunity elsewhere', 5, 3, 3, 3,
 'Enjoyed the role but seeking career advancement. Company was supportive.', 1),
(21, '2026-09-05', 'Relocation', 6, 4, 4, 3,
 'Good working environment. Moving to pursue family interests.', 1);

-- =============================================================================
-- 15. TURNOVER ANALYTICS
-- =============================================================================

INSERT INTO `turnover_analytics`
(`report_date`, `academic_year_id`, `total_employees_start`, `employees_hired`, `employees_left`, `turnover_rate`, `avg_tenure_months`, `top_exit_reasons`, `retention_strategies`)
VALUES
('2026-08-31', 1, 150, 8, 4, 2.67, 48.5,
 'Better opportunities (50%), Relocation (25%), Personal reasons (25%)',
 'Competitive salary review, Career development programs, Flexible work arrangements'),
('2026-09-30', 1, 154, 12, 5, 3.25, 49.2,
 'Career advancement (40%), Relocation (40%), Health (20%)',
 'Leadership training, Mentorship programs, Performance incentives');

-- =============================================================================
-- 16. RETENTION STRATEGIES
-- =============================================================================

INSERT INTO `retention_strategies`
(`strategy_name`, `strategy_description`, `target_group`, `start_date`, `end_date`, `budget_allocated`, `expected_retention_improvement`, `status`, `effectiveness_score`)
VALUES
('Career Development Program', 'Professional development and training opportunities for all staff', 'All Staff', '2026-01-01', '2026-12-31', 50000000, 5.0, 'active', 4.2),
('Leadership Mentorship', 'One-on-one mentoring for high-potential staff members', 'Senior Staff', '2026-01-01', '2026-12-31', 15000000, 7.0, 'active', 4.5),
('Flexible Work Arrangements', 'Options for remote work and flexible schedules', 'All Staff', '2026-06-01', '2026-12-31', 0, 3.0, 'active', 3.8),
('Compensation Review', 'Competitive salary adjustments and benefits enhancement', 'All Staff', '2026-07-01', '2026-12-31', 80000000, 6.0, 'active', 3.5);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'HR Monitoring System Sample Data Loaded Successfully' as status;

SELECT
  'Performance Appraisals' as table_name, COUNT(*) as record_count FROM `performance_appraisals`
UNION ALL
SELECT 'Performance Targets', COUNT(*) FROM `performance_targets`
UNION ALL
SELECT 'Recruitment Posts', COUNT(*) FROM `recruitment_posts`
UNION ALL
SELECT 'Recruitment Candidates', COUNT(*) FROM `recruitment_candidates`
UNION ALL
SELECT 'Probation Records', COUNT(*) FROM `probation_records`
UNION ALL
SELECT 'Payroll Audits', COUNT(*) FROM `payroll_audits`
UNION ALL
SELECT 'Benefits Tracking', COUNT(*) FROM `benefits_tracking`
UNION ALL
SELECT 'Policy Compliance Audits', COUNT(*) FROM `policy_compliance_audits`
UNION ALL
SELECT 'Grievances', COUNT(*) FROM `grievances`
UNION ALL
SELECT 'Conflict Resolutions', COUNT(*) FROM `conflict_resolutions`
UNION ALL
SELECT 'Staff Satisfaction Surveys', COUNT(*) FROM `staff_satisfaction_surveys`
UNION ALL
SELECT 'Counseling Records', COUNT(*) FROM `counseling_records`
UNION ALL
SELECT 'HR Data Audits', COUNT(*) FROM `hr_data_audits`
UNION ALL
SELECT 'Exit Interviews', COUNT(*) FROM `exit_interviews`
UNION ALL
SELECT 'Turnover Analytics', COUNT(*) FROM `turnover_analytics`
UNION ALL
SELECT 'Retention Strategies', COUNT(*) FROM `retention_strategies`
ORDER BY table_name;
