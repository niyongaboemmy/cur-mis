-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 122: Take the institution-wide dashboard away from teaching roles.
-- Date: 2026-08-09
--
-- `VIEW_DASHBOARD` gates exactly one thing — the global admin dashboard:
--   • GET /api/admin/dashboard          (routes/api/admin_dashboard.php:15)
--   • the /dashboard route              (App.tsx, ProtectedRoute)
--   • the "Dashboard" sidebar entry     (MainLayout NAV_TREE)
--   • the "Dashboard" global-search hit (GlobalSearch.tsx)
--
-- That page reports institution-wide student totals. It is not scoped to the
-- signed-in lecturer, contains nothing they can act on, and sits confusingly
-- beside their real dashboard at /teacher. Teaching staff now have a dashboard
-- of their own (My Teaching → Dashboard), so the global one is removed for them.
--
-- Revoking the grant — rather than merely hiding the nav item — also closes the
-- API and the direct /dashboard URL, which a presentational `hideForRoles` would
-- have left reachable.
--
-- Only `lecturer` and `HOD` are touched. Admin, registrar, finance and HR keep
-- the global dashboard; superadmin bypasses permission checks entirely.
--
-- The teacher landing page does NOT depend on this slug: HomePage/WelcomePage
-- branch on ACCESS_TEACHER_PORTAL, and /api/teacher/summary is gated on that
-- same slug, so this revoke cannot leave a lecturer with no dashboard at all.
--
-- Reversible: re-grant with an INSERT IGNORE into role_permissions.
-- ══════════════════════════════════════════════════════════════════════════════

DELETE rp
FROM `role_permissions` rp
JOIN `roles` r       ON r.id = rp.role_id
JOIN `permissions` p ON p.id = rp.permission_id
WHERE p.`slug` = 'VIEW_DASHBOARD'
  AND r.`name` IN ('lecturer', 'HOD');
