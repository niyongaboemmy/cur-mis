<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\AdmissionRequirementModel;
use App\Models\ApplicationDocumentTypeModel;
use App\Helpers\ValidationHelper;

/**
 * AdmissionRequirementController
 *
 * Manages which document types are required per faculty. Requirements are
 * faculty-scoped only — they are NOT split per academic year, so the same
 * checklist applies year over year.
 *
 * Required permission: MANAGE_ADMISSION_REQUIREMENTS
 */
class AdmissionRequirementController extends BaseController
{
    private AdmissionRequirementModel    $model;
    private ApplicationDocumentTypeModel $docTypeModel;

    public function __construct()
    {
        $this->model        = new AdmissionRequirementModel();
        $this->docTypeModel = new ApplicationDocumentTypeModel();
    }

    /**
     * GET /api/admin/admission-requirements
     * Paginated list of all configured requirements. Filterable by faculty_id.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page')     ?? 1);
        $perPage = (int)($request->query('per_page') ?? 20);
        $filters = array_filter([
            'faculty_id' => $request->query('faculty_id') ?? '',
        ], fn($v) => $v !== '');

        $result = $this->model->paginateWithDetails($page, $perPage, $filters);
        $this->success($response, $result, 'Admission requirements fetched.');
    }

    /**
     * GET /api/admin/admission-requirements/faculty/:faculty_id
     * Full requirement checklist for one faculty (flat list).
     */
    public function getForFaculty(Request $request, Response $response): never
    {
        $facultyId = (int)$request->param('faculty_id');

        $db      = Database::getInstance();
        $faculty = $db->fetchOne(
            "SELECT fac_id, fac_name, fac_code FROM `faculty` WHERE fac_id = ? LIMIT 1",
            [$facultyId]
        );

        if (!$faculty) {
            $this->error($response, 'Faculty not found.', 404);
        }

        $requirements = $this->model->getForFaculty($facultyId);

        // Surface doc types not yet attached so the admin can pick from them
        $allTypes  = $this->docTypeModel->getActive();
        $addedIds  = array_column($requirements, 'document_type_id');
        $unadded   = array_filter(
            $allTypes,
            fn($t) => !in_array((string)$t['id'], $addedIds, true)
                  && !in_array((int)$t['id'], array_map('intval', $addedIds), true)
        );

        $this->success($response, [
            'faculty'         => ['id' => $faculty['fac_id'], 'name' => $faculty['fac_name'], 'code' => $faculty['fac_code']],
            'requirements'    => $requirements,
            'available_types' => array_values($unadded),
        ], 'Requirements fetched.');
    }

    /**
     * GET /api/admin/admission-requirements/:id
     * Single requirement record.
     */
    public function show(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->find($id);

        if (!$row) {
            $this->error($response, 'Requirement not found.', 404);
        }

        $this->success($response, $row, 'Requirement fetched.');
    }

    /**
     * POST /api/admin/admission-requirements
     * Add a document type requirement for a faculty.
     */
    public function create(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'faculty_id'       => 'required|numeric',
            'document_type_id' => 'required|numeric',
            'is_required'      => 'required|boolean',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $facultyId = (int)$data['faculty_id'];
        $typeId    = (int)$data['document_type_id'];

        // Verify the document type exists and is active
        $docType = $this->docTypeModel->find($typeId);
        if (!$docType || !(int)$docType['is_active']) {
            $this->error($response, 'Document type not found or inactive.', 422);
        }

        // Verify faculty exists
        $db      = Database::getInstance();
        $faculty = $db->fetchOne("SELECT fac_id FROM `faculty` WHERE fac_id = ? LIMIT 1", [$facultyId]);
        if (!$faculty) {
            $this->error($response, 'Faculty not found.', 422);
        }

        if ($this->model->existsForFacultyType($facultyId, $typeId)) {
            $this->error($response, 'This document type is already configured for this faculty.', 409);
        }

        $id = $this->model->create([
            'faculty_id'       => $facultyId,
            'document_type_id' => $typeId,
            'is_required'      => (int)(bool)$data['is_required'],
            'notes'            => $data['notes']       ?? null,
            'sort_order'       => isset($data['sort_order']) ? (int)$data['sort_order'] : 0,
            'created_by'       => (int)($authUser['id'] ?? 0),
        ]);

        $this->success($response, ['id' => (int)$id], 'Requirement added successfully.', 201);
    }

    /**
     * PUT /api/admin/admission-requirements/:id
     * Update is_required, notes, or sort_order on an existing requirement.
     * (faculty_id and document_type_id are immutable once set.)
     */
    public function update(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->find($id);

        if (!$row) {
            $this->error($response, 'Requirement not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'is_required' => 'required|boolean',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $this->model->update($id, [
            'is_required' => (int)(bool)$data['is_required'],
            'notes'       => $data['notes']       ?? $row['notes'],
            'sort_order'  => isset($data['sort_order']) ? (int)$data['sort_order'] : (int)$row['sort_order'],
        ]);

        $this->success($response, ['id' => $id], 'Requirement updated successfully.');
    }

    /**
     * DELETE /api/admin/admission-requirements/:id
     */
    public function delete(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->find($id);

        if (!$row) {
            $this->error($response, 'Requirement not found.', 404);
        }

        $this->model->delete($id);
        $this->success($response, null, 'Requirement removed successfully.');
    }
}
