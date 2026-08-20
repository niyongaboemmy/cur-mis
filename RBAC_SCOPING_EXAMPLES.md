# Department & Faculty Scoping - Implementation Examples

This document provides concrete code examples for applying scope filtering to existing endpoints.

## Pattern 1: Filter List Endpoint (Leave Requests by HOD)

### Before (No Scoping)
```php
// LeaveController::getLeaveRequests()
public function getLeaveRequests(Request $request, Response $response): never
{
    $leaves = $this->requestModel->all();
    $this->success($response, $leaves, 'Leave requests fetched.');
}
```

### After (With Department Scoping)
```php
// LeaveController::getLeaveRequests()
public function getLeaveRequests(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_department_scope');  // Set by DepartmentScopeMiddleware
    
    // Build base query
    $query = "SELECT lr.* FROM leave_requests lr
              JOIN staff s ON s.id = lr.staff_id";
    $params = [];
    
    // Apply department scope if user has enforce_department_scope = 1
    if ($scope && $user['enforce_department_scope']) {
        $deptIds = $scope['assigned_departments'];
        $placeholders = implode(',', array_fill(0, count($deptIds), '?'));
        $query .= " WHERE s.department_id IN ($placeholders)";
        $params = $deptIds;
    } else if (!$scope && $user['role_name'] === 'HOD') {
        // Safeguard: HOD without scope assignment should see nothing
        $query .= " WHERE 1=0";
    }
    
    $query .= " ORDER BY lr.created_at DESC";
    
    $leaves = $this->requestModel->db()->fetchAll($query, $params);
    $this->success($response, $leaves, 'Leave requests fetched.');
}
```

### Router Setup
```php
// backend/routes/api/hr.php
$router->get('/hr/leave', [LeaveController::class, 'getLeaveRequests'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
    new DepartmentScopeMiddleware(),  // ← Adds department scope validation
]);
```

---

## Pattern 2: Single Record Access (Check Scope Before Modifying)

### Before (No Scoping)
```php
// LeaveController::approveLeaveRequest()
public function approveLeaveRequest(Request $request, Response $response): never
{
    $leaveId = (int)$request->param('id');
    $leave = $this->requestModel->find($leaveId);
    
    if (!$leave) {
        $this->error($response, 'Leave request not found.', 404);
    }
    
    // Approve the leave
    $this->requestModel->update($leaveId, ['status' => 'approved']);
    $this->success($response, null, 'Leave approved.');
}
```

### After (With Scope Check)
```php
// LeaveController::approveLeaveRequest()
public function approveLeaveRequest(Request $request, Response $response): never
{
    $leaveId = (int)$request->param('id');
    $user = $request->param('_auth_user');
    $scope = $request->param('_department_scope');
    
    $leave = $this->requestModel->find($leaveId);
    
    if (!$leave) {
        $this->error($response, 'Leave request not found.', 404);
    }
    
    // Validate user can approve this leave (scope check)
    if ($scope && $user['enforce_department_scope']) {
        $staff = $this->staffModel->find($leave['staff_id']);
        $staffDeptId = (int)($staff['department_id'] ?? 0);
        
        if (!in_array($staffDeptId, $scope['assigned_departments'], true)) {
            $this->error($response, 'You cannot approve leave from this department.', 403);
        }
    }
    
    // Approve the leave
    $this->requestModel->update($leaveId, ['status' => 'approved']);
    $this->success($response, null, 'Leave approved.');
}
```

---

## Pattern 3: Faculty-Scoped Listing (Filter by Faculty)

### Before (No Scoping)
```php
// DepartmentController::getDepartments()
public function getDepartments(Request $request, Response $response): never
{
    $departments = $this->deptModel->all();
    $this->success($response, $departments, 'Departments fetched.');
}
```

