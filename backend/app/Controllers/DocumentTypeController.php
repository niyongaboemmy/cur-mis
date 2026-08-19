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
     * The slug is a machine key (`id_card`, `passport_photo`) that other code
     * looks documents up by, so it has a fixed shape. It used to be validated
     * raw against `^[a-z_]+$`, which meant a perfectly reasonable entry was
     * rejected with nothing but "Validation failed." to explain it: a capital
     * letter ("Health_insurence"), a digit ("a2_certificate"), a hyphen
     * ("o-level-result") or a pasted trailing space all failed the same way.
     *
     * Normalising first makes the endpoint liberal in what it accepts while
     * keeping the stored value strict. Callers get back the canonical slug.
     */
    private static function normaliseSlug(mixed $value): string
    {
        $slug = strtolower(trim((string)$value));
        // Anything that is not slug-safe becomes an underscore, then runs of
        // separators collapse so "O-Level  result" lands as "o_level_result".
        $slug = preg_replace('/[^a-z0-9_-]+/', '_', $slug) ?? '';
        $slug = preg_replace('/_{2,}/', '_', $slug) ?? '';
        return trim($slug, '_-');
    }

    /** Shared by create() and update() — one shape, defined once. */
    private static function slugRules(): array
    {
        return [
            'name'               => 'required|string|min:3|max:100',
            'slug'               => 'required|regex:/^[a-z0-9_-]+$/|max:100',
            'allowed_extensions' => 'required|string',
        ];
    }

    /**
     * POST /api/admin/document-types
     */
    public function create(Request $request, Response $response): never
    {
        $data         = $request->body();
        $data['slug'] = self::normaliseSlug($data['slug'] ?? '');

        $errors = ValidationHelper::validate($data, self::slugRules());

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($this->model->exists('slug', $data['slug'])) {
            $this->error($response, 'A document type with this slug already exists.', 409);
        }

        $id = $this->model->create([
            'name'               => $data['name'],
            'slug'               => $data['slug'],
            'description'        => $data['description'] ?? null,
            'allowed_extensions' => $data['allowed_extensions'],
            'sort_order'         => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
            'is_active'          => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
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

        $data         = $request->body();
        $data['slug'] = self::normaliseSlug($data['slug'] ?? '');

        $errors = ValidationHelper::validate($data, self::slugRules());

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($this->model->exists('slug', $data['slug'], $id)) {
            $this->error($response, 'Another document type already uses this slug.', 409);
        }

        $this->model->update($id, [
            'name'               => $data['name'],
            'slug'               => $data['slug'],
            'description'        => $data['description'] ?? null,
            'allowed_extensions' => $data['allowed_extensions'],
            'sort_order'         => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
            'is_active'          => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
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
