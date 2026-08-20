<?php

declare(strict_types=1);

use App\Controllers\AppraisalController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Employee Appraisal Module API Routes (Gap 16)
 */

// Stats — readable by anyone with VIEW_APPRAISALS
$router->group('/api/appraisals', function ($router) {
    $router->get('/stats', [AppraisalController::class, 'stats']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_APPRAISALS)]);

// Periods — read
$router->group('/api/appraisals', function ($router) {
    $router->get('/periods',             [AppraisalController::class, 'listPeriods']);
    $router->get('/periods/:id/criteria',[AppraisalController::class, 'listCriteria']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_APPRAISALS)]);

// Periods — write (MANAGE only)
$router->group('/api/appraisals', function ($router) {
    $router->post('/periods',                          [AppraisalController::class, 'createPeriod']);
    $router->post('/periods/:id',                       [AppraisalController::class, 'updatePeriod']);
    $router->post('/periods/:id/status',              [AppraisalController::class, 'setPeriodStatus']);
    $router->delete('/periods/:id',                    [AppraisalController::class, 'deletePeriod']);
    $router->post('/periods/:id/initiate',             [AppraisalController::class, 'initiate']);
    $router->post('/periods/:id/criteria',             [AppraisalController::class, 'createCriterion']);
    $router->post('/periods/:id/criteria/:cid',         [AppraisalController::class, 'updateCriterion']);
    $router->delete('/periods/:id/criteria/:cid',      [AppraisalController::class, 'deleteCriterion']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_APPRAISALS)]);

// Appraisal records — read
$router->group('/api/appraisals', function ($router) {
    $router->get('',      [AppraisalController::class, 'listAppraisals']);
    $router->get('/:id',  [AppraisalController::class, 'showAppraisal']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_APPRAISALS)]);

// Appraisal records — workflow (MANAGE only)
$router->group('/api/appraisals', function ($router) {
    $router->post('/:id/self',       [AppraisalController::class, 'saveSelf']);
    $router->post('/:id/supervisor', [AppraisalController::class, 'saveSupervisor']);
    $router->post('/:id/hr',         [AppraisalController::class, 'saveHr']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_APPRAISALS)]);
