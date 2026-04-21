<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrEmployeeModel;

class HrEmployeeController extends BaseController
{
    private HrEmployeeModel $employeeModel;

    public function __construct()
    {
        $this->employeeModel = new HrEmployeeModel();
    }

    /**
     * List all HR employees with pagination.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? '';

        $where = '';
        $bindings = [];

        if ($search !== '') {
            $where = "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR position LIKE ?)";
            $bindings = ["%$search%", "%$search%", "%$search%", "%$search%"];
        }

        $paginated = $this->employeeModel->paginate($page, $perPage, $where, $bindings, 'id', 'DESC');
        
        $this->success($response, $paginated, 'HR Employees fetched successfully.');
    }

    /**
     * Get a single employee.
     */
    public function show(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->success($response, $employee, 'Employee details fetched.');
    }
}
