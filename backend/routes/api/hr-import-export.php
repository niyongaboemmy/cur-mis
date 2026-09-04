<?php

declare(strict_types=1);

/**
 * HR Import & Export API Routes
 *
 * Handles CSV/Excel file uploads and downloads for HR module
 * Routes:
 * - GET /api/hr/import/template/:type - Download import template
 * - POST /api/hr/import/validate - Validate import file
 * - POST /api/hr/import/process - Process validated import
 * - GET /api/hr/export/:type - Export HR data to Excel/CSV
 */

$router->group(['prefix' => '/api/hr'], function ($router) {

    // ── Import Template Download ──────────────────────────────────────────────
    $router->get('/import/template/:type', 'Controllers\HRImportExportController::downloadTemplate');

    // ── Import Validation ─────────────────────────────────────────────────────
    $router->post('/import/validate', 'Controllers\HRImportExportController::validateImport', [
        'middlewares' => ['auth']
    ]);

    // ── Process Import ────────────────────────────────────────────────────────
    $router->post('/import/process', 'Controllers\HRImportExportController::processImport', [
        'middlewares' => ['auth', 'can:MANAGE_HR_MODULE']
    ]);

    // ── Export Data ───────────────────────────────────────────────────────────
    $router->get('/export/:type', 'Controllers\HRImportExportController::exportData', [
        'middlewares' => ['auth']
    ]);

});
