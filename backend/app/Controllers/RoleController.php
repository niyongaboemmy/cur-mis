<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\RoleModel;
use App\Models\RolePermissionModel;
use App\Helpers\ValidationHelper;

class RoleController extends BaseController
{
    private RoleModel $roleModel;
    private RolePermissionModel $rolePermModel;

    public function __construct()
    {
        $this->roleModel     = new RoleModel();
        $this->rolePermModel = new RolePermissionModel();
    }

    public function index(Request $request, Response $response): never
    {
        $roles = $this->roleModel->all();
        // optionally attach permissions count or mapped IDs if needed
        foreach ($roles as &$role) {
            $role['permissions'] = $this->rolePermModel->getSlugsForRole((int)$role['id']);
        }
        $this->success($response, $roles, 'Roles fetched successfully.');
    }

    public function show(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $role = $this->roleModel->find($id);

        if (!$role) {
            $this->error($response, 'Role not found', 404);
        }

        $role['permissions'] = $this->rolePermModel->getSlugsForRole((int)$role['id']);
        $this->success($response, $role, 'Role fetched successfully.');
    }

    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'name' => ['required', 'min:2', 'max:50'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->roleModel->exists('name', $data['name'])) {
            $this->error($response, 'Role name already exists.', 409);
        }

        $id = $this->roleModel->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, ['id' => $id], 'Role created successfully.', 201);
    }

    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->roleModel->find($id)) {
            $this->error($response, 'Role not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'name' => ['required', 'min:2', 'max:50'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // check unique excluding self
        $existing = $this->roleModel->findBy('name', $data['name']);
        if ($existing && $existing['id'] != $id) {
            $this->error($response, 'Role name already exists.', 409);
        }

        $this->roleModel->update($id, [
            'name' => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, null, 'Role updated successfully.');
    }

    public function destroy(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');

        if (!$this->roleModel->find($id)) {
            $this->error($response, 'Role not found', 404);
        }

        // Cannot delete Superadmin easily if we want to protect it, but for now standard delete.
        $this->roleModel->delete($id);
        $this->success($response, null, 'Role deleted successfully.');
    }

    public function assignPermissions(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body(); // Expecting json: { "permissions": [1, 5, 8] }

        if (!$this->roleModel->find($id)) {
            $this->error($response, 'Role not found', 404);
        }

        if (!isset($data['permissions']) || !is_array($data['permissions'])) {
            $this->error($response, 'Permissions array is required', 422);
        }

        $this->rolePermModel->clearForRole($id);

        foreach ($data['permissions'] as $permId) {
            try {
                $this->rolePermModel->create([
                    'role_id' => $id,
                    'permission_id' => (int)$permId
                ]);
            } catch (\Exception $e) {
                // Ignore foreign key constrain fail if perm ID doesn't exist
                continue;
            }
        }

        $this->success($response, null, 'Permissions assigned successfully.');
    }
}
