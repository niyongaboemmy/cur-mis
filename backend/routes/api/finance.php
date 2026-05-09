<?php

declare(strict_types=1);

use App\Controllers\FeeController;
use App\Controllers\RefundController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Finance API Routes
 * Read-only:  VIEW_FINANCE or MANAGE_FINANCE
 * Writes:     MANAGE_FINANCE
 */

$router->group('/api/finance', function ($router) {

    // ── Read-only ─────────────────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/structures',               [FeeController::class, 'listStructures']);
        $r->get('/payments',                 [FeeController::class, 'listPayments']);
        $r->get('/payments/pending-count',   [FeeController::class, 'getPendingPaymentCount']);
        $r->get('/payments/:id/receipt',     [FeeController::class, 'getReceipt']);
        $r->get('/bursaries',                [FeeController::class, 'listBursaries']);
        $r->get('/sponsors',                 [FeeController::class, 'listSponsors']);
        $r->get('/overrides',                [FeeController::class, 'listOverrides']);
        $r->get('/refunds',                  [RefundController::class, 'listRefunds']);
        $r->get('/summary',                  [FeeController::class, 'getSummary']);
        $r->get('/balance',                  [FeeController::class, 'getAccountBalance']);
        $r->get('/reports/monthly',          [FeeController::class, 'getMonthlyCollections']);
        $r->get('/reports/revenue',          [FeeController::class, 'getRevenueReport']);
        $r->get('/reports/outstanding',      [FeeController::class, 'getOutstandingReport']);
        $r->get('/reports/projection',       [FeeController::class, 'getIncomeProjection']);
        $r->get('/reports/export',           [FeeController::class, 'exportReport']);
        $r->get('/students/invoices',        [FeeController::class, 'getStudentInvoices']);
        $r->get('/expenses',                 [FeeController::class, 'listExpenses']);
        $r->get('/expenses/categories',      [FeeController::class, 'listExpenseCategories']);
        $r->get('/clearance',                    [FeeController::class, 'getClearanceStatus']);
        $r->get('/clearance/exam-eligibility',   [FeeController::class, 'getExamEligibility']);
        $r->get('/clearance/bulk',               [FeeController::class, 'getBulkClearance']);
        $r->get('/clearance/report',             [FeeController::class, 'getClearanceReport']);
        $r->get('/budgets',                  [FeeController::class, 'listBudgets']);
        $r->get('/billing/summary',          [FeeController::class, 'listBillingSummary']);
        $r->get('/billing/export',           [FeeController::class, 'exportBillingSummary']);

    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
    ])]);

    // ── Writes ────────────────────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/structures',              [FeeController::class, 'createStructure']);
        $r->put('/structures/:id',           [FeeController::class, 'updateStructure']);
        $r->delete('/structures/:id',        [FeeController::class, 'deleteStructure']);

        $r->post('/students/generate',       [FeeController::class, 'generateInvoices']);
        $r->post('/billing/bulk-generate',   [FeeController::class, 'bulkGenerateInvoices']);

        $r->post('/invoices',                [FeeController::class, 'createInvoice']);
        $r->put('/invoices/:id',             [FeeController::class, 'updateInvoice']);

        $r->post('/payments',                [FeeController::class, 'recordPayment']);
        $r->patch('/payments/:id/approve',   [FeeController::class, 'approvePayment']);
        $r->patch('/payments/:id/reject',    [FeeController::class, 'rejectPayment']);

        // Bulk bursary must come before the parameterised bursary routes
        $r->post('/bursaries/bulk',          [FeeController::class, 'bulkCreateBursaries']);
        $r->post('/bursaries',               [FeeController::class, 'createBursary']);
        $r->put('/bursaries/:id',            [FeeController::class, 'updateBursary']);
        $r->delete('/bursaries/:id',         [FeeController::class, 'deleteBursary']);
        $r->patch('/bursaries/:id/confirm',  [FeeController::class, 'confirmBursary']);
        $r->patch('/bursaries/:id/cancel',   [FeeController::class, 'cancelBursary']);

        $r->post('/sponsors',                [FeeController::class, 'createSponsor']);
        $r->put('/sponsors/:id',             [FeeController::class, 'updateSponsor']);

        $r->post('/overrides',               [FeeController::class, 'createOverride']);
        $r->delete('/overrides/:id',         [FeeController::class, 'deleteOverride']);

        $r->post('/refunds',                 [RefundController::class, 'createRefund']);
        $r->patch('/refunds/:id/process',    [RefundController::class, 'processRefund']);
        $r->patch('/refunds/:id/reject',     [RefundController::class, 'rejectRefund']);

        $r->post('/expenses',                [FeeController::class, 'createExpense']);
        $r->put('/expenses/:id',             [FeeController::class, 'updateExpense']);
        $r->delete('/expenses/:id',          [FeeController::class, 'deleteExpense']);
        $r->post('/expenses/categories',      [FeeController::class, 'createExpenseCategory']);
        $r->put('/expenses/categories/:id',   [FeeController::class, 'updateExpenseCategory']);
        $r->delete('/expenses/categories/:id', [FeeController::class, 'deleteExpenseCategory']);

        $r->post('/clearance',               [FeeController::class, 'grantClearance']);
        $r->post('/clearance/bulk',          [FeeController::class, 'runBulkClearance']);
        $r->post('/budgets',                 [FeeController::class, 'saveBudget']);
    }, [new PermissionMiddleware(Permissions::MANAGE_FINANCE)]);

}, [AuthMiddleware::class]);
