<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\ModuleModel;
use App\Models\ModulePrerequisiteModel;
use App\Models\ModuleAssignmentModel;
use App\Models\ModuleScheduleModel;
use App\Models\ModuleRegistrationModel;
use App\Helpers\ValidationHelper;

/**
 * Modules Management — covers the four pillars:
 *   - Catalog (modules + prerequisites)
 *   - Scheduling (timetable w/ conflict detection)
 *   - Assignments (faculty ↔ module per term + workload)
 *   - Registrations (admin + student self-service)
 */
class ModulesManagementController extends BaseController
{
    private ModuleModel $modules;
    private ModulePrerequisiteModel $prereqs;
    private ModuleAssignmentModel $assignments;
    private ModuleScheduleModel $schedules;
    private ModuleRegistrationModel $registrations;

    public function __construct()
    {
        $this->modules       = new ModuleModel();
        $this->prereqs       = new ModulePrerequisiteModel();
        $this->assignments   = new ModuleAssignmentModel();
        $this->schedules     = new ModuleScheduleModel();
        $this->registrations = new ModuleRegistrationModel();
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private function authUser(Request $request): array
    {
        return (array) ($request->param('_auth_user') ?? []);
    }

    private function validateOrFail(Response $response, array $data, array $rules): void
    {
        $errors = ValidationHelper::validate($data, $rules);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CATALOG
    // ─────────────────────────────────────────────────────────────

    public function listCatalog(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 20);

        $filters = [
            'department' => $request->query('department'),
            'level'      => $request->query('level'),
            'status'     => $request->query('status'),
            'q'          => $request->query('q'),
        ];

        $paginated = $this->modules->listWithPrereqs($page, $perPage, $filters);
        $this->success($response, $paginated, 'Modules fetched.');
    }

    public function showCatalog(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $module = $this->modules->findWithPrereqs($id);
        if (!$module) {
            $this->error($response, 'Module not found.', 404);
        }
        $this->success($response, $module, 'Module fetched.');
    }

    public function createCatalog(Request $request, Response $response): never
    {
        $data = $request->body();

        $this->validateOrFail($response, $data, [
            'module_name'    => ['required', 'min:3'],
            'module_code'    => ['required'],
            'module_credits' => ['required', 'numeric'],
            'department'     => ['required', 'numeric'],
            'level'          => ['required', 'numeric'],
            'status'         => ['in:draft,active,archived'],
        ]);

        if ($this->modules->exists('module_code', $data['module_code'])) {
            $this->error($response, 'module_code already exists.', 409);
        }

        $id = (int)$this->modules->create($data);

        if (!empty($data['prerequisite_ids']) && is_array($data['prerequisite_ids'])) {
            $this->prereqs->syncFor($id, $data['prerequisite_ids']);
        }

        $this->success(
            $response,
            $this->modules->findWithPrereqs($id),
            'Module created.',
            201
        );
    }

    public function updateCatalog(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->modules->find($id)) {
            $this->error($response, 'Module not found.', 404);
        }

        $data = $request->body();

        if (!empty($data['module_code'])) {
            if ($this->modules->exists('module_code', $data['module_code'], $id)) {
                $this->error($response, 'module_code already exists.', 409);
            }
        }

        $this->validateOrFail($response, $data, [
            'module_name'    => ['min:3'],
            'module_credits' => ['numeric'],
            'department'     => ['numeric'],
            'level'          => ['numeric'],
            'status'         => ['in:draft,active,archived'],
        ]);

        $this->modules->update($id, $data);

        if (array_key_exists('prerequisite_ids', $data) && is_array($data['prerequisite_ids'])) {
            $this->prereqs->syncFor($id, $data['prerequisite_ids']);
        }

        $this->success($response, $this->modules->findWithPrereqs($id), 'Module updated.');
    }

