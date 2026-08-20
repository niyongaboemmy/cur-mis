<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\ServiceCatalogService;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;
use App\Models\ServiceDocumentTypeModel;

class ServiceCatalogController extends BaseController
{
    private ServiceCatalogService     $service;
    private ServiceDocumentTypeModel  $documentTypeModel;

    public function __construct()
    {
        $this->service           = new ServiceCatalogService();
        $this->documentTypeModel = new ServiceDocumentTypeModel();
    }

    /** GET /api/admin/service-catalog/document-types — options for the admin "generates" dropdown. */
    public function documentTypes(Request $request, Response $response): never
    {
        $this->success($response, $this->documentTypeModel->listActive(), 'Document types fetched successfully.');
    }

    public function index(Request $request, Response $response): never
    {
        $this->success($response, $this->service->listPublic(), 'Services fetched successfully.');
    }

    public function show(Request $request, Response $response): never
    {
        $slug = (string)$request->param('slug');
        $detail = $this->service->getPublicDetail($slug);

        if (!$detail) {
            $this->error($response, 'Service not found.', 404);
        }

        $this->success($response, $detail, 'Service fetched successfully.');
    }

    public function listAdmin(Request $request, Response $response): never
    {
        $this->success($response, $this->service->listForAdmin(), 'Services fetched successfully.');
    }

    public function showAdmin(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $service = $this->service->getForAdmin($id);

        if (!$service) {
            $this->error($response, 'Service not found.', 404);
        }

        $this->success($response, $service, 'Service fetched successfully.');
    }

    public function store(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'code' => ['required', 'min:2', 'max:50'],
            'name' => ['required', 'min:2', 'max:150'],
            'slug' => ['required', 'min:2', 'max:150'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $authUser = (array)$request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        try {
            $id = $this->service->create($data, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        SystemLogService::log('CREATE', 'SERVICE_REQUESTS', "Created service catalog entry '{$data['name']}' (ID {$id}).", $id, 'service_catalog', null, $authUser ?: null);
        $this->success($response, ['id' => $id], 'Service created successfully.', 201);
    }

    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->service->getForAdmin($id)) {
            $this->error($response, 'Service not found.', 404);
        }

        $authUser = (array)$request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        try {
            $this->service->update($id, $data, $actorId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        SystemLogService::log('UPDATE', 'SERVICE_REQUESTS', "Updated service catalog entry ID {$id}.", $id, 'service_catalog', null, $authUser ?: null);
        $this->success($response, null, 'Service updated successfully.');
    }

    public function deactivate(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');

        if (!$this->service->getForAdmin($id)) {
            $this->error($response, 'Service not found.', 404);
        }

        $authUser = (array)$request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        $this->service->deactivate($id, $actorId);

        SystemLogService::log('UPDATE', 'SERVICE_REQUESTS', "Deactivated service catalog entry ID {$id}.", $id, 'service_catalog', null, $authUser ?: null);
        $this->success($response, null, 'Service deactivated successfully.');
    }
}
