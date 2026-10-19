-- Links leave-tree organisation units (leave_org_units) to MIS faculties and
-- departments. AcademicScopeService reads this to decide what a Dean (faculty
-- unit) or Head of Department (department unit) may see.
--
-- Only unambiguous matches are seeded. Units not listed here (Nursing, Public
-- Health, Social Work department, Postgraduate Centre, etc.) are NOT scoped yet:
-- their heads keep full access until an admin adds a row for them.

CREATE TABLE IF NOT EXISTS `leave_org_unit_academic_links` (
  `unit_id`    int(10) UNSIGNED NOT NULL,
  `fac_id`     int(11) DEFAULT NULL COMMENT 'faculty.fac_id when the unit is a faculty (Dean)',
  `dep_id`     int(11) DEFAULT NULL COMMENT 'departements.dep_id when the unit is a department (HOD)',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`unit_id`),
  CONSTRAINT `fk_oual_unit` FOREIGN KEY (`unit_id`) REFERENCES `leave_org_units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `leave_org_unit_academic_links` (`unit_id`, `fac_id`, `dep_id`) VALUES
  (22, 1, NULL),   -- Faculty of Science and Technology
  (13, 6, NULL),   -- Faculty of Education
  (16, 8, NULL),   -- Faculty of Business Studies
  (19, 4, NULL),   -- Faculty of Health Sciences
  (24, 7, NULL),   -- Faculty of Social Work
  (26, 5, NULL),   -- Faculty of Catechesis and Religious Sciences
  (23, NULL, 1),   -- Department of Computer Science
  (17, NULL, 8),   -- Department of Management and Accounting
  (18, NULL, 7),   -- Department of Commercial Engineering
  (15, NULL, 15),  -- Department of Education Sciences
  (14, NULL, 16),  -- Department of Arts and Social Sciences Education
  (27, NULL, 6);   -- Department of Religious Sciences
