<?php

declare(strict_types=1);

use App\Controllers\DocumentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Document Generation API Routes
 */
$router->group('/api/documents', function ($router) {
    $router->get('/preview',  [DocumentController::class, 'preview']);
    $router->get('/download', [DocumentController::class, 'download']);
    $router->get('/exemption-letter/modules', [DocumentController::class, 'exemptionLetterModules']);
    $router->get('/exemption-letter/test', [DocumentController::class, 'testModuleQuery']);
    $router->post('/exemption-letter/preview',  [DocumentController::class, 'previewExemptionLetter']);
    $router->post('/exemption-letter/download', [DocumentController::class, 'downloadExemptionLetter']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::GENERATE_DOCUMENTS)]);