### After (With Faculty Scoping)
```php
// DepartmentController::getDepartments()
public function getDepartments(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_faculty_scope');  // Set by FacultyScopeMiddleware
    
    $query = "SELECT * FROM departements";
    $params = [];
    
    if ($scope && $user['enforce_faculty_scope']) {
        $facultyIds = $scope['assigned_faculties'];
        $placeholders = implode(',', array_fill(0, count($facultyIds), '?'));
        $query .= " WHERE fac_id IN ($placeholders)";
        $params = $facultyIds;
    } else if (!$scope && $user['role_name'] === 'dean') {
        // Safeguard: Dean without faculty assignment should see nothing
        $query .= " WHERE 1=0";
    }
    
    $query .= " ORDER BY dep_name ASC";
    
    $departments = $this->deptModel->db()->fetchAll($query, $params);
    $this->success($response, $departments, 'Departments fetched.');
}
```

### Router Setup
```php
// backend/routes/api/admin.php
$router->get('/academic/departments', [DepartmentController::class, 'getDepartments'], [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_DEPARTMENTS),
    new FacultyScopeMiddleware(),  // ← For Faculty Deans
]);
```

---

## Pattern 4: Multi-Scope User (HOD with Multiple Departments)

### Scenario
An HOD manages both Computer Science AND Mathematics departments.

### Implementation
```php
public function viewStudents(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_department_scope');
    
    $query = "SELECT s.*, d.dep_name FROM students s
              JOIN departements d ON d.dep_id = s.department_id";
    $params = [];
    
    if ($scope && $user['enforce_department_scope']) {
        // User manages BOTH CS and Math departments
        $deptIds = $scope['assigned_departments'];  // [1, 2]
        $placeholders = implode(',', array_fill(0, count($deptIds), '?'));
        $query .= " WHERE s.department_id IN ($placeholders)";
        $params = $deptIds;  // Both department IDs
    }
    
    $students = $this->studentModel->db()->fetchAll($query, $params);
    
    // Frontend can group by department for clarity
    $this->success($response, $students, 'Students fetched.');
}
```

### Frontend Usage
```tsx
import { useAuthStore } from '@/store/authStore';

export function StudentList() {
  const { user } = useAuthStore();
  const [selectedDept, setSelectedDept] = useState<number | null>(null);

  const deptOptions = user?.assigned_departments ?? [];
  const defaultDept = deptOptions[0]?.id;

  if (!selectedDept && defaultDept) {
    setSelectedDept(defaultDept);
  }

  return (
    <div>
      {/* Show department selector only if user manages multiple departments */}
      {deptOptions.length > 1 && (
        <select value={selectedDept || ''} onChange={(e) => setSelectedDept(parseInt(e.target.value))}>
          {deptOptions.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      
      {/* Fetch students for selected department */}
      <StudentTable departmentId={selectedDept} />
    </div>
  );
}
```

---

## Pattern 5: Using ScopeService for Complex Filters

### Scenario
A report needs to show all modules taught by staff in the HOD's departments.

### Implementation
```php
use App\Services\ScopeService;

public function getModulesInDepartments(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_department_scope');
    $scopeService = new ScopeService();
    
    if (!$scope) {
        $this->error($response, 'Scope not available.', 403);
    }
    
    $deptIds = $scope['assigned_departments'];
    
    // Get all staff in these departments
    $staff = $scopeService->getStaffInDepartments($deptIds);
    $staffIds = array_map(fn($s) => (int)$s['id'], $staff);
    
    if (empty($staffIds)) {
        $this->success($response, [], 'No modules found.');
    }
    
    // Get all modules taught by that staff
    $placeholders = implode(',', array_fill(0, count($staffIds), '?'));
    $modules = $this->moduleModel->db()->fetchAll(
        "SELECT m.* FROM modules m
         JOIN module_assignments ma ON ma.module_id = m.id
         WHERE ma.staff_id IN ($placeholders)
         ORDER BY m.name ASC",
        $staffIds
    );
    
    $this->success($response, $modules, 'Modules fetched.');
}
```

---

## Pattern 6: Nested Scope (Faculty → Departments → Staff)

