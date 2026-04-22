<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;

class HrEmployeeController extends BaseController
{
    private HrEmployeeModel $employeeModel;

    public function __construct()
    {
        $this->employeeModel = new HrEmployeeModel();
    }

    /**
     * List all HR employees with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? $request->query('q') ?? '';

        $where    = '';
        $bindings = [];

        if ($search !== '') {
            $where    = "(full_name LIKE ? OR emp_code LIKE ? OR email LIKE ? OR position LIKE ? OR department LIKE ?)";
            $bindings = ["%$search%", "%$search%", "%$search%", "%$search%", "%$search%"];
        }

        $paginated = $this->employeeModel->paginate($page, $perPage, $where, $bindings, 'id', 'DESC');

        $this->success($response, $paginated, 'HR Employees fetched successfully.');
    }

    /**
     * Get a single employee.
     */
    public function show(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->success($response, $employee, 'Employee details fetched.');
    }

    /**
     * Create a new HR employee.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'emp_code'      => ['required'],
            'full_name'     => ['required', 'min:3'],
            'gender'        => ['required'],
            'department'    => ['required'],
            'position'      => ['required'],
            'contract_type' => ['required'],
            'start_date'    => ['required'],
            'salary'        => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->employeeModel->exists('emp_code', $data['emp_code'])) {
            $this->error($response, 'Employee code already in use.', 409);
        }

        $id = $this->employeeModel->create([
            'emp_code'      => trim($data['emp_code']),
            'staff_id'      => isset($data['staff_id']) ? (int)$data['staff_id'] : null,
            'full_name'     => trim($data['full_name']),
            'gender'        => $data['gender'],
            'department'    => trim($data['department']),
            'position'      => trim($data['position']),
            'contract_type' => $data['contract_type'],
            'start_date'    => $data['start_date'],
            'end_date'      => $data['end_date'] ?? null,
            'salary'        => (float)$data['salary'],
            'phone'         => $data['phone'] ?? null,
            'email'         => $data['email'] ?? null,
            'status'        => $data['status'] ?? 'Active',
        ]);

        $this->success($response, ['id' => $id], 'Employee created successfully.', 201);
    }

    /**
     * Update an HR employee.
     */
    public function update(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $data     = $request->body();
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'emp_code'      => ['required'],
            'full_name'     => ['required', 'min:3'],
            'gender'        => ['required'],
            'department'    => ['required'],
            'position'      => ['required'],
            'contract_type' => ['required'],
            'start_date'    => ['required'],
            'salary'        => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->employeeModel->exists('emp_code', $data['emp_code'], $id)) {
            $this->error($response, 'Employee code already in use.', 409);
        }

        $this->employeeModel->update($id, [
            'emp_code'      => trim($data['emp_code']),
            'staff_id'      => isset($data['staff_id']) ? (int)$data['staff_id'] : null,
            'full_name'     => trim($data['full_name']),
            'gender'        => $data['gender'],
            'department'    => trim($data['department']),
            'position'      => trim($data['position']),
            'contract_type' => $data['contract_type'],
            'start_date'    => $data['start_date'],
            'end_date'      => $data['end_date'] ?? null,
            'salary'        => (float)$data['salary'],
            'phone'         => $data['phone'] ?? null,
            'email'         => $data['email'] ?? null,
            'status'        => $data['status'] ?? $employee['status'],
        ]);

        $this->success($response, null, 'Employee updated successfully.');
    }

    /**
     * Delete an HR employee.
     */
    public function delete(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->employeeModel->delete($id);
        $this->success($response, null, 'Employee deleted successfully.');
    }

    /**
     * Toggle employee status between Active and Inactive.
     */
    public function toggleStatus(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $newStatus = ($employee['status'] === 'Active') ? 'Inactive' : 'Active';
        $this->employeeModel->update($id, ['status' => $newStatus]);

        $this->success($response, ['status' => $newStatus], 'Employee status updated.');
    }
}
