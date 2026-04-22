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
 * Manages which document types are required per faculty per academic year.
 * Admins configure this before opening each admission round.
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
     * Paginated list of all configured requirements.
     * Filterable by faculty_id and academic_year_id.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page')             ?? 1);
        $perPage = (int)($request->query('per_page')         ?? 20);
        $filters = array_filter([
            'faculty_id'       => $request->query('faculty_id')       ?? '',
            'academic_year_id' => $request->query('academic_year_id') ?? '',
        ], fn($v) => $v !== '');

        $result = $this->model->paginateWithDetails($page, $perPage, $filters);
        $this->success($response, $result, 'Admission requirements fetched.');
    }

    /**
     * GET /api/admin/admission-requirements/faculty/:faculty_id/year/:year_id
     * Full requirement checklist for one faculty + year (flat list).
     * Used to set up or review an admission round's document requirements.
     */
    public function getForFacultyYear(Request $request, Response $response): never
    {
        $facultyId = (int)$request->param('faculty_id');
        $yearId    = (int)$request->param('year_id');

        $db = Database::getInstance();

        $faculty = $db->fetchOne(
            "SELECT fac_id, fac_name, fac_code FROM `faculty` WHERE fac_id = ? LIMIT 1",
            [$facultyId]
        );

        $year = $db->fetchOne(
            "SELECT id, label FROM `academic_years` WHERE id = ? LIMIT 1",
            [$yearId]
        );

        if (!$faculty) {
            $this->error($response, 'Faculty not found.', 404);
        }

        if (!$year) {
            $this->error($response, 'Academic year not found.', 404);
        }

        $requirements = $this->model->getForFacultyYear($facultyId, $yearId);

        // Also return all active document types so the admin can see what hasn't been added yet
        $allTypes   = $this->docTypeModel->getActive();
        $addedIds   = array_column($requirements, 'document_type_id');
        $unadded    = array_filter($allTypes, fn($t) => !in_array((string)$t['id'], $addedIds, true)
                                                     && !in_array((int)$t['id'], array_map('intval', $addedIds), true));

        $this->success($response, [
            'faculty'      => ['id' => $faculty['fac_id'], 'name' => $faculty['fac_name'], 'code' => $faculty['fac_code']],
            'academic_year'=> ['id' => $year['id'], 'label' => $year['label']],
            'requirements' => $requirements,
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
     * Add a document type requirement for a faculty + academic year.
     */
    public function create(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'faculty_id'       => 'required|numeric',
            'academic_year_id' => 'required|numeric',
            'document_type_id' => 'required|numeric',
            'is_required'      => 'required|boolean',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $facultyId = (int)$data['faculty_id'];
        $yearId    = (int)$data['academic_year_id'];
        $typeId    = (int)$data['document_type_id'];

        // Verify the document type exists and is active
        $docType = $this->docTypeModel->find($typeId);
        if (!$docType || !(int)$docType['is_active']) {
            $this->error($response, 'Document type not found or inactive.', 422);
        }

        // Verify faculty and academic year exist
        $db      = Database::getInstance();
        $faculty = $db->fetchOne("SELECT fac_id FROM `faculty` WHERE fac_id = ? LIMIT 1", [$facultyId]);
        $year    = $db->fetchOne("SELECT id FROM `academic_years` WHERE id = ? LIMIT 1", [$yearId]);

        if (!$faculty) {
            $this->error($response, 'Faculty not found.', 422);
        }
        if (!$year) {
            $this->error($response, 'Academic year not found.', 422);
        }

        // Duplicate check
        if ($this->model->existsForFacultyYearType($facultyId, $yearId, $typeId)) {
            $this->error($response, 'This document type is already configured for this faculty and academic year.', 409);
        }

        $id = $this->model->create([
            'faculty_id'       => $facultyId,
            'academic_year_id' => $yearId,
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
     * Update is_required, notes, or sort_order for an existing requirement.
     * (faculty_id, academic_year_id, document_type_id are immutable once set.)
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
     * Remove a document requirement.
     * Note: Removing a requirement does NOT delete already-uploaded applicant documents.
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

    /**
     * POST /api/admin/admission-requirements/copy
     * Copy all requirements from one academic year to another for the same faculty.
     * Useful when starting a new admission round with the same document checklist.
     */
    public function copyToYear(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'faculty_id'    => 'required|numeric',
            'from_year_id'  => 'required|numeric',
            'to_year_id'    => 'required|numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $facultyId  = (int)$data['faculty_id'];
        $fromYearId = (int)$data['from_year_id'];
        $toYearId   = (int)$data['to_year_id'];

        if ($fromYearId === $toYearId) {
            $this->error($response, 'Source and destination academic years must be different.', 422);
        }

        $copied = $this->model->copyForNewYear(
            $facultyId, $fromYearId, $toYearId,
            (int)($authUser['id'] ?? 0)
        );

        $this->success($response, ['copied' => $copied], "{$copied} requirement(s) copied to the target academic year.");
    }
}
