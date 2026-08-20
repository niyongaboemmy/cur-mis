<?php

declare(strict_types=1);

use App\Controllers\StaffProfileController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Faculty Profile API Routes — qualifications, credentials & teaching subjects.
 *
 * Namespaced under /api/hr/employees/:emp_id (like per-employee deductions)
 * to avoid colliding with the /api/employees/:id detail route.
 */

// Read: VIEW_HR_EMPLOYEES
$router->group('/api/hr/employees/:emp_id', function ($router) {
    $router->get('/qualifications', [StaffProfileController::class, 'qualifications']);
    $router->get('/subjects',       [StaffProfileController::class, 'subjects']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Write: MANAGE_HR_EMPLOYEES
$router->group('/api/hr/employees/:emp_id', function ($router) {
    $router->post('/qualifications',       [StaffProfileController::class, 'storeQualification']);
    $router->post('/qualifications/:id',    [StaffProfileController::class, 'updateQualification']);
    $router->delete('/qualifications/:id', [StaffProfileController::class, 'deleteQualification']);

    $router->post('/subjects',       [StaffProfileController::class, 'storeSubject']);
    $router->post('/subjects/:id',    [StaffProfileController::class, 'updateSubject']);
    $router->delete('/subjects/:id', [StaffProfileController::class, 'deleteSubject']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);
