<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\UserModel;
use App\Models\RoleModel;
use App\Models\CampusModel;
use App\Models\UserCampusAssignmentModel;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;
use App\Services\SystemLogService;

class UserController extends BaseController
{
    private UserModel $userModel;
    private RoleModel $roleModel;
    private CampusModel $campusModel;
    private UserCampusAssignmentModel $campusAssignmentModel;

    public function __construct()
    {
        $this->userModel              = new UserModel();
        $this->roleModel              = new RoleModel();
        $this->campusModel            = new CampusModel();
        $this->campusAssignmentModel  = new UserCampusAssignmentModel();
    }

    /**
     * List all users with their roles joined.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? '';

        $conditions = [];
        $bindings   = [];

        if ($search !== '') {
            $conditions[] = "(full_name LIKE ? OR email LIKE ? OR username LIKE ?)";
            array_push($bindings, "%$search%", "%$search%", "%$search%");
        }

        $roleId = $request->query('role_id') ?? '';
        if ($roleId !== '') {
            $conditions[] = "role_id = ?";
            $bindings[]   = (int) $roleId;
        }

        $status = $request->query('status') ?? '';
        if ($status === 'active')   { $conditions[] = "is_active = 1"; }
        if ($status === 'inactive') { $conditions[] = "is_active = 0"; }

        $isApplicant = $request->query('is_applicant') ?? '';
        if ($isApplicant !== '') {
            $conditions[] = "is_applicant = ?";
            $bindings[]   = (int) $isApplicant;
        }

        $mustChange = $request->query('must_change_pw') ?? '';
        if ($mustChange !== '') {
            $conditions[] = "must_change_pw = ?";
            $bindings[]   = (int) $mustChange;
        }

        $where = empty($conditions) ? '' : implode(' AND ', $conditions);

        $paginated = $this->userModel->paginate($page, $perPage, $where, $bindings, 'id', 'DESC');

        $roles = $this->roleModel->all();
        $roleMap = [];
        foreach ($roles as $r) {
            $roleMap[$r['id']] = $r['name'];
        }
        foreach ($paginated['data'] as &$user) {
            $user['role_name'] = $roleMap[$user['role_id'] ?? 0] ?? 'guest';
        }

        $this->success($response, $paginated, 'Users fetched successfully.');
    }

    /**
     * Aggregate stats for the Users Dashboard tab.
     * GET /api/users/stats
     */
    public function stats(Request $request, Response $response): never
    {
        $db = $this->userModel->db();

        $row = $db->fetchOne("
            SELECT
                COUNT(*)                                                                             AS total,
                SUM(is_active = 1)                                                                   AS active,
                SUM(is_active = 0)                                                                   AS inactive,
                SUM(is_applicant = 1)                                                                AS applicants,
                SUM(must_change_pw = 1)                                                              AS must_change_pw,
                SUM(last_login IS NULL)                                                              AS never_logged_in,
                SUM(MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()))             AS new_this_month
            FROM `users`
        ");

        $byRole = $db->fetchAll("
            SELECT r.name AS role, COUNT(u.id) AS count
            FROM `users` u
            JOIN `roles` r ON r.id = u.role_id
            GROUP BY r.id, r.name
            ORDER BY count DESC
        ");

        $byMonth = $db->fetchAll("
            SELECT DATE_FORMAT(created_at, '%b %Y') AS month,
                   YEAR(created_at)  AS yr,
                   MONTH(created_at) AS mo,
                   COUNT(*)          AS count
            FROM `users`
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY YEAR(created_at), MONTH(created_at), DATE_FORMAT(created_at, '%b %Y')
            ORDER BY YEAR(created_at) ASC, MONTH(created_at) ASC
        ");

        $this->success($response, [
            'total'          => (int)($row['total']          ?? 0),
            'active'         => (int)($row['active']         ?? 0),
            'inactive'       => (int)($row['inactive']       ?? 0),
            'applicants'     => (int)($row['applicants']     ?? 0),
            'must_change_pw' => (int)($row['must_change_pw'] ?? 0),
            'never_logged_in'=> (int)($row['never_logged_in']?? 0),
            'new_this_month' => (int)($row['new_this_month'] ?? 0),
            'by_role'        => array_map(fn($r) => ['role' => $r['role'], 'count' => (int)$r['count']], $byRole),
            'by_month'       => array_map(fn($r) => ['month' => $r['month'], 'count' => (int)$r['count']], $byMonth),
        ], 'User stats fetched.');
    }

    /**
     * Get a single user.
     */
    public function show(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $user = $this->userModel->find($id);

        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $user['campus_assignments'] = $this->campusAssignmentModel->listForUser($id);
        $this->success($response, $user, 'User details fetched.');
    }

    /**
     * Admin creating a new user.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'full_name' => ['required', 'min:3'],
            'email'     => ['required', 'email'],
            'username'  => ['required', 'min:3'],
            'password'  => ['required', 'min:6'],
            'role_id'   => ['required']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->userModel->exists('email', $data['email'])) {
            $this->error($response, 'Email already registered', 409);
        }
        
        if ($this->userModel->exists('username', $data['username'])) {
            $this->error($response, 'Username already taken', 409);
        }

        $id = $this->userModel->create([
            'full_name' => $data['full_name'],
            'email'     => $data['email'],
            'username'  => $data['username'],
            'password'  => password_hash($data['password'], PASSWORD_BCRYPT),
            'role_id'   => (int)$data['role_id'],
            'is_active' => 1
        ]);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('CREATE', 'USERS', "Created user '{$data['email']}' (ID {$id}).", (int) $id, 'user', ['role_id' => (int) $data['role_id']], $actor ?: null);
        $this->success($response, ['id' => $id], 'User created successfully.', 201);
    }

    /**
     * Update user details.
     */
    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'full_name' => ['required', 'min:3'],
            'email'     => ['required', 'email'],
            'role_id'   => ['required']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // Check uniqueness if email changed
        if ($data['email'] !== $user['email'] && $this->userModel->exists('email', $data['email'], $id)) {
            $this->error($response, 'Email already in use', 409);
        }

        $updateData = [
            'full_name' => $data['full_name'],
            'email'     => $data['email'],
            'role_id'   => (int)$data['role_id']
        ];

        if (!empty($data['password'])) {
            $updateData['password'] = password_hash($data['password'], PASSWORD_BCRYPT);
        }

        if (isset($data['is_active'])) {
             $updateData['is_active'] = (int)$data['is_active'];
        }

        $this->userModel->update($id, $updateData);
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'USERS', "Updated user '{$user['email']}' (ID {$id}).", $id, 'user', null, $actor ?: null);
        $this->success($response, null, 'User updated successfully.');
    }

