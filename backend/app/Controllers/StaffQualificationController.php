<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StaffQualificationModel;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;

class StaffQualificationController extends BaseController
{
    private StaffQualificationModel $qualModel;
    private HrEmployeeModel         $empModel;

    public function __construct()
    {
        $this->qualModel = new StaffQualificationModel();
        $this->empModel  = new HrEmployeeModel();
    }

    /**
     * GET /api/employees/:id/qualifications
     */
    public function index(Request $request, Response $response): never
    {
        $employeeId = (int)$request->param('id');

        if (!$this->empModel->find($employeeId)) {
            $this->error($response, 'Employee not found', 404);
        }

        $rows = $this->qualModel->findByEmployee($employeeId);
        $this->success($response, $rows, 'Qualifications fetched.');
    }

    /**
     * POST /api/employees/:id/qualifications
     */
    public function create(Request $request, Response $response): never
    {
        $employeeId = (int)$request->param('id');

        if (!$this->empModel->find($employeeId)) {
            $this->error($response, 'Employee not found', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'title' => ['required'],
            'type'  => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $validTypes = ['Academic', 'Certification', 'Teaching Specialisation'];
        if (!in_array($data['type'] ?? '', $validTypes, true)) {
            $this->error($response, 'Invalid type', 422, ['type' => ['Must be one of: ' . implode(', ', $validTypes)]]);
        }

        $yearObtained = isset($data['year_obtained']) && (string)$data['year_obtained'] !== ''
            ? (int)$data['year_obtained']
            : null;

        $id = $this->qualModel->create([
            'employee_id'    => $employeeId,
            'type'           => $data['type'],
            'title'          => trim($data['title'] ?? ''),
            'institution'    => trim($data['institution']    ?? '') ?: null,
            'field_of_study' => trim($data['field_of_study'] ?? '') ?: null,
            'year_obtained'  => $yearObtained,
            'grade_result'   => trim($data['grade_result']   ?? '') ?: null,
            'description'    => trim($data['description']    ?? '') ?: null,
        ]);

        $row = $this->qualModel->find($id);
        $this->success($response, $row, 'Qualification added.', 201);
    }

    /**
     * PUT /api/employees/:id/qualifications/:qid
     */
    public function update(Request $request, Response $response): never
    {
        $employeeId = (int)$request->param('id');
        $qualId     = (int)$request->param('qid');

        $row = $this->qualModel->find($qualId);
        if (!$row || (int)$row['employee_id'] !== $employeeId) {
            $this->error($response, 'Qualification not found', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'title' => ['required'],
            'type'  => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $validTypes = ['Academic', 'Certification', 'Teaching Specialisation'];
        if (!in_array($data['type'] ?? '', $validTypes, true)) {
            $this->error($response, 'Invalid type', 422, ['type' => ['Must be one of: ' . implode(', ', $validTypes)]]);
        }

        $yearObtained = isset($data['year_obtained']) && (string)$data['year_obtained'] !== ''
            ? (int)$data['year_obtained']
            : null;

        $this->qualModel->update($qualId, [
            'type'           => $data['type'],
            'title'          => trim($data['title'] ?? ''),
            'institution'    => trim($data['institution']    ?? '') ?: null,
            'field_of_study' => trim($data['field_of_study'] ?? '') ?: null,
            'year_obtained'  => $yearObtained,
            'grade_result'   => trim($data['grade_result']   ?? '') ?: null,
            'description'    => trim($data['description']    ?? '') ?: null,
        ]);

        $updated = $this->qualModel->find($qualId);
        $this->success($response, $updated, 'Qualification updated.');
    }

    /**
     * DELETE /api/employees/:id/qualifications/:qid
     */
    public function delete(Request $request, Response $response): never
    {
        $employeeId = (int)$request->param('id');
        $qualId     = (int)$request->param('qid');

        $row = $this->qualModel->find($qualId);
        if (!$row || (int)$row['employee_id'] !== $employeeId) {
            $this->error($response, 'Qualification not found', 404);
        }

        $this->qualModel->delete($qualId);
        $this->success($response, null, 'Qualification deleted.');
    }
}
