<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

use Core\Database;
use App\Constants\Permissions;

$db = Database::getInstance();

// 1. Create a System category if not exists
$catSql = "SELECT id FROM permission_categories WHERE name = 'System' LIMIT 1";
$category = $db->fetchOne($catSql);

if (!$category) {
    $db->execute("INSERT INTO permission_categories (name, description) VALUES (?, ?)", ['System', 'Core system management permissions']);
    $categoryId = $db->lastInsertId();
} else {
    $categoryId = $category['id'];
}

// 2. Insert Permissions from Constants
$permissions = [
    [
        'name' => 'MANAGE_ROLES',
        'slug' => Permissions::MANAGE_ROLES,
        'description' => 'Allows creating, updating and deleting system roles.'
    ],
    [
        'name' => 'MANAGE_PERMISSIONS',
        'slug' => Permissions::MANAGE_PERMISSIONS,
        'description' => 'Allows organizing permissions and categories.'
    ],
    [
        'name' => 'MANAGE_USERS',
        'slug' => Permissions::MANAGE_USERS,
        'description' => 'Allows administrative user management (CRUD, roles, status).'
    ]
];

foreach ($permissions as $perm) {
    $exists = $db->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$perm['slug']]);
    if (!$exists) {
        $db->execute(
            "INSERT INTO permissions (category_id, name, slug, description) VALUES (?, ?, ?, ?)",
            [$categoryId, $perm['name'], $perm['slug'], $perm['description']]
        );
        echo "Created permission: {$perm['slug']}\n";
    } else {
        echo "Permission {$perm['slug']} already exists.\n";
    }
}

echo "Seeding completed successfully.\n";
