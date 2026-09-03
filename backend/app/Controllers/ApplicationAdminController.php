<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Models\ApplicationStatusLogModel;
use App\Models\ApplicationPendingNoteModel;
use App\Models\UserCampusAssignmentModel;
use App\Services\ApplicationService;
use App\Services\SystemLogService;
use App\Services\AuthService;
use App\Helpers\ValidationHelper;

class ApplicationAdminController extends BaseController
{
    private StudentApplicationModel    $appModel;
    private ApplicationDocumentModel   $docModel;
    private ApplicationStatusLogModel  $logModel;
    private ApplicationPendingNoteModel $pendingNoteModel;
    private UserCampusAssignmentModel  $campusAssignmentModel;
    private ApplicationService         $service;

    /** Application statuses that are considered final (cannot transition from). */
    private const FINAL_STATUSES = ['enrolled', 'offer_declined'];

    public function __construct()
    {
        $this->appModel              = new StudentApplicationModel();
        $this->docModel              = new ApplicationDocumentModel();
        $this->logModel              = new ApplicationStatusLogModel();
        $this->pendingNoteModel      = new ApplicationPendingNoteModel();
        $this->campusAssignmentModel = new UserCampusAssignmentModel();
        $this->service               = new ApplicationService();
    }

    /**
     * Resolve the campus scope to apply for the current user.
     * Returns:
     *   - null  → no scoping (admins / superadmins see everything)
     *   - []    → user is a scoped registry assistant with zero campuses → empty list
     *   - [...] → restrict to these campus IDs
     */
    private function resolveCampusScope(?array $authUser): ?array
    {
        if (!$authUser) {
            return null;
        }
        $userId = (int)($authUser['id'] ?? 0);
        $role   = strtolower((string)($authUser['role'] ?? $authUser['role_name'] ?? ''));

        // Per-role "enforce campus scope" flag (set from the Permissions
        // modal) is the explicit source of truth. Falls back to the legacy
        // hardcoded admin/superadmin bypass when the column hasn't been
        // set (existing roles default to 0 = no scoping).
        $enforce = false;
        if (!empty($authUser['role_id'])) {
            try {
                $row = $this->appModel->db()->fetchOne(
                    "SELECT enforce_campus_scope FROM `roles` WHERE id = ? LIMIT 1",
                    [(int)$authUser['role_id']]
                );
                $enforce = !empty($row) && (int)($row['enforce_campus_scope'] ?? 0) === 1;
            } catch (\Throwable $e) {
                // Column missing on a legacy schema — defer to the role-name fallback.
                $enforce = false;
            }
        }
        if (!$enforce) {
            // Legacy behaviour: superadmin bypass; anyone else with
            // assignments gets scoped automatically.
            if (AuthService::isSuperadmin($authUser)) {
                return null;
            }
            if ($userId === 0) {
                return null;
            }
            $assigned = $this->campusAssignmentModel->campusIdsForUser($userId);
            // No assignments at all means the user hasn't been scoped — fall back
            // to showing all (matches Task 1.1 spec). This keeps existing registry
            // users working until an admin explicitly assigns campuses.
            return empty($assigned) ? null : $assigned;
        }

        // Role explicitly marks "enforce campus scope": always restrict, even
        // for admin role names. Zero assignments → empty result set (the
        // strictest possible interpretation, which is what registrars asked
        // for so role-mistagged accounts don't accidentally leak data).
        if ($userId === 0) {
            return [];
        }
        return $this->campusAssignmentModel->campusIdsForUser($userId);
    }

    /**
     * GET /api/admin/applications
     * Paginated, filterable list of all applications.
     */
    public function index(Request $request, Response $response): never
    {
        // Cheap pre-pass: auto-hide pending applications older than the
        // configured timeout. The query is indexed (is_hidden + submitted_at)
        // and is a no-op on subsequent calls until new rows go stale.
        $this->autoHideExpiredPending();

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
            'level_id'        => $request->query('level_id')        ?? '',
            'gender'          => $request->query('gender')          ?? '',
            'payment_status'  => $request->query('payment_status')  ?? '',
            'sort_paid_first' => $request->query('sort_paid_first') ?? '',
            // Submission date range (YYYY-MM-DD). Either bound may stand alone.
            'submitted_from'  => $request->query('submitted_from')  ?? '',
            'submitted_to'    => $request->query('submitted_to')    ?? '',
        ];

        // Remove empty filter keys so they are not used as conditions
        $filters = array_filter($filters, fn($v) => $v !== '');

        // Hidden-row scoping (Task 1.9). Default = exclude hidden.
        $includeHidden = $request->query('include_hidden') === '1' || $request->query('include_hidden') === 'true';
        $onlyHidden    = $request->query('only_hidden')    === '1' || $request->query('only_hidden')    === 'true';
        if ($onlyHidden) {
            $filters['hidden_filter'] = 'only';
        } elseif (!$includeHidden) {
            $filters['hidden_filter'] = 'exclude';
        }

        // Apply registry campus scoping. If the user has explicit campus
        // assignments (and is not a top-level admin), restrict the query to
        // those campus IDs — and intersect with any campus_id filter the
        // request also passed in so admins can still drill down.
        $scope = $this->resolveCampusScope((array) $request->param('_auth_user'));
        if ($scope !== null) {
            if (!empty($filters['campus_id'])) {
                $requested = (int)$filters['campus_id'];
                $filters['campus_scope_ids'] = in_array($requested, $scope, true) ? [$requested] : [];
                unset($filters['campus_id']);
            } else {
                $filters['campus_scope_ids'] = $scope;
            }
        }

        $result = $this->appModel->paginateFiltered($page, $perPage, $filters);

        // Decorate each row with pending-note count and the most recent note
        // so the list view can render the shared "why is this pending" panel
        // without an extra round-trip per row.
        $rows = $result['data'] ?? [];
        if (!empty($rows)) {
            $ids = array_map(fn($r) => (int)$r['id'], $rows);
            $counts = $this->pendingNoteModel->countsForApplications($ids);
            $latest = $this->pendingNoteModel->latestForApplications($ids);
            foreach ($rows as &$row) {
                $aid = (int)$row['id'];
                $row['pending_notes_count'] = $counts[$aid] ?? 0;
                $row['latest_pending_note'] = $latest[$aid] ?? null;
            }
            unset($row);
            $result['data'] = $rows;
        }

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

        $documents = $this->docModel->getChecklistForApplication(
            $id,
            isset($application['faculty_id']) ? (int)$application['faculty_id'] : null
        );
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
    /**
     * POST /api/admin/applications/:id
     *
     * Update application data (personal info, campus, mode of study, level, intake).
     * Called by admin when editing applicant information via the edit modal.
     * Returns full application data with joined information.
     */
    public function updateApplication(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);
        $authUser    = $request->param('_auth_user');
        $actorId     = (int)($authUser['id'] ?? 0);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $data = $request->body();

