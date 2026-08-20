-- Migration 063: Grant VIEW_SYSTEM_BASICS to student role
-- 
-- Why: Students need access to /api/system/basics to resolve the active 
--      academic year ID, which is required for the "My Finance" page and 
--      other self-service features to load data automatically.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'VIEW_SYSTEM_BASICS'
WHERE r.name = 'student';
