<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Constants\Permissions;
use App\Models\PermissionCategoryModel;
use App\Models\PermissionModel;

// Load environment
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

echo "Starting Permissions Sync...\n";

$categoryModel = new PermissionCategoryModel();
$permissionModel = new PermissionModel();

$mappings = [
    'Administration' => [
        Permissions::MANAGE_ROLES,
        Permissions::MANAGE_PERMISSIONS,
        Permissions::MANAGE_USERS,
        Permissions::VIEW_SYSTEM_LOGS,
    ],
    'System Settings' => [
        Permissions::MANAGE_ACADEMIC_YEARS,
        Permissions::MANAGE_ACADEMIC_TERMS,
        Permissions::VIEW_SYSTEM_BASICS,
        Permissions::VIEW_SETTINGS,
        Permissions::MANAGE_SETTINGS,
    ],
    'Academic Registry' => [
        Permissions::VIEW_STUDENTS,
        Permissions::MANAGE_STUDENTS,
        Permissions::MANAGE_ACADEMICS,
        Permissions::MANAGE_DEGREES,
        Permissions::MANAGE_FACILITIES,
        Permissions::MANAGE_DEPARTMENTS,
        Permissions::MANAGE_OPTIONS,
        Permissions::MANAGE_LEVELS,
        Permissions::MANAGE_MODULES,
        Permissions::MANAGE_SCHOOLS,
        Permissions::VIEW_TIMETABLE,
        Permissions::MANAGE_TIMETABLE,
    ],
    'Modules Management' => [
        Permissions::MANAGE_MODULE_SCHEDULES,
        Permissions::MANAGE_MODULE_ASSIGNMENTS,
        Permissions::MANAGE_MODULE_REGISTRATIONS,
        Permissions::VIEW_MY_MODULES,
    ],
    'HR Management' => [
        Permissions::VIEW_HR_EMPLOYEES,
        Permissions::MANAGE_HR_EMPLOYEES,
        Permissions::MANAGE_LEAVE_TYPES,
        Permissions::VIEW_PAYROLL,
        Permissions::MANAGE_PAYROLL,
        Permissions::VIEW_LEAVE_REQUESTS,
        Permissions::MANAGE_LEAVE_REQUESTS,
    ],
    'Finance' => [
        Permissions::VIEW_FINANCE,
        Permissions::MANAGE_FINANCE,
    ],
    'Admissions' => [
        Permissions::MANAGE_ADMISSION_REQUIREMENTS,
        Permissions::MANAGE_STUDENT_APPLICATIONS,
        Permissions::VERIFY_DOCUMENTS,
        Permissions::MANAGE_ADMISSIONS,
        Permissions::VIEW_MERIT_LIST,
        Permissions::MANAGE_MERIT_LIST,
    ],
    'Examinations' => [
        Permissions::VIEW_EXAMS,
        Permissions::MANAGE_EXAMS,
    ],
    'Attendance' => [
        Permissions::VIEW_ATTENDANCE,
        Permissions::RECORD_ATTENDANCE,
        Permissions::MANAGE_ATTENDANCE,
    ],
    'Student Clearance' => [
        Permissions::VIEW_CLEARANCE,
        Permissions::MANAGE_CLEARANCE,
    ],
    'External Portals' => [
        Permissions::ACCESS_APPLICANT_PORTAL,
        Permissions::ACCESS_STUDENT_PORTAL,
    ],
    'Applicant Self-Service' => [
        Permissions::MANAGE_OWN_PROFILE,
    ],
];

foreach ($mappings as $catName => $perms) {
    echo "Processing Category: $catName\n";
    
    // Ensure category exists
    $cat = $categoryModel->db()->fetchOne("SELECT id FROM permission_categories WHERE name = ?", [$catName]);
    if (!$cat) {
        $catId = $categoryModel->create(['name' => $catName]);
        echo "  [+] Created Category: $catName (ID: $catId)\n";
    } else {
        $catId = (int)$cat['id'];
        echo "  [=] Category Exists: $catName (ID: $catId)\n";
    }

    foreach ($perms as $slug) {
        // Human-friendly name from slug
        $name = ucwords(strtolower(str_replace('_', ' ', $slug)));
        
        $perm = $permissionModel->db()->fetchOne("SELECT id FROM permissions WHERE slug = ?", [$slug]);
        if (!$perm) {
            $permissionModel->create([
                'category_id' => $catId,
                'name'        => $name,
                'slug'        => $slug,
                'description' => "Allows user to " . strtolower($name)
            ]);
            echo "    [+] Created Permission: $slug\n";
        } else {
            // Update to ensure category_id is correct
            $permissionModel->update((int)$perm['id'], [
                'category_id' => $catId,
                'name'        => $name // Keep name in sync
            ]);
            echo "    [=] Updated Permission: $slug\n";
        }
    }
}

echo "\nPermissions Sync Complete!\n";
