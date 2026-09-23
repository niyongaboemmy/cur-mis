<?php
/**
 * Module-Level Academic Year Preference Routes
 *
 * These routes handle per-user, per-module academic year selection.
 * Allows Finance, Academic, HR, Registry, etc. to independently select different years.
 *
 * Add these routes to your main routes file:
 * require APPPATH . 'Config/Routes/api_routes_module_preferences.php';
 */

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */

$routes->group('api/users/me/module-preferences', ['namespace' => 'App\Controllers', 'filter' => 'auth'], function ($routes) {
    // Get all module preferences for authenticated user
    $routes->get('', 'UserModulePreferenceController::getAllModulePreferences');

    // Get specific module year preference
    $routes->get('(:segment)', 'UserModulePreferenceController::getModuleYear/$1');

    // Set/update module year preference
    $routes->post('(:segment)', 'UserModulePreferenceController::setModuleYear/$1');

    // Reset module to current year
    $routes->delete('(:segment)', 'UserModulePreferenceController::resetModuleYear/$1');
});

/**
 * USAGE IN YOUR EXISTING ROUTES:
 *
 * If using CodeIgniter 4.4+:
 *
 * In app/Config/Routes.php:
 *     require APPPATH . 'Config/Routes/api_routes_module_preferences.php';
 *
 * If using older CodeIgniter:
 *     Add the routes directly to your main Routes.php file
 */
