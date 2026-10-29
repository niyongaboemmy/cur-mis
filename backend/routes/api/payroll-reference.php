<?php

declare(strict_types=1);

use App\Controllers\PayrollReferenceController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Payroll reference data and HR data-quality report (read-only).
 */
$router->group('/api/hr/payroll', function ($router) {
    $router->get('/data-quality', [PayrollReferenceController::class, 'dataQuality']);
    $router->get('/reference',    [PayrollReferenceController::class, 'reference']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);
