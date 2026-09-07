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

// Employees listing for monitoring forms
$router->get('/api/hr/monitoring/employees', [HrMonitoringController::class, 'getEmployees'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

// ─────────────────────────────────────────────────────────────────────────
// PERFORMANCE MONITORING
// ─────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/monitoring/appraisals', [HrMonitoringController::class, 'getAppraisals'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/appraisals', [HrMonitoringController::class, 'createAppraisal'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->put('/api/hr/monitoring/appraisals/:id', [HrMonitoringController::class, 'updateAppraisal'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/appraisals/:id', [HrMonitoringController::class, 'deleteAppraisal'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
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

$router->put('/api/hr/monitoring/recruitment/posts/:id', [HrMonitoringController::class, 'updateRecruitmentPost'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/recruitment/posts/:id', [HrMonitoringController::class, 'deleteRecruitmentPost'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/recruitment/candidates', [HrMonitoringController::class, 'getCandidates'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->post('/api/hr/monitoring/recruitment/candidates', [HrMonitoringController::class, 'createCandidate'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->put('/api/hr/monitoring/recruitment/candidates/:id', [HrMonitoringController::class, 'updateCandidate'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/recruitment/candidates/:id', [HrMonitoringController::class, 'deleteCandidate'], [
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
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->put('/api/hr/monitoring/grievances/:id', [HrMonitoringController::class, 'updateGrievanceStatus'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/grievances/:id', [HrMonitoringController::class, 'deleteGrievance'], [
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

$router->put('/api/hr/monitoring/conflicts/:id', [HrMonitoringController::class, 'updateConflictResolution'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/conflicts/:id', [HrMonitoringController::class, 'deleteConflictResolution'], [
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

$router->put('/api/hr/monitoring/counseling/:id', [HrMonitoringController::class, 'updateCounselingRecord'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/counseling/:id', [HrMonitoringController::class, 'deleteCounselingRecord'], [
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

$router->put('/api/hr/monitoring/exit-interviews/:id', [HrMonitoringController::class, 'updateExitInterview'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->delete('/api/hr/monitoring/exit-interviews/:id', [HrMonitoringController::class, 'deleteExitInterview'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/monitoring/turnover-analytics', [HrMonitoringController::class, 'getTurnoverAnalytics'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
]);
