# RBAC Scope Assignment Routes - Setup Guide

This document shows exactly where and how to add the scope assignment routes to your application.

## 1. Adding Routes to `backend/routes/api/admin.php`

Add these routes to your existing admin router file. They should be protected by `MANAGE_USERS` permission.

```php
<?php
// backend/routes/api/admin.php

use Core\Router;
use App\Controllers\ScopeAssignmentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router = new Router();

// ... existing admin routes ...

// ──────────────────────────────────────────────────────────
// Department & Faculty Scope Management
// ──────────────────────────────────────────────────────────

// Assign user to department
$router->post('/admin/scope/assign-department', [ScopeAssignmentController::class, 'assignDepartment'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// Remove user from department
$router->post('/admin/scope/unassign-department', [ScopeAssignmentController::class, 'unassignDepartment'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// Get departments assigned to a user
$router->get('/admin/scope/user-departments', [ScopeAssignmentController::class, 'getUserDepartments'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// Assign user to faculty
$router->post('/admin/scope/assign-faculty', [ScopeAssignmentController::class, 'assignFaculty'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// Remove user from faculty
$router->post('/admin/scope/unassign-faculty', [ScopeAssignmentController::class, 'unassignFaculty'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// Get faculties assigned to a user
$router->get('/admin/scope/user-faculties', [ScopeAssignmentController::class, 'getUserFaculties'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_USERS),
]);

// ... rest of existing admin routes ...
```

## 2. Adding Scope Middleware to Existing Routes

### HR Module - Leave Requests
```php
// backend/routes/api/hr.php

use App\Middleware\DepartmentScopeMiddleware;

// Existing route - ADD DepartmentScopeMiddleware
$router->get('/hr/leave', [LeaveController::class, 'getLeaveRequests'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← ADD THIS
]);

// Approve leave (also add scope validation in controller)
$router->post('/hr/leave/:id/approve', [LeaveApprovalController::class, 'approve'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← ADD THIS
]);
```

### Students Module
```php
// backend/routes/api/students.php

use App\Middleware\DepartmentScopeMiddleware;

// List students (HOD sees only their dept)
$router->get('/students', [StudentController::class, 'index'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_STUDENTS),
    new DepartmentScopeMiddleware(),  // ← ADD THIS
]);

// View single student
$router->get('/students/:id', [StudentController::class, 'show'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_STUDENTS),
    new DepartmentScopeMiddleware(),  // ← ADD THIS
]);
```

### Academic Module - Departments (for Faculty Deans)
```php
// backend/routes/api/academic.php

use App\Middleware\FacultyScopeMiddleware;

// Faculty Dean sees only their faculties
$router->get('/academic/departments', [DepartmentController::class, 'index'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_DEPARTMENTS),
    new FacultyScopeMiddleware(),  // ← ADD THIS
]);

// Faculty Dean can't create/edit departments from other faculties
$router->post('/academic/departments', [DepartmentController::class, 'create'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_DEPARTMENTS),
    new FacultyScopeMiddleware(),  // ← ADD THIS
]);
```

## 3. Example: Complete Route File with Scoping

Here's a complete example of what your updated `backend/routes/api/hr.php` should look like:

