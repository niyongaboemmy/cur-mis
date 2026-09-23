-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 143: give the registrar role the four academic screens it was
-- always expected to run.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report asked for "Graduation list, Deliberation
-- report, grading scale, Report and analysis" on the registrar account. All
-- four screens already exist and work — GraduandManagementPage,
-- DeliberationPage, GradingScalePage and AcademicAnalyticsPage. The registrar
-- role simply was never granted the permissions that guard them: its grant list
-- in migration 028 stops at VIEW_MODULE_MARKS / MANAGE_MODULE_MARKS.
--
-- So this is a data correction, not a feature. Nothing in the application
-- changes.
--
-- The five slugs, and what each unlocks:
--   VIEW_GRADUANDS          GET  /api/graduands/*        graduation eligibility list
--   MANAGE_GRADUANDS        POST /api/graduands/*        approve onto the list
--   MANAGE_DELIBERATIONS    POST /api/deliberation/*     convene + finalise sessions
--   MANAGE_GRADING_SCALES   POST /api/grading-scales     edit the band table
--   VIEW_ACADEMIC_ANALYTICS GET  /api/academic-analytics reports dashboard
--
-- Note on the grading scale: GET /api/grading-scales is open to any
-- authenticated user, so the registrar could already READ the band table — the
-- nav link is gated on VIEW_SYSTEM_BASICS, which they hold. What they could not
-- do was save a change; the toolbar appeared and the write 403'd. That is what
-- MANAGE_GRADING_SCALES fixes here.
--
-- Idempotent: guarded by NOT EXISTS, safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
  FROM `roles` r
  CROSS JOIN `permissions` p
 WHERE r.`name` = 'registrar'
   AND p.`slug` IN (
        'VIEW_GRADUANDS',
        'MANAGE_GRADUANDS',
        'MANAGE_DELIBERATIONS',
        'MANAGE_GRADING_SCALES',
        'VIEW_ACADEMIC_ANALYTICS'
   )
   AND NOT EXISTS (
        SELECT 1 FROM `role_permissions` rp
         WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id`
   );
