<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\PermissionCategoryModel;
use App\Models\RolePermissionModel;

class NavigationController extends BaseController
{
    private PermissionCategoryModel $categoryModel;
    private RolePermissionModel $rolePermModel;

    public function __construct()
    {
        $this->categoryModel = new PermissionCategoryModel();
        $this->rolePermModel = new RolePermissionModel();
    }

    /**
     * Get the dynamic navigation structure based on the current user's role.
     */
    public function index(Request $request, Response $response): never
    {
        $user = $request->param('_auth_user');
        if (!$user) {
            $this->error($response, 'Unauthenticated', 401);
        }

        $roleId = (int)($user['role_id'] ?? 0);
        
        // 1. Fetch all categories
        $categories = $this->categoryModel->all();
        
        // 2. Fetch the permissions assigned to this role, with their slugs and names
        // We'll join permissions and categories
        $userPermissions = $this->rolePermModel->getDetailedPermissionsForRole($roleId);

        // 3. Build grouped structure
        $navStructure = [];
        foreach ($categories as $cat) {
            $items = array_values(array_filter($userPermissions, fn($p) => $p['category_id'] == $cat['id']));
            
            if (!empty($items)) {
                $navStructure[] = [
                    'label' => $cat['name'],
                    'items' => array_map(fn($p) => [
                        'slug' => $p['slug'],
                        'name' => $p['name']
                    ], $items)
                ];
            }
        }

        $this->success($response, $navStructure, 'Navigation structure fetched.');
    }
}