        // Whitelist editable fields (prevent updating status, sensitive fields)
        $allowedFields = [
            'first_name',
            'last_name',
            'email',
            'phone',
            'gender',
            'birthdate',
            'address',
            'nationality',
            'country_of_residence',
            'prev_school',
            'prev_qualification',
            'prev_grade',
            'campus_id',
            'mode_of_study',
            'level_id',
            'faculty_id',
            'department_id',
            'program_id',
            'intake',
        ];

        $updateData = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $value = $data[$field];
                // Skip empty strings for optional fields, but allow 0 and false
                if ($value !== '' || in_array($field, ['campus_id', 'level_id', 'faculty_id', 'department_id', 'program_id', 'mode_of_study'])) {
                    $updateData[$field] = $value;
                }
            }
        }

        if (empty($updateData)) {
            $this->error($response, 'No valid fields to update.', 422);
        }

        // Update the application
        try {
            $this->appModel->update($id, $updateData);
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to update application: ' . $e->getMessage(), 500);
        }

        // Fetch updated application with all details and joined names
        $db = \Core\Database::getInstance();
        try {
            $updatedApp = $db->fetchOne("
                SELECT
                    sa.id,
                    sa.application_number,
                    sa.first_name,
                    sa.last_name,
                    sa.email,
                    sa.phone,
                    sa.gender,
                    sa.birthdate,
                    sa.address,
                    sa.nationality,
                    sa.country_of_residence,
                    sa.prev_school,
                    sa.prev_qualification,
                    sa.prev_grade,
                    sa.combination,
                    sa.graduation_year,
                    sa.sponsorship,
                    sa.status,
                    sa.document_status,
                    sa.intake,
                    sa.campus_id,
                    c.name AS campus_name,
                    sa.mode_of_study,
                    pt.display_name AS mode_of_study_name,
                    sa.level_id,
                    lvl.name AS level_name,
                    sa.faculty_id,
                    f.fac_name AS faculty_name,
                    sa.department_id,
                    d.dep_name AS department_name,
                    sa.program_id,
                    p.name AS program_name,
                    sa.academic_year_id,
                    ay.year AS academic_year,
                    sa.created_at,
                    sa.updated_at
                FROM student_applications sa
                LEFT JOIN campus c ON sa.campus_id = c.id
                LEFT JOIN programme_types pt ON sa.mode_of_study = pt.id
                LEFT JOIN levels lvl ON sa.level_id = lvl.id
                LEFT JOIN faculty f ON sa.faculty_id = f.fac_id
                LEFT JOIN departements d ON sa.department_id = d.dep_id
                LEFT JOIN programs p ON sa.program_id = p.id
                LEFT JOIN academic_years ay ON sa.academic_year_id = ay.id
                WHERE sa.id = ?
            ", [$id]);
        } catch (\Throwable $e) {
            $this->error($response, 'Failed to fetch updated application: ' . $e->getMessage(), 500);
        }

        if (!$updatedApp) {
            $this->error($response, 'Application not found after update.', 404);
        }

        // Log the update
        SystemLogService::log(
            'UPDATE',
            'ADMISSIONS',
            "Application ID {$id} edited by admin.",
            $id,
            'student_application',
            $updateData,
            (array) $authUser ?: null
        );

        $this->success($response, $updatedApp, 'Application updated successfully.');
    }

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

        SystemLogService::log('UPDATE', 'ADMISSIONS', "Application ID {$id} status changed from '{$from}' to '{$to}'.", $id, 'student_application', ['from' => $from, 'to' => $to, 'notes' => $data['notes'] ?? null], (array) $authUser ?: null);
        $this->success($response, ['status' => $to], 'Application status updated.');
    }

    /**
     * DELETE /api/admin/applications/:id
     * Delete an application and all its associated documents/logs.
     * Allows applicant to resubmit. Cannot delete enrolled applications.
     */
    public function deleteApplication(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);
        $authUser    = $request->param('_auth_user');

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        // Prevent deletion of final-status applications
        if (in_array($application['status'], self::FINAL_STATUSES, true)) {
            $this->error($response, "Cannot delete application in status '{$application['status']}' — it is a final state.", 422);
        }

        $db = \Core\Database::getInstance();

        try {
            $db->beginTransaction();

            // Delete documents
            $this->docModel->db()->delete('application_documents', ['application_id' => $id]);

            // Delete status logs
            $this->logModel->db()->delete('application_status_logs', ['application_id' => $id]);

            // Delete pending notes
            $this->pendingNoteModel->db()->delete('application_pending_notes', ['application_id' => $id]);

            // Delete the application itself
            $this->appModel->delete($id);

            $db->commit();

            SystemLogService::log('DELETE', 'ADMISSIONS', "Application ID {$id} ({$application['application_number']}) deleted by admin. Applicant can resubmit.", $id, 'student_application', ['applicant_name' => "{$application['first_name']} {$application['last_name']}", 'applicant_email' => $application['email']], (array) $authUser ?: null);

            $this->success($response, null, 'Application deleted successfully. Applicant can resubmit.');

        } catch (\Throwable $e) {
            $db->rollBack();
            $this->error($response, 'Failed to delete application: ' . $e->getMessage(), 500);
        }
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
        // The DB column is `internal_notes` (not `notes`). The old code wrote
        // to a non-existent `notes` field which BaseModel.filterFillable
        // silently dropped, so admin notes never persisted. Append to the
        // real column instead.
        $existing    = $application['internal_notes'] ?? '';
        $combined    = $existing ? $existing . "\n" . $newEntry : $newEntry;

        $this->appModel->update($id, ['internal_notes' => $combined]);

        SystemLogService::log('UPDATE', 'ADMISSIONS', "Added internal note to application ID {$id}.", $id, 'student_application', null, (array) $authUser ?: null);
        $this->success($response, ['internal_notes' => $combined], 'Note added successfully.');
    }

    /**
     * GET /api/admin/applications/statistics
     * Task 1.14 — flexible counts table for the registry statistics page.
     * Accepts faculty_id, department_id, option_id (program), campus_id,
     * mode, level_id, date_from, date_to. Returns row-wise counts per
     * department + program with totals broken down by lifecycle status.
     */
    public function statistics(Request $request, Response $response): never
    {
        $facultyId  = (int)($request->query('faculty_id')    ?? 0);
        $deptId     = (int)($request->query('department_id') ?? 0);
        $optionId   = (int)($request->query('option_id')     ?? 0);
        $campusId   = (int)($request->query('campus_id')     ?? 0);
        $levelId    = (int)($request->query('level_id')      ?? 0);
        $mode       = (string)($request->query('mode')       ?? '');
        $dateFrom   = (string)($request->query('date_from')  ?? '');
        $dateTo     = (string)($request->query('date_to')    ?? '');

        $conds = ["sa.status <> 'draft'"];
        $bind  = [];
        if ($facultyId > 0) { $conds[] = 'sa.faculty_id = ?';    $bind[] = $facultyId; }
        if ($deptId    > 0) { $conds[] = 'sa.department_id = ?'; $bind[] = $deptId; }
        if ($optionId  > 0) { $conds[] = 'sa.program_id = ?';    $bind[] = $optionId; }
        if ($campusId  > 0) { $conds[] = 'sa.campus_id = ?';     $bind[] = $campusId; }
        if ($levelId   > 0) { $conds[] = 'sa.level_id = ?';      $bind[] = $levelId; }
        if ($mode !== '')   { $conds[] = 'sa.mode_of_study = ?'; $bind[] = $mode; }

        // Date window. Two corrections over the previous inline version:
        //
        //  - filters `submitted_at`, not `created_at`. The applications list
        //    ranges on submitted_at, and a report that answered the same
        //    question off a different column would disagree with the list it
        //    is meant to summarise. `created_at` is when the draft row was
        //    first written, which for a portal applicant can be days before
        //    they actually submit.
        //  - half-open upper bound via the shared helper, instead of
        //    '23:59:59' — which drops anything stamped in the last second of
        //    the day on a fractional-second column.
        [$rangeFrom, $rangeTo] = StudentApplicationModel::dateRangeBounds(
            $dateFrom !== '' ? $dateFrom : null,
            $dateTo   !== '' ? $dateTo   : null
        );
        if ($rangeFrom !== null) { $conds[] = 'sa.submitted_at >= ?'; $bind[] = $rangeFrom; }
        if ($rangeTo   !== null) { $conds[] = 'sa.submitted_at <  ?'; $bind[] = $rangeTo; }
        $where = 'WHERE ' . implode(' AND ', $conds);

        $db = $this->appModel->db();

        $rows = $db->fetchAll(
            "SELECT
                f.fac_name      AS faculty,
                d.dep_name      AS department,
                o.name          AS program,
                COUNT(*)                                                                     AS total,
                SUM(sa.status IN ('submitted','documents_under_review'))                      AS new_count,
                SUM(sa.status IN ('documents_verified','offered','offer_accepted'))           AS accepted_count,
                SUM(sa.status = 'enrolled')                                                   AS enrolled_count,
                SUM(sa.status IN ('withdrawn','offer_declined'))                              AS withdrawn_count
             FROM `student_applications` sa
             LEFT JOIN `departements` d ON d.dep_id = sa.department_id
             LEFT JOIN `faculty`      f ON f.fac_id = sa.faculty_id
             LEFT JOIN `options`      o ON o.id     = sa.program_id
             {$where}
             GROUP BY sa.faculty_id, sa.department_id, sa.program_id
             ORDER BY f.fac_name ASC, d.dep_name ASC, o.name ASC",
            $bind
        );

        // Totals row.
        $totals = [
            'total' => 0, 'new_count' => 0, 'accepted_count' => 0,
            'enrolled_count' => 0, 'withdrawn_count' => 0,
        ];
        foreach ($rows as &$r) {
            foreach (['total','new_count','accepted_count','enrolled_count','withdrawn_count'] as $k) {
                $r[$k] = (int)($r[$k] ?? 0);
                $totals[$k] += $r[$k];
            }
        }
        unset($r);

        $this->success($response, [
            'rows'    => $rows,
            'totals'  => $totals,
            'filters' => compact('facultyId','deptId','optionId','campusId','levelId','mode','dateFrom','dateTo'),
        ], 'Statistics fetched.');
    }

    /**
     * GET /api/admin/applications/bulk-upload-template
     * Streams a CSV the registry team fills in then re-uploads via
     * /bulk-upload. Excel opens CSV natively so no XLSX dependency.
     */
    public function bulkUploadTemplate(Request $request, Response $response): never
    {
        $db = $this->appModel->db();

        // Fetch real example values so the user sees a complete row
        // with real names rather than opaque ids. The import side
        // accepts either the name or the numeric id for these columns.
        $deptRow    = $db->fetchOne("SELECT dep_id, dep_name FROM `departements` ORDER BY dep_id ASC LIMIT 1");
        $progRow    = $db->fetchOne("SELECT id, name FROM `options` ORDER BY id ASC LIMIT 1");
        $campusRow  = $db->fetchOne("SELECT id, name FROM `campuses` ORDER BY id ASC LIMIT 1");
        $levelRow   = null;
        try {
            $levelRow = $db->fetchOne("SELECT id, name FROM `levels` ORDER BY id ASC LIMIT 1");
        } catch (\Throwable $e) { /* table may not exist on some snapshots */ }

        $headers = [
            'first_name','last_name','email','phone','gender','birthdate',
            'nationality','national_id','intake','department','program',
            'campus','mode_of_study','level','prev_school','prev_qualification',
            'prev_grade','combination','graduation_year','sponsorship','sponsor_name',
            'is_credit_transfer','credit_transfer_from',
        ];
        $exampleMap = [
            'first_name'           => 'John',
            'last_name'            => 'Doe',
            'email'                => 'john.doe@example.com',
            'phone'                => $this->excelText('+250788000000'),
            'gender'               => 'M',
            'birthdate'            => '2000-01-15',
            'nationality'          => 'Rwandan',
            'national_id'          => $this->excelText('1199000000000000'),
            'intake'               => 'Jan 2026',
            'department'           => $deptRow['dep_name'] ?? 'Computer Science',
            'program'              => $progRow['name']     ?? 'BSc Computer Science',
            'campus'               => $campusRow['name']   ?? 'Main Campus',
            'mode_of_study'        => 'Day',
            'level'                => $levelRow['name']    ?? 'Year 1',
            'prev_school'          => 'Nyamata TSS',
            'prev_qualification'   => 'A-Level',
            'prev_grade'           => 'A,B,B,C',
            'combination'          => 'PCM',
            'graduation_year'      => '2024',
            'sponsorship'          => 'self',
            'sponsor_name'         => '',
            'is_credit_transfer'   => '0',
            'credit_transfer_from' => '',
        ];
        $example = array_map(fn($h) => $exampleMap[$h] ?? '', $headers);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="bulk-applicant-template.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // BOM for Excel UTF-8
        fputcsv($out, $headers);
        fputcsv($out, $example);
        fputcsv($out, array_fill(0, count($headers), ''));
        fclose($out);
        exit;
    }

    /** Wrap a value as `="…"` so Excel keeps long all-digit strings (national
     *  IDs, phone numbers) from being coerced to scientific notation. */
    private function excelText(string $value): string
    {
        if ($value === '') return '';
        return '="' . str_replace('"', '""', $value) . '"';
    }

    /** Strip the `="…"` wrapper Excel keeps on save so the importer sees
     *  the plain string the user actually typed. */
    private function unwrapExcelText(string $value): string
    {
        $v = trim($value);
        if (strlen($v) >= 4 && str_starts_with($v, '="') && str_ends_with($v, '"')) {
            return str_replace('""', '"', substr($v, 2, -1));
        }
        return $v;
    }

    /** Resolve a department by case-insensitive name or numeric id. */
    private function resolveDepartmentByIdOrName(string $value): ?int
    {
        $v = trim($value);
        if ($v === '') return null;
        $db = $this->appModel->db();
        if (ctype_digit($v)) {
            $row = $db->fetchOne("SELECT dep_id FROM `departements` WHERE dep_id = ? LIMIT 1", [(int)$v]);
            return $row ? (int)$row['dep_id'] : null;
        }
        $row = $db->fetchOne("SELECT dep_id FROM `departements` WHERE LOWER(dep_name) = LOWER(?) LIMIT 1", [$v]);
        return $row ? (int)$row['dep_id'] : null;
    }

    /** Resolve a program / option by case-insensitive name or numeric id. */
    private function resolveProgramByIdOrName(string $value): ?int
    {
        $v = trim($value);
        if ($v === '') return null;
        $db = $this->appModel->db();
        if (ctype_digit($v)) {
            $row = $db->fetchOne("SELECT id FROM `options` WHERE id = ? LIMIT 1", [(int)$v]);
            return $row ? (int)$row['id'] : null;
        }
        $row = $db->fetchOne("SELECT id FROM `options` WHERE LOWER(name) = LOWER(?) LIMIT 1", [$v]);
        return $row ? (int)$row['id'] : null;
    }

    /** Resolve a campus by case-insensitive name or numeric id. */
    private function resolveCampusByIdOrName(string $value): ?int
    {
        $v = trim($value);
        if ($v === '') return null;
        $db = $this->appModel->db();
        if (ctype_digit($v)) {
            $row = $db->fetchOne("SELECT id FROM `campuses` WHERE id = ? LIMIT 1", [(int)$v]);
            return $row ? (int)$row['id'] : null;
        }
        $row = $db->fetchOne("SELECT id FROM `campuses` WHERE LOWER(name) = LOWER(?) LIMIT 1", [$v]);
        return $row ? (int)$row['id'] : null;
    }

    /** Resolve a level by case-insensitive name or numeric id. Returns
     *  null when the catalog row can't be found (or the table is absent
     *  on a legacy snapshot — caller falls back to NULL). */
    private function resolveLevelByIdOrName(string $value): ?int
    {
        $v = trim($value);
        if ($v === '') return null;
        $db = $this->appModel->db();
        try {
            if (ctype_digit($v)) {
                $row = $db->fetchOne("SELECT id FROM `levels` WHERE id = ? LIMIT 1", [(int)$v]);
                return $row ? (int)$row['id'] : null;
            }
            $row = $db->fetchOne("SELECT id FROM `levels` WHERE LOWER(name) = LOWER(?) LIMIT 1", [$v]);
            return $row ? (int)$row['id'] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * POST /api/admin/applications/bulk-validate
     * Dry-run preview of a bulk applicant CSV. Same parsing rules as
     * bulkUpload, but commits nothing — used by the import modal to
     * surface required-field gaps, duplicate-email collisions and the
     * intended action per row so the user can fix mismatches before
     * the real upload.
     */
    public function bulkValidate(Request $request, Response $response): never
    {
        if (empty($_FILES['file']['tmp_name'])) {
            $this->error($response, 'No file uploaded (expected multipart field "file").', 422);
        }
        $handle = fopen($_FILES['file']['tmp_name'], 'r');
        if (!$handle) {
            $this->error($response, 'Could not open uploaded file.', 500);
        }
        $first = fgets($handle);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first ?: '') ?? '';
        $headers = array_map(fn($h) => trim((string)$h), str_getcsv($first));

        // The template still accepts the legacy `*_id` column names so
        // sheets filled from an older download keep working.
        $required = ['first_name','last_name','email','intake','department'];
        $year     = $this->service->getActiveAcademicYear();
        $yearId   = (int)($year['id'] ?? 0);
        $result   = [];
        $tally    = ['total' => 0, 'valid' => 0, 'with_errors' => 0, 'to_create' => 0, 'duplicates' => 0];
        $rowNo    = 1;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNo++;
            if (empty(array_filter($row, fn($v) => trim((string)$v) !== ''))) continue;

            $assoc = [];
            foreach ($headers as $i => $h) {
                $assoc[$h] = isset($row[$i]) ? $this->unwrapExcelText((string)($row[$i] ?? '')) : '';
            }
            // Normalise legacy column aliases.
            if (!isset($assoc['department']) && isset($assoc['department_id'])) $assoc['department'] = $assoc['department_id'];
            if (!isset($assoc['program'])    && isset($assoc['program_id']))    $assoc['program']    = $assoc['program_id'];
            if (!isset($assoc['campus'])     && isset($assoc['campus_id']))     $assoc['campus']     = $assoc['campus_id'];
            if (!isset($assoc['level'])      && isset($assoc['level_id']))      $assoc['level']      = $assoc['level_id'];
            $tally['total']++;

            $errors = [];
            foreach ($required as $r) {
                if (($assoc[$r] ?? '') === '') {
                    $errors[] = ['field' => $r, 'message' => "Missing required field '$r'."];
                }
            }
            if (($assoc['email'] ?? '') !== '' && !filter_var($assoc['email'], FILTER_VALIDATE_EMAIL)) {
                $errors[] = ['field' => 'email', 'message' => "Invalid email '{$assoc['email']}'."];
            }
            if (($assoc['gender'] ?? '') !== '' && !in_array(strtoupper((string)$assoc['gender']), ['M','F','O','MALE','FEMALE'], true)) {
                $errors[] = ['field' => 'gender', 'message' => "Gender must be M, F or O."];
            }
            if (($assoc['birthdate'] ?? '') !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$assoc['birthdate'])) {
                $errors[] = ['field' => 'birthdate', 'message' => "Birthdate must be YYYY-MM-DD."];
            }
            $deptId = null;
            if (($assoc['department'] ?? '') !== '') {
                $deptId = $this->resolveDepartmentByIdOrName((string)$assoc['department']);
                if (!$deptId) $errors[] = ['field' => 'department', 'message' => "Unknown department '{$assoc['department']}'. Use the department name or its id."];
            }
            if (($assoc['program'] ?? '') !== '') {
                if (!$this->resolveProgramByIdOrName((string)$assoc['program'])) {
                    $errors[] = ['field' => 'program', 'message' => "Unknown program '{$assoc['program']}'. Use the program name or its id."];
                }
            }
            if (($assoc['campus'] ?? '') !== '') {
                if (!$this->resolveCampusByIdOrName((string)$assoc['campus'])) {
                    $errors[] = ['field' => 'campus', 'message' => "Unknown campus '{$assoc['campus']}'. Use the campus name or its id."];
                }
            }

            $action = 'create';
            if (empty($errors) && $yearId > 0 && $deptId
                && ($assoc['email'] ?? '') !== ''
                && ($assoc['intake'] ?? '') !== ''
            ) {
                $dup = $this->appModel->existsActiveForDeptIntake(
                    (string)$assoc['email'],
                    $deptId,
                    (string)$assoc['intake'],
                    $yearId
                );
                if ($dup) {
                    $action = 'duplicate';
                    $errors[] = ['field' => 'email', 'message' => 'An active application already exists for this email + dept + intake.'];
                }
            }

            if (empty($errors)) {
                $tally['valid']++;
                $tally['to_create']++;
            } else {
                $tally['with_errors']++;
                if ($action === 'duplicate') $tally['duplicates']++;
            }

            $result[] = [
                'row_no' => $rowNo,
                'action' => $action,
                'data'   => $assoc,
                'errors' => $errors,
            ];
        }
        fclose($handle);

        $this->success($response, [
            'headers' => $headers,
            'rows'    => $result,
            'summary' => $tally,
        ], 'Preview ready.');
    }

    /**
     * POST /api/admin/applications/bulk-upload
     * Accepts a CSV/XLSX (XLSX support requires PhpSpreadsheet; for now we
     * parse CSV — the most common interchange format for registry sheets).
     * Each row becomes a `student_application` row at status `enrolled`,
     * bypassing the public portal. Returns a per-row success/error summary.
     */
    public function bulkUpload(Request $request, Response $response): never
    {
        if (empty($_FILES['file']['tmp_name'])) {
            $this->error($response, 'No file uploaded (expected multipart field "file").', 422);
        }
        $authUser = (array) $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        // Merge user-supplied patches from the preview UI (per-row fixes).
        $patches = [];
        $patchRaw = $request->body()['patched_rows'] ?? null;
        if (is_string($patchRaw)) {
            $decoded = json_decode($patchRaw, true);
            if (is_array($decoded)) {
                foreach ($decoded as $p) {
                    if (isset($p['row_no']) && isset($p['data']) && is_array($p['data'])) {
                        $patches[(int)$p['row_no']] = $p['data'];
                    }
                }
            }
        }

        $handle = fopen($_FILES['file']['tmp_name'], 'r');
        if (!$handle) {
            $this->error($response, 'Could not open uploaded file.', 500);
        }
        // Strip BOM if Excel added one.
        $first = fgets($handle);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first) ?? '';
        rewind($handle);
        // Re-read first line as headers
        $headers = str_getcsv($first);
        // Move past header row in handle.
        fgetcsv($handle);

        $required = ['first_name','last_name','email','intake','department'];
        $results  = ['inserted' => 0, 'errors' => []];
        $rowNo    = 1; // header is row 1
        $db       = $this->appModel->db();

        try {
            $db->beginTransaction();
            while (($row = fgetcsv($handle)) !== false) {
                $rowNo++;
                if (empty(array_filter($row, fn($v) => trim((string)$v) !== ''))) {
                    continue; // skip blank rows
                }
                $assoc = [];
                foreach ($headers as $i => $h) {
                    $assoc[trim((string)$h)] = isset($row[$i]) ? $this->unwrapExcelText((string)$row[$i]) : '';
                }
                // Legacy *_id column names → new name-based ones so
                // sheets filled from an older download still work.
                if (!isset($assoc['department']) && isset($assoc['department_id'])) $assoc['department'] = $assoc['department_id'];
                if (!isset($assoc['program'])    && isset($assoc['program_id']))    $assoc['program']    = $assoc['program_id'];
                if (!isset($assoc['campus'])     && isset($assoc['campus_id']))     $assoc['campus']     = $assoc['campus_id'];
                if (!isset($assoc['level'])      && isset($assoc['level_id']))      $assoc['level']      = $assoc['level_id'];
                // Apply per-row patches from the preview UI before validation.
                if (isset($patches[$rowNo])) {
                    $assoc = array_merge($assoc, $patches[$rowNo]);
                }
                // Required-field gate.
                foreach ($required as $r) {
                    if (($assoc[$r] ?? '') === '') {
                        $results['errors'][] = ['row' => $rowNo, 'message' => "Missing required field '$r'."];
                        continue 2;
                    }
                }
                // Resolve name → id for catalog columns. Bad values are
                // surfaced row-by-row so the user can fix the sheet.
                $deptId = $this->resolveDepartmentByIdOrName((string)$assoc['department']);
                if (!$deptId) {
                    $results['errors'][] = ['row' => $rowNo, 'message' => "Unknown department '{$assoc['department']}'."];
                    continue;
                }
                $programId = null;
                if (($assoc['program'] ?? '') !== '') {
                    $programId = $this->resolveProgramByIdOrName((string)$assoc['program']);
                    if (!$programId) {
                        $results['errors'][] = ['row' => $rowNo, 'message' => "Unknown program '{$assoc['program']}'."];
                        continue;
                    }
                }
                $campusId = null;
                if (($assoc['campus'] ?? '') !== '') {
                    $campusId = $this->resolveCampusByIdOrName((string)$assoc['campus']);
                    if (!$campusId) {
                        $results['errors'][] = ['row' => $rowNo, 'message' => "Unknown campus '{$assoc['campus']}'."];
                        continue;
                    }
                }
                $levelId = null;
                if (($assoc['level'] ?? '') !== '') {
                    $levelId = $this->resolveLevelByIdOrName((string)$assoc['level']);
                }
                // Duplicate by email + intake + department guard.
                if ($this->appModel->existsActiveForDeptIntake(
                    (string)$assoc['email'],
                    $deptId,
                    (string)$assoc['intake'],
                    (int)($this->service->getActiveAcademicYear()['id'] ?? 0)
                )) {
                    $results['errors'][] = ['row' => $rowNo, 'message' => "Duplicate active application for {$assoc['email']}."];
                    continue;
                }

                try {
                    $year = $this->service->getActiveAcademicYear();
                    $payload = [
                        'application_number' => $this->service->generateApplicationNumber(),
                        'academic_year_id'   => (int)$year['id'],
                        'faculty_id'         => null, // resolved via department
                        'department_id'      => $deptId,
                        'intake'             => (string)$assoc['intake'],
                        'first_name'         => (string)$assoc['first_name'],
                        'last_name'          => (string)$assoc['last_name'],
                        'email'              => strtolower((string)$assoc['email']),
                        'phone'              => (string)($assoc['phone'] ?? ''),
                        'gender'             => (string)($assoc['gender'] ?? ''),
                        'birthdate'          => (string)($assoc['birthdate'] ?? '') ?: null,
                        'nationality'        => (string)($assoc['nationality'] ?? 'Rwandan'),
                        'national_id'        => (string)($assoc['national_id'] ?? '') ?: null,
                        'program_id'         => $programId,
                        'campus_id'          => $campusId,
                        'mode_of_study'      => (string)($assoc['mode_of_study'] ?? '') ?: null,
                        'level_id'           => $levelId,
                        'prev_school'        => (string)($assoc['prev_school'] ?? ''),
                        'prev_qualification' => (string)($assoc['prev_qualification'] ?? ''),
                        'prev_grade'         => (string)($assoc['prev_grade'] ?? ''),
                        'combination'        => (string)($assoc['combination'] ?? '') ?: null,
                        'graduation_year'    => isset($assoc['graduation_year']) && $assoc['graduation_year'] !== '' ? (int)$assoc['graduation_year'] : null,
                        'sponsorship'        => (string)($assoc['sponsorship'] ?? 'self'),
                        'sponsor_name'       => (string)($assoc['sponsor_name'] ?? '') ?: null,
                        'is_credit_transfer' => !empty($assoc['is_credit_transfer']) ? 1 : 0,
                        'credit_transfer_from' => (string)($assoc['credit_transfer_from'] ?? '') ?: null,
                        'status'             => 'documents_verified', // ready for offer + enroll
                        'submitted_at'       => date('Y-m-d H:i:s'),
                    ];
                    // Resolve faculty_id from department.
                    $dept = $db->fetchOne("SELECT fac_id FROM `departements` WHERE dep_id = ? LIMIT 1", [$payload['department_id']]);
                    if ($dept) $payload['faculty_id'] = (int)$dept['fac_id'];

                    $appId = (int)$this->appModel->create($payload);
                    $this->service->logStatusChange(
                        $appId, null, 'documents_verified', $actorId, 'admin',
                        'Bulk-imported via registry CSV.'
                    );
                    $results['inserted']++;
                } catch (\Throwable $e) {
                    $results['errors'][] = ['row' => $rowNo, 'message' => $e->getMessage()];
                }
            }
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->getPdo()->inTransaction()) $db->rollBack();
            $this->error($response, 'Bulk upload failed: ' . $e->getMessage(), 500);
        } finally {
            fclose($handle);
        }

        SystemLogService::log(
            'CREATE', 'ADMISSIONS',
            "Bulk-uploaded {$results['inserted']} applicant(s); " . count($results['errors']) . " error(s).",
            null, 'student_application',
            $results, $authUser ?: null
        );

        $this->success($response, $results, 'Bulk upload complete.');
    }

    /**
     * PATCH /api/admin/applications/:id/exemption-status
     * Registry / finance use this to confirm receipt of the exemption letter
     * for a credit-transfer applicant. When BOTH `received_registry` and
     * `received_finance` have been recorded, the status auto-advances to
     * `confirmed` and admission-letter issuance is unblocked.
     */
    public function setExemptionStatus(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $authUser = (array) $request->param('_auth_user');
        $app      = $this->appModel->find($id);
        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }
        if ((int)($app['is_credit_transfer'] ?? 0) !== 1) {
            $this->error($response, 'Application is not flagged as credit transfer.', 422);
        }

        $data = $request->body();
        $action = (string)($data['action'] ?? '');
        if (!in_array($action, ['received_registry', 'received_finance', 'confirmed', 'pending'], true)) {
            $this->error($response, 'Invalid action. Must be one of: received_registry, received_finance, confirmed, pending.', 422);
        }

        $current = (string)($app['exemption_letter_status'] ?? 'pending');
        $next    = $current;

        // Promote to combined "confirmed" once we've recorded receipt from
        // both sides. The frontend can also explicitly send action=confirmed
        // (e.g. director sign-off) to short-circuit.
        if ($action === 'confirmed') {
            $next = 'confirmed';
        } elseif ($action === 'pending') {
            $next = 'pending';
        } elseif ($action === 'received_registry') {
            $next = $current === 'received_finance' ? 'confirmed' : 'received_registry';
        } elseif ($action === 'received_finance') {
            $next = $current === 'received_registry' ? 'confirmed' : 'received_finance';
        }

        $this->appModel->db()->execute(
            "UPDATE `student_applications`
             SET exemption_letter_status = ?,
                 exemption_letter_received_at = CASE WHEN ? = 'confirmed' THEN NOW() ELSE exemption_letter_received_at END,
                 entry_level_override = COALESCE(?, entry_level_override)
             WHERE id = ?",
            [$next, $next, isset($data['entry_level_override']) ? (string)$data['entry_level_override'] : null, $id]
        );

        SystemLogService::log(
            'UPDATE', 'ADMISSIONS',
            "Exemption letter status for application ID {$id} → {$next}.",
            $id, 'student_application',
            ['from' => $current, 'to' => $next, 'action' => $action],
            $authUser ?: null
        );

        $this->success($response, [
            'exemption_letter_status' => $next,
        ], 'Exemption status updated.');
    }

    /**
     * PATCH /api/admin/applications/:id/hide
     * Soft-hide a pending application from the main queue. Registry staff
     * use this when they want to keep the record but stop it cluttering the
     * "Pending" list (e.g. while chasing the applicant by phone).
     */
    public function hideApplication(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $authUser = (array) $request->param('_auth_user');
        $app      = $this->appModel->find($id);
        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }
        $reason = trim((string)($request->body()['reason'] ?? ''));

        $this->appModel->db()->execute(
            "UPDATE `student_applications`
             SET is_hidden = 1, hidden_at = NOW(), hidden_by = ?, hidden_reason = ?
             WHERE id = ?",
            [(int)($authUser['id'] ?? 0) ?: null, $reason !== '' ? $reason : null, $id]
        );

        SystemLogService::log(
            'UPDATE', 'ADMISSIONS',
            "Hid application ID {$id}" . ($reason !== '' ? " — reason: {$reason}" : '.'),
            $id, 'student_application',
            ['reason' => $reason], $authUser ?: null
        );
        $this->success($response, ['is_hidden' => 1], 'Application hidden.');
    }

    /**
     * PATCH /api/admin/applications/:id/restore
     * Restore a previously hidden application.
     */
    public function restoreApplication(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $authUser = (array) $request->param('_auth_user');
        $app      = $this->appModel->find($id);
        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }

        $this->appModel->db()->execute(
            "UPDATE `student_applications`
             SET is_hidden = 0, hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
             WHERE id = ?",
            [$id]
        );

        SystemLogService::log(
            'UPDATE', 'ADMISSIONS',
            "Restored application ID {$id}.",
            $id, 'student_application', null, $authUser ?: null
        );
        $this->success($response, ['is_hidden' => 0], 'Application restored.');
    }

    /**
     * GET /api/admin/applications/:id/returning-check
     * Returns whether the applicant already has a `student` row (by email or
     * national ID). The frontend uses this to warn admins before enrolling a
     * returning student that a new postgraduate row will be created.
     */
    public function returningCheck(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $app = $this->appModel->find($id);
        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }

        $email = trim((string)($app['email'] ?? ''));
        $nid   = trim((string)($app['national_id'] ?? ''));
        $where = [];
        $bind  = [];
        if ($email !== '') { $where[] = 'email = ?';        $bind[] = $email; }
        if ($nid   !== '') { $where[] = 'index_number = ?'; $bind[] = $nid; }
        if (empty($where)) {
            $this->success($response, ['is_returning' => false, 'records' => []], 'No prior records.');
        }

        $rows = $this->appModel->db()->fetchAll(
            "SELECT id, regnumber, fname, lname, email, programme_level, acc_year, faculty, department, current_level, student_state
             FROM `student`
             WHERE " . implode(' OR ', $where) . "
             ORDER BY id DESC
             LIMIT 5",
            $bind
        );

        $this->success($response, [
            'is_returning' => !empty($rows),
            'records'      => $rows,
        ], !empty($rows) ? 'Existing student record(s) found.' : 'No prior records.');
    }

    /**
     * GET /api/admin/applications/:id/pending-notes
     * Shared, visible notes recorded against a pending candidate. Every
     * registry assistant can read them so everyone knows why an applicant
     * is being held — even across campus assignments.
     */
    public function listPendingNotes(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $notes = $this->pendingNoteModel->listForApplication($id);
        $this->success($response, ['notes' => $notes, 'count' => count($notes)], 'Pending notes fetched.');
    }

    /**
     * POST /api/admin/applications/:id/pending-notes
     * Append a shared, visible note explaining why a candidate is pending.
     */
    public function addPendingNote(Request $request, Response $response): never
    {
        $id          = (int)$request->param('id');
        $application = $this->appModel->find($id);
        $authUser    = (array) $request->param('_auth_user');

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'note' => 'required|string|min:3|max:1000',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $newId = $this->pendingNoteModel->create([
            'application_id' => $id,
            'note'           => trim((string)$data['note']),
            'created_by'     => isset($authUser['id']) ? (int)$authUser['id'] : null,
        ]);

        SystemLogService::log(
            'CREATE', 'ADMISSIONS',
            "Added shared pending note to application ID {$id}.",
            $id, 'student_application',
            ['pending_note_id' => $newId],
            $authUser ?: null
        );

        $notes = $this->pendingNoteModel->listForApplication($id);
        $this->success($response, ['notes' => $notes, 'count' => count($notes)], 'Pending note recorded.', 201);
    }

    /**
     * GET /api/admin/applications/stats
     * Dashboard statistics.
     */
    public function getDashboardStats(Request $request, Response $response): never
    {
        $db = \Core\Database::getInstance();

        // Apply the user's campus scope to every aggregate so registry
        // staff see "Pending: 3 in MY campus" instead of "Pending: 200 system-wide".
        // The resolver returns null for unscoped users (admins), an int[]
        // for assigned users, and [] for scope-locked users with no
        // assignments (which short-circuits to zero counts).
        $scope = $this->resolveCampusScope((array) $request->param('_auth_user'));
        $scopeWhere  = '';
        $scopeParams = [];
        if (is_array($scope)) {
            if (empty($scope)) {
                // 1 = 0 → guaranteed empty result set.
                $scopeWhere = ' AND 1 = 0';
            } else {
                $ph = implode(',', array_fill(0, count($scope), '?'));
                $scopeWhere = " AND sa.campus_id IN ($ph)";
                $scopeParams = $scope;
            }
        }

        // Submission date range, shared with the list. The stat tiles on the
        // applications page are rendered from these counts while the table
        // below them comes from index() — so if the tiles ignored the range
        // the user would read "Total Applications 4,812" above a table
        // showing one month's 137 rows.
        //
        // Applied to the breakdown counts only. The catalogues (all_campuses,
        // all_levels, all_modes) are pick-lists, `trend` carries its own
        // explicit 7-day window, `recent` is a newest-8 feed, and
        // desynced_pending_count is a data-integrity warning that stays true
        // regardless of which window is on screen.
        [$rangeFrom, $rangeTo] = StudentApplicationModel::dateRangeBounds(
            $request->query('submitted_from'),
            $request->query('submitted_to')
        );
        $rangeWhere  = '';
        $rangeParams = [];
        if ($rangeFrom !== null) { $rangeWhere .= ' AND sa.submitted_at >= ?'; $rangeParams[] = $rangeFrom; }
        if ($rangeTo   !== null) { $rangeWhere .= ' AND sa.submitted_at <  ?'; $rangeParams[] = $rangeTo; }

        // Scope clause first, then range — the bindings must follow the same
        // order they appear in the string.
        $filterWhere  = $scopeWhere . $rangeWhere;
        $filterParams = array_merge($scopeParams, $rangeParams);

        // All admin-facing aggregates exclude `draft` applications since those
        // are applicant-side work-in-progress and have not been submitted.
        $statusCounts = $db->fetchAll(
            "SELECT sa.status, COUNT(*) as cnt
             FROM student_applications sa
             WHERE sa.status <> 'draft' {$filterWhere}
             GROUP BY sa.status",
            $filterParams
        );

        $intakeCounts = $db->fetchAll(
            "SELECT sa.intake, COUNT(*) as cnt
             FROM student_applications sa
             WHERE sa.status <> 'draft' {$filterWhere}
             GROUP BY sa.intake",
            $filterParams
        );

        $deptCounts = $db->fetchAll(
            "SELECT d.dep_name as label, COUNT(*) as cnt
             FROM student_applications sa
             JOIN departements d ON d.dep_id = sa.department_id
             WHERE sa.status <> 'draft' {$filterWhere}
             GROUP BY sa.department_id
             ORDER BY cnt DESC",
            $filterParams
        );

        $genderCounts = $db->fetchAll(
            "SELECT sa.gender as label, COUNT(*) as cnt
             FROM student_applications sa
             WHERE sa.status <> 'draft' {$filterWhere}
             GROUP BY sa.gender",
            $filterParams
        );

        $campusCounts = $db->fetchAll(
            "SELECT sa.campus_id AS id, c.name AS label, COUNT(*) AS cnt
             FROM student_applications sa
             LEFT JOIN campuses c ON c.id = sa.campus_id
             WHERE sa.status <> 'draft' AND sa.campus_id IS NOT NULL {$filterWhere}
             GROUP BY sa.campus_id, c.name
             ORDER BY cnt DESC",
            $filterParams
        );

        $modeCounts = $db->fetchAll(
            "SELECT sa.mode_of_study AS label, COUNT(*) AS cnt
             FROM student_applications sa
             WHERE sa.status <> 'draft' AND sa.mode_of_study IS NOT NULL AND sa.mode_of_study <> '' {$filterWhere}
             GROUP BY sa.mode_of_study
             ORDER BY cnt DESC",
            $filterParams
        );

        // The campus catalogue shown in filter dropdowns. For scope-locked
        // users we hand back only their assigned campuses so the UI can't
        // surface campuses they wouldn't have data for.
        if (is_array($scope) && !empty($scope)) {
            $ph = implode(',', array_fill(0, count($scope), '?'));
            $allCampuses = $db->fetchAll(
                "SELECT id, name AS label FROM campuses WHERE id IN ($ph) AND is_active = 1 ORDER BY name ASC",
                $scope
            );
        } elseif (is_array($scope) && empty($scope)) {
            $allCampuses = [];
        } else {
            $allCampuses = $db->fetchAll(
                "SELECT id, name AS label FROM campuses WHERE is_active = 1 ORDER BY name ASC"
            );
        }

        $levelCounts = $db->fetchAll(
            "SELECT sa.level_id AS id, l.name AS label, COUNT(*) AS cnt
             FROM student_applications sa
             LEFT JOIN levels l ON l.id = sa.level_id
             WHERE sa.status <> 'draft' AND sa.level_id IS NOT NULL {$filterWhere}
             GROUP BY sa.level_id, l.name
             ORDER BY l.name ASC",
            $filterParams
        );
        $allLevels = $db->fetchAll(
            "SELECT id, name AS label FROM levels ORDER BY name ASC"
        );
        $allModes = [
            ['label' => 'Day'],
            ['label' => 'Evening'],
            ['label' => 'Weekend'],
            ['label' => 'Distance Learning'],
        ];

        $trend = $db->fetchAll(
            "SELECT DATE(sa.created_at) as date, COUNT(*) as cnt
             FROM student_applications sa
             WHERE sa.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
               AND sa.status <> 'draft' {$scopeWhere}
             GROUP BY DATE(sa.created_at)
             ORDER BY date ASC",
            $scopeParams
        );

        $recent = $db->fetchAll(
            "SELECT sa.application_number, sa.first_name, sa.last_name, sa.status, sa.created_at, d.dep_name as department_name
             FROM student_applications sa
             JOIN departements d ON d.dep_id = sa.department_id
             WHERE sa.status <> 'draft' {$scopeWhere}
             ORDER BY sa.id DESC
             LIMIT 8",
            $scopeParams
        );

        // Task 1.6 — pending-but-already-admitted desync count. Surfaced as a
        // banner on the admissions list so registry staff can spot mismatches.
        // Scoped by campus too so a registrar's banner doesn't count rows
        // from campuses they can't act on.
        $desyncedCount = (int)($db->fetchOne(
            "SELECT COUNT(DISTINCT sa.id) AS cnt
             FROM student_applications sa
             JOIN student s
               ON (sa.email IS NOT NULL AND s.email = sa.email)
               OR (sa.national_id IS NOT NULL AND sa.national_id <> '' AND s.index_number = sa.national_id)
             WHERE sa.status NOT IN ('enrolled', 'withdrawn', 'offer_declined') {$scopeWhere}",
            $scopeParams
        )['cnt'] ?? 0);

        $this->success($response, [
            'by_status' => $statusCounts,
            'by_intake' => $intakeCounts,
            'by_dept'   => $deptCounts,
            'by_gender' => $genderCounts,
            'by_campus' => $campusCounts,
            'by_mode'   => $modeCounts,
            'all_campuses' => $allCampuses,
            'all_modes'    => $allModes,
            'all_levels'   => $allLevels,
            'by_level'     => $levelCounts,
            'trend'     => $trend,
            'recent'    => $recent,
            'desynced_pending_count' => $desyncedCount,
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
            // The export must reproduce exactly what the list shows, so it
            // takes the same date range.
            'submitted_from'=> $request->query('submitted_from')?? '',
            'submitted_to'  => $request->query('submitted_to')  ?? '',
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
        // Name the window on the printed report. Without this the PDF looks
        // like a full census of the applications table when it is in fact one
        // month's worth.
        if (!empty($filters['submitted_from']) || !empty($filters['submitted_to'])) {
            $filterSummary[] = 'Submitted: '
                . (!empty($filters['submitted_from']) ? (string)$filters['submitted_from'] : 'any')
                . ' → '
                . (!empty($filters['submitted_to'])   ? (string)$filters['submitted_to']   : 'any');
        }
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
     * GET /api/admin/applications/:id/photo
     * Stream the applicant's profile photo (uploaded via the apply wizard's
     * step 1). 404 when none has been uploaded so the UI falls back to its
     * default avatar.
     */
    public function downloadApplicantPhoto(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        // Resolve every available photo id in priority order:
        //   1. applicant_profiles.profile_photo_id  (uploaded via apply wizard)
        //   2. users.photo                          (user-account photo)
        $row = $this->appModel->db()->fetchOne(
            "SELECT ap.profile_photo_id, u.photo AS user_photo
             FROM `student_applications` sa
             LEFT JOIN `applicant_profiles` ap ON ap.application_id = sa.id
             LEFT JOIN `users` u                ON u.id = ap.user_id
             WHERE sa.id = ? LIMIT 1",
            [$id]
        );
        $photoId = $row['profile_photo_id'] ?? null;
        if (empty($photoId)) {
            $photoId = $row['user_photo'] ?? null;
        }
        if (empty($photoId)) {
            $this->error($response, 'No applicant photo.', 404);
        }
        try {
            $client = new \App\Helpers\FileServerClient();
            $file   = $client->download((string)$photoId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }
        header('Content-Type: ' . ($file['mime'] ?? 'image/jpeg'));
        header('Content-Disposition: inline; filename="' . addslashes($file['original_name'] ?? 'photo') . '"');
        header('Content-Length: ' . strlen($file['content']));
        header('Cache-Control: private, max-age=300');
        header('X-Content-Type-Options: nosniff');
        echo $file['content'];
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

    /**
     * Auto-hide applications that have been stuck in a non-final state
     * (submitted / under-review / requested_changes / etc.) for longer than
     * the configured `pending_timeout_days`. Records are only soft-hidden —
     * they remain queryable via `include_hidden=1` or `only_hidden=1`.
     */
    private function autoHideExpiredPending(): void
    {
        $db = $this->appModel->db();
        $row = $db->fetchOne(
            "SELECT value FROM `settings` WHERE key_name = 'pending_timeout_days' LIMIT 1"
        );
        $days = (int)($row['value'] ?? 0);
        if ($days <= 0) return;

        try {
            $db->execute(
                "UPDATE `student_applications`
                 SET is_hidden = 1, hidden_at = NOW(), hidden_reason = CONCAT('Auto-hidden after ', ?, ' days pending')
                 WHERE is_hidden = 0
                   AND status NOT IN ('enrolled','withdrawn','offer_declined')
                   AND submitted_at IS NOT NULL
                   AND submitted_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
                [$days, $days]
            );
        } catch (\Throwable $e) {
            // Non-blocking — a missing column on legacy schemas mustn't take
            // the admissions list down.
        }
    }
}
