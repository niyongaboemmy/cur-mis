<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\MeritCriteriaModel;
use App\Models\MeritListModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;
use Core\Database;

class MeritListController extends BaseController
{
    private MeritCriteriaModel $criteriaModel;
    private MeritListModel     $meritListModel;
    private ApplicationService $service;

    public function __construct()
    {
        $this->criteriaModel  = new MeritCriteriaModel();
        $this->meritListModel = new MeritListModel();
        $this->service        = new ApplicationService();
    }

    /**
     * GET /api/admin/merit/criteria?program_id=&intake=&academic_year_id=
     */
    public function getCriteria(Request $request, Response $response): never
    {
        $programId = (int)($request->query('program_id')      ?? 0);
        $intake    = $request->query('intake')                 ?? '';
        $yearId    = (int)($request->query('academic_year_id') ?? 0);

        if (!$programId || !$intake || !$yearId) {
            $this->error($response, 'program_id, intake, and academic_year_id are required.', 422);
        }

        $criteria = $this->criteriaModel->findForProgramIntake($programId, $intake, $yearId);

        if (!$criteria) {
            $this->error($response, 'No merit criteria configured for this program and intake.', 404);
        }

        $this->success($response, $criteria, 'Merit criteria fetched.');
    }

    /**
     * POST /api/admin/merit/criteria
     * Create or update merit criteria for a program+intake+year.
     */
    public function saveCriteria(Request $request, Response $response): never
    {
        $data   = $request->body();
        $authUser = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'program_id'          => 'required|numeric',
            'intake'              => 'required|string|min:3|max:20',
            'academic_year_id'    => 'required|numeric',
            'grade_weight'        => 'required|numeric|min:0|max:100',
            'combination_weight'  => 'required|numeric|min:0|max:100',
            'other_weight'        => 'required|numeric|min:0|max:100',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $total = (float)$data['grade_weight'] + (float)$data['combination_weight'] + (float)$data['other_weight'];
        if (abs($total - 100.0) > 0.01) {
            $this->error($response, 'grade_weight + combination_weight + other_weight must equal 100.', 422, [
                'weights' => 'The three weights must sum to 100. Current sum: ' . $total,
            ]);
        }

        $payload = [
            'program_id'            => (int)$data['program_id'],
            'intake'                => $data['intake'],
            'academic_year_id'      => (int)$data['academic_year_id'],
            'grade_weight'          => (float)$data['grade_weight'],
            'combination_weight'    => (float)$data['combination_weight'],
            'other_weight'          => (float)$data['other_weight'],
            'min_grade'             => $data['min_grade']             ?? null,
            'required_combinations' => $data['required_combinations'] ?? null,
            'cutoff_score'          => isset($data['cutoff_score'])   ? (float)$data['cutoff_score']   : null,
            'max_capacity'          => isset($data['max_capacity'])   ? (int)$data['max_capacity']     : null,
            'created_by'            => (int)($authUser['id'] ?? 0),
        ];

        $id = $this->criteriaModel->upsert($payload);

        $this->success($response, ['id' => (int)$id], 'Merit criteria saved successfully.', 201);
    }

    /**
     * POST /api/admin/merit/generate
     * Generate (or regenerate) the merit list for a program+intake+year.
     */
    public function generateMeritList(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'program_id'       => 'required|numeric',
            'intake'           => 'required|string',
            'academic_year_id' => 'required|numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $result = $this->service->generateMeritList(
                (int)$data['program_id'],
                (string)$data['intake'],
                (int)$data['academic_year_id'],
                (int)($authUser['id'] ?? 0)
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $result, 'Merit list generated successfully.', 201);
    }

    /**
     * GET /api/admin/merit/list?program_id=&intake=&academic_year_id=&page=&per_page=
     */
    public function getMeritList(Request $request, Response $response): never
    {
        $programId = (int)($request->query('program_id')       ?? 0);
        $intake    = $request->query('intake')                  ?? '';
        $yearId    = (int)($request->query('academic_year_id')  ?? 0);
        $page      = (int)($request->query('page')              ?? 1);
        $perPage   = (int)($request->query('per_page')          ?? 20);

        if (!$programId || !$intake || !$yearId) {
            $this->error($response, 'program_id, intake, and academic_year_id are required.', 422);
        }

        $total = $this->meritListModel->countForProgramIntake($programId, $intake, $yearId);

        if ($total === 0) {
            $this->success($response, [
                'data'         => [],
                'total'        => 0,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => 1,
            ], 'No merit list generated yet for this program and intake.');
        }

        // Paginate via raw query
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $db   = Database::getInstance();
        $rows = $db->fetchAll(
            "SELECT ml.*, sa.first_name, sa.last_name, sa.application_number,
                    sa.email, sa.combination, sa.prev_grade, sa.status AS application_status
             FROM `merit_lists` ml
             JOIN `student_applications` sa ON sa.id = ml.application_id
             WHERE ml.program_id = ? AND ml.intake = ? AND ml.academic_year_id = ?
             ORDER BY ml.rank ASC
             LIMIT ? OFFSET ?",
            [$programId, $intake, $yearId, $perPage, $offset]
        );

        $this->success($response, [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ], 'Merit list fetched.');
    }

    /**
     * PATCH /api/admin/merit/publish
     * Publish (or unpublish) the merit list for a program+intake+year.
     */
    public function publishMeritList(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'program_id'       => 'required|numeric',
            'intake'           => 'required|string',
            'academic_year_id' => 'required|numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $criteria = $this->criteriaModel->findForProgramIntake(
            (int)$data['program_id'],
            (string)$data['intake'],
            (int)$data['academic_year_id']
        );

        if (!$criteria) {
            $this->error($response, 'No merit criteria found for this program and intake.', 404);
        }

        $isPublished = isset($data['is_published']) ? (int)(bool)$data['is_published'] : 1;
        $this->criteriaModel->update((int)$criteria['id'], ['is_published' => $isPublished]);

        $this->success($response, ['is_published' => $isPublished], $isPublished ? 'Merit list published.' : 'Merit list unpublished.');
    }
}
