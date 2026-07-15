<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\SystemDocumentModel;
use App\Helpers\ValidationHelper;

class SystemDocumentController extends BaseController
{
    private SystemDocumentModel $model;

    public function __construct()
    {
        $this->model = new SystemDocumentModel();
    }

    /**
     * GET /api/system-documents
     * Get all active system documents grouped by category
     */
    public function list(Request $request, Response $response): never
    {
        try {
            $docs = $this->model->listActive();
            $this->success($response, $docs, 'Documents retrieved.');
        } catch (\Exception $e) {
            $this->error($response, $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/system-documents/categories
     * Get all document categories with counts
     */
    public function categories(Request $request, Response $response): never
    {
        try {
            $categories = $this->model->getCategories();
            $this->success($response, $categories, 'Categories retrieved.');
        } catch (\Exception $e) {
            $this->error($response, $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/system-documents/:id/download
     * Download a system document by ID
     */
    public function download(Request $request, Response $response): never
    {
        try {
            $id = (int) ($request->getRouteParam('id') ?? 0);
            if ($id <= 0) {
                $this->error($response, 'Invalid document ID.', 400);
            }

            $doc = $this->model->getById($id);
            if (!$doc) {
                $this->error($response, 'Document not found.', 404);
            }

            $filePath = $doc['file_path'] ?? '';
            if (!file_exists($filePath)) {
                $this->error($response, 'File not found on server.', 404);
            }

            // Stream file with proper headers
            header('Content-Type: ' . ($doc['file_type'] ?? 'application/octet-stream'));
            header('Content-Disposition: attachment; filename="' . basename($doc['file_name'] ?? 'document') . '"');
            header('Content-Length: ' . filesize($filePath));
            header('Cache-Control: no-cache, no-store, must-revalidate');
            header('Pragma: no-cache');
            header('Expires: 0');

            readfile($filePath);
            exit;
        } catch (\Exception $e) {
            $this->error($response, $e->getMessage(), 500);
        }
    }

    /**
     * POST /api/system-documents
     * Upload a new system document (admin only)
     */
    public function upload(Request $request, Response $response): never
    {
        try {
            $data = $request->getAll();

            // Validate input
            $validation = ValidationHelper::validate($data, [
                'name'        => 'required|string|max:255',
                'description' => 'string|nullable|max:1000',
                'category'    => 'required|string|max:50',
            ]);

            if ($validation !== true) {
                $this->error($response, 'Validation failed.', 422, $validation);
            }

            // Check if file was uploaded
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $this->error($response, 'No file uploaded or upload error.', 400);
            }

            $file = $_FILES['file'];
            $allowedTypes = ['application/pdf', 'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

            if (!in_array($file['type'] ?? '', $allowedTypes, true)) {
                $this->error($response, 'File type not allowed. Only PDF, Word, Excel allowed.', 400);
            }

            // Create uploads directory if it doesn't exist
            $uploadsDir = BASE_PATH . '/storage/system-documents';
            if (!is_dir($uploadsDir)) {
                mkdir($uploadsDir, 0755, true);
            }

            // Generate unique filename
            $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
            $fileName = uniqid('doc_', true) . '.' . $ext;
            $filePath = $uploadsDir . '/' . $fileName;

            // Move uploaded file
            if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                $this->error($response, 'Failed to save file.', 500);
            }

            // Get current user ID from auth context
            $userId = $this->getCurrentUserId($request);

            // Create database record
            $docData = [
                'name'         => $data['name'] ?? '',
                'description'  => $data['description'] ?? '',
                'file_path'    => $filePath,
                'file_name'    => $file['name'] ?? '',
                'file_size'    => $file['size'] ?? 0,
                'file_type'    => $file['type'] ?? '',
                'category'     => $data['category'] ?? '',
                'uploaded_by'  => $userId,
                'uploaded_at'  => date('Y-m-d H:i:s'),
                'is_active'    => 1,
            ];

            $id = $this->model->create($docData);
            if (!$id) {
                @unlink($filePath);
                $this->error($response, 'Failed to save document record.', 500);
            }

            $doc = $this->model->getById($id);
            $this->success($response, $doc, 'Document uploaded successfully.', 201);
        } catch (\Exception $e) {
            $this->error($response, $e->getMessage(), 500);
        }
    }

    /**
     * DELETE /api/system-documents/:id
     * Deactivate a system document (admin only)
     */
    public function delete(Request $request, Response $response): never
    {
        try {
            $id = (int) ($request->getRouteParam('id') ?? 0);
            if ($id <= 0) {
                $this->error($response, 'Invalid document ID.', 400);
            }

            $doc = $this->model->getById($id);
            if (!$doc) {
                $this->error($response, 'Document not found.', 404);
            }

            // Soft delete
            if (!$this->model->deactivate($id)) {
                $this->error($response, 'Failed to delete document.', 500);
            }

            $this->success($response, null, 'Document deleted.');
        } catch (\Exception $e) {
            $this->error($response, $e->getMessage(), 500);
        }
    }

    /**
     * Helper: Get current user ID from request context
     */
    private function getCurrentUserId(Request $request): int
    {
        $auth = $request->getAttributes()['auth'] ?? null;
        return $auth['user_id'] ?? 0;
    }
}
