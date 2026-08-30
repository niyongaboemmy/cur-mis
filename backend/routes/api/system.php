<?php

declare(strict_types=1);

use App\Controllers\SystemBasicsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * System Basics API Routes
 */

$router->group('/api/system', function ($router) {
    $router->get('/basics', [SystemBasicsController::class, 'getBasics']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_SYSTEM_BASICS,
    Permissions::VIEW_SETTINGS,
])]);

// Guidance videos — admins set the two public help-video URLs.
$router->group('/api/system', function ($router) {
    // Registered for both verbs: systemService.saveGuidanceVideos() issues a
    // PUT, and only POST was declared here, so every save 404'd.
    $router->post('/guidance-videos', [SystemBasicsController::class, 'saveGuidanceVideos']);
    $router->put('/guidance-videos',  [SystemBasicsController::class, 'saveGuidanceVideos']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);

// Public read for the apply / login pages (no auth required).
$router->get('/api/portal/guidance-videos',    [SystemBasicsController::class, 'getGuidanceVideos']);
$router->get('/api/portal/application-fee',    [SystemBasicsController::class, 'getPublicApplicationFee']);

// Application fee → finance fee type mapping settings.
$router->group('/api/system', function ($router) {
    $router->get('/fee-mapping', [SystemBasicsController::class, 'getFeeMappingSettings']);
    $router->post('/fee-mapping', [SystemBasicsController::class, 'saveFeeMappingSettings']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);

// Who signs issued documents — the Academic Registrar's name printed on
// transcripts, certificates and letters. Reading it is enough to render the
// admin form, so the GET follows VIEW_SETTINGS; changing whose name goes on
// every document a student receives is MANAGE_SETTINGS.
$router->group('/api/system', function ($router) {
    $router->get('/signatories', [SystemBasicsController::class, 'getSignatories']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_SETTINGS,
    Permissions::MANAGE_SETTINGS,
])]);

$router->group('/api/system', function ($router) {
    $router->post('/signatories', [SystemBasicsController::class, 'saveSignatories']);
    $router->put('/signatories',  [SystemBasicsController::class, 'saveSignatories']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SETTINGS)]);
