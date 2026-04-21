<?php

declare(strict_types=1);

use App\Controllers\AcademicController;
use App\Controllers\AcademicsManagementController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Academics API Routes
 */

// 1. Academic Years & Terms
$router->group('/api/academic', function ($router) {
    // Years
    $router->get('/years',           [AcademicController::class, 'listYears']); // Viewable by all authenticated
    $router->post('/years',          [AcademicController::class, 'createYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->put('/years/:id',       [AcademicController::class, 'updateYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->delete('/years/:id',    [AcademicController::class, 'deleteYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->patch('/years/:id/activate', [AcademicController::class, 'activateYear'], [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);

    // Terms
    $router->get('/terms',           [AcademicController::class, 'listTerms']);
    $router->post('/terms',          [AcademicController::class, 'createTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->put('/terms/:id',       [AcademicController::class, 'updateTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->delete('/terms/:id',    [AcademicController::class, 'deleteTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->patch('/terms/:id/activate', [AcademicController::class, 'activateTerm'], [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
}, [AuthMiddleware::class]);

// 2. Academics Management (Granular Permissions)
$entityPermissions = [
    'degrees'            => Permissions::MANAGE_DEGREES,
    'facility'           => Permissions::MANAGE_FACILITIES,
    'departments'        => Permissions::MANAGE_DEPARTMENTS,
    'options'            => Permissions::MANAGE_OPTIONS,
    'levels'             => Permissions::MANAGE_LEVELS,
    'leave_types'        => Permissions::MANAGE_LEAVE_TYPES,
    'modules'            => Permissions::MANAGE_MODULES,
    'schools'            => Permissions::MANAGE_SCHOOLS,
];

foreach ($entityPermissions as $entity => $permission) {
    $router->group("/api/academics-management/{$entity}", function ($router) {
        $router->get('',       [AcademicsManagementController::class, 'index']);
        $router->get('/:id',   [AcademicsManagementController::class, 'show']);
        $router->post('',      [AcademicsManagementController::class, 'create']);
        $router->put('/:id',   [AcademicsManagementController::class, 'update']);
        $router->delete('/:id', [AcademicsManagementController::class, 'delete']);
    }, [AuthMiddleware::class, new PermissionMiddleware($permission)]);
}