    /**
     * Delete a user. Cannot delete your own account.
     */
    public function delete(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $authUser = $request->param('_auth_user');

        if ($id === (int)($authUser['id'] ?? 0)) {
            $this->error($response, 'You cannot delete your own account.', 403);
        }

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $this->userModel->delete($id);
        SystemLogService::log('DELETE', 'USERS', "Deleted user '{$user['email']}' (ID {$id}).", $id, 'user', ['email' => $user['email']], (array) $authUser ?: null);
        $this->success($response, null, 'User deleted successfully.');
    }

    /**
     * GET /api/users/:id/photo
     * Stream the user's profile photo. Used by admin user lists.
     */
    public function downloadPhoto(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $user = $this->userModel->find($id);

        if (!$user) {
            $this->error($response, 'User not found.', 404);
        }

        $photoId = $user['photo'] ?? null;
        if (!$photoId) {
            $this->error($response, 'No profile photo.', 404);
        }

        try {
            $client   = new FileServerClient();
            $fileData = $client->download((string)$photoId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $fileData['mime'] ?? 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . addslashes($fileData['original_name'] ?? 'photo') . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, max-age=60');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * Preview which records would receive accounts in a bulk-create run.
     * Returns a normalised list: { id, username, full_name, email } for each eligible row.
     * GET /api/users/bulk-preview?target_table=student|staff|hr_employees
     */
    public function bulkPreview(Request $request, Response $response): never
    {
        $allowedTables = ['student', 'staff', 'hr_employees'];
        $targetTable   = $request->query('target_table') ?? '';

        if (!in_array($targetTable, $allowedTables, true)) {
            $this->error($response, 'Invalid target_table. Must be one of: student, staff, hr_employees.', 422);
        }

        $db   = $this->userModel->db();
        $rows = [];

        if ($targetTable === 'student') {
            $raw = $db->fetchAll(
                "SELECT id, regnumber, fname, lname, email
                 FROM `student`
                 WHERE regnumber IS NOT NULL
                   AND student_state = 'active'
                   AND regnumber NOT IN (SELECT username FROM `users`)
                 ORDER BY fname, lname"
            );
            foreach ($raw as $r) {
                $username = trim((string)($r['regnumber'] ?? ''));
                if ($username === '') continue;
                $rows[] = [
                    'id'        => $r['id'],
                    'username'  => $username,
                    'full_name' => trim(($r['fname'] ?? '') . ' ' . ($r['lname'] ?? '')),
                    'email'     => !empty($r['email']) ? trim($r['email']) : "{$username}@cur.ac.rw",
                ];
            }
        } elseif ($targetTable === 'staff') {
            $raw = $db->fetchAll(
                "SELECT id, staff_number, first_name, last_name, email
                 FROM `staff`
                 WHERE staff_number IS NOT NULL
                   AND is_active = 1
                   AND staff_number NOT IN (SELECT username FROM `users`)
                 ORDER BY first_name, last_name"
            );
            foreach ($raw as $r) {
                $username = trim((string)($r['staff_number'] ?? ''));
                if ($username === '') continue;
                $rows[] = [
                    'id'        => $r['id'],
                    'username'  => $username,
                    'full_name' => trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')),
                    'email'     => !empty($r['email']) ? trim($r['email']) : "{$username}@cur.ac.rw",
                ];
            }
        } else {
            $raw = $db->fetchAll(
                "SELECT e.id, e.emp_code, e.full_name, e.email, e.staff_id
                 FROM `hr_employees` e
                 WHERE e.staff_id IS NOT NULL
                   AND e.emp_code IS NOT NULL
                   AND e.status = 'Active'
                   AND e.emp_code NOT IN (SELECT username FROM `users`)
                 ORDER BY e.full_name"
            );
            foreach ($raw as $r) {
                $username = trim((string)($r['emp_code'] ?? ''));
                if ($username === '') continue;
                $rows[] = [
                    'id'        => $r['id'],
                    'username'  => $username,
                    'full_name' => trim((string)($r['full_name'] ?? '')),
                    'email'     => !empty($r['email']) ? trim($r['email']) : "{$username}@cur.ac.rw",
                ];
            }
        }

        $this->success($response, ['items' => $rows, 'count' => count($rows)], 'Preview fetched.');
    }

    /**
     * Bulk-create user accounts for student, staff, or hr_employees records that have no portal access.
     */
    public function bulkCreate(Request $request, Response $response): never
    {
        $data = $request->body();

        $allowedTables = ['student', 'staff', 'hr_employees'];
        $targetTable   = $data['target_table'] ?? '';
        $password      = $data['default_password'] ?? '';

        if (!in_array($targetTable, $allowedTables, true)) {
            $this->error($response, 'Invalid target_table. Must be one of: student, staff, hr_employees.', 422);
        }

        if (strlen($password) < 6) {
            $this->error($response, 'default_password must be at least 6 characters.', 422);
        }

        $roleNameMap = [
            'student'      => 'student',
            'staff'        => 'lecturer',
            'hr_employees' => 'hr_manager',
        ];

        $roleId = $this->roleModel->getIdByName($roleNameMap[$targetTable]);
        if (!$roleId) {
            $this->error($response, "Role '{$roleNameMap[$targetTable]}' not found in the system.", 500);
        }

        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
        $created = 0;
        $skipped = 0;
        $db = $this->userModel->db();

        // Check once whether user_id columns exist (migration 048 may not have run yet)
        $studentHasUid = !empty($db->fetchAll(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'user_id'"
        ));
        $staffHasUid = !empty($db->fetchAll(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'user_id'"
        ));

        try {
            $db->beginTransaction();

            if ($targetTable === 'student') {
                $rows = $db->fetchAll(
                    "SELECT id, regnumber, fname, lname, email FROM `student`
                     WHERE regnumber IS NOT NULL
                       AND student_state = 'active'
                       AND regnumber NOT IN (SELECT username FROM `users`)"
                );
                foreach ($rows as $row) {
                    $username = trim((string)($row['regnumber'] ?? ''));
                    $fullName = trim(($row['fname'] ?? '') . ' ' . ($row['lname'] ?? ''));
                    $email    = !empty($row['email']) ? trim($row['email']) : "{$username}@cur.ac.rw";

                    if (empty($username) || $this->userModel->exists('username', $username) || $this->userModel->exists('email', $email)) {
                        $skipped++;
                        continue;
                    }

                    $newId = $this->userModel->create([
                        'username'       => $username,
                        'full_name'      => $fullName ?: $username,
                        'email'          => $email,
                        'password'       => $hashedPassword,
                        'role_id'        => $roleId,
                        'is_active'      => 1,
                        'is_applicant'   => 0,
                        'must_change_pw' => 1,
                    ]);

                    if ($studentHasUid) {
                        $db->execute("UPDATE `student` SET user_id = ? WHERE id = ?", [$newId, $row['id']]);
                    }
                    $created++;
                }
            } elseif ($targetTable === 'staff') {
                $rows = $db->fetchAll(
                    "SELECT id, staff_number, first_name, last_name, email FROM `staff`
                     WHERE staff_number IS NOT NULL
                       AND is_active = 1
                       AND staff_number NOT IN (SELECT username FROM `users`)"
                );
                foreach ($rows as $row) {
                    $username = trim((string)($row['staff_number'] ?? ''));
                    $fullName = trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''));
                    $email    = !empty($row['email']) ? trim($row['email']) : "{$username}@cur.ac.rw";

                    if (empty($username) || $this->userModel->exists('username', $username) || $this->userModel->exists('email', $email)) {
                        $skipped++;
                        continue;
                    }

                    $newId = $this->userModel->create([
                        'username'       => $username,
                        'full_name'      => $fullName ?: $username,
                        'email'          => $email,
                        'password'       => $hashedPassword,
                        'role_id'        => $roleId,
                        'is_active'      => 1,
                        'is_applicant'   => 0,
                        'must_change_pw' => 1,
                    ]);

                    if ($staffHasUid) {
                        $db->execute("UPDATE `staff` SET user_id = ? WHERE id = ?", [$newId, $row['id']]);
                    }
                    $created++;
                }
            } else {
                // hr_employees: link via staff.user_id
                $rows = $db->fetchAll(
                    "SELECT e.id, e.emp_code, e.full_name, e.email, e.staff_id
                     FROM `hr_employees` e
                     WHERE e.staff_id IS NOT NULL
                       AND e.emp_code IS NOT NULL
                       AND e.status = 'Active'
                       AND e.emp_code NOT IN (SELECT username FROM `users`)"
                );
                foreach ($rows as $row) {
                    $username = trim((string)($row['emp_code'] ?? ''));
                    $fullName = trim((string)($row['full_name'] ?? ''));
                    $email    = !empty($row['email']) ? trim($row['email']) : "{$username}@cur.ac.rw";

                    if (empty($username) || $this->userModel->exists('username', $username) || $this->userModel->exists('email', $email)) {
                        $skipped++;
                        continue;
                    }

                    $newId = $this->userModel->create([
                        'username'       => $username,
                        'full_name'      => $fullName ?: $username,
                        'email'          => $email,
                        'password'       => $hashedPassword,
                        'role_id'        => $roleId,
                        'is_active'      => 1,
                        'is_applicant'   => 0,
                        'must_change_pw' => 1,
                    ]);

                    if ($staffHasUid) {
                        $db->execute("UPDATE `staff` SET user_id = ? WHERE id = ?", [$newId, $row['staff_id']]);
                    }
                    $created++;
                }
            }

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            $this->error($response, 'Bulk creation failed: ' . $e->getMessage(), 500);
        }

        $total = $created + $skipped;
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log(
            'CREATE', 'USERS',
            "Bulk created {$created} account(s) for '{$targetTable}' ({$skipped} skipped, {$total} total).",
            null, $targetTable,
            ['created' => $created, 'skipped' => $skipped, 'total' => $total],
            $actor ?: null
        );

        $this->success($response, [
            'total_processed' => $total,
            'created_count'   => $created,
            'skipped_count'   => $skipped,
        ], "Bulk account creation complete.");
    }

    /**
     * Toggle active status.
     */
    public function toggleStatus(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $user = $this->userModel->find($id);

        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $newStatus = (int)($user['is_active']) === 1 ? 0 : 1;
        $this->userModel->update($id, ['is_active' => $newStatus]);
        $actor = (array) $request->param('_auth_user');
        $label = $newStatus === 1 ? 'activated' : 'deactivated';
        SystemLogService::log('UPDATE', 'USERS', "User '{$user['email']}' (ID {$id}) {$label}.", $id, 'user', ['is_active' => $newStatus], $actor ?: null);
        $this->success($response, ['is_active' => $newStatus], 'User status toggled.');
    }

    /**
     * GET /api/users/campuses-catalog
     * Lightweight list of all active campuses — used by the user-edit modal
     * when assigning campuses to a registry user.
     */
    public function campusesCatalog(Request $request, Response $response): never
    {
        $rows = $this->campusModel->db()->fetchAll(
            "SELECT id, name, code, location, is_active
             FROM `campuses`
             WHERE is_active = 1
             ORDER BY name ASC"
        );
        $this->success($response, ['campuses' => $rows], 'Campuses fetched.');
    }

    /**
     * GET /api/users/:id/campuses
     * Campus(es) currently assigned to this user.
     */
    public function listCampuses(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }

        $this->success($response, [
            'assignments' => $this->campusAssignmentModel->listForUser($id),
        ], 'Campus assignments fetched.');
    }

