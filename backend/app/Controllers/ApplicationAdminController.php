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
            'status' => 'required|in:submitted,documents_under_review,documents_verified,documents_rejected,requested_changes,withdrawn',
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
    /**
     * GET /api/admin/applications/stats
     * Dashboard statistics.
     */
    public function getDashboardStats(Request $request, Response $response): never
    {
        $db = \Core\Database::getInstance();
        
        // All admin-facing aggregates exclude `draft` applications since those
        // are applicant-side work-in-progress and have not been submitted.
        $statusCounts = $db->fetchAll(
            "SELECT status, COUNT(*) as cnt
             FROM student_applications
             WHERE status <> 'draft'
             GROUP BY status"
        );

        $intakeCounts = $db->fetchAll(
            "SELECT intake, COUNT(*) as cnt
             FROM student_applications
             WHERE status <> 'draft'
             GROUP BY intake"
        );

        $deptCounts = $db->fetchAll(
            "SELECT d.dep_name as label, COUNT(*) as cnt
             FROM student_applications sa
             JOIN departements d ON d.dep_id = sa.department_id
             WHERE sa.status <> 'draft'
             GROUP BY sa.department_id
             ORDER BY cnt DESC"
        );

        $genderCounts = $db->fetchAll(
            "SELECT gender as label, COUNT(*) as cnt
             FROM student_applications
             WHERE status <> 'draft'
             GROUP BY gender"
        );

        $trend = $db->fetchAll(
            "SELECT DATE(created_at) as date, COUNT(*) as cnt
             FROM student_applications
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
               AND status <> 'draft'
             GROUP BY DATE(created_at)
             ORDER BY date ASC"
        );

        $recent = $db->fetchAll(
            "SELECT sa.application_number, sa.first_name, sa.last_name, sa.status, sa.created_at, d.dep_name as department_name
             FROM student_applications sa
             JOIN departements d ON d.dep_id = sa.department_id
             WHERE sa.status <> 'draft'
             ORDER BY sa.id DESC
             LIMIT 8"
        );

        $this->success($response, [
            'by_status' => $statusCounts,
            'by_intake' => $intakeCounts,
            'by_dept'   => $deptCounts,
            'by_gender' => $genderCounts,
            'trend'     => $trend,
            'recent'    => $recent,
            'total'     => array_sum(array_column($statusCounts, 'cnt'))
        ], 'Stats fetched.');
    }
}