### Scenario
A Faculty Dean needs to see leave requests from all staff in all their departments.

### Implementation
```php
public function getLeaveRequestsInFaculty(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_faculty_scope');
    $scopeService = new ScopeService();
    
    if (!$scope) {
        $this->error($response, 'Faculty scope not available.', 403);
    }
    
    $facultyIds = $scope['assigned_faculties'];
    
    // Step 1: Get all departments in these faculties
    $deptIds = $scopeService->getDepartmentsInFaculties($facultyIds);
    
    if (empty($deptIds)) {
        $this->success($response, [], 'No leave requests found.');
    }
    
    // Step 2: Get all staff in these departments
    $staff = $scopeService->getStaffInDepartments($deptIds);
    $staffIds = array_map(fn($s) => (int)$s['id'], $staff);
    
    if (empty($staffIds)) {
        $this->success($response, [], 'No leave requests found.');
    }
    
    // Step 3: Get leave requests from these staff
    $placeholders = implode(',', array_fill(0, count($staffIds), '?'));
    $leaves = $this->requestModel->db()->fetchAll(
        "SELECT lr.* FROM leave_requests lr
         WHERE lr.staff_id IN ($placeholders)
         ORDER BY lr.created_at DESC",
        $staffIds
    );
    
    $this->success($response, $leaves, 'Faculty leave requests fetched.');
}
```

---

## Pattern 7: Conditional Scope (Admin vs HOD)

### Scenario
Both Admin and HOD can view students, but Admin sees all and HOD sees only their department.

### Implementation
```php
public function getStudents(Request $request, Response $response): never
{
    $user = $request->param('_auth_user');
    $scope = $request->param('_department_scope');
    $scopeService = new ScopeService();
    
    $query = "SELECT s.*, d.dep_name FROM students s
              JOIN departements d ON d.dep_id = s.department_id";
    $params = [];
    
    // Only apply scope if enabled for this role AND user has assignments
    if ($user['enforce_department_scope'] && $scope) {
        $deptIds = $scope['assigned_departments'];
        $clause = $scopeService->buildDepartmentWhereClause(
            $deptIds,
            's.department_id'
        );
        $query .= " WHERE " . $clause['where'];
        $params = $clause['params'];
    }
    // Else: Admin with enforce_department_scope=0 sees all students
    
    $query .= " ORDER BY s.registration_number ASC";
    
    $students = $this->studentModel->db()->fetchAll($query, $params);
    $this->success($response, $students, 'Students fetched.');
}
```

---

## Pattern 8: Apply Scope to Existing Model Methods

### Before
```php
// LeaveRequestModel.php
public function getRequestsForApproval(int $leaveTypeId): array
{
    return $this->db->fetchAll(
        "SELECT * FROM leave_requests 
         WHERE leave_type_id = ? AND status = 'pending'
         ORDER BY created_at ASC",
        [$leaveTypeId]
    );
}
```

### After
```php
// LeaveRequestModel.php
public function getRequestsForApproval(int $leaveTypeId, ?array $departmentFilter = null): array
{
    $query = "SELECT lr.* FROM leave_requests lr
              JOIN staff s ON s.id = lr.staff_id
              WHERE lr.leave_type_id = ? AND lr.status = 'pending'";
    $params = [$leaveTypeId];
    
    if ($departmentFilter) {
        $placeholders = implode(',', array_fill(0, count($departmentFilter), '?'));
        $query .= " AND s.department_id IN ($placeholders)";
        $params = array_merge($params, $departmentFilter);
    }
    
    $query .= " ORDER BY lr.created_at ASC";
    
    return $this->db->fetchAll($query, $params);
}
```

### Controller Usage
```php
public function getLeaveForApproval(Request $request, Response $response): never
{
    $leaveTypeId = (int)$request->query('leave_type_id');
    $scope = $request->param('_department_scope');
    
    $deptFilter = ($scope && $request->param('_auth_user')['enforce_department_scope'])
        ? $scope['assigned_departments']
        : null;
    
    $leaves = $this->requestModel->getRequestsForApproval($leaveTypeId, $deptFilter);
    $this->success($response, $leaves, 'Pending leave requests fetched.');
}
```

