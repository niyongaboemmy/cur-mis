<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\HRImportService;
use App\Services\HRExportService;
use App\Helpers\ResponseHelper;
use App\Helpers\ValidationHelper;

/**
 * HR Import/Export Controller
 *
 * Handles CSV/Excel file uploads and template generation for HR module
 */
class HRImportExportController extends BaseController
{
    private HRImportService $importService;
    private HRExportService $exportService;

    public function __construct()
    {
        parent::__construct();
        $this->importService = new HRImportService();
        $this->exportService = new HRExportService();
    }

    /**
     * GET /api/hr/import/template/:type
     * Download import template for a specific HR module
     *
     * @param string $type Import type (employees, payroll, leave, contracts)
     * @return void
     */
    public function downloadTemplate(string $type): void
    {
        try {
            // Validate import type
            $validTypes = ['employees', 'payroll', 'leave', 'contracts', 'certificates'];
            if (!in_array($type, $validTypes)) {
                ResponseHelper::error('Invalid import type', 400);
                return;
            }

            // Generate template
            $filepath = $this->importService->generateTemplate($type);

            if (!file_exists($filepath)) {
                ResponseHelper::error('Failed to generate template', 500);
                return;
            }

            // Send file as download
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment; filename="' . basename($filepath) . '"');
            header('Content-Length: ' . filesize($filepath));

            readfile($filepath);
            exit;

        } catch (\Exception $e) {
            ResponseHelper::error('Template generation failed: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/import/validate
     * Validate import file before processing
     *
     * @return void
     */
    public function validateImport(): void
    {
        try {
            // Check if file was uploaded
            if (empty($_FILES['file'])) {
                ResponseHelper::error('No file uploaded', 400);
                return;
            }

            $importType = $_POST['import_type'] ?? null;
            if (!$importType) {
                ResponseHelper::error('Import type is required', 400);
                return;
            }

            $file = $_FILES['file'];

            // Validate file
            if ($file['error'] !== UPLOAD_ERR_OK) {
                ResponseHelper::error('File upload error: ' . $this->getUploadErrorMessage($file['error']), 400);
                return;
            }

            // Check file size (max 10MB)
            if ($file['size'] > 10 * 1024 * 1024) {
                ResponseHelper::error('File size exceeds 10MB limit', 400);
                return;
            }

            // Check file extension
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['csv', 'xlsx', 'xls'])) {
                ResponseHelper::error('Only CSV and Excel files are supported', 400);
                return;
            }

            // Perform validation
            $validationResult = $this->importService->validateImport($file['tmp_name'], $importType);

            ResponseHelper::success($validationResult);

        } catch (\Exception $e) {
            ResponseHelper::error('Validation failed: ' . $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/hr/import/process
     * Import validated data
     *
     * @return void
     */
    public function processImport(): void
    {
        try {
            // Check if file was uploaded
            if (empty($_FILES['file'])) {
                ResponseHelper::error('No file uploaded', 400);
                return;
            }

            $importType = $_POST['import_type'] ?? null;
            if (!$importType) {
                ResponseHelper::error('Import type is required', 400);
                return;
            }

            $file = $_FILES['file'];

            // Validate file
            if ($file['error'] !== UPLOAD_ERR_OK) {
                ResponseHelper::error('File upload error', 400);
                return;
            }

            // First validate
            $validationResult = $this->importService->validateImport($file['tmp_name'], $importType);
            if (!$validationResult['valid']) {
                ResponseHelper::success([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validationResult['errors'],
                    'warnings' => $validationResult['warnings']
                ]);
                return;
            }

            // If validation passed, perform import
            $userId = $this->user['id'] ?? null;
            $importResult = $this->importService->importData($file['tmp_name'], $importType, $userId);

            ResponseHelper::success($importResult);

        } catch (\Exception $e) {
            ResponseHelper::error('Import failed: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/hr/export/:type
     * Export HR data to CSV/Excel
     *
     * @param string $type Export type (employees, payroll, leave, contracts)
     * @return void
     */
    public function exportData(string $type): void
    {
        try {
            // Validate export type
            $validTypes = ['employees', 'payroll', 'leave', 'contracts'];
            if (!in_array($type, $validTypes)) {
                ResponseHelper::error('Invalid export type', 400);
                return;
            }

            // Get export format
            $format = $_GET['format'] ?? 'xlsx'; // xlsx or csv
            if (!in_array($format, ['xlsx', 'csv'])) {
                ResponseHelper::error('Invalid export format', 400);
                return;
            }

            // Generate export file
            $filepath = $this->exportService->exportData($type, $format);

            if (!file_exists($filepath)) {
                ResponseHelper::error('Failed to generate export', 500);
                return;
            }

            // Determine MIME type
            $mimeType = $format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv';

            // Send file as download
            header('Content-Type: ' . $mimeType);
            header('Content-Disposition: attachment; filename="' . basename($filepath) . '"');
            header('Content-Length: ' . filesize($filepath));

            readfile($filepath);
            exit;

        } catch (\Exception $e) {
            ResponseHelper::error('Export failed: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Get human-readable upload error message
     *
     * @param int $errorCode
     * @return string
     */
    private function getUploadErrorMessage(int $errorCode): string
    {
        $errors = [
            UPLOAD_ERR_OK => 'No error',
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds form MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temp directory',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by extension',
        ];

        return $errors[$errorCode] ?? 'Unknown error';
    }
}
