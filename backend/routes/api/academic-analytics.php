<?php

declare(strict_types=1);

use App\Controllers\AcademicAnalyticsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Academic Analytics & Reporting Dashboard Routes (Gap 14)
 *
 * All endpoints require:
 *   - Valid JWT (AuthMiddleware)
 *   - VIEW_ACADEMIC_ANALYTICS permission (superadmin bypasses via controller gate)
 */

$router->group('/api/academic-analytics', function ($router) {
    $router->get('/overview',                [AcademicAnalyticsController::class, 'overview']);
    $router->get('/grade-distribution',      [AcademicAnalyticsController::class, 'gradeDistribution']);
    $router->get('/pass-fail-rates',         [AcademicAnalyticsController::class, 'passFailRates']);
    $router->get('/enrollment-trends',       [AcademicAnalyticsController::class, 'enrollmentTrends']);
    $router->get('/department-performance',  [AcademicAnalyticsController::class, 'departmentPerformance']);
    $router->get('/attendance-compliance',   [AcademicAnalyticsController::class, 'attendanceCompliance']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_ACADEMIC_ANALYTICS)]);
