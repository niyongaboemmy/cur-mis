<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\IntakeModel;
use App\Helpers\ValidationHelper;

class IntakeController extends BaseController
{
    private IntakeModel $intakeModel;

    public function __construct()
    {
        $this->intakeModel = new IntakeModel();
    }

    /**
     * GET /api/admin/intakes
     */
    public function index(Request $request, Response $response): never
    {
        $intakes = $this->intakeModel->all('start_date', 'DESC');
        $this->success($response, $intakes, 'Intakes fetched successfully.');
    }

    /**
     * POST /api/admin/intakes
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'name'       => ['required', 'string', 'min:2'],
            'start_date' => ['required', 'date'],
            'end_date'   => ['required', 'date'],
            'is_active'  => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = $this->intakeModel->create([
            'name'       => $data['name'],
            'start_date' => $data['start_date'],
            'end_date'   => $data['end_date'],
            'is_active'  => (int)$data['is_active'],
        ]);

        $this->success($response, $this->intakeModel->find($id), 'Intake created successfully.', 201);
    }

    /**
     * PUT /api/admin/intakes/:id
     */
    public function update(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        $intake = $this->intakeModel->find($id);
        if (!$intake) {
            $this->error($response, 'Intake not found.', 404);
        }

        $this->intakeModel->update($id, [
            'name'       => $data['name']       ?? $intake['name'],
            'start_date' => $data['start_date'] ?? $intake['start_date'],
            'end_date'   => $data['end_date']   ?? $intake['end_date'],
            'is_active'  => isset($data['is_active']) ? (int)$data['is_active'] : $intake['is_active'],
        ]);

        $this->success($response, $this->intakeModel->find($id), 'Intake updated successfully.');
    }

    /**
     * DELETE /api/admin/intakes/:id
     */
    public function delete(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        
        if (!$this->intakeModel->find($id)) {
            $this->error($response, 'Intake not found.', 404);
        }

        $this->intakeModel->delete($id);
        $this->success($response, null, 'Intake deleted successfully.');
    }

    /**
     * PATCH /api/admin/intakes/:id/toggle-active
     */
    public function toggleActive(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $intake = $this->intakeModel->find($id);

        if (!$intake) {
            $this->error($response, 'Intake not found.', 404);
        }

        $newStatus = (int)$intake['is_active'] === 1 ? 0 : 1;
        $this->intakeModel->update($id, ['is_active' => $newStatus]);

        $this->success($response, ['is_active' => $newStatus], 'Intake status updated.');
    }
}
