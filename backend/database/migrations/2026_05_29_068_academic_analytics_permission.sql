-- =============================================================================
-- Migration 068: Academic Analytics & Reporting Dashboard Permission (Gap 14)
-- Adds: VIEW_ACADEMIC_ANALYTICS permission under Academic Registry category
-- =============================================================================

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (2, 'View Academic Analytics', 'VIEW_ACADEMIC_ANALYTICS',
   'Access the academic analytics and reporting dashboard (pass/fail rates, grade distribution, enrollment trends, department performance, attendance compliance)');
