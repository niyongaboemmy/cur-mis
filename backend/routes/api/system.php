<?php

declare(strict_types=1);

use App\Controllers\SystemBasicsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * System Basics API Routes
 */

$router->group('/api/system', function ($router) {
    $router->get('/basics', [SystemBasicsController::class, 'getBasics']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_SYSTEM_BASICS)]);

// Guidance videos — admins set the two public help-video URLs.
$router->group('/api/system', function ($router) {
    $router->put('/guidance-videos', [SystemBasicsController::class, 'saveGuidanceVideos']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);

// Public read for the apply / login pages (no auth required).
$router->get('/api/portal/guidance-videos',    [SystemBasicsController::class, 'getGuidanceVideos']);
$router->get('/api/portal/application-fee',    [SystemBasicsController::class, 'getPublicApplicationFee']);

// Application fee → finance fee type mapping settings.
$router->group('/api/system', function ($router) {
    $router->get('/fee-mapping', [SystemBasicsController::class, 'getFeeMappingSettings']);
    $router->put('/fee-mapping', [SystemBasicsController::class, 'saveFeeMappingSettings']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);
