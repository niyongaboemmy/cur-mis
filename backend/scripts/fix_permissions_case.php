<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

use Core\Database;

$db = Database::getInstance();

// 1. Rename existing permissions in the DB to Capital case
$mapping = [
    'manage_roles' => 'MANAGE_ROLES',
    'manage_permissions' => 'MANAGE_PERMISSIONS'
];

foreach ($mapping as $old => $new) {
    $db->execute("UPDATE permissions SET slug = ? WHERE slug = ?", [$new, $old]);
    echo "Updated permission slug: $old -> $new\n";
}

// 2. Clear role 1 permissions and re-assign the capitalized ones
$roleId = 1;

// Get the IDs of the newly capitalized permissions
$permIds = $db->fetchAll("SELECT id FROM permissions WHERE slug IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS', 'MANAGE_USERS')");

if (empty($permIds)) {
     // If they didn't exist for some reason, insert them (fallback)
     // First find category
     $cat = $db->fetchOne("SELECT id FROM permission_categories WHERE name = 'System' LIMIT 1");
     $catId = $cat ? $cat['id'] : 1;
     
     foreach ($mapping as $new) {
         $exists = $db->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$new]);
         if (!$exists) {
             $db->execute("INSERT INTO permissions (category_id, name, slug) VALUES (?, ?, ?)", [$catId, $new, $new]);
             echo "Inserted missing permission: $new\n";
         }
     }
     $permIds = $db->fetchAll("SELECT id FROM permissions WHERE slug IN ('MANAGE_ROLES', 'MANAGE_PERMISSIONS', 'MANAGE_USERS')");
}

$db->execute("DELETE FROM role_permissions WHERE role_id = ?", [$roleId]);

foreach ($permIds as $p) {
    $db->execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [$roleId, $p['id']]);
    echo "Assigned permission ID {$p['id']} to role ID $roleId\n";
}

echo "Renaming and assignment completed.\n";
