<?php

declare(strict_types=1);

use App\Controllers\HrMonitoringController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Monitoring API Routes
 * All routes require authentication and HR management permissions
 */

// Dashboard summary
$router->get('/api/hr/monitoring/dashboard', [HrMonitoringController::class, 'getMonitoringDashboard'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

// ─────────────────────────────────────────────────────────────────────────
// PERFORMANCE MONITORING
// ─────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/monitoring/appraisals', [HrMonitoringController::class, 'getAppraisals'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_APPRAISALS),
]);

$router->post('/api/hr/monitoring/appraisals', [HrMonitoringController::class, 'createAppraisal'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_APPRAISALS),
]);

// ─────────────────────────────────────────────────────────────────────────
// RECRUITMENT MONITORING
// ─────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/monitoring/recruitment/posts', [HrMonitoringController::class, 'getRecruitmentPosts'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/recruitment/posts', [HrMonitoringController::class, 'createRecruitmentPost'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/recruitment/candidates', [HrMonitoringController::class, 'getCandidates'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

// ─────────────────────────────────────────────────────────────────────────
// EMPLOYEE RELATIONS MONITORING
// ─────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/monitoring/grievances', [HrMonitoringController::class, 'getGrievances'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/grievances', [HrMonitoringController::class, 'createGrievance'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->put('/api/hr/monitoring/grievances/:id', [HrMonitoringController::class, 'updateGrievanceStatus'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/conflicts', [HrMonitoringController::class, 'getConflictResolutions'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/conflicts', [HrMonitoringController::class, 'recordConflictResolution'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/surveys', [HrMonitoringController::class, 'getStaffSatisfactionSurveys'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/counseling', [HrMonitoringController::class, 'getCounselingRecords'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/counseling', [HrMonitoringController::class, 'recordCounselingSession'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

// ─────────────────────────────────────────────────────────────────────────
// TURNOVER & RETENTION MONITORING
// ─────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/monitoring/exit-interviews', [HrMonitoringController::class, 'getExitInterviews'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/exit-interviews', [HrMonitoringController::class, 'recordExitInterview'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/turnover-analytics', [HrMonitoringController::class, 'getTurnoverAnalytics'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);