---

## Summary: Implementation Checklist

For each endpoint needing scope filtering:

1. **Add middleware to route:**
   ```php
   new DepartmentScopeMiddleware()  // or FacultyScopeMiddleware
   ```

2. **Get scope from request:**
   ```php
   $scope = $request->param('_department_scope');
   ```

3. **Apply to query:**
   ```php
   if ($scope && $user['enforce_department_scope']) {
       $query .= " WHERE department_id IN (?, ?, ...)";
       $params = $scope['assigned_departments'];
   }
   ```

4. **Add safeguard for scoped roles:**
   ```php
   if (!$scope && $user['role_name'] === 'HOD') {
       $query .= " WHERE 1=0";  // Prevent accidental full access
   }
   ```

5. **Test:**
   - ✅ Admin sees all data
   - ✅ HOD sees only their departments
   - ✅ User without assignments gets error
   - ✅ Superadmin bypasses scope

---

## Common Mistakes & Fixes

### Mistake 1: Only Frontend Filtering
```php
// ❌ BAD: Only frontend limits visibility
// Frontend hides "Other Dept" button
// But user can still call API directly

// ✅ GOOD: Always validate backend
if ($scope && !in_array($requestedDeptId, $scope['assigned_departments'])) {
    $this->error($response, 'Access denied.', 403);
}
```

### Mistake 2: Forgetting Safeguard
```php
// ❌ BAD: Non-scoped HOD accidentally sees all data
if ($scope) {
    $query .= " WHERE department_id IN (...)";
}
// Missing: else clause to handle HOD without scope

// ✅ GOOD: Explicit safeguard
if ($scope) {
    $query .= " WHERE department_id IN (...)";
} else if ($user['enforce_department_scope']) {
    $query .= " WHERE 1=0";  // HOD without scope = no data
}
```

### Mistake 3: Scope Leakage in Joins
```php
// ❌ BAD: Forget to filter by scope in joined table
$query = "SELECT s.*, m.name FROM students s
          JOIN modules m ON m.id = s.module_id
          WHERE s.department_id IN (?)";  // Scoped
// But modules have no scope check!

// ✅ GOOD: Scope all relevant tables
$query = "SELECT s.*, m.name FROM students s
          JOIN modules m ON m.id = s.module_id
          JOIN staff staff ON staff.id = m.staff_id
          WHERE s.department_id IN (?)
          AND staff.department_id IN (?)";  // Double-scoped
```

---

## Testing Template

```php
// tests/Feature/ScopingTest.php

class DepartmentScopingTest extends TestCase
{
    public function test_hod_can_see_own_department_leaves()
    {
        $hod = User::factory()->withRole('HOD')->create();
        $deptId = 1;
        $this->assignUserToDepartment($hod->id, $deptId);
        
        $this->actingAs($hod)
            ->get('/api/hr/leave')
            ->assertJsonPath('data.*.staff_id', [1, 2])  // Only dept 1 staff
            ->assertStatus(200);
    }
    
    public function test_hod_cannot_see_other_department_leaves()
    {
        $hod = User::factory()->withRole('HOD')->create();
        $this->assignUserToDepartment($hod->id, 1);  // CS dept
        
        $otherDeptLeave = LeaveRequest::factory()->forStaffInDept(2)->create();  // Math dept
        
        $this->actingAs($hod)
            ->get('/api/hr/leave')
            ->assertJsonMissing(['id' => $otherDeptLeave->id])
            ->assertStatus(200);
    }
    
    public function test_hod_without_assignment_gets_error()
    {
        $hod = User::factory()->withRole('HOD')->create();
        // No department assignment
        
        $this->actingAs($hod)
            ->get('/api/hr/leave')
            ->assertJsonPath('message', 'You do not have any departments assigned')
            ->assertStatus(403);
    }
}
```
