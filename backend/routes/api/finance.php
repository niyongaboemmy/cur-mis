<?php

declare(strict_types=1);

use App\Controllers\FeeController;
use App\Controllers\RefundController;
use App\Controllers\StudentController;
use App\Controllers\PaymentCalendarController;
use App\Controllers\BudgetController;
use App\Controllers\BudgetPlanController;
use App\Controllers\PgIntlFeeStructureController;
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

    // ── Read-only: general (no granular sub-slug defined for these yet) ────────
    $router->group('', function ($r) {
        $r->get('/payments',                 [FeeController::class, 'listPayments']);
        $r->get('/online-payments',          [FeeController::class, 'listOnlinePaymentsHistory']);
        $r->get('/payments/pending-count',   [FeeController::class, 'getPendingPaymentCount']);
        $r->get('/payments/:id/receipt',     [FeeController::class, 'getReceipt']);
        $r->get('/invoices/:id/pdf',         [FeeController::class, 'downloadInvoicePdf']);
        $r->get('/students/:studentId/bill/pdf', [FeeController::class, 'downloadStudentBillPdf']);
        $r->get('/overrides',                [FeeController::class, 'listOverrides']);
        $r->get('/students/invoices',        [FeeController::class, 'getStudentInvoices']);
        $r->get('/fee-types',                [FeeController::class, 'listFeeTypes']);
        $r->get('/per-credit-rates',         [FeeController::class, 'listPerCreditRates']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_MOBILE_PAYMENTS,
        Permissions::VIEW_ONLINE_PAYMENTS_HISTORY,
        // /payments and /payments/pending-count back the Approvals tab.
        Permissions::VIEW_FINANCE_APPROVALS,
    ])]);

    // ── Read-only: structures (Finding B — granular slug added alongside coarse) ─
    $router->group('', function ($r) {
        $r->get('/structures',               [FeeController::class, 'listStructures']);
        $r->get('/pg-intl-structures',        [PgIntlFeeStructureController::class, 'listPgIntlStructures']);
        $r->get('/structures/schedule-export',     [FeeController::class, 'scheduleExportJson']);
        $r->get('/structures/schedule-export.pdf', [FeeController::class, 'scheduleExportPdf']);
        $r->get('/postgraduate/schedule-export',     [FeeController::class, 'postgraduateScheduleExportJson']);
        $r->get('/postgraduate/schedule-export.pdf', [FeeController::class, 'postgraduateScheduleExportPdf']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_STRUCTURES,
    ])]);

    // ── Read-only: billing ───────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/billing/summary',          [FeeController::class, 'listBillingSummary']);
        $r->get('/billing/all-students',     [FeeController::class, 'listAllStudentsWithStatus']);
        $r->get('/billing/export',           [FeeController::class, 'exportBillingSummary']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_BILLING,
    ])]);

    // ── Read-only: bursaries ─────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/bursaries',                [FeeController::class, 'listBursaries']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_BURSARIES,
    ])]);

    // ── Read-only: sponsors ──────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/sponsors',                 [FeeController::class, 'listSponsors']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_SPONSORS,
    ])]);

    // ── Read-only: expenses ──────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/expenses',                 [FeeController::class, 'listExpenses']);
        $r->get('/expenses/categories',      [FeeController::class, 'listExpenseCategories']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_EXPENSES,
    ])]);

    // ── Read-only: refunds ───────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/refunds',                  [RefundController::class, 'listRefunds']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_REFUNDS,
    ])]);

    // ── Read-only: balance ───────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/balance',                  [FeeController::class, 'getAccountBalance']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_BALANCE,
    ])]);

    // ── Read-only: clearance ─────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/clearance',                    [FeeController::class, 'getClearanceStatus']);
        $r->get('/clearance/exam-eligibility',   [FeeController::class, 'getExamEligibility']);
        $r->get('/clearance/bulk',               [FeeController::class, 'getBulkClearance']);
        $r->get('/clearance/report',             [FeeController::class, 'getClearanceReport']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_CLEARANCE,
        Permissions::VIEW_CLEARANCE,
        Permissions::MANAGE_CLEARANCE,
    ])]);

    // ── Read-only: reports ───────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/reports/application-fee-reconciliation', [FeeController::class, 'applicationFeeReconciliation']);
        $r->get('/reports/monthly',          [FeeController::class, 'getMonthlyCollections']);
        $r->get('/reports/revenue',          [FeeController::class, 'getRevenueReport']);
        $r->get('/reports/outstanding',      [FeeController::class, 'getOutstandingReport']);
        $r->get('/reports/projection',       [FeeController::class, 'getIncomeProjection']);
        $r->get('/reports/export',           [FeeController::class, 'exportReport']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_REPORTS,
    ])]);

    // ── Read-only: overview (top-level dashboard) ────────────────────────────
    $router->group('', function ($r) {
        $r->get('/summary',                  [FeeController::class, 'getSummary']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
        Permissions::VIEW_FINANCE_OVERVIEW,
    ])]);

    // ── Payment Calendar — read-only ─────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/payment-calendar', [PaymentCalendarController::class, 'listEvents']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_PAYMENT_CALENDAR,
        Permissions::MANAGE_PAYMENT_CALENDAR,
    ])]);

    // ── Budget Execution — read-only, Phase 4 ────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/budgets',                   [BudgetController::class, 'listBudgets']);
        $r->get('/budget-execution',          [BudgetController::class, 'listByYear']);
        $r->get('/budget-execution/compare',  [BudgetController::class, 'compare']);
        $r->get('/budget-execution/export',   [BudgetController::class, 'export']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_BUDGET_EXECUTION,
        Permissions::MANAGE_BUDGET_EXECUTION,
    ])]);

    // ── Financial Budget Plan (full institution revenue+expense model) ───────
    $router->group('', function ($r) {
        $r->get('/budget-plan',          [BudgetPlanController::class, 'show']);
        $r->get('/budget-plan/export',   [BudgetPlanController::class, 'export']);
        $r->get('/budget-plan/template', [BudgetPlanController::class, 'downloadTemplate']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_BUDGET_EXECUTION,
        Permissions::MANAGE_BUDGET_EXECUTION,
    ])]);

    // ── Student self-service ──────────────────────────────────────────────────
    $router->group('/my', function ($r) {
        $r->get('/invoices',  [FeeController::class, 'getMyInvoices']);
        $r->get('/clearance', [FeeController::class, 'getMyClearance']);
        $r->get('/bill/pdf',  [FeeController::class, 'downloadMyBillPdf']);
        $r->get('/payment-calendar', [PaymentCalendarController::class, 'listMyEvents']);
    }, [new MaybePermissionMiddleware([
        Permissions::ACCESS_STUDENT_PORTAL,
        Permissions::MY_INVOICE,
    ])]);

    // ── Student Directory (Finance view) — read-only, Phase 2 ───────────────────
    $router->group('', function ($r) {
        $r->get('/students', [StudentController::class, 'financeDirectory']);
    }, [new PermissionMiddleware(Permissions::VIEW_STUDENT_DIRECTORY_FINANCE)]);

    // ── Writes ────────────────────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/structures',              [FeeController::class, 'createStructure']);
        $r->post('/structures/bulk-import',  [FeeController::class, 'bulkImportStructures']);
        $r->post('/structures/:id',           [FeeController::class, 'updateStructure']);
        $r->delete('/structures/:id',        [FeeController::class, 'deleteStructure']);

        $r->post('/pg-intl-structures',       [PgIntlFeeStructureController::class, 'createPgIntlStructure']);
        $r->post('/pg-intl-structures/:id',    [PgIntlFeeStructureController::class, 'updatePgIntlStructure']);
        $r->delete('/pg-intl-structures/:id', [PgIntlFeeStructureController::class, 'deletePgIntlStructure']);

        $r->post('/students/generate',       [FeeController::class, 'generateInvoices']);
        $r->post('/billing/bulk-generate',   [FeeController::class, 'bulkGenerateInvoices']);

        $r->post('/invoices',                [FeeController::class, 'createInvoice']);
        $r->post('/invoices/:id',             [FeeController::class, 'updateInvoice']);

        $r->post('/payments',                [FeeController::class, 'recordPayment']);
        $r->post('/payments/:id/approve',   [FeeController::class, 'approvePayment']);
        $r->post('/payments/:id/reject',    [FeeController::class, 'rejectPayment']);

        // Bulk bursary must come before the parameterised bursary routes
        $r->post('/bursaries/bulk',          [FeeController::class, 'bulkCreateBursaries']);
        $r->post('/bursaries',               [FeeController::class, 'createBursary']);
        $r->post('/bursaries/:id',            [FeeController::class, 'updateBursary']);
        $r->delete('/bursaries/:id',         [FeeController::class, 'deleteBursary']);
        $r->post('/bursaries/:id/confirm',  [FeeController::class, 'confirmBursary']);
        $r->post('/bursaries/:id/cancel',   [FeeController::class, 'cancelBursary']);

        $r->post('/sponsors',                [FeeController::class, 'createSponsor']);
        $r->post('/sponsors/:id',             [FeeController::class, 'updateSponsor']);

        $r->post('/overrides',               [FeeController::class, 'createOverride']);
        $r->delete('/overrides/:id',         [FeeController::class, 'deleteOverride']);

        $r->post('/refunds',                 [RefundController::class, 'createRefund']);
        $r->post('/refunds/:id/process',    [RefundController::class, 'processRefund']);
        $r->post('/refunds/:id/reject',     [RefundController::class, 'rejectRefund']);

        $r->post('/expenses',                [FeeController::class, 'createExpense']);
        $r->post('/expenses/:id',             [FeeController::class, 'updateExpense']);
        $r->delete('/expenses/:id',          [FeeController::class, 'deleteExpense']);
        $r->post('/expenses/categories',      [FeeController::class, 'createExpenseCategory']);
        $r->post('/expenses/categories/:id',   [FeeController::class, 'updateExpenseCategory']);
        $r->delete('/expenses/categories/:id', [FeeController::class, 'deleteExpenseCategory']);

        $r->post('/fee-types',               [FeeController::class, 'createFeeType']);
        $r->post('/fee-types/:id',            [FeeController::class, 'updateFeeType']);
        $r->delete('/fee-types/:id',         [FeeController::class, 'deleteFeeType']);

        $r->post('/per-credit-rates',        [FeeController::class, 'createPerCreditRate']);
        $r->post('/per-credit-rates/:id',     [FeeController::class, 'updatePerCreditRate']);
        $r->delete('/per-credit-rates/:id',  [FeeController::class, 'deletePerCreditRate']);

        $r->post('/clearance',               [FeeController::class, 'grantClearance']);
        $r->post('/clearance/bulk',          [FeeController::class, 'runBulkClearance']);
        $r->post('/reports/application-fee-reconciliation/run-pending', [FeeController::class, 'runPendingApplicationFeeCredits']);
    }, [new PermissionMiddleware(Permissions::MANAGE_FINANCE)]);

    // ── Payment Calendar — writes ────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/payment-calendar',       [PaymentCalendarController::class, 'createEvent']);
        $r->post('/payment-calendar/:id',    [PaymentCalendarController::class, 'updateEvent']);
        $r->delete('/payment-calendar/:id', [PaymentCalendarController::class, 'deleteEvent']);
    }, [new PermissionMiddleware(Permissions::MANAGE_PAYMENT_CALENDAR)]);

    // ── Budget Execution — writes ─────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/budgets', [BudgetController::class, 'saveBudget']);
    }, [new PermissionMiddleware(Permissions::MANAGE_BUDGET_EXECUTION)]);

    // ── Financial Budget Plan — writes ────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/budget-plan',                       [BudgetPlanController::class, 'create']);
        $r->post('/budget-plan/import',                [BudgetPlanController::class, 'import']);
        $r->post('/budget-plan/:id',                   [BudgetPlanController::class, 'update']);
        $r->post('/budget-plan/:planId/line-items',    [BudgetPlanController::class, 'createLineItem']);
        $r->post('/budget-plan/line-items/:id',        [BudgetPlanController::class, 'updateLineItem']);
        $r->delete('/budget-plan/line-items/:id',      [BudgetPlanController::class, 'deleteLineItem']);
    }, [new PermissionMiddleware(Permissions::MANAGE_BUDGET_EXECUTION)]);

}, [AuthMiddleware::class]);
