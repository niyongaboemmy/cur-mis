<?php
/**
 * Admin-Only Academic Year Selection Routes
 *
 * These routes allow admins to view any historical year without affecting other users.
 * This is SEPARATE from module-level year selection.
 *
 * Admin View: Can see any year (session-based)
 * Module Selection: Finance, Academic, HR each have independent years
 *
 * Add these routes to your main routes file:
 * require APPPATH . 'Config/Routes/api_routes_admin_year.php';
 */

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */

// Admin-only academic year routes
$routes->group('api/admin', ['namespace' => 'App\Controllers', 'filter' => 'auth'], function ($routes) {
    // Get all available academic years (admin only)
    $routes->get('academic-years', 'AdminAcademicYearController::getAllYears');

    // Get admin's current year selection
    $routes->get('me/selected-year', 'AdminAcademicYearController::getAdminSelectedYear');

    // Set admin's year selection
    $routes->post('me/selected-year', 'AdminAcademicYearController::setAdminSelectedYear');

    // Reset admin to current year
    $routes->delete('me/selected-year', 'AdminAcademicYearController::resetAdminYear');

    // Get dashboard stats for admin's selected year
    $routes->get('dashboard-stats', 'AdminAcademicYearController::getDashboardStats');
});

/**
 * USAGE IN YOUR EXISTING ROUTES:
 *
 * If using CodeIgniter 4.4+:
 *
 * In app/Config/Routes.php:
 *     require APPPATH . 'Config/Routes/api_routes_admin_year.php';
 *
 * API Endpoints:
 *
 * GET /api/admin/academic-years
 *   - Get all available years for dropdown
 *
 * GET /api/admin/me/selected-year
 *   - Get admin's current year selection
 *
 * POST /api/admin/me/selected-year
 *   - Set admin's year (body: { academic_year_id: 123 })
 *
 * DELETE /api/admin/me/selected-year
 *   - Reset to current year
 *
 * GET /api/admin/dashboard-stats
 *   - Get stats for admin's selected year
 */
