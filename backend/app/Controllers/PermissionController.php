<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\PermissionCategoryModel;
use App\Models\PermissionModel;

class PermissionController extends BaseController
{
    private PermissionCategoryModel $categoryModel;
    private PermissionModel $permissionModel;

    public function __construct()
    {
        $this->categoryModel   = new PermissionCategoryModel();
        $this->permissionModel = new PermissionModel();
    }

    /**
     * Get all categories with nested permissions
     */
    public function index(Request $request, Response $response): never
    {
        $categories = $this->categoryModel->all();
        $allPermissions = $this->permissionModel->all();

        // Group permissions by category
        foreach ($categories as &$cat) {
            $cat['permissions'] = array_values(array_filter($allPermissions, fn($p) => $p['category_id'] == $cat['id']));
        }

        $this->success($response, $categories, 'Permissions fetched successfully.');
    }

    /**
     * Create a category
     */
    public function createCategory(Request $request, Response $response): never
    {
        $data = $request->body();
        if (empty($data['name'])) {
            $this->error($response, 'Name is required', 422);
        }

        if ($this->categoryModel->exists('name', $data['name'])) {
            $this->error($response, 'Category already exists', 409);
        }

        $id = $this->categoryModel->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, ['id' => $id], 'Category created successfully.', 201);
    }
    
    /**
     * Update category
     */
    public function updateCategory(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->categoryModel->find($id)) {
            $this->error($response, 'Category not found', 404);
        }

        $this->categoryModel->update($id, [
            'name' => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, null, 'Category updated successfully.');
    }

    /**
     * Create a permission
     */
    public function createPermission(Request $request, Response $response): never
    {
        $data = $request->body();
        
        if (empty($data['category_id']) || empty($data['name']) || empty($data['slug'])) {
            $this->error($response, 'Category ID, name, and slug are required.', 422);
        }

        if ($this->permissionModel->exists('slug', $data['slug'])) {
            $this->error($response, 'Permission slug already exists', 409);
        }

        $id = $this->permissionModel->create([
            'category_id' => $data['category_id'],
            'name'        => $data['name'],
            'slug'        => $data['slug'],
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, ['id' => $id], 'Permission created successfully.', 201);
    }

    /**
     * Update permission
     */
    public function updatePermission(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->permissionModel->find($id)) {
            $this->error($response, 'Permission not found', 404);
        }

        $this->permissionModel->update($id, [
            'name' => $data['name'] ?? null,
            'slug' => $data['slug'] ?? null,
            'description' => $data['description'] ?? null
        ]);

        $this->success($response, null, 'Permission updated successfully.');
    }

    public function deletePermission(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $this->permissionModel->delete($id);
        $this->success($response, null, 'Permission deleted.');
    }
}
