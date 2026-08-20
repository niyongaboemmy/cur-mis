# Role-Based Access Control: Department & Faculty Scoping Implementation

## Overview

This document outlines the implementation of department-level and faculty-level scoping for the RBAC system. Users with specific roles (HOD, Faculty Dean, etc.) can now see and manage only data belonging to their assigned departments or faculties.

## Database Schema Changes

### New Tables

#### 1. `user_department_assignments`
Links users to departments they manage/oversee.

```sql
CREATE TABLE `user_department_assignments` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`        INT UNSIGNED NOT NULL,
  `department_id`  INT UNSIGNED NOT NULL,
  `assigned_by`    INT UNSIGNED,
  `assigned_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_department` (`user_id`, `department_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`) ON DELETE CASCADE
);
```

**Use Case:** When you assign an HOD to manage Computer Science department, create a record here.

#### 2. `user_faculty_assignments`
Links users to faculties they oversee (Faculty Deans).

```sql
CREATE TABLE `user_faculty_assignments` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`        INT UNSIGNED NOT NULL,
  `faculty_id`     INT UNSIGNED NOT NULL,
  `assigned_by`    INT UNSIGNED,
  `assigned_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_faculty` (`user_id`, `faculty_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`fac_id`) ON DELETE CASCADE
);
```

**Use Case:** When you assign a Dean to oversee Engineering faculty, create a record here.

### Role Table Enhancements

Two new columns were added to the `roles` table:

```sql
ALTER TABLE `roles` 
  ADD COLUMN `enforce_department_scope` TINYINT(1) NOT NULL DEFAULT 0 AFTER `enforce_campus_scope`,
  ADD COLUMN `enforce_faculty_scope` TINYINT(1) NOT NULL DEFAULT 0 AFTER `enforce_department_scope`;
```

**What these flags do:**

- `enforce_department_scope = 1`: User can only see/manage data for their assigned departments
- `enforce_faculty_scope = 1`: User can only see/manage data for their assigned faculties

**Example Role Configuration:**

```
Role: HOD (Head of Department)
- enforce_campus_scope: 0 (HODs are not campus-scoped)
- enforce_department_scope: 1 (HODs ARE department-scoped)
- enforce_faculty_scope: 0 (HODs are not faculty-scoped)

Role: Faculty Dean
- enforce_campus_scope: 0
- enforce_department_scope: 0
- enforce_faculty_scope: 1 (Deans ARE faculty-scoped)
```

## Backend Implementation

### Models

#### `UserDepartmentAssignmentModel`
Manages department assignments.

**Methods:**
- `assign(int $userId, int $departmentId, int $assignedBy): bool` — Create assignment
- `unassign(int $userId, int $departmentId): bool` — Remove assignment
- `getAssignedDepartments(int $userId): array` — Get all departments for a user
- `getAssignedUsers(int $departmentId): array` — Get all users assigned to a department
- `isAssignedTo(int $userId, int $departmentId): bool` — Check if user manages department
- `hasAssignments(int $userId): bool` — Check if user has any assignments

#### `UserFacultyAssignmentModel`
Manages faculty assignments (similar interface).

### Middleware

#### `DepartmentScopeMiddleware`
Apply to any route that needs department-level filtering.

```php
$router->get('/api/hr/leave', [LeaveController::class, 'list'], 
    [AuthMiddleware::class, new PermissionMiddleware('VIEW_LEAVE_REQUESTS'), new DepartmentScopeMiddleware()]);
```

**What it does:**
1. Checks if user's role has `enforce_department_scope = 1`
2. Verifies user has at least one assigned department
3. Stores scope info in request: `_department_scope` with list of assigned department IDs
4. Superadmin/Admin always bypass scope checks

#### `FacultyScopeMiddleware`
Similar to above, but for faculty-level scoping.

### Services

#### `ScopeService`
Helper service for building scoped queries.

**Key Methods:**

```php
// Get department IDs in user's faculties
$deptIds = $scopeService->getDepartmentsInFaculties($facultyIds);

// Build WHERE clause for department filtering
$clause = $scopeService->buildDepartmentWhereClause($departmentIds, 'staff.department_id');
// Returns: ['where' => 'staff.department_id IN (?, ?)', 'params' => [1, 2]]

// Get staff in departments
$staff = $scopeService->getStaffInDepartments($departmentIds);

// Check if department belongs to faculties
$isInFaculty = $scopeService->isDepartmentInFaculties($deptId, $facultyIds);
```

### AuthService Updates

When a user logs in, their JWT now includes:

```php
$userData['enforce_department_scope'] = $role['enforce_department_scope'] ?? 0;
$userData['enforce_faculty_scope'] = $role['enforce_faculty_scope'] ?? 0;
$userData['assigned_departments'] = $this->loadAssignedDepartments($userId);
$userData['assigned_faculties'] = $this->loadAssignedFaculties($userId);
```

This data flows to the frontend via JWT and is available in the auth store.

## Frontend Implementation

### Auth Store Updates

The `AuthUser` interface now includes:

```typescript
enforce_department_scope?: boolean
enforce_faculty_scope?: boolean
assigned_departments?: Array<{ id: number, name: string, code: string, faculty_id: number }>
assigned_faculties?: Array<{ id: number, name: string, code: string }>
```

### Using Scope in Components

```tsx
import { useAuthStore } from '@/store/authStore';

