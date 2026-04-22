<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\AcademicYearModel;
use App\Models\AcademicTermModel;
use App\Helpers\ValidationHelper;

class AcademicController extends BaseController
{
    private AcademicYearModel $yearModel;
    private AcademicTermModel $termModel;

    public function __construct()
    {
        $this->yearModel = new AcademicYearModel();
        $this->termModel = new AcademicTermModel();
    }

    // ──────────────────────────────────────────────────────────
    // Academic Years
    // ──────────────────────────────────────────────────────────

    public function listYears(Request $request, Response $response): never
    {
        $years = $this->yearModel->all('id', 'DESC');
        $this->success($response, $years, 'Academic years fetched.');
    }

    public function createYear(Request $request, Response $response): never
    {
        $data = $request->body();
        $errors = ValidationHelper::validate($data, [
            'label'      => ['required', 'regex:/^\d{4}\/\d{4}$/'], // e.g. 2024/2025
            'start_date' => ['required', 'regex:/^\d{4}-\d{2}-\d{2}$/'], // YYYY-MM-DD
            'end_date'   => ['required', 'regex:/^\d{4}-\d{2}-\d{2}$/']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $id = $this->yearModel->create($data);
        $this->success($response, ['id' => $id], 'Academic year created.', 201);
    }

    public function updateYear(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->yearModel->find($id)) {
            $this->error($response, 'Year not found.', 404);
        }

        $this->yearModel->update($id, $data);
        $this->success($response, null, 'Academic year updated.');
    }

    public function deleteYear(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $this->yearModel->delete($id);
        $this->success($response, null, 'Academic year deleted.');
    }

    public function activateYear(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        
        if (!$this->yearModel->find($id)) {
            $this->error($response, 'Year not found.', 404);
        }

        // Deactivate all first
        $this->yearModel->db()->execute("UPDATE `academic_years` SET `is_current` = 0");
        // Activate the chosen one
        $this->yearModel->update($id, ['is_current' => 1]);

        $this->success($response, null, 'Academic year activated.');
    }

    // ──────────────────────────────────────────────────────────
    // Academic Terms (Semesters)
    // ──────────────────────────────────────────────────────────

    public function listTerms(Request $request, Response $response): never
    {
        $yearId = (int)$request->query('academic_year_id');

        if ($yearId > 0) {
            $terms = $this->termModel->db()->fetchAll(
                "SELECT * FROM `academic_terms` WHERE academic_year_id = ? ORDER BY id ASC",
                [$yearId]
            );
        } else {
            $terms = $this->termModel->all('id', 'ASC');
        }

        $this->success($response, $terms, 'Academic terms fetched.');
    }

    public function createTerm(Request $request, Response $response): never
    {
        $data = $request->body();
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => ['required', 'numeric'],
            'label'            => ['required', 'min:3'],
            'start_date'       => ['required', 'regex:/^\d{4}-\d{2}-\d{2}$/'],
            'end_date'         => ['required', 'regex:/^\d{4}-\d{2}-\d{2}$/']
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $id = $this->termModel->create($data);
        $this->success($response, ['id' => $id], 'Academic term created.', 201);
    }

    public function updateTerm(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $data = $request->body();

        if (!$this->termModel->find($id)) {
            $this->error($response, 'Term not found.', 404);
        }

        $this->termModel->update($id, $data);
        $this->success($response, null, 'Academic term updated.');
    }

    public function deleteTerm(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $this->termModel->delete($id);
        $this->success($response, null, 'Academic term deleted.');
    }

    public function activateTerm(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        
        if (!$this->termModel->find($id)) {
            $this->error($response, 'Term not found.', 404);
        }

        // Deactivate all terms (system-wide active term)
        $this->termModel->db()->execute("UPDATE `academic_terms` SET `is_current` = 0");
        // Activate the chosen one
        $this->termModel->update($id, ['is_current' => 1]);

        $this->success($response, null, 'Academic term activated.');
    }
}
