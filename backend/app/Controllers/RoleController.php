<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\RoleModel;
use App\Models\RolePermissionModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;
use App\Services\LeaveApprovalService;
use Core\Database;

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
        $roles = $this->roleModel->getWithUserCounts();
        
        // attach permissions slugs
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

        if ($this->roleModel->findByNameCaseInsensitive($data['name'])) {
            $this->error($response, 'Role name already exists.', 409);
        }

        $id = $this->roleModel->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('CREATE', 'ROLES', "Created role '{$data['name']}' (ID {$id}).", (int) $id, 'role', null, $actor ?: null);
        $this->success($response, ['id' => $id], 'Role created successfully.', 201);
    }

    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        $role = $this->roleModel->find($id);
        if (!$role) {
            $this->error($response, 'Role not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'name' => ['required', 'min:2', 'max:50'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $isRename = strcasecmp((string)$role['name'], (string)$data['name']) !== 0;
        if ($isRename && (int)($role['is_system'] ?? 0) === 1) {
            $this->error($response, 'System roles cannot be renamed.', 403);
        }

        // check unique excluding self, case-insensitive
        $existing = $this->roleModel->findByNameCaseInsensitive($data['name']);
        if ($existing && $existing['id'] != $id) {
            $this->error($response, 'Role name already exists.', 409);
        }

        $update = [
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
        ];
        if (array_key_exists('enforce_campus_scope', $data)) {
            $update['enforce_campus_scope'] = !empty($data['enforce_campus_scope']) ? 1 : 0;
        }
        $this->roleModel->update($id, $update);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'ROLES', "Updated role ID {$id} to '{$data['name']}'.", $id, 'role', null, $actor ?: null);
        $this->success($response, null, 'Role updated successfully.');
    }

    public function destroy(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');

        $role = $this->roleModel->find($id);
        if (!$role) {
            $this->error($response, 'Role not found', 404);
        }

        // Finding A (RBAC_PERMISSIONS_AUDIT.md): system roles are load-bearing
        // for the permission model itself and must never be deletable via the API.
        if ((int)($role['is_system'] ?? 0) === 1) {
            $this->error($response, 'System roles cannot be deleted.', 403);
        }

        $this->roleModel->delete($id);
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('DELETE', 'ROLES', "Deleted role ID {$id}.", $id, 'role', null, $actor ?: null);
        $this->success($response, null, 'Role deleted successfully.');
    }

    public function assignPermissions(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body(); // Expecting json: { "permissions": [1, 5, 8], "enforce_campus_scope"?: 0|1 }

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

        // The Permissions modal saves the campus-scope toggle alongside the
        // permission grid in one request, so accept it here as a convenience.
        if (array_key_exists('enforce_campus_scope', $data)) {
            $this->roleModel->update($id, [
                'enforce_campus_scope' => !empty($data['enforce_campus_scope']) ? 1 : 0,
            ]);
        }

        $this->syncLeaveStageBindings($id);

        $actor = (array) $request->param('_auth_user');
        $count = count($data['permissions']);
        SystemLogService::log('ASSIGN', 'ROLES', "Assigned {$count} permission(s) to role ID {$id}.", $id, 'role', ['permission_ids' => $data['permissions']], $actor ?: null);
        $this->success($response, null, 'Permissions assigned successfully.');
    }

    /**
     * Mirror this role's leave stage permissions into `leave_stage_role_bindings`.
     *
     * A leave approval stage is gated on a permission, not on a role, so
     * granting APPROVE_LEAVE_* here is how an administrator staffs a stage that
     * would otherwise queue at an office with no accounts in it. Migration 137
     * turned that binding into a table because the separation-of-duties sweep
     * used to delete any stage grant it did not recognise from its hard-coded
     * list — a fix made on this screen did not survive the next deploy.
     * Registering the grant here is what makes it durable.
     *
     * Best-effort: the permission grid has already been written and the request
     * succeeds either way, so a failure here is logged rather than raised.
     */
    private function syncLeaveStageBindings(int $roleId): void
    {
        try {
            $role = $this->roleModel->find($roleId);
            if (!$role || ($role['name'] ?? '') === 'superadmin') {
                return;
            }

            $db    = Database::getInstance();
            $name  = (string) $role['name'];
            $slugs = LeaveApprovalService::STAGE_PERMISSIONS;

            // What the role holds after the rewrite above. That intersection is
            // what should be bound; any stage it used to sign is now unbound.
            $held = array_values(array_intersect(
                $slugs,
                $this->rolePermModel->getSlugsForRole($roleId)
            ));

            $sql = 'DELETE FROM `leave_stage_role_bindings`
                     WHERE `role_name` = ?
                       AND `permission_slug` IN (' . implode(',', array_fill(0, count($slugs), '?')) . ')';
            if ($held) {
                $sql .= ' AND `permission_slug` NOT IN (' . implode(',', array_fill(0, count($held), '?')) . ')';
            }
            $db->execute($sql, array_merge([$name], $slugs, $held));

            foreach ($held as $slug) {
                $db->execute(
                    'INSERT IGNORE INTO `leave_stage_role_bindings`
                       (`role_name`, `permission_slug`, `note`)
                     VALUES (?, ?, ?)',
                    [$name, $slug, 'Granted in Settings → Roles']
                );
            }
        } catch (\Throwable $e) {
            error_log('[RoleController] leave stage binding sync failed: ' . $e->getMessage());
        }
    }
}
