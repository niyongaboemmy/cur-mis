<?php

declare(strict_types=1);

namespace App\Seeders;

use App\Constants\Permissions;
use Core\Database;

/**
 * Seeds the core "System" permission category and its base permissions.
 * Safe to re-run — every insert is guarded by an existence check.
 */
class PermissionsSeeder implements SeederInterface
{
    public static function run(): array
    {
        $db  = Database::getInstance();
        $log = [];

        $category = $db->fetchOne(
            "SELECT id FROM permission_categories WHERE name = 'System' LIMIT 1"
        );

        if (!$category) {
            $db->execute(
                "INSERT INTO permission_categories (name, description) VALUES (?, ?)",
                ['System', 'Core system management permissions']
            );
            $categoryId = $db->lastInsertId();
            $log[] = 'Created "System" permission category.';
        } else {
            $categoryId = $category['id'];
        }

        $permissions = [
            [
                'name'        => 'MANAGE_ROLES',
                'slug'        => Permissions::MANAGE_ROLES,
                'description' => 'Allows creating, updating and deleting system roles.',
            ],
            [
                'name'        => 'MANAGE_PERMISSIONS',
                'slug'        => Permissions::MANAGE_PERMISSIONS,
                'description' => 'Allows organizing permissions and categories.',
            ],
            [
                'name'        => 'MANAGE_USERS',
                'slug'        => Permissions::MANAGE_USERS,
                'description' => 'Allows administrative user management (CRUD, roles, status).',
            ],
        ];

        foreach ($permissions as $perm) {
            $exists = $db->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$perm['slug']]);
            if ($exists) {
                $log[] = "Permission {$perm['slug']} already exists.";
                continue;
            }

            $db->execute(
                "INSERT INTO permissions (category_id, name, slug, description) VALUES (?, ?, ?, ?)",
                [$categoryId, $perm['name'], $perm['slug'], $perm['description']]
            );
            $log[] = "Created permission: {$perm['slug']}";
        }

        return $log;
    }
}