export function MyComponent() {
  const { user } = useAuthStore();
  
  // Check if user has department scope
  if (user?.enforce_department_scope) {
    const departmentIds = user.assigned_departments?.map(d => d.id) ?? [];
    // Use departmentIds to filter API requests
  }
  
  // Check if user has faculty scope
  if (user?.enforce_faculty_scope) {
    const facultyIds = user.assigned_faculties?.map(f => f.id) ?? [];
    // Use facultyIds to filter API requests
  }
}
```

### Sidebar Filtering

The MainLayout already filters menu items based on permissions. You can extend this to also filter based on scope:

```tsx
// Only show departments the user manages
const visibleDepartments = allDepartments.filter(d =>
  user?.assigned_departments?.some(ad => ad.id === d.id)
);
```

## API Endpoints

### Scope Management Endpoints

All require `MANAGE_USERS` permission and `AuthMiddleware`.

#### POST `/api/admin/scope/assign-department`
Assign user to department.

```json
{
  "user_id": 5,
  "department_id": 2
}
```

#### POST `/api/admin/scope/unassign-department`
Remove user from department.

```json
{
  "user_id": 5,
  "department_id": 2
}
```

#### GET `/api/admin/scope/user-departments?user_id=5`
Get departments assigned to user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "name": "Computer Science",
      "code": "CS",
      "faculty_id": 1,
      "assigned_at": "2026-08-19T10:30:00Z"
    }
  ]
}
```

#### POST `/api/admin/scope/assign-faculty`
Assign user to faculty.

```json
{
  "user_id": 6,
  "faculty_id": 1
}
```

#### POST `/api/admin/scope/unassign-faculty`
Remove user from faculty.

```json
{
  "user_id": 6,
  "faculty_id": 1
}
```

#### GET `/api/admin/scope/user-faculties?user_id=6`
Get faculties assigned to user.

## Implementation Checklist

### Phase 1: Database (✅ COMPLETE)
- [x] Create migration file
- [x] Add `enforce_department_scope` and `enforce_faculty_scope` to roles
- [x] Create `user_department_assignments` table
- [x] Create `user_faculty_assignments` table

### Phase 2: Backend Models & Services (✅ COMPLETE)
- [x] Create `UserDepartmentAssignmentModel`
- [x] Create `UserFacultyAssignmentModel`
- [x] Create `DepartmentScopeMiddleware`
- [x] Create `FacultyScopeMiddleware`
- [x] Create `ScopeService` with filtering helpers
- [x] Update `AuthService` to load assignments in JWT

### Phase 3: Backend API (TODO)
- [ ] Create `ScopeAssignmentController` (CREATED but not routed)
- [ ] Add routes to `backend/routes/api/admin.php`:
  ```php
  $router->post('/admin/scope/assign-department', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  $router->post('/admin/scope/unassign-department', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  $router->get('/admin/scope/user-departments', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  $router->post('/admin/scope/assign-faculty', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  $router->post('/admin/scope/unassign-faculty', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  $router->get('/admin/scope/user-faculties', [..., new PermissionMiddleware(Permissions::MANAGE_USERS)]);
  ```

### Phase 4: Apply Scoping to Existing Endpoints (TODO)
Examples of where to apply `DepartmentScopeMiddleware`:

**HR Module:**
- GET `/api/hr/leave` — Filter to departments user manages
- GET `/api/hr/staff` — Filter to departments user manages
- GET `/api/hr/leave/{id}/approve` — Verify leave requester is in user's dept

**Academic Module:**
- GET `/api/academic/modules` — Filter to departments user manages
- GET `/api/students` — Filter to departments user manages (if HOD)

**Admin/Users:**
- GET `/api/admin/users` — Filter based on scope
- PUT `/api/admin/users/{id}` — Verify user can modify (same scope)

### Phase 5: Frontend Updates (TODO)
- [ ] Create scope context/hook (`useScopeInfo`)
- [ ] Update sidebar to show department/faculty selector for multi-scope users
- [ ] Filter API requests based on scope filters
- [ ] Add department/faculty filter to data tables
- [ ] Update admin pages to show scope assignments

### Phase 6: Security & Testing (TODO)
- [ ] Audit all data endpoints for missing scope checks
- [ ] Test that non-scoped users cannot access scoped data (e.g., HOD accessing other dept)
- [ ] Add unit tests for ScopeService
- [ ] Add integration tests for middleware
- [ ] Document in runbook for DevOps

## Example: HOD Leave Approval Workflow

