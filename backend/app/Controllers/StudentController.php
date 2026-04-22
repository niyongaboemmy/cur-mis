<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentModel;
use App\Helpers\ValidationHelper;

class StudentController extends BaseController
{
    private StudentModel $studentModel;

    public function __construct()
    {
        $this->studentModel = new StudentModel();
    }

    /**
     * List all students with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? $request->query('q') ?? '';

        $where    = '';
        $bindings = [];

        if ($search !== '') {
            $where    = "(fname LIKE ? OR lname LIKE ? OR regnumber LIKE ? OR email LIKE ?)";
            $bindings = ["%$search%", "%$search%", "%$search%", "%$search%"];
        }

        $paginated = $this->studentModel->paginate($page, $perPage, $where, $bindings, 'id', 'DESC');

        $this->success($response, $paginated, 'Students fetched successfully.');
    }

    /**
     * Get a single student.
     */
    public function show(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->success($response, $student, 'Student details fetched.');
    }

    /**
     * Create a new student record.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'fname'   => ['required', 'min:2'],
            'lname'   => ['required', 'min:2'],
            'faculty' => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // Auto-generate reg number if not provided
        if (empty($data['regnumber'])) {
            $year              = date('Y');
            $data['regnumber'] = 'CUR/' . $year . '/' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        }

        $id = $this->studentModel->create([
            'regnumber'         => $data['regnumber'],
            'fname'             => trim($data['fname']),
            'lname'             => trim($data['lname']),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['birthdate'] ?? null,
            'nationality'       => $data['nationality'] ?? 'Rwandan',
            'program'           => $data['program'] ?? null,
            'faculty'           => $data['faculty'],
            'department'        => $data['department'] ?? null,
            'current_level'     => $data['current_level'] ?? null,
            'registration_date' => $data['registration_date'] ?? date('Y-m-d'),
            'student_state'     => $data['student_state'] ?? 'active',
        ]);

        $this->success($response, ['id' => $id], 'Student created successfully.', 201);
    }

    /**
     * Update a student record.
     */
    public function update(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $data    = $request->body();
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'fname'   => ['required', 'min:2'],
            'lname'   => ['required', 'min:2'],
            'faculty' => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $this->studentModel->update($id, [
            'regnumber'         => $data['regnumber'] ?? $student['regnumber'],
            'fname'             => trim($data['fname']),
            'lname'             => trim($data['lname']),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['birthdate'] ?? null,
            'nationality'       => $data['nationality'] ?? null,
            'program'           => $data['program'] ?? null,
            'faculty'           => $data['faculty'],
            'department'        => $data['department'] ?? null,
            'current_level'     => $data['current_level'] ?? null,
            'registration_date' => $data['registration_date'] ?? null,
            'student_state'     => $data['student_state'] ?? $student['student_state'],
        ]);

        $this->success($response, null, 'Student updated successfully.');
    }

    /**
     * Delete a student record.
     */
    public function delete(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->studentModel->delete($id);
        $this->success($response, null, 'Student deleted successfully.');
    }
}
