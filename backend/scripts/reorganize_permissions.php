<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

use Core\Database;
use App\Constants\Permissions;

$db = Database::getInstance();

echo "Starting permission reorganization...\n";

// 1. Reorganize Categories
$categories = [
    1 => [
        'name' => 'Administration',
        'description' => 'System-wide administrative controls and user management.'
    ],
    2 => [
        'name' => 'Academic Registry',
        'description' => 'Management of students, programs, and academic records.'
    ],
    3 => [
        'name' => 'Finance & Accounts',
        'description' => 'Handling of student fees, billing, and accounting.'
    ],
    4 => [
        'name' => 'Examinations',
        'description' => 'Planning and recording of examinations and results.'
    ]
];

foreach ($categories as $id => $cat) {
    $exists = $db->fetchOne("SELECT id FROM permission_categories WHERE id = ?", [$id]);
    if ($exists) {
        $db->execute("UPDATE permission_categories SET name = ?, description = ? WHERE id = ?", [$cat['name'], $cat['description'], $id]);
        echo "Updated category: {$cat['name']}\n";
    } else {
        $db->execute("INSERT INTO permission_categories (id, name, description) VALUES (?, ?, ?)", [$id, $cat['name'], $cat['description']]);
        echo "Created category: {$cat['name']}\n";
    }
}

// 2. Define Permissions per category
$permsByCat = [
    1 => [
        ['name' => 'Manage Roles', 'slug' => Permissions::MANAGE_ROLES],
        ['name' => 'Manage Permissions', 'slug' => 'MANAGE_PERMISSIONS'],
        ['name' => 'Manage Users', 'slug' => Permissions::MANAGE_USERS],
        ['name' => 'View System Logs', 'slug' => Permissions::VIEW_SYSTEM_LOGS],
    ],
    2 => [
        ['name' => 'View Student Profiles', 'slug' => Permissions::VIEW_STUDENTS],
        ['name' => 'Manage Academic Programs', 'slug' => Permissions::MANAGE_ACADEMICS],
    ],
    3 => [
        ['name' => 'Manage Financial Records', 'slug' => Permissions::MANAGE_FINANCE],
    ],
    4 => [
        ['name' => 'Manage Examination Results', 'slug' => Permissions::MANAGE_EXAMS],
    ]
];

foreach ($permsByCat as $catId => $perms) {
    foreach ($perms as $p) {
        $exists = $db->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$p['slug']]);
        if ($exists) {
            $db->execute("UPDATE permissions SET category_id = ?, name = ? WHERE slug = ?", [$catId, $p['name'], $p['slug']]);
            echo "Updated permission: {$p['slug']} -> Category $catId\n";
        } else {
            $db->execute("INSERT INTO permissions (category_id, name, slug) VALUES (?, ?, ?)", [$catId, $p['name'], $p['slug']]);
            echo "Created permission: {$p['slug']} -> Category $catId\n";
        }
    }
}

// 3. Auto-assign all to Superadmin (Role 1)
$roleId = 1;
$allPerms = $db->fetchAll("SELECT id FROM permissions");
$db->execute("DELETE FROM role_permissions WHERE role_id = ?", [$roleId]);

foreach ($allPerms as $perm) {
    $db->execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [$roleId, $perm['id']]);
}

echo "Assigned " . count($allPerms) . " permissions to Superadmin.\n";
echo "Reorganization completed successfully.\n";