```php
<?php

declare(strict_types=1);

namespace App\Routes;

use Core\Router;
use App\Controllers\LeaveController;
use App\Controllers\LeaveApprovalController;
use App\Controllers\StaffController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\DepartmentScopeMiddleware;
use App\Constants\Permissions;

/**
 * HR Module Routes
 *
 * All routes require AuthMiddleware. Most also require:
 * - PermissionMiddleware (specific permission)
 * - DepartmentScopeMiddleware (if user's role has enforce_department_scope=1)
 */

$router = new Router();

// ──────────────────────────────────────────────────────────
// Leave Types (global, no scoping needed)
// ──────────────────────────────────────────────────────────

$router->get('/hr/leave/types', [LeaveController::class, 'leaveTypes'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
]);

$router->post('/hr/leave/types', [LeaveController::class, 'createLeaveType'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_LEAVE_TYPES),
]);

// ──────────────────────────────────────────────────────────
// Leave Requests (SCOPED - HOD only sees their dept's leaves)
// ──────────────────────────────────────────────────────────

$router->get('/hr/leave', [LeaveController::class, 'getLeaveRequests'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← Scope all leave list endpoints
]);

$router->post('/hr/leave', [LeaveController::class, 'createLeaveRequest'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::REQUEST_LEAVE),
]);

$router->get('/hr/leave/:id', [LeaveController::class, 'getLeaveRequest'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← Scope single request access
]);

$router->post('/hr/leave/:id/approve', [LeaveApprovalController::class, 'approve'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← Scope approval access
]);

$router->post('/hr/leave/:id/reject', [LeaveApprovalController::class, 'reject'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← Scope rejection access
]);

// ──────────────────────────────────────────────────────────
// Staff (SCOPED - HOD only sees their department's staff)
// ──────────────────────────────────────────────────────────

$router->get('/hr/staff', [StaffController::class, 'index'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
    new DepartmentScopeMiddleware(),  // ← Scope staff listing
]);

$router->post('/hr/staff', [StaffController::class, 'create'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
    new DepartmentScopeMiddleware(),  // ← Scope staff creation
]);

$router->get('/hr/staff/:id', [StaffController::class, 'show'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES),
    new DepartmentScopeMiddleware(),  // ← Scope staff details
]);

$router->put('/hr/staff/:id', [StaffController::class, 'update'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
    new DepartmentScopeMiddleware(),  // ← Scope staff updates
]);

// ──────────────────────────────────────────────────────────
// Payroll (SCOPED - HOD only sees their department's payroll)
// ──────────────────────────────────────────────────────────

$router->get('/hr/payroll', [StaffController::class, 'getPayroll'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_PAYROLL),
    new DepartmentScopeMiddleware(),  // ← Scope payroll viewing
]);

return $router;
```

## 4. Checklist for Adding Scope Middleware

For each endpoint you want to scope:

- [ ] **Route Definition:** Add middleware to router (see examples above)
- [ ] **Controller Validation:** Add scope check in controller method
- [ ] **Query Filtering:** Apply scope filter to database query
- [ ] **Error Handling:** Return 403 if user tries to access outside scope
- [ ] **Testing:** Test HOD sees only their dept's data
- [ ] **Testing:** Test HOD cannot access other dept's data
- [ ] **Documentation:** Add comment showing scope is applied

## 5. Controller-Side Validation Example

Once you've added the middleware to the route, you must also validate in the controller:

```php
<?php

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Services\ScopeService;

class LeaveController extends BaseController
{
    private ScopeService $scopeService;

    public function __construct()
    {
        $this->scopeService = new ScopeService();
    }

    public function getLeaveRequests(Request $request, Response $response): never
    {
        $user = $request->param('_auth_user');
        $scope = $request->param('_department_scope');  // Set by middleware

        $query = "SELECT lr.* FROM leave_requests lr
                  JOIN staff s ON s.id = lr.staff_id";
        $params = [];

        // Apply scope if user has enforce_department_scope = 1
        if ($scope && $user['enforce_department_scope']) {
            $deptIds = $scope['assigned_departments'];
            $clause = $this->scopeService->buildDepartmentWhereClause($deptIds, 's.department_id');
            $query .= " WHERE " . $clause['where'];
            $params = $clause['params'];
        } else if (!$scope && $user['role_name'] === 'HOD') {
            // Safeguard: HOD without scope assignment = no access
            $this->error($response, 'You do not have any departments assigned.', 403);
        }

        $query .= " ORDER BY lr.created_at DESC";

        $leaves = $this->requestModel->db()->fetchAll($query, $params);
        $this->success($response, $leaves, 'Leave requests fetched.');
    }

    public function approveLeaveRequest(Request $request, Response $response): never
    {
        $leaveId = (int)$request->param('id');
        $user = $request->param('_auth_user');
        $scope = $request->param('_department_scope');

        $leave = $this->requestModel->find($leaveId);
        if (!$leave) {
            $this->error($response, 'Leave request not found.', 404);
        }

        // CRITICAL: Verify user can approve this specific leave
        if ($scope && $user['enforce_department_scope']) {
            $staff = $this->staffModel->find($leave['staff_id']);
            $staffDeptId = (int)($staff['department_id'] ?? 0);

            if (!in_array($staffDeptId, $scope['assigned_departments'], true)) {
                $this->error($response, 'You cannot approve leave from this department.', 403);
            }
        }

        // Approve
        $this->requestModel->update($leaveId, ['status' => 'approved']);
        $this->success($response, null, 'Leave approved.');
    }
}
```