    public function deleteCatalog(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->modules->find($id)) {
            $this->error($response, 'Module not found.', 404);
        }
        $this->modules->delete($id);
        $this->success($response, null, 'Module deleted.');
    }

    // ─────────────────────────────────────────────────────────────
    // SCHEDULING
    // ─────────────────────────────────────────────────────────────

    public function listSchedules(Request $request, Response $response): never
    {
        $filters = [
            'term_id'   => $request->query('term_id'),
            'module_id' => $request->query('module_id'),
            'room_id'   => $request->query('room_id'),
            'staff_id'  => $request->query('staff_id'),
        ];
        $this->success($response, $this->schedules->listWithJoins($filters), 'Schedules fetched.');
    }

    public function checkConflicts(Request $request, Response $response): never
    {
        $data   = $request->body();
        $ignore = isset($data['ignore_id']) && is_numeric($data['ignore_id'])
            ? (int)$data['ignore_id']
            : null;

        $this->validateOrFail($response, $data, $this->scheduleRules());

        $conflicts = $this->schedules->detectConflicts($data, $ignore);
        $this->success($response, ['conflicts' => $conflicts], 'Conflict scan complete.');
    }

    public function createSchedule(Request $request, Response $response): never
    {
        $data = $request->body();
        $this->validateOrFail($response, $data, $this->scheduleRules());

        $conflicts = $this->schedules->detectConflicts($data);
        if (!empty($conflicts)) {
            $this->error($response, 'Schedule conflicts detected.', 409, ['conflicts' => $conflicts]);
        }

        $id = (int)$this->schedules->create($data);
        $this->success($response, ['id' => $id], 'Schedule created.', 201);
    }

    public function updateSchedule(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->schedules->find($id)) {
            $this->error($response, 'Schedule not found.', 404);
        }

        $data = $request->body();
        $this->validateOrFail($response, $data, $this->scheduleRules());

        $conflicts = $this->schedules->detectConflicts($data, $id);
        if (!empty($conflicts)) {
            $this->error($response, 'Schedule conflicts detected.', 409, ['conflicts' => $conflicts]);
        }

        $this->schedules->update($id, $data);
        $this->success($response, null, 'Schedule updated.');
    }

    public function deleteSchedule(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->schedules->find($id)) {
            $this->error($response, 'Schedule not found.', 404);
        }
        $this->schedules->delete($id);
        $this->success($response, null, 'Schedule deleted.');
    }

    private function scheduleRules(): array
    {
        return [
            'module_id'        => ['required', 'numeric'],
            'academic_term_id' => ['required', 'numeric'],
            'room_id'          => ['required', 'numeric'],
            'day_of_week'      => ['required', 'numeric', 'in:1,2,3,4,5,6,7'],
            'start_time'       => ['required'],
            'end_time'         => ['required'],
            'session_type'     => ['in:lecture,lab,tutorial,seminar,exam'],
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // ASSIGNMENTS
    // ─────────────────────────────────────────────────────────────

    public function listAssignments(Request $request, Response $response): never
    {
        $filters = [
            'term_id'   => $request->query('term_id'),
            'staff_id'  => $request->query('staff_id'),
            'module_id' => $request->query('module_id'),
        ];
        $this->success($response, $this->assignments->listWithJoins($filters), 'Assignments fetched.');
    }

    public function createAssignment(Request $request, Response $response): never
    {
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'module_id'        => ['required', 'numeric'],
            'staff_id'         => ['required', 'numeric'],
            'academic_term_id' => ['required', 'numeric'],
            'role'             => ['in:primary,assistant'],
            'hours_per_week'   => ['numeric'],
        ]);

        // Auto-resolve academic_year_id from the term
        if (empty($data['academic_year_id'])) {
            $term = $this->modules->db()->fetchOne(
                'SELECT academic_year_id FROM `academic_terms` WHERE id = ? LIMIT 1',
                [(int)$data['academic_term_id']]
            );
            if ($term) {
                $data['academic_year_id'] = (int)$term['academic_year_id'];
            } else {
                $this->error($response, 'Academic term not found.', 404);
            }
        }

        $existing = $this->assignments->db()->fetchOne(
            'SELECT id FROM `module_assignments`
              WHERE module_id = ? AND staff_id = ? AND academic_term_id = ? LIMIT 1',
            [(int)$data['module_id'], (int)$data['staff_id'], (int)$data['academic_term_id']]
        );
        if ($existing) {
            $this->error($response, 'This staff member is already assigned to this module in this term.', 409);
        }

        $user = $this->authUser($request);
        if (!empty($user['id'])) {
            $data['created_by'] = (int)$user['id'];
        }

        $id = (int)$this->assignments->create($data);
        $this->success($response, ['id' => $id], 'Assignment created.', 201);
    }

    public function updateAssignment(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->assignments->find($id)) {
            $this->error($response, 'Assignment not found.', 404);
        }
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'role'           => ['in:primary,assistant'],
            'hours_per_week' => ['numeric'],
        ]);
        $this->assignments->update($id, $data);
        $this->success($response, null, 'Assignment updated.');
    }

    public function deleteAssignment(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->assignments->find($id)) {
            $this->error($response, 'Assignment not found.', 404);
        }
        $this->assignments->delete($id);
        $this->success($response, null, 'Assignment deleted.');
    }

    public function workloadSummary(Request $request, Response $response): never
    {
        $termId = (int)$request->query('term_id');
        if (!$termId) {
            $this->error($response, 'term_id is required.', 422);
        }
        $rows = $this->assignments->workloadByStaff($termId);
        $this->success($response, $rows, 'Workload summary fetched.');
    }

    // ─────────────────────────────────────────────────────────────
    // REGISTRATIONS (admin)
    // ─────────────────────────────────────────────────────────────

    public function listRegistrations(Request $request, Response $response): never
    {
        $filters = [
            'term_id'   => $request->query('term_id'),
            'module_id' => $request->query('module_id'),
            'regnumber' => $request->query('regnumber'),
            'status'    => $request->query('status'),
        ];
        $this->success($response, $this->registrations->listWithJoins($filters), 'Registrations fetched.');
    }

    public function registerStudentAdmin(Request $request, Response $response): never
    {
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'module_id'        => ['required', 'numeric'],
            'student_regnumber'=> ['required'],
            'academic_term_id' => ['required', 'numeric'],
            'status'           => ['in:registered,dropped,completed,failed'],
        ]);

        $force = !empty($data['force']);
        $moduleId  = (int)$data['module_id'];
        $regnumber = (string)$data['student_regnumber'];
        $termId    = (int)$data['academic_term_id'];

        if ($this->registrations->isRegistered($regnumber, $moduleId, $termId)) {
            $this->error($response, 'Student is already registered for this module in this term.', 409);
        }

        if (!$force) {
            $check = $this->checkEligibility($regnumber, $moduleId, $termId);
            if ($check['ok'] !== true) {
                $this->error($response, $check['message'], 422, $check['details'] ?? null);
            }

            // Block overlapping schedule with another already-registered module
            $conflicts = $this->detectStudentScheduleClash($regnumber, $moduleId, $termId);
            if (!empty($conflicts)) {
                $this->error(
                    $response,
                    'Schedule overlaps with another module the student is registered for.',
                    409,
                    ['conflicts' => $conflicts]
                );
            }
        }

        $id = (int)$this->registrations->create([
            'module_id'        => $moduleId,
            'student_regnumber'=> $regnumber,
            'academic_term_id' => $termId,
            'status'           => $data['status'] ?? 'registered',
            'grade'            => $data['grade'] ?? null,
        ]);

        $this->success($response, ['id' => $id], 'Student registered.', 201);
    }

    public function updateRegistration(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->registrations->find($id)) {
            $this->error($response, 'Registration not found.', 404);
        }
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'status' => ['in:registered,dropped,completed,failed'],
        ]);

        if (($data['status'] ?? null) === 'dropped') {
            $data['dropped_at'] = date('Y-m-d H:i:s');
        }

        $this->registrations->update($id, $data);
        $this->success($response, null, 'Registration updated.');
    }

    public function deleteRegistration(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->registrations->find($id)) {
            $this->error($response, 'Registration not found.', 404);
        }
        $this->registrations->delete($id);
        $this->success($response, null, 'Registration deleted.');
    }

    /**
     * Bulk-register multiple students to a module in one request.
     * Expects { module_id, academic_term_id, student_regnumbers: string[], force?: bool }
     */
    public function bulkRegister(Request $request, Response $response): never
    {
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'module_id'           => ['required', 'numeric'],
            'academic_term_id'    => ['required', 'numeric'],
        ]);

        if (empty($data['student_regnumbers']) || !is_array($data['student_regnumbers'])) {
            $this->error($response, 'student_regnumbers array is required.', 422);
        }

        $moduleId  = (int)$data['module_id'];
        $termId    = (int)$data['academic_term_id'];
        $force     = !empty($data['force']);
        $created   = 0;
        $skipped   = 0;
        $errors    = [];

        foreach ($data['student_regnumbers'] as $regnumber) {
            $regnumber = trim((string)$regnumber);
            if ($regnumber === '') { continue; }

            if ($this->registrations->isRegistered($regnumber, $moduleId, $termId)) {
                $skipped++;
                continue;
            }

            if (!$force) {
                $check = $this->checkEligibility($regnumber, $moduleId, $termId);
                if ($check['ok'] !== true) {
                    $errors[] = ['regnumber' => $regnumber, 'reason' => $check['message']];
                    $skipped++;
                    continue;
                }
            }

            $this->registrations->create([
                'module_id'         => $moduleId,
                'student_regnumber' => $regnumber,
                'academic_term_id'  => $termId,
                'status'            => 'registered',
            ]);
            $created++;
        }

        $this->success($response, [
            'created' => $created,
            'skipped' => $skipped,
            'errors'  => $errors,
        ], "{$created} student(s) registered, {$skipped} skipped.", 201);
    }

    // ─────────────────────────────────────────────────────────────
    // REGISTRATIONS (student self-service)
    // ─────────────────────────────────────────────────────────────

    public function myEligibleModules(Request $request, Response $response): never
    {
        $termId = (int)$request->query('term_id');
        if (!$termId) {
            $this->error($response, 'term_id is required.', 422);
        }
        $reg = $this->studentRegnumber($request);
        if (!$reg) {
            $this->error($response, 'No student record linked to this account.', 400);
        }
        $this->success($response, $this->modules->listEligibleFor($reg, $termId), 'Eligible modules fetched.');
    }

    public function myRegistrations(Request $request, Response $response): never
    {
        $termId = (int)$request->query('term_id');
        $reg    = $this->studentRegnumber($request);
        if (!$reg) {
            $this->error($response, 'No student record linked to this account.', 400);
        }
        $filters = ['regnumber' => $reg];
        if ($termId) {
            $filters['term_id'] = $termId;
        }
        $this->success($response, $this->registrations->listWithJoins($filters), 'My registrations fetched.');
    }

    public function selfRegister(Request $request, Response $response): never
    {
        $data = $request->body();
        $this->validateOrFail($response, $data, [
            'module_id'        => ['required', 'numeric'],
            'academic_term_id' => ['required', 'numeric'],
        ]);

        $reg = $this->studentRegnumber($request);
        if (!$reg) {
            $this->error($response, 'No student record linked to this account.', 400);
        }
        $moduleId = (int)$data['module_id'];
        $termId   = (int)$data['academic_term_id'];

        if ($this->registrations->isRegistered($reg, $moduleId, $termId)) {
            $this->error($response, 'You are already registered for this module.', 409);
        }

        $check = $this->checkEligibility($reg, $moduleId, $termId);
        if ($check['ok'] !== true) {
            $this->error($response, $check['message'], 422, $check['details'] ?? null);
        }

        // Schedule overlap with existing registered modules
        $conflicts = $this->detectStudentScheduleClash($reg, $moduleId, $termId);
        if (!empty($conflicts)) {
            $this->error($response, 'Schedule overlaps with your existing registrations.', 409, ['conflicts' => $conflicts]);
        }

        $id = (int)$this->registrations->create([
            'module_id'        => $moduleId,
            'student_regnumber'=> $reg,
            'academic_term_id' => $termId,
            'status'           => 'registered',
        ]);

        $this->success($response, ['id' => $id], 'Registered.', 201);
    }

    public function selfDrop(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $row = $this->registrations->find($id);
        if (!$row) {
            $this->error($response, 'Registration not found.', 404);
        }

        $reg = $this->studentRegnumber($request);
        if ($row['student_regnumber'] !== $reg) {
            $this->error($response, 'You can only drop your own registrations.', 403);
        }

        if ($row['status'] !== 'registered') {
            $this->error($response, 'Only active registrations can be dropped.', 422);
        }

        $this->registrations->update($id, [
            'status'     => 'dropped',
            'dropped_at' => date('Y-m-d H:i:s'),
        ]);
        $this->success($response, null, 'Registration dropped.');
    }

    // ─────────────────────────────────────────────────────────────
    // Shared logic
    // ─────────────────────────────────────────────────────────────

    /**
     * @return array{ok:bool,message?:string,details?:array}
     */
    private function checkEligibility(string $regnumber, int $moduleId, int $termId): array
    {
        $module = $this->modules->find($moduleId);
        if (!$module) {
            return ['ok' => false, 'message' => 'Module not found.'];
        }
        if (($module['status'] ?? 'active') !== 'active') {
            return ['ok' => false, 'message' => 'Module is not active.'];
        }

        $student = $this->modules->db()->fetchOne(
            'SELECT department, current_level FROM `student` WHERE regnumber = ? LIMIT 1',
            [$regnumber]
        );
        if (!$student) {
            return ['ok' => false, 'message' => 'Student record not found.'];
        }

        // Level check: only block if the student has a level set and it's below the module's
        $studentLevel = !empty($student['current_level']) ? (int)$student['current_level'] : 0;
        if ($studentLevel > 0 && (int)$module['level'] > $studentLevel) {
            return ['ok' => false, 'message' => 'Your current year-of-study is below the module level.'];
        }

        $requiredIds = array_column($this->modules->prereqsFor($moduleId), 'id');
        if (!empty($requiredIds)) {
            $completed = $this->registrations->completedModuleIds($regnumber);
            $missing   = array_values(array_diff(array_map('intval', $requiredIds), $completed));
            if (!empty($missing)) {
                return [
                    'ok'      => false,
                    'message' => 'Prerequisites not satisfied.',
                    'details' => ['missing_prerequisite_ids' => $missing],
                ];
            }
        }

        return ['ok' => true];
    }

    /**
     * Returns schedule entries of the new module that overlap with any
     * already-registered module's schedule for the same term.
     */
    private function detectStudentScheduleClash(string $regnumber, int $newModuleId, int $termId): array
    {
        $existing = $this->schedules->studentSchedulesFor($regnumber, $termId);
        if (empty($existing)) {
            return [];
        }

        $newSchedules = $this->modules->db()->fetchAll(
            "SELECT day_of_week, start_time, end_time, module_id
             FROM `module_schedules`
             WHERE module_id = ? AND academic_term_id = ?",
            [$newModuleId, $termId]
        );

        $conflicts = [];
        foreach ($newSchedules as $n) {
            foreach ($existing as $e) {
                if ((int)$n['day_of_week'] !== (int)$e['day_of_week']) {
                    continue;
                }
                // Time overlap
                if (!($e['end_time'] <= $n['start_time'] || $e['start_time'] >= $n['end_time'])) {
                    $conflicts[] = ['candidate' => $n, 'existing' => $e];
                }
            }
        }
        return $conflicts;
    }

    /**
     * Resolve the authenticated user's student regnumber.
     * The auth JWT carries the user identity; we map user.email → student.email
     * (falling back to user.regnumber if it is stored on the user row).
     */
    private function studentRegnumber(Request $request): ?string
    {
        $user = $this->authUser($request);

        if (!empty($user['regnumber'])) {
            return (string)$user['regnumber'];
        }
        if (!empty($user['email'])) {
            $row = $this->modules->db()->fetchOne(
                'SELECT regnumber FROM `student` WHERE email = ? LIMIT 1',
                [$user['email']]
            );
            if ($row && !empty($row['regnumber'])) {
                return (string)$row['regnumber'];
            }
        }
        return null;
    }
}
