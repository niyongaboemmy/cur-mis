<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\ApplicationDocumentTypeModel;
use App\Helpers\ValidationHelper;

class DocumentTypeController extends BaseController
{
    private ApplicationDocumentTypeModel $model;

    public function __construct()
    {
        $this->model = new ApplicationDocumentTypeModel();
    }

    /**
     * GET /api/admin/document-types
     */
    public function index(Request $request, Response $response): never
    {
        $types = $this->model->all('sort_order', 'ASC');
        $this->success($response, $types, 'Document types fetched successfully.');
    }

    /**
     * GET /api/admin/document-types/:id
     */
    public function show(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $type = $this->model->find($id);

        if (!$type) {
            $this->error($response, 'Document type not found.', 404);
        }

        $this->success($response, $type, 'Document type fetched.');
    }

    /**
     * POST /api/admin/document-types
     */
    public function create(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'name'        => 'required|string|min:3|max:100',
            'slug'        => 'required|regex:/^[a-z_]+$/|max:100',
            'is_required' => 'required|boolean',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($this->model->exists('slug', $data['slug'])) {
            $this->error($response, 'A document type with this slug already exists.', 409);
        }

        $id = $this->model->create([
            'name'        => $data['name'],
            'slug'        => $data['slug'],
            'description' => $data['description'] ?? null,
            'is_required' => (int)(bool)$data['is_required'],
            'sort_order'  => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
            'is_active'   => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
        ]);

        $this->success($response, ['id' => (int)$id], 'Document type created successfully.', 201);
    }

    /**
     * PUT /api/admin/document-types/:id
     */
    public function update(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $type = $this->model->find($id);

        if (!$type) {
            $this->error($response, 'Document type not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'name'        => 'required|string|min:3|max:100',
            'slug'        => 'required|regex:/^[a-z_]+$/|max:100',
            'is_required' => 'required|boolean',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($this->model->exists('slug', $data['slug'], $id)) {
            $this->error($response, 'Another document type already uses this slug.', 409);
        }

        $this->model->update($id, [
            'name'        => $data['name'],
            'slug'        => $data['slug'],
            'description' => $data['description'] ?? null,
            'is_required' => (int)(bool)$data['is_required'],
            'sort_order'  => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
            'is_active'   => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
        ]);

        $this->success($response, ['id' => $id], 'Document type updated successfully.');
    }

    /**
     * DELETE /api/admin/document-types/:id
     */
    public function delete(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $type = $this->model->find($id);

        if (!$type) {
            $this->error($response, 'Document type not found.', 404);
        }

        $this->model->delete($id);

        $this->success($response, null, 'Document type deleted successfully.');
    }
}
