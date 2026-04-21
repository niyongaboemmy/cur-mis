<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentModel;

class StudentController extends BaseController
{
    private StudentModel $studentModel;

    public function __construct()
    {
        $this->studentModel = new StudentModel();
    }

    /**
     * List all students with pagination.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? '';

        $where = '';
        $bindings = [];

        if ($search !== '') {
            $where = "(fname LIKE ? OR lname LIKE ? OR regnumber LIKE ? OR email LIKE ?)";
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
        $id = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->success($response, $student, 'Student details fetched.');
    }
}
