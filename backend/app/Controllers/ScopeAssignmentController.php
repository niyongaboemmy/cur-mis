<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\UserDepartmentAssignmentModel;
use App\Models\UserFacultyAssignmentModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;
use App\Constants\Permissions;

/**
 * Manage department and faculty assignments for users.
 * Restricted to MANAGE_USERS permission.
 */
class ScopeAssignmentController extends BaseController
{
    private UserDepartmentAssignmentModel $deptModel;
    private UserFacultyAssignmentModel $facultyModel;

    public function __construct()
    {
        $this->deptModel = new UserDepartmentAssignmentModel();
        $this->facultyModel = new UserFacultyAssignmentModel();
    }

    public function assignDepartment(Request $request, Response $response): never
    {
        $data = $request->body();
        $user = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'user_id'      => ['required', 'integer'],
            'department_id' => ['required', 'integer'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $userId = (int)$data['user_id'];
        $departmentId = (int)$data['department_id'];
        $assignedBy = (int)($user['id'] ?? 0);

        try {
            $this->deptModel->assign($userId, $departmentId, $assignedBy);

            SystemLogService::log(
                'CREATE',
                'SCOPE',
                "Assigned department $departmentId to user $userId",
                $assignedBy,
                'department_assignment',
                ['user_id' => $userId, 'department_id' => $departmentId]
            );

            $this->success($response, null, 'Department assigned successfully.', 201);
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to assign department: ' . $e->getMessage(), 500);
        }
    }

    public function unassignDepartment(Request $request, Response $response): never
    {
        $data = $request->body();
        $user = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'user_id'      => ['required', 'integer'],
            'department_id' => ['required', 'integer'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $userId = (int)$data['user_id'];
        $departmentId = (int)$data['department_id'];
        $assignedBy = (int)($user['id'] ?? 0);

        try {
            $this->deptModel->unassign($userId, $departmentId);

            SystemLogService::log(
                'DELETE',
                'SCOPE',
                "Removed department $departmentId from user $userId",
                $assignedBy,
                'department_assignment',
                ['user_id' => $userId, 'department_id' => $departmentId]
            );

            $this->success($response, null, 'Department assignment removed.');
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to remove department assignment: ' . $e->getMessage(), 500);
        }
    }

    public function getUserDepartments(Request $request, Response $response): never
    {
        $userId = (int)$request->query('user_id');

        if ($userId <= 0) {
            $this->error($response, 'Invalid user ID.', 400);
        }

        try {
            $departments = $this->deptModel->getAssignedDepartments($userId);
            $this->success($response, $departments, 'User departments retrieved.');
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to retrieve departments: ' . $e->getMessage(), 500);
        }
    }

    public function assignFaculty(Request $request, Response $response): never
    {
        $data = $request->body();
        $user = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'user_id'    => ['required', 'integer'],
            'faculty_id' => ['required', 'integer'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $userId = (int)$data['user_id'];
        $facultyId = (int)$data['faculty_id'];
        $assignedBy = (int)($user['id'] ?? 0);

        try {
            $this->facultyModel->assign($userId, $facultyId, $assignedBy);

            SystemLogService::log(
                'CREATE',
                'SCOPE',
                "Assigned faculty $facultyId to user $userId",
                $assignedBy,
                'faculty_assignment',
                ['user_id' => $userId, 'faculty_id' => $facultyId]
            );

            $this->success($response, null, 'Faculty assigned successfully.', 201);
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to assign faculty: ' . $e->getMessage(), 500);
        }
    }

    public function unassignFaculty(Request $request, Response $response): never
    {
        $data = $request->body();
        $user = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'user_id'    => ['required', 'integer'],
            'faculty_id' => ['required', 'integer'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $userId = (int)$data['user_id'];
        $facultyId = (int)$data['faculty_id'];
        $assignedBy = (int)($user['id'] ?? 0);

        try {
            $this->facultyModel->unassign($userId, $facultyId);

            SystemLogService::log(
                'DELETE',
                'SCOPE',
                "Removed faculty $facultyId from user $userId",
                $assignedBy,
                'faculty_assignment',
                ['user_id' => $userId, 'faculty_id' => $facultyId]
            );

            $this->success($response, null, 'Faculty assignment removed.');
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to remove faculty assignment: ' . $e->getMessage(), 500);
        }
    }

    public function getUserFaculties(Request $request, Response $response): never
    {
        $userId = (int)$request->query('user_id');

        if ($userId <= 0) {
            $this->error($response, 'Invalid user ID.', 400);
        }

        try {
            $faculties = $this->facultyModel->getAssignedFaculties($userId);
            $this->success($response, $faculties, 'User faculties retrieved.');
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to retrieve faculties: ' . $e->getMessage(), 500);
        }
    }
}