### Setup
1. Create HOD role with `enforce_department_scope = 1`
2. Assign permission `MANAGE_LEAVE_REQUESTS` to HOD role
3. Assign "John Doe" (user_id=5) as HOD to Computer Science dept (dept_id=2)
   - POST `/api/admin/scope/assign-department` with {user_id: 5, department_id: 2}

### Usage
1. John logs in
2. His JWT contains:
   ```
   {
     "role_name": "HOD",
     "enforce_department_scope": 1,
     "assigned_departments": [{ id: 2, name: "Computer Science", ... }]
   }
   ```
3. When John calls GET `/api/hr/leave` (with `DepartmentScopeMiddleware`):
   - Middleware extracts departments: [2]
   - Controller queries only leave requests where staff.department_id IN (2)
   - John sees only leaves from CS department staff ✅

4. If a lecturer from Engineering tries to approve John's leave request:
   - Middleware checks if lecturer's department is in [2]
   - It's not → 403 Forbidden ✅

5. If John tries to access `/api/students?department_id=3` (Engineering):
   - Controller checks if 3 is in John's assigned departments
   - It's not → 403 Forbidden (or silently filtered) ✅

## Security Considerations

### 1. Bypass for Superadmin
All scope checks bypass for users with role `superadmin` or `admin`. This allows system administrators to inspect/manage everything.

### 2. Frontend Filtering ≠ Security
Frontend filtering (hiding nav items, hiding form fields) is UX only. Always enforce scope checks on the backend.

### 3. URL-Based Bypass Attempts
Always validate scope at the endpoint, not just in the middleware. Example:

```php
// ❌ BAD: Only middleware checks scope
public function getStudents(Request $request) {
  $departmentId = $request->query('department_id');
  return Student::where('department_id', $departmentId)->get();
}

// ✅ GOOD: Controller also validates scope
public function getStudents(Request $request) {
  $user = $request->param('_auth_user');
  $scope = $request->param('_department_scope');
  $departmentId = (int)$request->query('department_id');
  
  if ($scope && !in_array($departmentId, $scope['assigned_departments'])) {
    throw new AuthorizationException('Not authorized for this department');
  }
  
  return Student::where('department_id', $departmentId)->get();
}
```

### 4. Audit Trail
All scope assignments are logged via `SystemLogService`. Review logs regularly.

```php
SystemLogService::log('CREATE', 'SCOPE', 'Assigned department X to user Y', $adminId, ...);
```

## Testing Checklist

### Unit Tests
- [ ] `UserDepartmentAssignmentModel::assign()` creates record
- [ ] `UserDepartmentAssignmentModel::getAssignedDepartments()` returns correct data
- [ ] `ScopeService::isDepartmentInFaculties()` validates correctly
- [ ] `ScopeService::buildDepartmentWhereClause()` generates correct SQL

### Integration Tests
- [ ] HOD cannot see students from other departments
- [ ] Dean can see all departments in their faculty
- [ ] Scope filtering works with multiple assigned departments
- [ ] Superadmin bypasses scope checks
- [ ] Non-scoped role ignores scope middleware

### End-to-End Tests
- [ ] Admin assigns HOD to department
- [ ] HOD logs in → JWT contains department scope
- [ ] HOD views leave requests → Only sees their department's requests
- [ ] HOD tries to approve leave from other dept → Forbidden
- [ ] Admin views all data → No filtering applied

## Migration Guide

### For Existing HODs
If you already have HODs but they're linked to departments via `staff.department_id`:

```sql
-- Backfill user_department_assignments from staff table
INSERT INTO user_department_assignments (user_id, department_id, assigned_by)
SELECT DISTINCT s.user_id, s.department_id, 1  -- Assigned by superadmin (id=1)
FROM staff s
WHERE s.user_id IS NOT NULL
  AND s.department_id IS NOT NULL
  AND s.user_id IN (SELECT user_id FROM users WHERE role_id IN (
      SELECT id FROM roles WHERE name = 'HOD'
  ))
ON DUPLICATE KEY UPDATE assigned_at = NOW();
```

Then enable scoping:

```sql
UPDATE roles SET enforce_department_scope = 1 WHERE name = 'HOD';
```

## Troubleshooting

### "You do not have any departments assigned"
- User's role has `enforce_department_scope = 1` but no rows in `user_department_assignments`
- Solution: Admin must assign departments using scope API

### "User can see all departments despite scope"
- Role has `enforce_department_scope = 0` (scope not enabled)
- Endpoint doesn't use `DepartmentScopeMiddleware`
- Controller doesn't validate scope
- Solution: Check role config and middleware chain

### Users see empty data
- User has multiple assignments but no assignments for currently selected filter
- Solution: Frontend should default to first assigned department/faculty

## Additional Resources

- [Permissions.php](backend/app/Constants/Permissions.php) — Full permission catalog
- [RBAC_IMPLEMENTATION_PLAN.md](RBAC_IMPLEMENTATION_PLAN.md) — Broader RBAC roadmap
- [AuthService.php](backend/app/Services/AuthService.php) — JWT generation
- [MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) — Frontend permission filtering
