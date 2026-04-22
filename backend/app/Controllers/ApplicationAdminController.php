<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Models\ApplicationStatusLogModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;

class ApplicationAdminController extends BaseController
{
    private StudentApplicationModel   $appModel;
    private ApplicationDocumentModel  $docModel;
    private ApplicationStatusLogModel $logModel;
    private ApplicationService        $service;

    /** Application statuses that are considered final (cannot transition from). */
    private const FINAL_STATUSES = ['enrolled', 'offer_declined'];

    public function __construct()
    {
        $this->appModel = new StudentApplicationModel();
        $this->docModel = new ApplicationDocumentModel();
        $this->logModel = new ApplicationStatusLogModel();
        $this->service  = new ApplicationService();
    }

    /**
     * GET /api/admin/applications
     * Paginated, filterable list of all applications.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page')             ?? 1);
        $perPage = (int)($request->query('per_page')         ?? 15);
        $filters = [
            'search'          => $request->query('search')          ?? '',
            'status'          => $request->query('status')          ?? '',
            'department_id'   => $request->query('department_id')   ?? '',
            'intake'          => $request->query('intake')          ?? '',
            'academic_year_id'=> $request->query('academic_year_id') ?? '',
        ];

        // Remove empty filter keys so they are not used as conditions
        $filters = array_filter($filters, fn($v) => $v !== '');

        $result = $this->appModel->paginateFiltered($page, $perPage, $filters);
        $this->success($response, $result, 'Applications fetched successfully.');
    }

    /**
     * GET /api/admin/applications/:id
     * Full details: application + documents + status log.
     */
    public function show(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->getWithDetails($id);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $documents = $this->docModel->getForApplication($id);
        $statusLog = $this->logModel->getForApplication($id);

        $this->success($response, [
            'application' => $application,
            'documents'   => $documents,
            'status_log'  => $statusLog,
        ], 'Application details fetched.');
    }

    /**
     * PATCH /api/admin/applications/:id/status
     * Manually transition application status.
     */
    public function updateStatus(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);
        $authUser    = $request->param('_auth_user');
        $actorId     = (int)($authUser['id'] ?? 0);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'status' => 'required|in:documents_under_review,withdrawn',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $from = $application['status'];
        $to   = $data['status'];

        if (in_array($from, self::FINAL_STATUSES, true)) {
            $this->error($response, "Cannot change status from '{$from}' — it is a final state.", 422);
        }

        $this->appModel->update($id, [
            'status'      => $to,
            'reviewed_by' => $actorId,
            'reviewed_at' => date('Y-m-d H:i:s'),
        ]);

        $this->service->logStatusChange($id, $from, $to, $actorId, 'admin', $data['notes'] ?? null);

        $this->success($response, ['status' => $to], 'Application status updated.');
    }

    /**
     * POST /api/admin/applications/:id/notes
     * Append an internal admin note to an application.
     */
    public function addNote(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);
        $authUser    = $request->param('_auth_user');
        $actorName   = $authUser['full_name'] ?? $authUser['email'] ?? 'Admin';

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'notes' => 'required|string|min:5|max:1000',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $timestamp   = date('Y-m-d H:i:s');
        $newEntry    = "[{$timestamp} — {$actorName}]: " . $data['notes'];
        $existing    = $application['notes'] ?? '';
        $combined    = $existing ? $existing . "\n" . $newEntry : $newEntry;

        $this->appModel->update($id, ['notes' => $combined]);

        $this->success($response, ['notes' => $combined], 'Note added successfully.');
    }
}
