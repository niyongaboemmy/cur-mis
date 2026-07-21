-- Migration 112: Public Service Request Platform — RBAC permission slugs.
-- Mirrors 2026_07_15_095_rbac_phase0_finance_slugs.sql's pattern: new
-- category + slugs, granted to superadmin/admin plus the roles most likely
-- to hold each slug day-to-day (registrar/HOD for approvals, student for
-- submission). Institutions can reassign slugs to other roles afterwards
-- via the existing Roles UI — this seed is a sane starting grant, not a
-- hard constraint.
-- Idempotent — safe to re-run.

INSERT IGNORE INTO `permission_categories` (`name`, `description`)
VALUES ('Service Requests', 'Public service request catalog, approval, and fulfillment');

SET @cat_service_requests := (SELECT id FROM permission_categories WHERE name = 'Service Requests' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_service_requests, 'Manage Service Catalog',        'MANAGE_SERVICE_CATALOG',          'Create/edit/deactivate public service catalog entries and their approval stages'),
  (@cat_service_requests, 'Submit Service Request',        'SUBMIT_SERVICE_REQUEST',          'Submit a public service request as a student'),
  (@cat_service_requests, 'Approve Service Request (L1)',  'APPROVE_SERVICE_REQUEST_L1',      'Act on service requests at approval stage 1'),
  (@cat_service_requests, 'Approve Service Request (L2)',  'APPROVE_SERVICE_REQUEST_L2',      'Act on service requests at approval stage 2'),
  (@cat_service_requests, 'Approve Service Request (Final)', 'APPROVE_SERVICE_REQUEST_FINAL', 'Give final approval on a service request before payment'),
  (@cat_service_requests, 'View Service Requests',         'VIEW_SERVICE_REQUESTS',           'View service request records and their approval history'),
  (@cat_service_requests, 'Void Service Request',          'VOID_SERVICE_REQUEST',            'Cancel/void a service request outside the normal state machine');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('MANAGE_SERVICE_CATALOG', 'VIEW_SERVICE_REQUESTS', 'VOID_SERVICE_REQUEST')
WHERE r.`name` IN ('superadmin', 'admin');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'SUBMIT_SERVICE_REQUEST'
WHERE r.`name` IN ('superadmin', 'admin', 'student');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_SERVICE_REQUEST_L1'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_SERVICE_REQUEST_L2'
WHERE r.`name` IN ('superadmin', 'admin', 'HOD');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_SERVICE_REQUEST_FINAL'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');