## 6. Testing Your Routes

### Test 1: Admin can see all
```bash
# Login as admin
TOKEN=$(curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.data.token')

# Should return ALL leave requests (no filtering)
curl http://localhost/api/hr/leave \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | length'
# Output: 50 (for example)
```

### Test 2: HOD sees only their dept
```bash
# Login as HOD
TOKEN=$(curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hod_cs@example.com","password":"password"}' \
  | jq -r '.data.token')

# Should return ONLY CS department leave requests
curl http://localhost/api/hr/leave \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[].staff_id'
# Output: [1, 2, 3] (all staff in CS dept)
```

### Test 3: HOD without assignment gets error
```bash
# Create HOD user but DON'T assign department
# Then login as that HOD

TOKEN=$(curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"unassigned_hod@example.com","password":"password"}' \
  | jq -r '.data.token')

# Should get 403 error
curl http://localhost/api/hr/leave \
  -H "Authorization: Bearer $TOKEN"
# Output: {"success":false,"message":"You do not have any departments assigned.","status":403}
```

## 7. Production Deployment Checklist

- [ ] Migration run successfully: `2026_08_19_136_add_department_faculty_scoping.sql`
- [ ] All new models created and autoloaded
- [ ] All new middleware created and autoloaded
- [ ] All routes added to respective route files
- [ ] All controller methods updated with scope validation
- [ ] Staging tested with real HOD/Dean users
- [ ] Scope assignments created for test users
- [ ] All leave/student/academic endpoints tested
- [ ] No regressions in admin/superadmin access
- [ ] Audit logs show scope assignments
- [ ] Documentation updated for operations team

## 8. Rollback Plan (if needed)

If issues arise post-deployment:

```bash
# Revert migration (keeps data, removes tables/columns)
php migrate rollback 2026_08_19_136_add_department_faculty_scoping.sql

# Remove middleware from routes (comment them out in route files)

# Restart application
```

Data is safe because:
- Migration uses IF NOT EXISTS
- Old columns are never touched
- `user_department_assignments` and `user_faculty_assignments` are independent tables
- Role scoping flags default to 0 (off)

If you need to keep the tables but disable scoping, simply revert the role columns:
```sql
UPDATE roles SET enforce_department_scope = 0, enforce_faculty_scope = 0;
```

---

## Complete Routing Summary

| Endpoint | Method | Permission | Middleware | Purpose |
|----------|--------|-----------|------------|---------|
| `/api/admin/scope/assign-department` | POST | MANAGE_USERS | Auth | Assign user to department |
| `/api/admin/scope/unassign-department` | POST | MANAGE_USERS | Auth | Remove user from department |
| `/api/admin/scope/user-departments` | GET | MANAGE_USERS | Auth | List user's departments |
| `/api/admin/scope/assign-faculty` | POST | MANAGE_USERS | Auth | Assign user to faculty |
| `/api/admin/scope/unassign-faculty` | POST | MANAGE_USERS | Auth | Remove user from faculty |
| `/api/admin/scope/user-faculties` | GET | MANAGE_USERS | Auth | List user's faculties |
| `/api/hr/leave` | GET | VIEW_LEAVE_REQUESTS | Auth + Dept | List leave (scoped) |
| `/api/hr/leave/:id/approve` | POST | MANAGE_LEAVE_REQUESTS | Auth + Dept | Approve leave (scoped) |
| `/api/hr/staff` | GET | VIEW_HR_EMPLOYEES | Auth + Dept | List staff (scoped) |
| `/api/academic/departments` | GET | MANAGE_DEPARTMENTS | Auth + Faculty | List departments (scoped) |

---

All routes are ready to deploy once the migration is run and the controller is available.
