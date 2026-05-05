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
            'campus_id'       => $request->query('campus_id')       ?? '',
            'mode_of_study'   => $request->query('mode_of_study')   ?? '',
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

        // Fetch merit criteria for this application's context
        $criteriaModel = new \App\Models\MeritCriteriaModel();
        $meritCriteria = $criteriaModel->findForDeptIntake(
            (int)$application['department_id'],
            (string)$application['intake'],
            (int)$application['academic_year_id']
        );

        // Fetch this applicant's ranking if a list was generated
        $db = \Core\Database::getInstance();
        // `rank` is a reserved keyword in MySQL 8 (window function); must be backticked.
        $meritListing = $db->fetchOne(
            "SELECT `rank`, merit_score, is_qualified, generated_at
             FROM `merit_lists`
             WHERE application_id = ?
             LIMIT 1",
            [$id]
        );

        $this->success($response, [
            'application'    => $application,
            'documents'      => $documents,
            'status_log'     => $statusLog,
            'merit_criteria' => $meritCriteria ?: null,
            'merit_listing'  => $meritListing  ?: null,
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

        $campusCounts = $db->fetchAll(
            "SELECT sa.campus_id AS id, c.name AS label, COUNT(*) AS cnt
             FROM student_applications sa
             LEFT JOIN campuses c ON c.id = sa.campus_id
             WHERE sa.status <> 'draft' AND sa.campus_id IS NOT NULL
             GROUP BY sa.campus_id, c.name
             ORDER BY cnt DESC"
        );

        $modeCounts = $db->fetchAll(
            "SELECT mode_of_study AS label, COUNT(*) AS cnt
             FROM student_applications
             WHERE status <> 'draft' AND mode_of_study IS NOT NULL AND mode_of_study <> ''
             GROUP BY mode_of_study
             ORDER BY cnt DESC"
        );

        // Full catalogue of options the admin can filter by — every active
        // campus, plus the canonical modes of study supported by the apply
        // wizard. These don't depend on whether any application has used them.
        $allCampuses = $db->fetchAll(
            "SELECT id, name AS label
             FROM campuses
             WHERE is_active = 1
             ORDER BY name ASC"
        );
        $allModes = [
            ['label' => 'Day'],
            ['label' => 'Evening'],
            ['label' => 'Weekend'],
            ['label' => 'Distance Learning'],
        ];

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
            'by_campus' => $campusCounts,
            'by_mode'   => $modeCounts,
            'all_campuses' => $allCampuses,
            'all_modes'    => $allModes,
            'trend'     => $trend,
            'recent'    => $recent,
            'total'     => array_sum(array_column($statusCounts, 'cnt'))
        ], 'Stats fetched.');
    }

    /**
     * GET /api/admin/applications/export?format=xlsx|pdf
     *
     * Exports the filtered application list. Honours every filter the
     * frontend list page uses: status, intake, campus_id, mode_of_study,
     * search. `xlsx` is delivered as CSV (which Excel opens natively) so
     * we don't pull in a heavy spreadsheet dependency. `pdf` is delivered
     * as a printable HTML document the browser will print-to-PDF — the
     * server marks the response as text/html so the page renders inline.
     */
    public function export(Request $request, Response $response): never
    {
        $format = strtolower((string)$request->query('format') ?: 'xlsx');
        if (!in_array($format, ['xlsx', 'csv', 'pdf'], true)) {
            $this->error($response, 'Unsupported export format.', 422);
        }

        $filters = [
            'search'        => $request->query('search')        ?? '',
            'status'        => $request->query('status')        ?? '',
            'intake'        => $request->query('intake')        ?? '',
            'campus_id'     => $request->query('campus_id')     ?? '',
            'mode_of_study' => $request->query('mode_of_study') ?? '',
        ];
        $filters = array_filter($filters, fn($v) => $v !== '');

        // Pull every matching row (cap at 5000 to avoid runaway exports).
        $result = $this->appModel->paginateFiltered(1, 5000, $filters);
        $rows   = $result['data'] ?? [];

        $headers = [
            'App #', 'Applicant', 'Email', 'Program', 'Campus',
            'Mode of Study', 'Intake', 'Status', 'Submitted',
        ];
        $records = [];
        foreach ($rows as $r) {
            $statusLabel = $r['status'] === 'submitted' ? 'Pending' : str_replace('_', ' ', (string)$r['status']);
            $submittedAt = $r['submitted_at'] ?? $r['created_at'] ?? '';
            if ($submittedAt) {
                $ts = strtotime((string)$submittedAt);
                $submittedAt = $ts ? date('Y-m-d', $ts) : (string)$submittedAt;
            }
            $records[] = [
                $r['application_number'] ?? '',
                trim(($r['first_name'] ?? '') . ' ' . ($r['last_name'] ?? '')),
                $r['email'] ?? '',
                $r['program_name'] ?? $r['department_name'] ?? '',
                $r['campus_name'] ?? '',
                $r['mode_of_study'] ?? '',
                $r['intake'] ?? '',
                ucfirst($statusLabel),
                (string)$submittedAt,
            ];
        }

        $stamp = date('Ymd_His');

        if ($format === 'xlsx' || $format === 'csv') {
            $filename = "applications_{$stamp}.csv";
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: private, no-store');

            $out = fopen('php://output', 'w');
            // BOM so Excel correctly detects UTF-8.
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $headers);
            foreach ($records as $row) fputcsv($out, $row);
            fclose($out);
            exit;
        }

        // PDF — render a styled HTML document; the user prints to PDF from
        // the browser. Avoids pulling in a binary PDF library.
        $generated = date('Y-m-d H:i');
        $filterSummary = [];
        if (!empty($filters['status']))        $filterSummary[] = 'Status: ' . str_replace('_', ' ', (string)$filters['status']);
        if (!empty($filters['intake']))        $filterSummary[] = 'Intake: ' . $filters['intake'];
        if (!empty($filters['campus_id']))     $filterSummary[] = 'Campus #' . $filters['campus_id'];
        if (!empty($filters['mode_of_study'])) $filterSummary[] = 'Mode: ' . $filters['mode_of_study'];
        if (!empty($filters['search']))        $filterSummary[] = 'Search: "' . $filters['search'] . '"';
        $filterLine = $filterSummary ? implode(' · ', $filterSummary) : 'No filters applied';

        $rowsHtml = '';
        foreach ($records as $rec) {
            $rowsHtml .= '<tr>';
            foreach ($rec as $cell) {
                $rowsHtml .= '<td>' . htmlspecialchars((string)$cell, ENT_QUOTES, 'UTF-8') . '</td>';
            }
            $rowsHtml .= '</tr>';
        }
        if (!$rowsHtml) {
            $rowsHtml = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#888">No applications match the current filters.</td></tr>';
        }
        $headerHtml = '';
        foreach ($headers as $h) {
            $headerHtml .= '<th>' . htmlspecialchars($h, ENT_QUOTES, 'UTF-8') . '</th>';
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="applications_' . $stamp . '.html"');
        header('Cache-Control: private, no-store');

        echo <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Applications — Export</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color:#0f172a; margin:32px; font-size:12px; }
  header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom:12px; border-bottom:2px solid #0f172a; margin-bottom:16px; }
  h1 { margin:0; font-size:20px; letter-spacing:-0.01em; }
  .meta { color:#64748b; font-size:11px; margin-top:4px; }
  .filters { background:#f1f5f9; padding:8px 12px; border-radius:6px; font-size:11px; color:#334155; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { background:#0f172a; color:#fff; text-align:left; padding:8px 10px; font-weight:600; text-transform:uppercase; font-size:10px; letter-spacing:0.04em; }
  td { padding:8px 10px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  tr:nth-child(even) td { background:#f8fafc; }
  .toolbar { margin-bottom:16px; text-align:right; }
  .toolbar button { background:#0f172a; color:#fff; border:0; padding:8px 16px; font-size:12px; border-radius:6px; cursor:pointer; }
  @media print { .toolbar { display:none; } body { margin:12mm; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<header>
  <div>
    <h1>Applications Export</h1>
    <div class="meta">Catholic University of Rwanda · {$generated}</div>
  </div>
  <div class="meta"><strong>{$result['total']}</strong> record(s)</div>
</header>
<div class="filters"><strong>Filters:</strong> {$filterLine}</div>
<table>
  <thead><tr>{$headerHtml}</tr></thead>
  <tbody>{$rowsHtml}</tbody>
</table>
</body>
</html>
HTML;
        exit;
    }

    /**
     * GET /api/admin/applications/:id/payment-slip
     *
     * Streams the payment slip uploaded against the given application
     * (PDF/JPG/PNG) inline so admin users can preview it.
     */
    public function downloadPaymentSlip(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $app = $this->appModel->find($id);

        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }
        if (empty($app['payment_slip_file_id'])) {
            $this->error($response, 'No payment slip uploaded for this application.', 404);
        }

        try {
            $client   = new \App\Helpers\FileServerClient();
            $fileData = $client->download($app['payment_slip_file_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $app['payment_slip_mime']
            ?? $fileData['mime']
            ?? 'application/octet-stream';
        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $disposition  = $isInlineable ? 'inline' : 'attachment';
        $filename     = $fileData['original_name'] ?? 'payment-slip';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($filename) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }
}
