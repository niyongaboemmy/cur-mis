<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\ProgrammeDocumentRequirementModel;
use App\Models\ApplicationDocumentTypeModel;
use App\Helpers\ValidationHelper;
use App\Services\StudentDocumentComplianceService;
use App\Services\SystemLogService;

/**
 * ProgrammeDocumentRequirementController
 *
 * Admin editor for the required-documents checklist per programme category
 * (undergraduate / postgraduate / masters). This is what the student
 * Documents tab checks uploads against — replaces the hardcoded
 * REQUIRED_DOCS list the frontend used to carry.
 *
 * Required permission: MANAGE_ADMISSION_REQUIREMENTS (same gate as the
 * document-type catalogue and per-faculty admission requirements).
 */
class ProgrammeDocumentRequirementController extends BaseController
{
    private ProgrammeDocumentRequirementModel $model;
    private ApplicationDocumentTypeModel      $docTypeModel;

    public function __construct()
    {
        $this->model        = new ProgrammeDocumentRequirementModel();
        $this->docTypeModel = new ApplicationDocumentTypeModel();
    }

    /**
     * GET /api/admin/programme-document-requirements
     * Every configured requirement plus the categories and active document
     * types the editor can pick from.
     */
    public function index(Request $request, Response $response): never
    {
        $this->success($response, [
            'categories'   => array_map(
                fn($key) => ['key' => $key, 'label' => StudentDocumentComplianceService::CATEGORY_LABELS[$key]],
                ProgrammeDocumentRequirementModel::CATEGORIES
            ),
            'requirements'    => $this->model->allWithDetails(),
            'available_types' => $this->docTypeModel->getActive(),
        ], 'Programme document requirements fetched.');
    }

    /**
     * POST /api/admin/programme-document-requirements
     */
    public function create(Request $request, Response $response): never
    {
        $data     = $request->body();
        $authUser = (array) $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'programme_category' => 'required',
            'document_type_id'   => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $category = strtolower(trim((string)$data['programme_category']));
        if (!in_array($category, ProgrammeDocumentRequirementModel::CATEGORIES, true)) {
            $this->error($response, 'Unknown programme category.', 422);
        }

        $typeId  = (int)$data['document_type_id'];
        $docType = $this->docTypeModel->find($typeId);
        if (!$docType || !(int)$docType['is_active']) {
            $this->error($response, 'Document type not found or inactive.', 422);
        }

        if ($this->model->existsForCategoryType($category, $typeId)) {
            $this->error($response, 'This document type is already on the checklist for that category.', 409);
        }

        $id = $this->model->create([
            'programme_category' => $category,
            'document_type_id'   => $typeId,
            'is_required'        => isset($data['is_required']) ? (int)(bool)$data['is_required'] : 1,
            'is_active'          => isset($data['is_active'])   ? (int)(bool)$data['is_active']   : 1,
            'notes'              => $this->cleanNotes($data['notes'] ?? null),
            'sort_order'         => isset($data['sort_order']) ? (int)$data['sort_order'] : $this->nextSortOrder($category),
            'created_by'         => (int)($authUser['id'] ?? 0) ?: null,
        ]);

        SystemLogService::log(
            'CREATE', 'ADMISSIONS',
            "Required document \"{$docType['name']}\" added to the {$category} checklist.",
            (int)$id, 'programme_document_requirement', null, $authUser ?: null
        );

        $this->success($response, ['id' => (int)$id], 'Requirement added.', 201);
    }

    /**
     * POST /api/admin/programme-document-requirements/:id
     * Update is_required / is_active / notes / sort_order. Category and
     * document type are immutable — delete and re-add instead.
     */
    public function update(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->find($id);
        if (!$row) {
            $this->error($response, 'Requirement not found.', 404);
        }

        $data     = $request->body();
        $authUser = (array) $request->param('_auth_user');

        $this->model->update($id, [
            'is_required' => isset($data['is_required']) ? (int)(bool)$data['is_required'] : (int)$row['is_required'],
            'is_active'   => isset($data['is_active'])   ? (int)(bool)$data['is_active']   : (int)$row['is_active'],
            'notes'       => array_key_exists('notes', $data) ? $this->cleanNotes($data['notes']) : $row['notes'],
            'sort_order'  => isset($data['sort_order']) ? (int)$data['sort_order'] : (int)$row['sort_order'],
        ]);

        SystemLogService::log(
            'UPDATE', 'ADMISSIONS',
            "Required document #{$id} ({$row['programme_category']}) updated.",
            $id, 'programme_document_requirement', $data, $authUser ?: null
        );

        $this->success($response, ['id' => $id], 'Requirement updated.');
    }

    /**
     * POST /api/admin/programme-document-requirements/reorder
     * Body: { programme_category, ids: [requirement ids in display order] }
     */
    public function reorder(Request $request, Response $response): never
    {
        $data     = $request->body();
        $category = strtolower(trim((string)($data['programme_category'] ?? '')));
        $ids      = array_values(array_filter(array_map('intval', (array)($data['ids'] ?? []))));

        if (!in_array($category, ProgrammeDocumentRequirementModel::CATEGORIES, true) || $ids === []) {
            $this->error($response, 'programme_category and a non-empty ids list are required.', 422);
        }

        $db = $this->model->db();
        $db->transaction(function () use ($db, $ids, $category) {
            foreach ($ids as $i => $id) {
                $db->execute(
                    "UPDATE `programme_document_requirements` SET sort_order = ? WHERE id = ? AND programme_category = ?",
                    [$i + 1, $id, $category]
                );
            }
        });

        $this->success($response, ['ids' => $ids], 'Order saved.');
    }

    /**
     * DELETE /api/admin/programme-document-requirements/:id
     */
    public function delete(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->model->find($id);
        if (!$row) {
            $this->error($response, 'Requirement not found.', 404);
        }

        $this->model->delete($id);

        SystemLogService::log(
            'DELETE', 'ADMISSIONS',
            "Required document #{$id} removed from the {$row['programme_category']} checklist.",
            $id, 'programme_document_requirement', $row, (array) $request->param('_auth_user') ?: null
        );

        $this->success($response, null, 'Requirement removed.');
    }

    private function cleanNotes(mixed $notes): ?string
    {
        $n = trim((string)($notes ?? ''));
        return $n === '' ? null : mb_substr($n, 0, 255);
    }

    private function nextSortOrder(string $category): int
    {
        $row = $this->model->db()->fetchOne(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM `programme_document_requirements` WHERE programme_category = ?",
            [$category]
        );
        return (int)($row['n'] ?? 1);
    }
}
