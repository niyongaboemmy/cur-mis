<?php

declare(strict_types=1);

use App\Controllers\AdminAcademicYearController;
use App\Middleware\AuthMiddleware;

/**
 * Admin-Only Academic Year Selection Routes
 *
 * These routes allow admins to view any historical year without affecting other users.
 * This is SEPARATE from module-level year selection.
 */

// Get all available academic years (admin only)
$router->get('/api/admin/academic-years', [AdminAcademicYearController::class, 'getAllYears'], [AuthMiddleware::class]);

// Get admin's current year selection
$router->get('/api/admin/me/selected-year', [AdminAcademicYearController::class, 'getAdminSelectedYear'], [AuthMiddleware::class]);

// Set admin's year selection
$router->post('/api/admin/me/selected-year', [AdminAcademicYearController::class, 'setAdminSelectedYear'], [AuthMiddleware::class]);

// Reset admin to current year
$router->delete('/api/admin/me/selected-year', [AdminAcademicYearController::class, 'resetAdminYear'], [AuthMiddleware::class]);

// Get dashboard stats for admin's selected year
$router->get('/api/admin/dashboard-stats', [AdminAcademicYearController::class, 'getDashboardStats'], [AuthMiddleware::class]);
