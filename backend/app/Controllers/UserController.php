<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\UserModel;
use App\Models\RoleModel;
use App\Helpers\ValidationHelper;

class UserController extends BaseController
{
    private UserModel $userModel;
    private RoleModel $roleModel;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->roleModel = new RoleModel();
    }

    /**
     * List all users with their roles joined.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? '';

        $where = '';
        $bindings = [];

        if ($search !== '') {
            $where = "(full_name LIKE ? OR email LIKE ? OR username LIKE ?)";
            $bindings = ["%$search%", "%$search%", "%$search%"];
        }

        // We use paginate but we need role names. 
        // Our BaseModel::paginate is simple. Let's manually do the query for role labels or map them.
        $paginated = $this->userModel->paginate($page, $perPage, $where, $bindings, 'id', 'DESC');
        
        $roles = $this->roleModel->all();
        $roleMap = [];
        foreach ($roles as $r) {
            $roleMap[$r['id']] = $r['name'];
        }

        foreach ($paginated['data'] as &$user) {
            $user['role_name'] = $roleMap[$user['role_id'] ?? 0] ?? 'guest';
        }

        $this->success($response, $paginated, 'Users fetched successfully.');
    }

    /**
     * Get a single user.
     */
    public function show(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $user = $this->userModel->find($id);

        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $this->success($response, $user, 'User details fetched.');
    }

    /**
     * Admin creating a new user.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'full_name' => ['required', 'min:3'],
            'email'     => ['required', 'email'],
            'username'  => ['required', 'min:3'],
            'password'  => ['required', 'min:6'],
            'role_id'   => ['required']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->userModel->exists('email', $data['email'])) {
            $this->error($response, 'Email already registered', 409);
        }
        
        if ($this->userModel->exists('username', $data['username'])) {
            $this->error($response, 'Username already taken', 409);
        }

        $id = $this->userModel->create([
            'full_name' => $data['full_name'],
            'email'     => $data['email'],
            'username'  => $data['username'],
            'password'  => password_hash($data['password'], PASSWORD_BCRYPT),
            'role_id'   => (int)$data['role_id'],
            'is_active' => 1
        ]);

        $this->success($response, ['id' => $id], 'User created successfully.', 201);
    }

    /**
     * Update user details.
     */
    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'full_name' => ['required', 'min:3'],
            'email'     => ['required', 'email'],
            'role_id'   => ['required']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // Check uniqueness if email changed
        if ($data['email'] !== $user['email'] && $this->userModel->exists('email', $data['email'], $id)) {
            $this->error($response, 'Email already in use', 409);
        }

        $updateData = [
            'full_name' => $data['full_name'],
            'email'     => $data['email'],
            'role_id'   => (int)$data['role_id']
        ];

        if (!empty($data['password'])) {
            $updateData['password'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        if (isset($data['is_active'])) {
             $updateData['is_active'] = (int)$data['is_active'];
        }

        $this->userModel->update($id, $updateData);
        $this->success($response, null, 'User updated successfully.');
    }

    /**
     * Delete a user. Cannot delete your own account.
     */
    public function delete(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $authUser = $request->param('_auth_user');

        if ($id === (int)($authUser['id'] ?? 0)) {
            $this->error($response, 'You cannot delete your own account.', 403);
        }

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $this->userModel->delete($id);
        $this->success($response, null, 'User deleted successfully.');
    }

    /**
     * Toggle active status.
     */
    public function toggleStatus(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $user = $this->userModel->find($id);

        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $newStatus = (int)($user['is_active']) === 1 ? 0 : 1;
        $this->userModel->update($id, ['is_active' => $newStatus]);

        $this->success($response, ['is_active' => $newStatus], 'User status toggled.');
    }
}
