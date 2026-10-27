<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\PayrollAdminController;
use App\Controllers\PayrollPartTimeController;
use App\Controllers\PayrollRunController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;

/**
 * Payroll runs, part-time assignments, contracts and rate administration.
 *
 *   VIEW_PAYROLL     read runs, lines, exports, payslips, contracts, part-time requests
 *   MANAGE_PAYROLL   prepare: create runs, add and change lines, calculate, verify, request modules
 *   APPROVE_PAYROLL  approve, mark paid, reopen, and change rates, responsibility amounts and hourly rates
 *
 * Preparing and approving are separate permissions, and the services also refuse the same person doing both.
 */

// ── Read ────────────────────────────────────────────────────────────────────────────────────────
$router->group('/api/hr/payroll', function ($router) {
    $router->get('/runs',                                    [PayrollRunController::class, 'index']);
    $router->get('/runs/:id',                                [PayrollRunController::class, 'show']);
    $router->get('/runs/:id/lines',                          [PayrollRunController::class, 'lines']);
    $router->get('/runs/:id/audit',                          [PayrollRunController::class, 'audit']);
    $router->get('/runs/:id/export.xlsx',                    [PayrollRunController::class, 'exportWorkbook']);
    $router->get('/runs/:id/lines/:lineId/payslip.pdf',      [PayrollRunController::class, 'payslip']);
    $router->get('/part-time',                               [PayrollPartTimeController::class, 'index']);
    $router->get('/part-time/:id/reimbursement',             [PayrollPartTimeController::class, 'reimbursement']);
    $router->get('/part-time/:id/documents/:kind',           [PayrollPartTimeController::class, 'document']);
    $router->get('/employees/:id/contracts',                 [PayrollAdminController::class, 'contracts']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

// ── Prepare ─────────────────────────────────────────────────────────────────────────────────────
$router->group('/api/hr/payroll', function ($router) {
    $router->post('/runs',                                   [PayrollRunController::class, 'create']);
    $router->post('/runs/:id/generate',                      [PayrollRunController::class, 'generate']);
    $router->post('/runs/:id/lines',                         [PayrollRunController::class, 'addLine']);
    $router->post('/runs/:id/lines/:lineId',                 [PayrollRunController::class, 'updateLine']);
    $router->post('/runs/:id/lines/:lineId/remove',          [PayrollRunController::class, 'removeLine']);
    $router->post('/runs/:id/calculate',                     [PayrollRunController::class, 'calculate']);
    $router->post('/runs/:id/verify',                        [PayrollRunController::class, 'verify']);
    $router->post('/runs/:id/return',                        [PayrollRunController::class, 'returnToPreparer']);
    $router->post('/part-time',                              [PayrollPartTimeController::class, 'request']);
    $router->post('/part-time/:id/hours',                    [PayrollPartTimeController::class, 'hours']);
    $router->post('/part-time/:id/advance',                  [PayrollPartTimeController::class, 'advance']);
    $router->post('/part-time/:id/send',                     [PayrollPartTimeController::class, 'send']);
    $router->post('/employees/:id/contracts',                [PayrollAdminController::class, 'addContract']);
    $router->post('/contracts/:id/end',                      [PayrollAdminController::class, 'endContract']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_PAYROLL)]);

// ── Approve, pay, and change rates ──────────────────────────────────────────────────────────────
$router->group('/api/hr/payroll', function ($router) {
    $router->post('/runs/:id/approve',                       [PayrollRunController::class, 'approve']);
    $router->post('/runs/:id/pay',                           [PayrollRunController::class, 'pay']);
    $router->post('/runs/:id/reopen',                        [PayrollRunController::class, 'reopen']);
    $router->post('/settings',                               [PayrollAdminController::class, 'addSettings']);
    $router->post('/roles',                                  [PayrollAdminController::class, 'addRole']);
    $router->post('/hourly',                                 [PayrollAdminController::class, 'addHourly']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::APPROVE_PAYROLL)]);