    /**
     * POST /api/users/:id/campuses/:campus_id
     * Assign a campus to a user (registry scoping).
     */
    public function assignCampus(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $campusId = (int)$request->param('campus_id');
        $authUser = (array) $request->param('_auth_user');

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }
        $campus = $this->campusModel->find($campusId);
        if (!$campus) {
            $this->error($response, 'Campus not found', 404);
        }

        if ($this->campusAssignmentModel->pairExists($id, $campusId)) {
            $this->error($response, 'Campus already assigned to this user.', 409);
        }

        $this->campusAssignmentModel->create([
            'user_id'     => $id,
            'campus_id'   => $campusId,
            'assigned_by' => isset($authUser['id']) ? (int)$authUser['id'] : null,
        ]);

        SystemLogService::log(
            'UPDATE', 'USERS',
            "Assigned campus '{$campus['name']}' to user '{$user['email']}'.",
            $id, 'user',
            ['campus_id' => $campusId, 'campus_name' => $campus['name']],
            $authUser ?: null
        );

        $this->success($response, [
            'assignments' => $this->campusAssignmentModel->listForUser($id),
        ], 'Campus assigned.', 201);
    }

    /**
     * DELETE /api/users/:id/campuses/:campus_id
     * Revoke a user's access to a campus.
     */
    public function revokeCampus(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $campusId = (int)$request->param('campus_id');
        $authUser = (array) $request->param('_auth_user');

        $user = $this->userModel->find($id);
        if (!$user) {
            $this->error($response, 'User not found', 404);
        }
        $campus = $this->campusModel->find($campusId);
        if (!$campus) {
            $this->error($response, 'Campus not found', 404);
        }

        $removed = $this->campusAssignmentModel->deletePair($id, $campusId);
        if ($removed === 0) {
            $this->error($response, 'Campus was not assigned to this user.', 404);
        }

        SystemLogService::log(
            'UPDATE', 'USERS',
            "Revoked campus '{$campus['name']}' from user '{$user['email']}'.",
            $id, 'user',
            ['campus_id' => $campusId, 'campus_name' => $campus['name']],
            $authUser ?: null
        );

        $this->success($response, [
            'assignments' => $this->campusAssignmentModel->listForUser($id),
        ], 'Campus revoked.');
    }
}
