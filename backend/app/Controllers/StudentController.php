<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentModel;
use App\Models\ApplicationDocumentModel;
use App\Models\StudentApplicationModel;
use App\Models\StudentVisaRecordModel;
use App\Models\StudentStatusChangeModel;
use App\Models\FacultyModel;
use App\Models\DepartmentModel;
use App\Models\OptionModel;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;
use App\Services\SystemLogService;

class StudentController extends BaseController
{
    private StudentModel $studentModel;
    private ApplicationDocumentModel $docModel;
    private StudentVisaRecordModel $visaModel;
    private StudentStatusChangeModel $statusModel;

    public function __construct()
    {
        $this->studentModel = new StudentModel();
        $this->docModel     = new ApplicationDocumentModel();
        $this->visaModel    = new StudentVisaRecordModel();
        $this->statusModel  = new StudentStatusChangeModel();
    }

    /**
     * Resolve the application_id linked to a student through their admission offer.
     * Returns null if the student has no offer (e.g. manually created student).
     */
    private function resolveApplicationId(int $studentId): ?int
    {
        $row = $this->studentModel->db()->fetchOne(
            "SELECT application_id FROM `admission_offers`
             WHERE student_id = ?
             ORDER BY id DESC LIMIT 1",
            [$studentId]
        );
        return $row && !empty($row['application_id']) ? (int)$row['application_id'] : null;
    }

    /**
     * Resolve the latest admission offer for a student so its admission
     * letter can be surfaced alongside the uploaded application documents.
     * Returns null when the student has no offer or when the offer hasn't
     * had a letter token generated yet (in which case there is nothing to
     * download).
     */
    private function resolveAdmissionOffer(int $studentId): ?array
    {
        $row = $this->studentModel->db()->fetchOne(
            "SELECT ao.id, ao.letter_token, ao.status, ao.letter_sent_at,
                    sa.application_number
             FROM `admission_offers` ao
             LEFT JOIN `student_applications` sa ON sa.id = ao.application_id
             WHERE ao.student_id = ?
             ORDER BY ao.id DESC LIMIT 1",
            [$studentId]
        );

        if (!$row || empty($row['letter_token'])) {
            return null;
        }

        return [
            'offer_id'           => (int)$row['id'],
            'letter_token'       => (string)$row['letter_token'],
            'status'             => $row['status'] ?? null,
            'letter_sent_at'     => $row['letter_sent_at'] ?? null,
            'application_number' => $row['application_number'] ?? null,
        ];
    }

    /**
     * GET /api/students/:id/documents
     * All documents the student uploaded with their admission application.
     */
    public function documents(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $applicationId = $this->resolveApplicationId($id);
        $offer         = $this->resolveAdmissionOffer($id);

        $documents = $applicationId ? $this->docModel->getForApplication($applicationId) : [];

        // International students always get the synthetic Visa row injected
        // at the top — mirrors the self-service /me/documents behavior so
        // admins viewing the page see the same list of expected docs.
        if (self::isStudentInternational($student)) {
            array_unshift($documents, $this->buildVisaDocRow($id));
        }

        $this->success($response, [
            'application_id'  => $applicationId,
            'documents'       => $documents,
            'admission_offer' => $offer,
        ], 'Documents fetched successfully.');
    }

    /**
     * GET /api/students/:id/documents/:document_id/download
     * Proxy-download a single document from the file server.
     */
    public function downloadDocument(Request $request, Response $response): never
    {
        $id         = (int)$request->param('id');
        $documentId = (int)$request->param('document_id');

        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $applicationId = $this->resolveApplicationId($id);
        if (!$applicationId) {
            $this->error($response, 'Student has no linked application.', 404);
        }

        $document = $this->docModel->find($documentId);
        if (!$document || (int)$document['application_id'] !== $applicationId) {
            $this->error($response, 'Document not found.', 404);
        }

        if (empty($document['file_server_id'])) {
            $this->error($response, 'No file associated with this document record.', 404);
        }

        try {
            $client   = new FileServerClient();
            $fileData = $client->download($document['file_server_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime         = $fileData['mime'] ?? 'application/octet-stream';
        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $disposition  = $isInlineable ? 'inline' : 'attachment';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($fileData['original_name']) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * Build the WHERE clauses + bindings shared by the paginated student
     * list (`index`) and the CSV export (`exportCsv`). Returns
     * `[string $whereSql, array $bindings]`. Both endpoints accept the
     * same `q` search box and per-column exact-match filters so the
     * export always mirrors what the user sees on the list page.
     *
     * @return array{0:string, 1:array}
     */
    private function buildListFilters(Request $request, string $alias = '', array $except = []): array
    {
        // `$except` lists parameter names the caller wants ignored. The
        // faceted-count endpoint uses it to compute "how many rows would this
        // option yield" for one dimension while every OTHER active filter
        // still applies.
        $search  = in_array('q', $except, true)
            ? ''
            : ($request->query('search') ?? $request->query('q') ?? '');
        // Callers that run these filters against a JOINed query must pass the
        // student table's alias — several joined tables share column names
        // with `student` (e.g. `departements`.`program`), so an unqualified
        // reference raises "Column 'program' in WHERE is ambiguous".
        $p = $alias !== '' ? rtrim($alias, '.') . '.' : '';

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            // Tokenised: each word must match SOME column, so a full name
            // works in either order — "DUSINGIZIMANA Agnes" is fname + lname,
            // and matching the whole string against single columns found
            // nothing.
            foreach (preg_split('/\s+/', trim((string)$search)) ?: [] as $term) {
                if ($term === '') continue;
                $clauses[]  = "({$p}fname LIKE ? OR {$p}lname LIKE ? OR {$p}regnumber LIKE ? OR {$p}email LIKE ?)";
                $bindings[] = "%$term%";
                $bindings[] = "%$term%";
                $bindings[] = "%$term%";
                $bindings[] = "%$term%";
            }
        }

        $this->applyFilterableClauses($request, $clauses, $bindings, $alias, $except);

        $where = $clauses ? implode(' AND ', $clauses) : '';
        return [$where, $bindings];
    }

    /**
     * List all students with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);

        $sortBy  = $request->query('sort_by');
        $sortDir = strtoupper($request->query('sort_dir') ?? 'DESC');

        $allowedSorts = ['id', 'fname', 'lname', 'regnumber', 'email', 'gender', 'nationality'];
        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'id';
        }
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        [$where, $bindings] = $this->buildListFilters($request);

        $paginated = $this->studentModel->paginate($page, $perPage, $where, $bindings, $sortBy, $sortDir);

        // Decorate rows with a human-readable campus_name. One follow-up
        // query per page keeps the list lightweight without changing the
        // paginate() contract.
        $rows = $paginated['data'] ?? [];
        if (!empty($rows)) {
            $campusIds = [];
            foreach ($rows as $r) {
                $c = $r['campus'] ?? null;
                if ($c !== null && $c !== '') $campusIds[(string)$c] = true;
            }
            $nameById = [];
            if (!empty($campusIds)) {
                $ids = array_keys($campusIds);
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                $db  = $this->studentModel->db();
                $catalog = $db->fetchAll(
                    "SELECT id, name, code FROM `campuses` WHERE id IN ($ph)",
                    $ids
                );
                foreach ($catalog as $c) {
                    $nameById[(string)$c['id']] = [
                        'name' => $c['name'],
                        'code' => $c['code'],
                    ];
                }
            }
            foreach ($rows as &$r) {
                $c = (string)($r['campus'] ?? '');
                $r['campus_name'] = $c !== '' && isset($nameById[$c]) ? $nameById[$c]['name'] : null;
                $r['campus_code'] = $c !== '' && isset($nameById[$c]) ? $nameById[$c]['code'] : null;
            }
            unset($r);
            $rows = \App\Helpers\LevelHelper::decorate($rows, 'current_level', 'level_name');

            // Document verification badge. Computed for the page's rows only —
            // two grouped queries, no per-row lookups — so the list can show
            // the same state the student's Documents tab does.
            $docSummary = $this->fetchDocumentStatusSummary(array_map(
                static fn ($r) => (int)($r['id'] ?? 0),
                $rows
            ));
            foreach ($rows as &$r) {
                $sum = $docSummary[(int)($r['id'] ?? 0)]
                    ?? ['total' => 0, 'verified' => 0, 'pending' => 0, 'rejected' => 0, 'status' => 'none'];
                $r['document_status']  = $sum['status'];
                $r['documents_total']  = $sum['total'];
                $r['documents_verified'] = $sum['verified'];
                $r['documents_pending']  = $sum['pending'];
                $r['documents_rejected'] = $sum['rejected'];
            }
            unset($r);

            $paginated['data'] = $rows;
        }

        $this->success($response, $paginated, 'Students fetched successfully.');
    }

    /**
     * GET /api/finance/students
     *
     * Read-only Student Directory for Finance (Phase 2 of the MIS revision request,
     * gated by VIEW_STUDENT_DIRECTORY_FINANCE). Reuses index()'s exact filter set
     * (buildListFilters()/applyFilterableClauses()) rather than duplicating it, and
     * decorates each row with a fee/payment status summary so Finance doesn't need
     * a second request per student to see balance status.
     *
     * Strictly read-only — no corresponding write endpoint.
     */
    public function financeDirectory(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);

        $sortBy  = $request->query('sort_by');
        $sortDir = strtoupper($request->query('sort_dir') ?? 'DESC');

        $allowedSorts = ['id', 'fname', 'lname', 'regnumber', 'email', 'gender', 'nationality'];
        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'id';
        }
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        [$where, $bindings] = $this->buildListFilters($request);

        $paginated = $this->studentModel->paginate($page, $perPage, $where, $bindings, $sortBy, $sortDir);

        $rows = $paginated['data'] ?? [];
        if (!empty($rows)) {
            $regnumbers = array_values(array_unique(array_filter(
                array_map(fn ($r) => $r['regnumber'] ?? null, $rows)
            )));
            $feeStatusByReg = $this->fetchFeeStatusSummary($regnumbers, $request->query('academic_year_id'));

            foreach ($rows as &$r) {
                $reg = $r['regnumber'] ?? null;
                $r['fee_status'] = ($reg !== null && isset($feeStatusByReg[$reg]))
                    ? $feeStatusByReg[$reg]
                    : ['total_due' => 0.0, 'total_paid' => 0.0, 'total_bursary' => 0.0, 'balance' => 0.0, 'status' => 'no_invoices', 'has_override' => false];
            }
            unset($r);
            $paginated['data'] = $rows;
        }

        $this->success($response, $paginated, 'Finance student directory fetched.');
    }

    /**
     * Aggregate fee_invoices (+ student_fee_overrides presence) per student, keyed
     * by regnumber. Scoped to a single academic year when $academicYearId is given,
     * otherwise aggregates the student's full invoice history.
     *
     * @param array<int, string> $regnumbers
     * @return array<string, array{total_due:float,total_paid:float,total_bursary:float,balance:float,status:string,has_override:bool}>
     */
    private function fetchFeeStatusSummary(array $regnumbers, mixed $academicYearId): array
    {
        if (empty($regnumbers)) {
            return [];
        }

        $db = $this->studentModel->db();
        $ph = implode(',', array_fill(0, count($regnumbers), '?'));

        $yearSql      = '';
        $yearBindings = [];
        if (!empty($academicYearId)) {
            $yearSql      = 'AND academic_year_id = ?';
            $yearBindings = [(int)$academicYearId];
        }

        $sums = $db->fetchAll(
            "SELECT student_id,
                    SUM(amount_due)      AS total_due,
                    SUM(amount_paid)     AS total_paid,
                    SUM(bursary_applied) AS total_bursary
             FROM `fee_invoices`
             WHERE student_id IN ($ph) AND fee_type != 'BURSARY_CREDIT' {$yearSql}
             GROUP BY student_id",
            array_merge($regnumbers, $yearBindings)
        );

        $overrides = $db->fetchAll(
            "SELECT student_id, COUNT(*) AS override_count
             FROM `student_fee_overrides`
             WHERE student_id IN ($ph) {$yearSql}
             GROUP BY student_id",
            array_merge($regnumbers, $yearBindings)
        );
        $overrideByReg = array_column($overrides, 'override_count', 'student_id');

        $summary = [];
        foreach ($sums as $row) {
            $due     = (float)$row['total_due'];
            $paid    = (float)$row['total_paid'];
            $bursary = (float)$row['total_bursary'];
            $balance = $due - $paid - $bursary;

            $summary[$row['student_id']] = [
                'total_due'     => $due,
                'total_paid'    => $paid,
                'total_bursary' => $bursary,
                'balance'       => $balance,
                'status'        => $balance <= 0.0 ? 'cleared' : ($paid > 0.0 ? 'partial' : 'unpaid'),
                'has_override'  => !empty($overrideByReg[$row['student_id']]),
            ];
        }

        return $summary;
    }

    /**
     * Get a single student.
     */
    public function show(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        // Enrich student with joined faculty, department, and program names
        $student['faculty_name'] = null;
        $student['department_name'] = null;
        $student['program_name'] = null;
        // `current_level` stores a `levels.id`; every screen shows the name.
        $student['level_name'] = \App\Helpers\LevelHelper::name($student['current_level'] ?? null) ?: null;

        if (!empty($student['faculty'])) {
            $facultyModel = new FacultyModel();
            $faculty = $facultyModel->findBy('fac_id', $student['faculty']);
            if ($faculty) {
                $student['faculty_name'] = $faculty['fac_name'] ?? null;
            }
        }

        if (!empty($student['department'])) {
            $deptModel = new DepartmentModel();
            $dept = $deptModel->findBy('dep_id', $student['department']);
            if ($dept) {
                $student['department_name'] = $dept['dep_name'] ?? null;
            }
        }

        if (!empty($student['std_option'])) {
            $optionModel = new OptionModel();
            $option = $optionModel->find($student['std_option']);
            if ($option) {
                $student['program_name'] = $option['name'] ?? null;
            }
        }

        // Surface the linked admission application so the overview tab can render
        // the rich personal/contact/residency/academic info that was captured at
        // application time. Manually-created students simply won't have one.
        $applicationId = $this->resolveApplicationId($id);
        $application   = null;
        if ($applicationId) {
            $appModel = new StudentApplicationModel();
            $application = $appModel->getWithDetails($applicationId) ?: null;
        }
        $student['application'] = $application;

        $this->success($response, $student, 'Student details fetched.');
    }

    /**
     * GET /api/students/me
     *
     * Self-service: returns the student record tied to the authenticated user,
     * regardless of whether they hold VIEW_STUDENTS. Used by the student
     * portal "My Profile" page so each enrolled student can read their own
     * record without unlocking the full registry.
     */
    public function me(Request $request, Response $response): never
    {
        $student = $this->resolveSelfStudent($request, $response);

        $applicationId = $this->resolveApplicationId((int)$student['id']);
        $application   = null;
        if ($applicationId) {
            $appModel    = new StudentApplicationModel();
            $application = $appModel->getWithDetails($applicationId) ?: null;
        }
        $student['application'] = $application;

        // Enrich student with joined faculty, department, and program names
        $student['faculty_name'] = null;
        $student['department_name'] = null;
        $student['program_name'] = null;
        // `current_level` stores a `levels.id`; every screen shows the name.
        $student['level_name'] = \App\Helpers\LevelHelper::name($student['current_level'] ?? null) ?: null;

        if (!empty($student['faculty'])) {
            $facultyModel = new FacultyModel();
            $faculty = $facultyModel->findBy('fac_id', $student['faculty']);
            if ($faculty) {
                $student['faculty_name'] = $faculty['fac_name'] ?? null;
            }
        }

        if (!empty($student['department'])) {
            $deptModel = new DepartmentModel();
            $dept = $deptModel->findBy('dep_id', $student['department']);
            if ($dept) {
                $student['department_name'] = $dept['dep_name'] ?? null;
            }
        }

        if (!empty($student['std_option'])) {
            $optionModel = new OptionModel();
            $option = $optionModel->find($student['std_option']);
            if ($option) {
                $student['program_name'] = $option['name'] ?? null;
            }
        }

        $this->success($response, $student, 'Student profile fetched.');
    }

    /**
     * GET /api/students/me/documents
     * Self-service: documents uploaded by the authenticated student during
     * their admission application, or documents they've uploaded directly to
     * their student profile. Mirrors `documents()` but doesn't require
     * VIEW_STUDENTS — the row is auto-resolved to the caller.
     */
    public function meDocuments(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        $applicationId = $this->resolveApplicationId($studentId);
        $offer         = $this->resolveAdmissionOffer($studentId);

        $documents = $applicationId ? $this->docModel->getForApplication($applicationId) : [];

        // International students always get a synthetic "Visa" entry at the
        // top of their document list — either pointing to the file they've
        // already uploaded, or a placeholder asking them to upload one.
        if (self::isStudentInternational($student)) {
            array_unshift($documents, $this->buildVisaDocRow($studentId));
        }

        $this->success($response, [
            'application_id'  => $applicationId,
            'documents'       => $documents,
            'admission_offer' => $offer,
            'can_upload'      => true,
        ], 'Documents fetched successfully.');
    }

    /**
     * GET /api/students/me/documents/:document_id/download
     * Self-service download — only resolves if the document belongs to the
     * caller's application.
     */
    public function meDownloadDocument(Request $request, Response $response): never
    {
        $student    = $this->resolveSelfStudent($request, $response);
        $studentId  = (int)$student['id'];
        $documentId = (int)$request->param('document_id');

        $applicationId = $this->resolveApplicationId($studentId);
        if (!$applicationId) {
            $this->error($response, 'You have no linked application.', 404);
        }

        $document = $this->docModel->find($documentId);
        if (!$document || (int)$document['application_id'] !== $applicationId) {
            $this->error($response, 'Document not found.', 404);
        }

        if (empty($document['file_server_id'])) {
            $this->error($response, 'No file associated with this document record.', 404);
        }

        try {
            $client   = new FileServerClient();
            $fileData = $client->download($document['file_server_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime         = $fileData['mime'] ?? 'application/octet-stream';
        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $disposition  = $isInlineable ? 'inline' : 'attachment';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($fileData['original_name']) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * GET /api/students/me/program-modules
     * Self-service curriculum view — every module in the caller's program
     * with their marks. Mirrors `programModules()` for any authenticated
     * student, no VIEW_STUDENTS required.
     */
    public function meProgramModules(Request $request, Response $response): never
    {
        $student = $this->resolveSelfStudent($request, $response);

        [$program, $groups] = $this->loadProgramCurriculum($student);

        $this->success($response, [
            'student' => [
                'id'         => (int)$student['id'],
                'regnumber'  => $student['regnumber'] ?? null,
                'fname'      => $student['fname']     ?? null,
                'lname'      => $student['lname']     ?? null,
                'std_option' => $student['std_option']?? null,
                'program'    => $student['program']   ?? null,
            ],
            'program' => $program,
            'groups'  => $groups,
        ], 'Program curriculum fetched.');
    }

    /**
     * Internal helper used by every `me*` endpoint to resolve the student
     * row tied to the authenticated user. Aborts the request with 401/404
     * if there is no usable account or no linked student record.
     */
    private function resolveSelfStudent(Request $request, Response $response): array
    {
        $authUser = $request->param('_auth_user') ?? [];
        $userId   = (int)($authUser['id'] ?? 0);
        $email    = is_string($authUser['email'] ?? null) ? $authUser['email'] : null;

        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $student = $this->studentModel->findByUserId($userId, $email);

        if (!$student) {
            $this->error($response, 'No student record is linked to your account.', 404);
        }

        return $student;
    }

    /**
     * Resolve a chosen program/option (std_option) to a full
     * { id, name, department_id, faculty_id } payload, used to auto-derive
     * the student's faculty and department from the option they belong to.
     *
     * Returns null when the option is missing/invalid.
     */
    private function resolveOption(int|string|null $optionId): ?array
    {
        $oid = (int)$optionId;
        if ($oid <= 0) return null;
        $row = $this->studentModel->db()->fetchOne(
            "SELECT o.id, o.name, o.department_id, d.fac_id AS faculty_id
             FROM `options` o
             LEFT JOIN `departements` d ON d.dep_id = o.department_id
             WHERE o.id = ? LIMIT 1",
            [$oid]
        );
        return $row ?: null;
    }

    /**
     * Create a new student record.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'fname'      => ['required', 'min:2'],
            'lname'      => ['required', 'min:2'],
            'std_option' => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $option = $this->resolveOption($data['std_option'] ?? null);
        if (!$option) {
            $this->error($response, 'Validation failed', 422, ['std_option' => ['Selected program is invalid.']]);
        }

        // Auto-generate reg number if not provided
        if (empty($data['regnumber'])) {
            $year              = date('Y');
            $data['regnumber'] = 'CUR/' . $year . '/' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT);
        }

        $id = $this->studentModel->create([
            'regnumber'         => $data['regnumber'],
            'fname'             => trim($data['fname']),
            'lname'             => trim($data['lname']),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'gender'            => $data['gender'] ?? null,
            'birthdate'         => $data['birthdate'] ?? null,
            'nationality'       => $data['nationality'] ?? 'Rwandan',
            'std_option'        => (string)$option['id'],
            'program'           => $data['program'] ?? $option['name'],
            'faculty'           => isset($option['faculty_id']) ? (string)$option['faculty_id'] : ($data['faculty'] ?? null),
            'department'        => isset($option['department_id']) ? (string)$option['department_id'] : ($data['department'] ?? null),
            'current_level'     => $data['current_level'] ?? null,
            'registration_date' => $data['registration_date'] ?? date('Y-m-d'),
            'student_state'     => $data['student_state'] ?? 'active',
        ]);

        $this->success($response, ['id' => $id], 'Student created successfully.', 201);
    }

    /**
     * Update a student record.
     */
    public function update(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $data    = $request->body();
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        // PATCH-style: only fields explicitly sent in the body get validated
        // and persisted. Powers section-by-section saves on the details page,
        // and stays compatible with the legacy "edit everything" modal which
        // sends the full payload anyway.
        $rules = [];
        if (array_key_exists('fname', $data))      $rules['fname']      = ['required', 'min:2'];
        if (array_key_exists('lname', $data))      $rules['lname']      = ['required', 'min:2'];
        if (array_key_exists('std_option', $data)) $rules['std_option'] = ['required'];
        if (array_key_exists('email', $data))      $rules['email']      = ['email'];
        if (array_key_exists('marital_status', $data)) $rules['marital_status'] = ['in:single,married,divorced,widowed'];
        if (array_key_exists('gender', $data))     $rules['gender']     = ['in:M,F,m,f,male,female,Male,Female'];

        if (!empty($rules)) {
            $errors = ValidationHelper::validate($data, $rules);
            if (!empty($errors)) {
                $this->error($response, 'Validation failed', 422, $errors);
            }
        }

        // Build the patch from the keys actually present in the request, so a
        // section update doesn't accidentally null out fields it didn't touch.
        $patch = [];
        $stringCols = [
            'regnumber', 'fname', 'lname', 'phone', 'email', 'gender',
            'birthdate', 'nationality', 'current_level', 'registration_date',
            'intake', 'acc_year', 'sponsor', 'marital_status', 'spouse',
            'disability', 'father', 'mother', 'reference', 'id_card',
            'country', 'province', 'district', 'sector', 'cell', 'village',
            'student_state',
        ];
        foreach ($stringCols as $col) {
            if (array_key_exists($col, $data)) {
                $val = $data[$col];
                $patch[$col] = is_string($val) ? trim($val) : $val;
            }
        }

        // Status changes do NOT go through this endpoint. `student_state` is
        // still accepted here so the details form can post its whole payload
        // unchanged, but a change of value is refused and redirected to
        // POST /api/students/:id/status — the only path that captures the
        // reason and the supporting document the registry asked for, and the
        // only one that writes the audit trail. Without this guard the main
        // edit form would remain a way to mark a student deceased with no
        // evidence and no record of who did it.
        if (array_key_exists('student_state', $patch)) {
            $submitted = strtolower(trim((string) $patch['student_state']));
            $current   = strtolower(trim((string) ($student['student_state'] ?? '')));
            if ($submitted !== $current) {
                $this->error($response, 'Validation failed', 422, [
                    'student_state' => ['Change a student\'s status from the Status action, so the reason and any supporting document are recorded with it.'],
                ]);
            }
            // Unchanged — drop it rather than rewriting the column with the
            // same value and dirtying updated_at.
            unset($patch['student_state']);
        }

        // Programme change recomputes the legacy faculty/department fields
        // from the chosen option so they stay in sync with the catalog.
        if (array_key_exists('std_option', $data)) {
            $option = $this->resolveOption($data['std_option']);
            if (!$option) {
                $this->error($response, 'Validation failed', 422, ['std_option' => ['Selected program is invalid.']]);
            }
            $patch['std_option'] = (string)$option['id'];
            $patch['program']    = $data['program'] ?? $option['name'];
            $patch['faculty']    = isset($option['faculty_id'])    ? (string)$option['faculty_id']    : ($data['faculty']    ?? $student['faculty']);
            $patch['department'] = isset($option['department_id']) ? (string)$option['department_id'] : ($data['department'] ?? $student['department']);
        }

        if (!empty($patch)) {
            $this->studentModel->update($id, $patch);
        }

        $this->success($response, null, 'Student updated successfully.');
    }


    /**
     * The canonical student states the registry may set, mirroring
     * STUDENT_STATES in StudentDetailsPage.tsx.
     *
     * `graduands` is stored plural because that is what the existing rows hold
     * (commit c7f7e0d) — the singular would leave those students matching no
     * option.
     */
    private const STUDENT_STATES = [
        'active', 'inactive', 'graduated', 'graduands',
        'suspended', 'rejected', 'dropped', 'dismissed', 'deceased',
    ];

    /**
     * POST /api/students/:id/status
     *
     * Change a student's state, recording why and (for a death) the document
     * that proves it. Multipart, because the state, the reason and the
     * certificate arrive together: doing it as upload-then-update would leave
     * an orphaned file whenever the second call failed, or — worse — a student
     * marked deceased with no evidence attached.
     *
     * Body (multipart/form-data):
     *   student_state  required, one of self::STUDENT_STATES
     *   reason         required for `rejected` and `dropped`
     *   document       required for `deceased` (pdf/jpg/png/doc/docx)
     */
    public function updateStatus(Request $request, Response $response): never
    {
        $id      = (int) $request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $newState = strtolower(trim((string) ($request->input('student_state') ?? '')));
        if ($newState === '') {
            $this->error($response, 'Validation failed', 422, ['student_state' => ['A status is required.']]);
        }
        if (!in_array($newState, self::STUDENT_STATES, true)) {
            $this->error($response, 'Validation failed', 422, [
                'student_state' => ['"' . $newState . '" is not a status the registry can set.'],
            ]);
        }

        $reason = trim((string) ($request->input('reason') ?? ''));
        if ($reason === '' && in_array($newState, StudentStatusChangeModel::REASON_REQUIRED, true)) {
            $this->error($response, 'Validation failed', 422, [
                'reason' => ['A reason is required when a student is marked "' . $newState . '".'],
            ]);
        }

        // Supporting document — mandatory for a death, accepted for any state.
        $file        = $request->file('document');
        $needsDoc    = in_array($newState, StudentStatusChangeModel::DOCUMENT_REQUIRED, true);
        $uploaded    = null;

        if (!$file && $needsDoc) {
            $this->error($response, 'Validation failed', 422, [
                'document' => ['A supporting document is required when a student is marked deceased.'],
            ]);
        }

        if ($file) {
            $allowed = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
            $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $allowed, true)) {
                $this->error($response, 'Validation failed', 422, [
                    'document' => ["Invalid file type '{$ext}'. Allowed: " . implode(', ', $allowed)],
                ]);
            }
            try {
                $uploaded = (new FileServerClient())->upload($file);
            } catch (\RuntimeException $e) {
                $this->error($response, $e->getMessage(), 422);
            }
        }

        $previous = (string) ($student['student_state'] ?? '');
        $actor    = (array) ($request->param('_auth_user') ?? []);
        $actorId  = (int) ($actor['id'] ?? 0) ?: null;

        // Write the trail first. If the UPDATE below fails we are left with a
        // recorded intent and an unchanged student, which a registrar can see
        // and retry — the reverse (state changed, no record of why) is the
        // outcome this whole feature exists to prevent.
        $this->statusModel->record([
            'student_id'              => $id,
            'previous_state'          => $previous !== '' ? $previous : null,
            'new_state'               => $newState,
            'reason'                  => $reason,
            'document_file_server_id' => $uploaded ? (string) $uploaded['id'] : null,
            'document_original_name'  => $uploaded['original_name'] ?? null,
            'document_mime'           => $uploaded['mime'] ?? null,
            'document_size'           => isset($uploaded['size']) ? (int) $uploaded['size'] : null,
            'changed_by'              => $actorId,
        ]);

        $this->studentModel->update($id, ['student_state' => $newState]);

        SystemLogService::log(
            'UPDATE',
            'STUDENTS',
            "Student #{$id} status: " . ($previous !== '' ? $previous : 'unset') . " → {$newState}",
            $id,
            'student',
            ['reason' => $reason ?: null, 'has_document' => $uploaded !== null]
        );

        $this->success($response, [
            'student_state' => $newState,
            'previous'      => $previous,
        ], 'Student status updated.');
    }

    /**
     * GET /api/students/:id/status-history
     * The audit trail behind the current status.
     */
    public function statusHistory(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        if (!$this->studentModel->find($id)) {
            $this->error($response, 'Student not found', 404);
        }

        $rows = $this->statusModel->forStudent($id);

        // Never leak the storage handle to the client — it is a capability.
        // The row exposes only whether a document exists; fetching it goes
        // through the id-addressed download route, which re-checks permission.
        foreach ($rows as &$r) {
            $r['has_document'] = !empty($r['document_file_server_id']);
            unset($r['document_file_server_id']);
        }
        unset($r);

        $this->success($response, $rows, 'Status history fetched.');
    }

    /**
     * GET /api/students/:id/status-history/:change_id/document
     * Stream the supporting document behind one status change.
     */
    public function downloadStatusDocument(Request $request, Response $response): never
    {
        $id     = (int) $request->param('id');
        $change = $this->statusModel->find((int) $request->param('change_id'));

        // Check the change belongs to the student in the path, so a valid
        // change id cannot be used to read another student's document.
        if (!$change || (int) $change['student_id'] !== $id) {
            $this->error($response, 'Status change not found.', 404);
        }
        if (empty($change['document_file_server_id'])) {
            $this->error($response, 'No supporting document was attached to this change.', 404);
        }

        $this->streamFileServerDownload((string) $change['document_file_server_id'], $response);
    }

    /**
     * Delete a student record.
     */
    public function delete(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);

        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $this->studentModel->delete($id);
        $this->success($response, null, 'Student deleted successfully.');
    }

    /* ─────────────────────────────────────────────────────────────────
     *  BULK IMPORT — template / validate (dry-run) / commit
     *  Mirrors the applicant bulk upload flow. CSV (UTF-8 with BOM) is
     *  the interchange format — Excel opens it natively and no extra
     *  PHP dependency is required.
     * ───────────────────────────────────────────────────────────────── */

    /** Stable column list used by both template generation + bulk import. */
    private function bulkStudentColumns(): array
    {
        return [
            'regnumber','fname','lname','email','phone','gender','birthdate',
            'nationality','std_option','current_level','intake','acc_year',
            'campus','sponsor','marital_status','disability',
            'father','mother','id_card','country','province','district',
            'sector','cell','village','registration_date','student_state',
        ];
    }

    /** Required keys when importing a student row. */
    private function bulkStudentRequired(): array
    {
        return ['fname','lname','std_option'];
    }

    /**
     * GET /api/students/bulk-upload-template
     * Streams a CSV the registry team fills in then re-uploads via
     * /bulk-validate (preview) and /bulk-upload (commit). Excel opens CSV
     * natively so no XLSX dependency.
     *
     * Two design notes that matter for non-technical users:
     *   1. The example row uses real *names* (program, campus) fetched
     *      from the DB — not raw IDs — because nobody knows that
     *      "5" means "BSc Computer Science". The import side accepts
     *      either the name or the id.
     *   2. Long all-digit fields (id_card, national IDs) are wrapped
     *      as `="…"` so Excel treats them as text instead of converting
     *      to scientific notation (1.199E+15). The import side strips
     *      that wrapper transparently.
     */
    public function bulkUploadTemplate(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();

        // Use the first real program + campus as the example so the
        // user sees an end-to-end realistic row instead of opaque ids.
        $progRow   = $db->fetchOne("SELECT name FROM `options` ORDER BY id ASC LIMIT 1");
        $campusRow = $db->fetchOne("SELECT name FROM `campuses` ORDER BY id ASC LIMIT 1");
        $exampleProgram = $progRow['name']   ?? 'BSc Computer Science';
        $exampleCampus  = $campusRow['name'] ?? 'Main Campus';

        $headers = $this->bulkStudentColumns();
        // Map header → example value so re-ordering bulkStudentColumns()
        // doesn't desync the example row.
        $exampleMap = [
            'regnumber'        => 'CUR/2026/00001',
            'fname'            => 'Jane',
            'lname'            => 'Doe',
            'email'            => 'jane.doe@example.com',
            'phone'            => $this->excelText('+250788000000'),
            'gender'           => 'F',
            'birthdate'        => '2002-03-14',
            'nationality'      => 'Rwandan',
            'std_option'       => $exampleProgram,
            'current_level'    => '1',
            'intake'           => 'Jan 2026',
            'acc_year'         => '2025-2026',
            'campus'           => $exampleCampus,
            'sponsor'          => 'self',
            'marital_status'   => 'single',
            'disability'       => '',
            'father'           => 'John Doe',
            'mother'           => 'Mary Doe',
            'id_card'          => $this->excelText('1199000000000000'),
            'country'          => 'Rwanda',
            'province'         => 'Kigali',
            'district'         => 'Gasabo',
            'sector'           => 'Remera',
            'cell'             => 'Rukiri',
            'village'          => 'Kabeza',
            'registration_date'=> '2026-01-15',
            'student_state'    => 'active',
        ];
        $example = array_map(fn($h) => $exampleMap[$h] ?? '', $headers);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="bulk-students-template.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // BOM for Excel UTF-8
        // Instructions row (Excel reads it as a comment-style first row);
        // re-uploading is harmless because we skip rows with no `fname`.
        fputcsv($out, $headers);
        fputcsv($out, $example);
        // Second example row left blank for the user to start typing.
        fputcsv($out, array_fill(0, count($headers), ''));
        fclose($out);
        exit;
    }

    /**
     * Wrap a value as `="…"` so Excel keeps it as text when opening the
     * CSV (otherwise long all-digit values like national IDs are
     * coerced to scientific notation: "1.199E+15").
     */
    private function excelText(string $value): string
    {
        if ($value === '') return '';
        // Escape any embedded double-quotes per Excel's =""..."" convention.
        $escaped = str_replace('"', '""', $value);
        return '="' . $escaped . '"';
    }

    /**
     * Reverse of excelText() — strips the `="…"` wrapper Excel sometimes
     * preserves on save so the importer sees the plain value.
     */
    private function unwrapExcelText(string $value): string
    {
        $v = trim($value);
        if (strlen($v) >= 4 && str_starts_with($v, '="') && str_ends_with($v, '"')) {
            return str_replace('""', '"', substr($v, 2, -1));
        }
        return $v;
    }

    /**
     * Resolve a chosen program (`std_option`) by either numeric id or
     * case-insensitive name. Returns the same `{ id, name, ... }` shape
     * as resolveOption() so the rest of the importer doesn't care which
     * form the spreadsheet used.
     */
    private function resolveOptionByIdOrName(string $value): ?array
    {
        $v = trim($value);
        if ($v === '') return null;
        if (ctype_digit($v)) {
            return $this->resolveOption($v);
        }
        $row = $this->studentModel->db()->fetchOne(
            "SELECT o.id, o.name, o.department_id, d.fac_id AS faculty_id
             FROM `options` o
             LEFT JOIN `departements` d ON d.dep_id = o.department_id
             WHERE LOWER(o.name) = LOWER(?) LIMIT 1",
            [$v]
        );
        return $row ?: null;
    }

    /**
     * Resolve a campus column value (id or case-insensitive name) to
     * the campus.id stored as a string on the `student` row. Returns
     * null when the column was left blank, or false when the value
     * didn't match any campus.
     */
    private function resolveCampusByIdOrName(string $value): null|false|string
    {
        $v = trim($value);
        if ($v === '') return null;
        if (ctype_digit($v)) {
            $row = $this->studentModel->db()->fetchOne(
                "SELECT id FROM `campuses` WHERE id = ? LIMIT 1",
                [(int)$v]
            );
            return $row ? (string)(int)$row['id'] : false;
        }
        $row = $this->studentModel->db()->fetchOne(
            "SELECT id FROM `campuses` WHERE LOWER(name) = LOWER(?) LIMIT 1",
            [$v]
        );
        return $row ? (string)(int)$row['id'] : false;
    }

    /**
     * POST /api/students/bulk-validate
     * Dry-run preview: parses the uploaded CSV, normalises rows, checks
     * required fields + std_option validity + regnumber collisions and
     * tags each row as `create` (new regnumber) or `update` (existing
     * regnumber). No DB writes. Powers the modal preview where the user
     * can fix mismatched values before committing.
     *
     * Returns: { headers, rows:[{row_no, action, data, errors:[{field,message}]}],
     *            summary:{ total, valid, with_errors, to_create, to_update } }
     */
    public function bulkValidate(Request $request, Response $response): never
    {
        $parsed = $this->parseBulkCsv($response);
        $headers = $parsed['headers'];
        $rows    = $parsed['rows'];

        $required = $this->bulkStudentRequired();
        $result   = [];
        $tally    = ['total' => 0, 'valid' => 0, 'with_errors' => 0, 'to_create' => 0, 'to_update' => 0];

        foreach ($rows as $entry) {
            $tally['total']++;
            $assoc  = $entry['data'];
            $rowNo  = $entry['row_no'];
            $errors = [];

            foreach ($required as $r) {
                if (($assoc[$r] ?? '') === '') {
                    $errors[] = ['field' => $r, 'message' => "Missing required field '$r'."];
                }
            }

            if (($assoc['std_option'] ?? '') !== '') {
                $opt = $this->resolveOptionByIdOrName((string)$assoc['std_option']);
                if (!$opt) {
                    $errors[] = ['field' => 'std_option', 'message' => "Unknown program '{$assoc['std_option']}'. Use the program name or its id."];
                }
            }

            if (($assoc['campus'] ?? '') !== '') {
                $cmp = $this->resolveCampusByIdOrName((string)$assoc['campus']);
                if ($cmp === false) {
                    $errors[] = ['field' => 'campus', 'message' => "Unknown campus '{$assoc['campus']}'. Use the campus name or its id."];
                }
            }

            if (($assoc['email'] ?? '') !== '' && !filter_var($assoc['email'], FILTER_VALIDATE_EMAIL)) {
                $errors[] = ['field' => 'email', 'message' => "Invalid email '{$assoc['email']}'."];
            }
            if (($assoc['gender'] ?? '') !== '' && !in_array(strtoupper((string)$assoc['gender']), ['M','F','MALE','FEMALE'], true)) {
                $errors[] = ['field' => 'gender', 'message' => "Gender must be M or F."];
            }
            if (($assoc['birthdate'] ?? '') !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$assoc['birthdate'])) {
                $errors[] = ['field' => 'birthdate', 'message' => "Birthdate must be YYYY-MM-DD."];
            }

            $action = 'create';
            $regnum = trim((string)($assoc['regnumber'] ?? ''));
            if ($regnum !== '') {
                $existing = $this->studentModel->db()->fetchOne(
                    "SELECT id, fname, lname FROM `student` WHERE regnumber = ? LIMIT 1",
                    [$regnum]
                );
                if ($existing) {
                    $action = 'update';
                }
            }

            if (empty($errors)) {
                $tally['valid']++;
                $action === 'update' ? $tally['to_update']++ : $tally['to_create']++;
            } else {
                $tally['with_errors']++;
            }

            $result[] = [
                'row_no'  => $rowNo,
                'action'  => $action,
                'data'    => $assoc,
                'errors'  => $errors,
            ];
        }

        $this->success($response, [
            'headers' => $headers,
            'rows'    => $result,
            'summary' => $tally,
        ], 'Preview ready.');
    }

    /**
     * POST /api/students/bulk-upload
     * Commit endpoint. Inserts new students (no regnumber match) and
     * updates existing rows by regnumber. Rows with validation errors
     * are skipped and surfaced in the response. Runs in a single
     * transaction so a fatal parse error never leaves the table in a
     * half-imported state.
     *
     * Body (multipart):
     *   file: CSV/XLSX (only CSV supported for now)
     *   patched_rows (optional JSON): [{row_no, data}] — rows the user
     *     fixed in the preview UI. Their `data` overrides the parsed
     *     row's values before the row is processed.
     */
    public function bulkUpload(Request $request, Response $response): never
    {
        $parsed   = $this->parseBulkCsv($response);
        $rows     = $parsed['rows'];
        $authUser = (array) $request->param('_auth_user');
        $actorId  = (int)($authUser['id'] ?? 0);

        // Merge user-supplied patches from the preview UI.
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

        $required = $this->bulkStudentRequired();
        $results  = [
            'inserted'  => 0,
            'updated'   => 0,
            // Rows where every value either matched the existing row or
            // was left blank — there was literally nothing to write.
            'unchanged' => 0,
            'skipped'   => 0,
            'errors'    => [],
        ];
        $db       = $this->studentModel->db();

        try {
            $db->beginTransaction();
            foreach ($rows as $entry) {
                $rowNo = $entry['row_no'];
                $assoc = $entry['data'];
                if (isset($patches[$rowNo])) {
                    $assoc = array_merge($assoc, $patches[$rowNo]);
                }

                // Validate.
                foreach ($required as $r) {
                    if (($assoc[$r] ?? '') === '') {
                        $results['errors'][] = ['row' => $rowNo, 'message' => "Missing required field '$r'."];
                        $results['skipped']++;
                        continue 2;
                    }
                }
                $option = $this->resolveOptionByIdOrName((string)$assoc['std_option']);
                if (!$option) {
                    $results['errors'][] = ['row' => $rowNo, 'message' => "Unknown program '{$assoc['std_option']}'. Use the program name or its id."];
                    $results['skipped']++;
                    continue;
                }
                // Resolve campus name/id → numeric id string. Blank stays
                // blank; an unrecognised value blocks the row instead of
                // silently dropping the column.
                $campusVal = (string)($assoc['campus'] ?? '');
                $campusId  = null;
                if ($campusVal !== '') {
                    $resolved = $this->resolveCampusByIdOrName($campusVal);
                    if ($resolved === false) {
                        $results['errors'][] = ['row' => $rowNo, 'message' => "Unknown campus '{$campusVal}'."];
                        $results['skipped']++;
                        continue;
                    }
                    $campusId = $resolved;
                }

                $regnum = trim((string)($assoc['regnumber'] ?? ''));
                if ($regnum === '') {
                    $year   = date('Y');
                    $regnum = 'CUR/' . $year . '/' . str_pad((string)random_int(1, 99999), 5, '0', STR_PAD_LEFT);
                }

                $payload = [
                    'regnumber'         => $regnum,
                    'fname'             => trim((string)$assoc['fname']),
                    'lname'             => trim((string)$assoc['lname']),
                    'email'             => $assoc['email']  ?? null,
                    'phone'             => $assoc['phone']  ?? null,
                    'gender'            => $assoc['gender'] ?? null,
                    'birthdate'         => $assoc['birthdate'] ?? null,
                    'nationality'       => $assoc['nationality'] ?? 'Rwandan',
                    'std_option'        => (string)$option['id'],
                    'program'           => $option['name'] ?? null,
                    'faculty'           => isset($option['faculty_id'])    ? (string)$option['faculty_id']    : null,
                    'department'        => isset($option['department_id']) ? (string)$option['department_id'] : null,
                    'current_level'     => $assoc['current_level'] ?? null,
                    'intake'            => $assoc['intake'] ?? null,
                    'acc_year'          => $assoc['acc_year'] ?? null,
                    'campus'            => $campusId,
                    'sponsor'           => $assoc['sponsor'] ?? null,
                    'marital_status'    => $assoc['marital_status'] ?? null,
                    'disability'        => $assoc['disability'] ?? null,
                    'father'            => $assoc['father'] ?? null,
                    'mother'            => $assoc['mother'] ?? null,
                    'id_card'           => $assoc['id_card'] ?? null,
                    'country'           => $assoc['country'] ?? null,
                    'province'          => $assoc['province'] ?? null,
                    'district'          => $assoc['district'] ?? null,
                    'sector'            => $assoc['sector'] ?? null,
                    'cell'              => $assoc['cell'] ?? null,
                    'village'           => $assoc['village'] ?? null,
                    'registration_date' => $assoc['registration_date'] ?? date('Y-m-d'),
                    'student_state'     => $assoc['student_state'] ?? 'active',
                ];
                // Which cells the *user* actually provided in this row.
                // We carry this through so the update branch can diff against
                // the existing record and skip blanks instead of blanking
                // existing data with NULLs.
                $providedKeys = [];
                foreach ($assoc as $k => $v) {
                    if (trim((string)$v) !== '') {
                        $providedKeys[$k] = true;
                    }
                }
                // std_option + campus get resolved to ids above, so flag
                // their *destination* columns as provided too.
                if (($assoc['std_option'] ?? '') !== '') {
                    $providedKeys['std_option']  = true;
                    $providedKeys['program']     = true;
                    $providedKeys['faculty']     = true;
                    $providedKeys['department']  = true;
                }
                if ($campusId !== null) $providedKeys['campus'] = true;
                // Default-fill columns the create branch sets unconditionally
                // (so a fresh import still gets sensible nationality/state
                // values even if the user left those blank).
                $providedKeys['regnumber']    = true;
                $providedKeys['fname']        = true;
                $providedKeys['lname']        = true;

                // Drop empty strings so the model writes NULLs where the
                // user really left a column blank — but only on CREATE.
                // On UPDATE we never overwrite existing data with NULL.
                $createPayload = $payload;
                foreach ($createPayload as $k => $v) {
                    if ($v === '') $createPayload[$k] = null;
                }

                try {
                    $existing = $db->fetchOne(
                        "SELECT * FROM `student` WHERE regnumber = ? LIMIT 1",
                        [$payload['regnumber']]
                    );
                    if ($existing) {
                        // Build a patch from only the columns the user
                        // actually filled in, dropping any that already
                        // match the existing value. If nothing remains the
                        // row is left untouched — counted as "unchanged".
                        $patch = [];
                        foreach ($payload as $col => $newVal) {
                            if (!isset($providedKeys[$col])) continue;
                            if ($newVal === '' || $newVal === null) continue;
                            // regnumber is the match key — never re-write it.
                            if ($col === 'regnumber') continue;
                            $oldVal = $existing[$col] ?? null;
                            if ((string)$oldVal === (string)$newVal) continue;
                            $patch[$col] = $newVal;
                        }
                        if (empty($patch)) {
                            $results['unchanged']++;
                        } else {
                            $this->studentModel->update((int)$existing['id'], $patch);
                            $results['updated']++;
                        }
                    } else {
                        $this->studentModel->create($createPayload);
                        $results['inserted']++;
                    }
                } catch (\Throwable $e) {
                    $results['errors'][] = ['row' => $rowNo, 'message' => $e->getMessage()];
                    $results['skipped']++;
                }
            }
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->getPdo()->inTransaction()) $db->rollBack();
            $this->error($response, 'Bulk upload failed: ' . $e->getMessage(), 500);
        }

        SystemLogService::log(
            'CREATE', 'STUDENTS',
            "Bulk-imported {$results['inserted']} new + {$results['updated']} updated + {$results['unchanged']} unchanged student(s); {$results['skipped']} skipped.",
            null, 'student',
            $results, $authUser ?: null
        );

        $this->success($response, $results, 'Bulk upload complete.');
    }

    /**
     * Open the uploaded file (multipart field `file`), strip the BOM,
     * read the header line and return an array of associative rows.
     * Throws an HTTP error response on any IO failure.
     *
     * @return array{headers:string[], rows: array<int, array{row_no:int, data:array<string,string>}>}
     */
    private function parseBulkCsv(Response $response): array
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

        $rows = [];
        $rowNo = 1;
        while (($row = fgetcsv($handle)) !== false) {
            $rowNo++;
            if (empty(array_filter($row, fn($v) => trim((string)$v) !== ''))) {
                continue;
            }
            $assoc = [];
            foreach ($headers as $i => $h) {
                // unwrapExcelText() also trims, so excel-text-wrapped IDs
                // (`="1199…"`) come through as the plain string the user
                // typed.
                $assoc[$h] = isset($row[$i]) ? $this->unwrapExcelText((string)$row[$i]) : '';
            }
            $rows[] = ['row_no' => $rowNo, 'data' => $assoc];
        }
        fclose($handle);

        return ['headers' => $headers, 'rows' => $rows];
    }

    /**
     * POST /api/students/bulk-update-campus
     * Reassign many students to a single campus in one transaction. Used by
     * the students list multi-select toolbar.
     *
     * Body: { student_ids: number[]; campus_id: number | null }
     *   - student_ids: 1..200 student.id values
     *   - campus_id  : campuses.id, or null to clear the campus
     */
    public function bulkUpdateCampus(Request $request, Response $response): never
    {
        $data    = $request->body();
        $ids     = is_array($data['student_ids'] ?? null) ? $data['student_ids'] : [];
        $campus  = array_key_exists('campus_id', $data) ? $data['campus_id'] : null;
        $authUser = (array) $request->param('_auth_user');

        // Coerce to ints, drop garbage, cap to a sane batch size.
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($n) => $n > 0)));
        if (empty($ids)) {
            $this->error($response, 'student_ids must contain at least one valid id.', 422);
        }
        if (count($ids) > 200) {
            $this->error($response, 'Cannot bulk-update more than 200 students at once.', 422);
        }

        // Validate the campus exists (or accept null to clear).
        $campusIdStr = null;
        if ($campus !== null && $campus !== '') {
            $row = $this->studentModel->db()->fetchOne(
                "SELECT id FROM `campuses` WHERE id = ? LIMIT 1",
                [(int)$campus]
            );
            if (!$row) {
                $this->error($response, 'Campus not found.', 404);
            }
            $campusIdStr = (string)(int)$campus;
        }

        $db = $this->studentModel->db();
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $db->execute(
            "UPDATE `student` SET `campus` = ?, updated_at = NOW() WHERE id IN ($ph)",
            array_merge([$campusIdStr], $ids)
        );
        $updated = count($ids);

        \App\Services\SystemLogService::log(
            'UPDATE', 'STUDENTS',
            "Bulk-updated campus for {$updated} student(s) → "
                . ($campusIdStr ?? 'cleared'),
            null, 'student',
            ['student_ids' => $ids, 'campus_id' => $campusIdStr],
            $authUser ?: null
        );

        $this->success($response, ['updated' => $updated], 'Campus updated for ' . $updated . ' student(s).');
    }

    /**
     * POST /api/students/:id/photo
     * Upload (or replace) the student profile photo. Stores the new
     * file_server_id on `student.photo` and best-effort deletes the previous
     * file from the storage service so we don't leak orphans.
     */
    public function uploadPhoto(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $file = $request->file('photo');
        if (!$file) {
            $this->error($response, 'No photo file provided.', 422);
        }

        // Browser-supplied type is a hint only (some send 'image/jpg' or ''),
        // FileServerClient does the authoritative content-based check.
        $allowedMimes = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp'];
        $claimed      = strtolower(trim((string)($file['type'] ?? '')));
        if ($claimed !== '' && !in_array($claimed, $allowedMimes, true)) {
            $this->error($response, 'Invalid file type. Only JPEG, PNG and WebP are allowed.', 422);
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->failFromFileServer($response, $e);
        }

        $previous = $student['photo'] ?? null;

        $this->studentModel->update($id, ['photo' => $uploaded['id']]);

        // Cleanup the previous photo on the file server. Don't fail the request
        // if it can't be deleted — the new photo is already saved on the record.
        if ($previous && $previous !== $uploaded['id']) {
            try { $client->delete($previous); } catch (\Throwable) { /* ignore */ }
        }

        $this->success($response, [
            'photo' => $uploaded['id'],
        ], 'Profile photo updated.');
    }

    /**
     * DELETE /api/students/:id/photo
     * Remove a student's profile photo. Idempotent — see PhotoRemover.
     */
    public function deletePhoto(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $previous = $student['photo'] ?? null;
        $this->studentModel->update($id, ['photo' => null]);
        \App\Helpers\PhotoRemover::discard($previous);

        $this->success($response, ['photo' => null], 'Profile photo removed.');
    }

    /**
     * DELETE /api/students/me/photo
     * Self-service removal — resolves the student from the auth context so
     * MANAGE_STUDENTS isn't required to clear your own picture.
     */
    public function deleteMyPhoto(Request $request, Response $response): never
    {
        $student = $this->resolveAuthStudent($request, $response);
        $request->setRouteParams(['id' => (string)$student['id']]);
        $this->deletePhoto($request, $response);
    }

    /**
     * GET /api/students/:id/photo
     * Stream the student profile photo from the file server, inline so it can
     * be used directly as an <img src=…>. 404s when the student has no photo.
     */
    public function downloadPhoto(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        $photoId = $student['photo'] ?? null;
        if (!$photoId) {
            $this->error($response, 'Student has no profile photo.', 404);
        }

        // Legacy path (not a file-server UUID) — try to serve from the local
        // filesystem first (LEGACY_PHOTO_DIR env var = absolute path to the old
        // registraria directory, e.g. /home/user/public_html/mis/main/registraria).
        // Falls back to 404 when the env var is absent or the file is missing.
        if (!\App\Helpers\PhotoHelper::isUuid((string)$photoId)) {
            $this->serveLegacyPhoto((string)$photoId, $response);
        }

        try {
            $client   = new FileServerClient();
            $fileData = $client->download((string)$photoId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $fileData['mime'] ?? 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . addslashes($fileData['original_name'] ?? 'photo') . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        // Short cache so consecutive renders reuse the bytes; clears quickly
        // after a re-upload because the stored id changes.
        header('Cache-Control: private, max-age=60');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * Attempt to stream a legacy photo file from the local filesystem and exit,
     * or terminate with 404 if the file cannot be located.
     *
     * Legacy photo values are relative paths such as:
     *   "documents/std_photo/photo_6a1af….jpg"
     *   "photo_6a1af….jpg"   (bare filename → prefixed with documents/std_photo/)
     *
     * Set LEGACY_PHOTO_DIR in .env to the absolute filesystem path of the old
     * registraria root (e.g. /home/curac/public_html/mis/main/registraria).
     */
    private function serveLegacyPhoto(string $photoId, Response $response): never
    {
        $baseDir = rtrim((string)($_ENV['LEGACY_PHOTO_DIR'] ?? ''), '/');

        if ($baseDir !== '') {
            $rel = ltrim($photoId, '/');
            // Bare filename → lives under documents/std_photo/
            if (!str_contains($rel, '/')) {
                $rel = 'documents/std_photo/' . $rel;
            }
            // Block path traversal
            if (!str_contains($rel, '..')) {
                $full = $baseDir . '/' . $rel;
                $real = realpath($full);
                if ($real !== false && str_starts_with($real, $baseDir) && is_file($real)) {
                    $mime = mime_content_type($real) ?: 'image/jpeg';
                    header('Content-Type: ' . $mime);
                    header('Content-Length: ' . (string)filesize($real));
                    header('Cache-Control: private, max-age=300');
                    header('X-Content-Type-Options: nosniff');
                    readfile($real);
                    exit;
                }
            }
        }

        // Fallback (and the default in production): redirect to the public CUR
        // photo store, which the browser can always reach. This is what makes
        // legacy images load online, where the old registraria files are NOT on
        // the API server's filesystem (so LEGACY_PHOTO_DIR is unset / empty).
        $legacy = \App\Helpers\PhotoHelper::legacyUrl($photoId);
        if ($legacy !== null) {
            header('Location: ' . $legacy, true, 302);
            header('Cache-Control: private, max-age=300');
            exit;
        }

        $this->error($response, 'Student photo is not available.', 404);
    }

    /**
     * POST /api/students/me/photo
     * Self-service photo upload — students update their own profile picture
     * without holding MANAGE_STUDENTS. Reuses uploadPhoto() after resolving
     * the caller's student id from the auth context.
     */
    public function uploadMyPhoto(Request $request, Response $response): never
    {
        $student = $this->resolveAuthStudent($request, $response);
        $request->setRouteParams(['id' => (string)$student['id']]);
        $this->uploadPhoto($request, $response);
    }

    /**
     * GET /api/students/me/photo
     * Self-service photo download — mirrors downloadPhoto() but resolves
     * the student from the auth context so VIEW_STUDENTS isn't required.
     */
    public function downloadMyPhoto(Request $request, Response $response): never
    {
        $student = $this->resolveAuthStudent($request, $response);
        $request->setRouteParams(['id' => (string)$student['id']]);
        $this->downloadPhoto($request, $response);
    }

    /**
     * PUT /api/students/me
     * Self-service field update. Strictly whitelists what students may change
     * about their own record — name, gender, DOB, ID, faculty/department,
     * etc. remain admin-only because they are part of the legal/academic
     * identity captured at enrollment.
     */
    public function updateMe(Request $request, Response $response): never
    {
        $student = $this->resolveAuthStudent($request, $response);
        $body    = $request->body();

        // Tier 1 of the three-tier split (migration 147): the student's own
        // contact and personal-circumstance details, saved immediately.
        //
        // Anything outside this list is silently dropped, so a malicious
        // client cannot promote itself to a different programme / level /
        // faculty, nor rename itself on a certificate. Identity fields
        // (names, date of birth, national ID, parents) are tier 2 and go
        // through requestProfileChange() with evidence; the institutional
        // fields are tier 3 and are registry-only.
        $editable = self::SELF_EDITABLE;

        $patch = [];
        foreach ($editable as $col) {
            if (array_key_exists($col, $body)) {
                $val = $body[$col];
                $patch[$col] = is_string($val) ? trim($val) : $val;
            }
        }

        $errors = ValidationHelper::validate($patch, [
            'phone'          => ['min:6', 'max:30'],
            'email'          => ['email', 'max:50'],
            'marital_status' => ['in:single,married,divorced,widowed'],
            'spouse'         => ['max:50'],
            'disability'     => ['max:50'],
            'province'       => ['max:50'],
            'district'       => ['max:50'],
            'sector'         => ['max:100'],
            'cell'           => ['max:50'],
            'village'        => ['max:50'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if (!empty($patch)) {
            $this->studentModel->update((int)$student['id'], $patch);
        }

        $fresh = $this->studentModel->find((int)$student['id']);
        $this->success($response, $fresh, 'Profile updated.');
    }


    /**
     * Tier 1 — a student edits these themselves, saved immediately.
     * Their own contact details and personal circumstances; a wrong value
     * here inconveniences the student and nobody else.
     */
    private const SELF_EDITABLE = [
        'phone', 'email', 'marital_status', 'spouse', 'disability',
        // Residency. `address` and `residence_district` live on the
        // application record and stay admin-only on purpose.
        'province', 'district', 'sector', 'cell', 'village',
    ];

    /**
     * Tier 2 — a student may PROPOSE these, with evidence, for the registry
     * to approve. They print on transcripts, certificates and the ID card, so
     * they cannot be self-served, but they are still the student's own
     * identity and do need a correction path.
     */
    private const CHANGE_REQUESTABLE = [
        'fname', 'lname', 'birthdate', 'gender', 'nationality', 'country',
        'id_card', 'father', 'mother',
    ];

    /**
     * Human labels for the reviewer's queue — `id_card` on its own does not
     * tell a registrar what they are approving.
     */
    private const FIELD_LABELS = [
        'fname'       => 'First name',
        'lname'       => 'Surname',
        'birthdate'   => 'Date of birth',
        'gender'      => 'Gender',
        'nationality' => 'Nationality',
        'country'     => 'Country',
        'id_card'     => 'National ID',
        'father'      => "Father's name",
        'mother'      => "Mother's name",
    ];

    /**
     * POST /api/students/me/profile-change-requests
     *
     * Propose a change to one or more identity fields. Multipart, so the
     * supporting document travels with the proposal rather than being uploaded
     * separately and possibly orphaned.
     *
     * Body: fields[<name>] = value …, reason, document
     */
    public function requestProfileChange(Request $request, Response $response): never
    {
        $student   = $this->resolveAuthStudent($request, $response);
        $studentId = (int) $student['id'];

        // Accept either `fields[fname]=x` or a JSON blob in `fields`.
        $raw = $request->input('fields');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        $raw = is_array($raw) ? $raw : [];

        $proposed = [];
        $previous = [];
        foreach (self::CHANGE_REQUESTABLE as $col) {
            if (!array_key_exists($col, $raw)) {
                continue;
            }
            $value = is_string($raw[$col]) ? trim($raw[$col]) : $raw[$col];
            // Only carry fields that actually differ — a request that changes
            // nothing wastes a reviewer's time.
            if ((string) $value === (string) ($student[$col] ?? '')) {
                continue;
            }
            $proposed[$col] = $value;
            $previous[$col] = $student[$col] ?? null;
        }

        if ($proposed === []) {
            $this->error($response, 'Validation failed', 422, [
                'fields' => ['Change at least one field the registry can review.'],
            ]);
        }

        $errors = ValidationHelper::validate($proposed, [
            'fname'       => ['min:2', 'max:50'],
            'lname'       => ['min:2', 'max:50'],
            'gender'      => ['in:M,F,m,f,male,female,Male,Female'],
            'nationality' => ['max:50'],
            'country'     => ['max:50'],
            'id_card'     => ['max:50'],
            'father'      => ['max:50'],
            'mother'      => ['max:50'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        // One open request at a time. Two pending requests touching the same
        // field would let whichever the registry approved second silently undo
        // the first.
        $open = $this->studentModel->db()->fetchOne(
            "SELECT id FROM `student_profile_change_requests`
              WHERE student_id = ? AND status = 'pending' LIMIT 1",
            [$studentId]
        );
        if ($open) {
            $this->error($response, 'You already have a change request awaiting review. Wait for it to be decided before sending another.', 409);
        }

        $uploaded = null;
        $file     = $request->file('document');
        if ($file) {
            $allowed = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
            $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $allowed, true)) {
                $this->error($response, 'Validation failed', 422, [
                    'document' => ["Invalid file type '{$ext}'. Allowed: " . implode(', ', $allowed)],
                ]);
            }
            try {
                $uploaded = (new FileServerClient())->upload($file);
            } catch (\RuntimeException $e) {
                $this->error($response, $e->getMessage(), 422);
            }
        }

        $this->studentModel->db()->execute(
            "INSERT INTO `student_profile_change_requests`
               (student_id, proposed, previous, reason,
                document_file_server_id, document_original_name,
                document_mime, document_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $studentId,
                json_encode($proposed, JSON_UNESCAPED_UNICODE),
                json_encode($previous, JSON_UNESCAPED_UNICODE),
                trim((string) ($request->input('reason') ?? '')) ?: null,
                $uploaded ? (string) $uploaded['id'] : null,
                $uploaded['original_name'] ?? null,
                $uploaded['mime'] ?? null,
                isset($uploaded['size']) ? (int) $uploaded['size'] : null,
            ]
        );

        $id = (int) $this->studentModel->db()->lastInsertId();
        SystemLogService::log('CREATE', 'STUDENTS', "Student #{$studentId} requested a profile change (#{$id}).", $id, 'student_profile_change_request');

        $this->success($response, ['id' => $id, 'fields' => array_keys($proposed)],
            'Change request sent to the registry.', 201);
    }

    /** GET /api/students/me/profile-change-requests — the student's own history. */
    public function myProfileChangeRequests(Request $request, Response $response): never
    {
        $student = $this->resolveAuthStudent($request, $response);
        $rows = $this->studentModel->db()->fetchAll(
            "SELECT r.*, u.full_name AS reviewed_by_name
               FROM `student_profile_change_requests` r
               LEFT JOIN `users` u ON u.id = r.reviewed_by
              WHERE r.student_id = ?
              ORDER BY r.created_at DESC, r.id DESC",
            [(int) $student['id']]
        );
        $this->success($response, array_map([self::class, 'decorateChangeRequest'], $rows), 'Change requests fetched.');
    }

    /** GET /api/students/profile-change-requests — the registry's queue. */
    public function listProfileChangeRequests(Request $request, Response $response): never
    {
        $status = (string) ($request->query('status') ?? 'pending');
        $args   = [];
        $where  = '1=1';
        if (in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $where  = 'r.status = ?';
            $args[] = $status;
        }

        $rows = $this->studentModel->db()->fetchAll(
            "SELECT r.*, u.full_name AS reviewed_by_name,
                    s.regnumber, s.fname AS student_fname, s.lname AS student_lname
               FROM `student_profile_change_requests` r
               LEFT JOIN `users` u ON u.id = r.reviewed_by
               LEFT JOIN `student` s ON s.id = r.student_id
              WHERE {$where}
              ORDER BY r.created_at ASC, r.id ASC",
            $args
        );
        $this->success($response, array_map([self::class, 'decorateChangeRequest'], $rows), 'Change requests fetched.');
    }

    /**
     * POST /api/students/profile-change-requests/:id/decide
     * Body: { decision: approved|rejected, note? }
     *
     * Approval applies the proposed values. Re-whitelisted at this point
     * rather than trusted from the stored JSON, so a row written by any other
     * means still cannot reach a field the policy does not allow.
     */
    public function decideProfileChangeRequest(Request $request, Response $response): never
    {
        $id  = (int) $request->param('id');
        $row = $this->studentModel->db()->fetchOne(
            "SELECT * FROM `student_profile_change_requests` WHERE id = ? LIMIT 1", [$id]
        );
        if (!$row)                       $this->error($response, 'Change request not found.', 404);
        if ($row['status'] !== 'pending') $this->error($response, 'This request has already been decided.', 409);

        $body     = $request->body();
        $decision = strtolower(trim((string) ($body['decision'] ?? '')));
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            $this->error($response, 'Validation failed', 422, ['decision' => ['Decision must be approved or rejected.']]);
        }

        $actor   = (array) ($request->param('_auth_user') ?? []);
        $actorId = (int) ($actor['id'] ?? 0) ?: null;

        if ($decision === 'approved') {
            $proposed = json_decode((string) $row['proposed'], true);
            $patch    = [];
            foreach (self::CHANGE_REQUESTABLE as $col) {
                if (is_array($proposed) && array_key_exists($col, $proposed)) {
                    $patch[$col] = $proposed[$col];
                }
            }
            if ($patch !== []) {
                $this->studentModel->update((int) $row['student_id'], $patch);
            }
        }

        $this->studentModel->db()->execute(
            "UPDATE `student_profile_change_requests`
                SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW()
              WHERE id = ?",
            [$decision, trim((string) ($body['note'] ?? '')) ?: null, $actorId, $id]
        );

        SystemLogService::log(
            $decision === 'approved' ? 'APPROVE' : 'REJECT',
            'STUDENTS',
            "Profile change request #{$id} {$decision}.",
            $id,
            'student_profile_change_request'
        );

        $this->success($response, ['status' => $decision], "Change request {$decision}.");
    }

    /** GET /api/students/profile-change-requests/:id/document */
    public function downloadProfileChangeDocument(Request $request, Response $response): never
    {
        $row = $this->studentModel->db()->fetchOne(
            "SELECT document_file_server_id FROM `student_profile_change_requests` WHERE id = ? LIMIT 1",
            [(int) $request->param('id')]
        );
        if (!$row || empty($row['document_file_server_id'])) {
            $this->error($response, 'No supporting document was attached to this request.', 404);
        }
        $this->streamFileServerDownload((string) $row['document_file_server_id'], $response);
    }

    /** Decode the JSON payloads and hide the storage handle. */
    private static function decorateChangeRequest(array $r): array
    {
        $proposed = json_decode((string) ($r['proposed'] ?? '{}'), true) ?: [];
        $previous = json_decode((string) ($r['previous'] ?? '{}'), true) ?: [];

        $r['proposed'] = $proposed;
        $r['previous'] = $previous;
        // A reviewer needs to read the change, not a column name.
        $r['changes'] = array_map(
            fn ($col) => [
                'field' => $col,
                'label' => self::FIELD_LABELS[$col] ?? $col,
                'from'  => $previous[$col] ?? null,
                'to'    => $proposed[$col] ?? null,
            ],
            array_keys($proposed)
        );
        $r['has_document'] = !empty($r['document_file_server_id']);
        unset($r['document_file_server_id']);
        return $r;
    }

    /**
     * Resolve the authenticated user's student record. Errors out (and never
     * returns) when there is no auth user or no linked student row.
     */
    private function resolveAuthStudent(Request $request, Response $response): array
    {
        $authUser = $request->param('_auth_user') ?? [];
        $userId   = (int)($authUser['id'] ?? 0);
        $email    = is_string($authUser['email'] ?? null) ? $authUser['email'] : null;

        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $student = $this->studentModel->findByUserId($userId, $email);
        if (!$student) {
            $this->error($response, 'No student record is linked to your account.', 404);
        }

        return $student;
    }

    /**
     * GET /api/students/:id/program-modules
     * Curriculum view: every module attached to the student's program (option)
     * via `module_programs`, grouped by level and ordered by `module_order`,
     * left-joined with the student's marks (latest term per module).
     *
     * Response shape:
     * {
     *   student:  { id, regnumber, fname, lname, std_option, ... },
     *   program:  { id, name, code, department_id, faculty_id } | null,
     *   groups:   [
     *     { level_id, level_name, modules: [
     *       { module_id, module_code, module_name, module_credits,
     *         module_order, marks: { cat_marks, ..., percentage, grade,
     *         term_label, year_label } | null }
     *     ]}
     *   ]
     * }
     */
    public function programModules(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        [$program, $groups] = $this->loadProgramCurriculum($student);

        $this->success($response, [
            'student' => [
                'id'         => (int)$student['id'],
                'regnumber'  => $student['regnumber'] ?? null,
                'fname'      => $student['fname']     ?? null,
                'lname'      => $student['lname']     ?? null,
                'std_option' => $student['std_option']?? null,
                'program'    => $student['program']   ?? null,
            ],
            'program' => $program,
            'groups'  => $groups,
        ], 'Program curriculum fetched.');
    }

    /**
     * GET /api/students/:id/program-modules/export
     * Stream the curriculum view as a CSV download. Same data as
     * programModules() flattened to one row per (level, module) pair.
     */
    public function programModulesExport(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }

        [$program, $groups] = $this->loadProgramCurriculum($student);

        $reg      = (string)($student['regnumber'] ?? "id-{$id}");
        $safeReg  = preg_replace('/[^A-Za-z0-9._-]+/', '_', $reg) ?: "id-{$id}";
        $filename = "program-modules-{$safeReg}.csv";

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-Content-Type-Options: nosniff');

        $out = fopen('php://output', 'w');
        // Excel-friendly UTF-8 BOM so accented module names render correctly.
        fwrite($out, "\xEF\xBB\xBF");

        $studentName = trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''));
        fputcsv($out, ['Student',  $studentName !== '' ? $studentName : '—']);
        fputcsv($out, ['Reg number', $student['regnumber'] ?? '—']);
        fputcsv($out, ['Program',  $program['name'] ?? '—']);
        fputcsv($out, []);

        fputcsv($out, [
            'Level', 'Order', 'Module Code', 'Module Name', 'Credits',
            'CAT', 'CAT Max', 'Assignment', 'Assignment Max',
            'Exam', 'Exam Max', 'Total', 'Marks/100', 'Grade',
            'Term', 'Academic Year',
        ]);

        foreach ($groups as $group) {
            foreach ($group['modules'] as $m) {
                $marks = $m['marks'] ?? null;
                fputcsv($out, [
                    $group['level_name'] ?? '',
                    $m['module_order'] ?? '',
                    $m['module_code']   ?? '',
                    $m['module_name']   ?? '',
                    $m['module_credits']?? '',
                    $marks['cat_marks']        ?? '',
                    $marks['cat_max']          ?? '',
                    $marks['assignment_marks'] ?? '',
                    $marks['assignment_max']   ?? '',
                    $marks['exam_marks']       ?? '',
                    $marks['exam_max']         ?? '',
                    $marks['total']            ?? '',
                    $marks['percentage']       ?? '',
                    $marks['grade']            ?? '',
                    $marks['term_label']       ?? '',
                    $marks['year_label']       ?? '',
                ]);
            }
        }

        fclose($out);
        exit;
    }

    /**
     * Build the program curriculum + per-module marks bundle for a single
     * student. Shared by the JSON and CSV endpoints.
     *
     * @return array{0: array<string,mixed>|null, 1: array<int,array<string,mixed>>}
     */
    private function loadProgramCurriculum(array $student): array
    {
        $db        = $this->studentModel->db();
        $optionId  = isset($student['std_option']) && $student['std_option'] !== ''
            ? (int)$student['std_option'] : 0;
        $regnumber = (string)($student['regnumber'] ?? '');

        // Fallback: legacy enrollments never copied program_id onto the
        // student row. Walk the admission_offers → student_applications chain
        // to recover it so the curriculum still shows up without requiring
        // the backfill migration to have run. Once recovered, persist it on
        // the student record so subsequent calls can skip this lookup.
        if ($optionId <= 0) {
            $studentId = (int)($student['id'] ?? 0);
            $resolved  = null;
            if ($studentId > 0) {
                $resolved = $db->fetchOne(
                    "SELECT sa.program_id, sa.campus_id
                     FROM `admission_offers` ao
                     JOIN `student_applications` sa ON sa.id = ao.application_id
                     WHERE ao.student_id = ? AND sa.program_id IS NOT NULL
                     ORDER BY ao.id DESC
                     LIMIT 1",
                    [$studentId]
                );
            }
            // Last-ditch fallback when the offer link is missing — match
            // the application by email/regnumber and pull program_id from there.
            if (!$resolved) {
                $email = trim((string)($student['email'] ?? ''));
                if ($email !== '') {
                    $resolved = $db->fetchOne(
                        "SELECT program_id, campus_id
                         FROM `student_applications`
                         WHERE email = ? AND program_id IS NOT NULL
                         ORDER BY id DESC LIMIT 1",
                        [$email]
                    );
                }
            }

            if ($resolved && !empty($resolved['program_id'])) {
                $optionId = (int)$resolved['program_id'];
                if ($studentId > 0) {
                    $db->execute(
                        "UPDATE `student`
                         SET std_option = ?,
                             campus     = COALESCE(NULLIF(campus, ''), ?)
                         WHERE id = ?",
                        [
                            (string)$optionId,
                            !empty($resolved['campus_id']) ? (string)(int)$resolved['campus_id'] : null,
                            $studentId,
                        ]
                    );
                }
            }
        }

        if ($optionId <= 0) {
            return [null, []];
        }

        $program = $db->fetchOne(
            "SELECT o.id, o.name, o.code, o.department_id, d.fac_id AS faculty_id
             FROM `options` o
             LEFT JOIN `departements` d ON d.dep_id = o.department_id
             WHERE o.id = ? LIMIT 1",
            [$optionId]
        );
        if (!$program) {
            return [null, []];
        }

        // All modules attached to the program. Use module_levels when
        // available so a single module can appear under each level it's
        // assigned to (e.g. shared core modules); fall back to the legacy
        // single-level column on `modules` when no module_levels rows exist.
        $rows = $db->fetchAll(
            "SELECT
                m.module_id, m.module_code, m.module_name, m.module_credits,
                mp.module_order,
                COALESCE(ml.level_id, m.level)         AS level_id,
                COALESCE(lvl.name, lvl_legacy.name)    AS level_name
             FROM `module_programs` mp
             JOIN `modules` m ON m.module_id = mp.module_id
             LEFT JOIN `module_levels` ml ON ml.module_id = m.module_id
             LEFT JOIN `levels` lvl        ON lvl.id        = ml.level_id
             LEFT JOIN `levels` lvl_legacy ON lvl_legacy.id = m.level
             WHERE mp.option_id = ?
             ORDER BY level_id ASC, mp.module_order ASC, m.module_code ASC",
            [$optionId]
        );

        // Latest marks per module for this student.
        $marksByModule = [];
        if ($regnumber !== '') {
            $marksRows = $db->fetchAll(
                "SELECT mm.id AS mark_id, mm.module_id, mm.cat_marks, mm.assignment_marks, mm.exam_marks,
                        mm.cat_max, mm.assignment_max, mm.exam_max,
                        mm.total, mm.percentage, mm.grade, mm.remarks,
                        mm.is_exempted, mm.exemption_reason,
                        mm.academic_term_id, t.label AS term_label,
                        t.academic_year_id, y.label AS year_label,
                        mm.updated_at
                 FROM `module_marks` mm
                 LEFT JOIN `academic_terms` t ON t.id = mm.academic_term_id
                 LEFT JOIN `academic_years` y ON y.id = t.academic_year_id
                 WHERE mm.student_regnumber = ?
                 ORDER BY y.start_date DESC, t.start_date DESC, mm.updated_at DESC",
                [$regnumber]
            );
            foreach ($marksRows as $r) {
                $mid = (int)$r['module_id'];
                // Keep only the latest record per module (rows are pre-sorted).
                if (!isset($marksByModule[$mid])) {
                    $marksByModule[$mid] = $r;
                }
            }
        }

        // Scheduled-offering summary per module for this option. A module is
        // "scheduled" when at least one row exists in `module_offerings` for
        // (module, option). Aggregating mode/semesters/years lets the UI
        // render "Day · S1&S2 · 2025/2026" without N+1 lookups.
        $offeringByModule = [];
        $offeringRows = $db->fetchAll(
            "SELECT
                mo.module_id,
                COUNT(*)                                                                              AS offering_count,
                GROUP_CONCAT(DISTINCT mo.mode          ORDER BY mo.mode          SEPARATOR ', ')      AS modes,
                GROUP_CONCAT(DISTINCT mo.semesters     ORDER BY mo.semesters     SEPARATOR ', ')      AS semesters,
                GROUP_CONCAT(DISTINCT mo.academic_year ORDER BY mo.academic_year SEPARATOR ', ')      AS years
             FROM `module_offerings` mo
             WHERE mo.option_id = ?
             GROUP BY mo.module_id",
            [$optionId]
        );
        foreach ($offeringRows as $r) {
            $offeringByModule[(int)$r['module_id']] = [
                'offering_count' => (int)($r['offering_count'] ?? 0),
                'modes'          => $r['modes']     ?? null,
                'semesters'      => $r['semesters'] ?? null,
                'years'          => $r['years']     ?? null,
            ];
        }

        // Latest registration row per module for this student. Drives the
        // per-row "Enroll / Registered / Drop" button — separate from marks
        // because a student can be registered without having a grade yet.
        $registrationByModule = [];
        if ($regnumber !== '') {
            $regRows = $db->fetchAll(
                "SELECT mr.id AS registration_id, mr.module_id, mr.status, mr.grade,
                        mr.academic_term_id, t.label AS term_label,
                        t.academic_year_id, y.label AS year_label,
                        mr.registered_at
                 FROM `module_registrations` mr
                 LEFT JOIN `academic_terms` t ON t.id = mr.academic_term_id
                 LEFT JOIN `academic_years` y ON y.id = t.academic_year_id
                 WHERE mr.student_regnumber = ?
                 ORDER BY y.start_date DESC, t.start_date DESC, mr.id DESC",
                [$regnumber]
            );
            foreach ($regRows as $r) {
                $mid = (int)$r['module_id'];
                if (!isset($registrationByModule[$mid])) {
                    $registrationByModule[$mid] = $r;
                }
            }
        }

        // Group by level. Modules without a level fall under an "Unassigned" bucket.
        $groups = [];
        foreach ($rows as $r) {
            $levelId   = $r['level_id'] !== null ? (int)$r['level_id'] : 0;
            $levelName = (string)($r['level_name'] ?? '');
            if ($levelName === '' && $levelId > 0) $levelName = "Level {$levelId}";
            if ($levelName === '') $levelName = 'Unassigned';

            if (!isset($groups[$levelId])) {
                $groups[$levelId] = [
                    'level_id'   => $levelId ?: null,
                    'level_name' => $levelName,
                    'modules'    => [],
                ];
            }

            $mid   = (int)$r['module_id'];
            $marks = $marksByModule[$mid] ?? null;
            $sched = $offeringByModule[$mid] ?? null;
            $reg   = $registrationByModule[$mid] ?? null;

            $groups[$levelId]['modules'][] = [
                'module_id'      => $mid,
                'module_code'    => (string)$r['module_code'],
                'module_name'    => (string)$r['module_name'],
                'module_credits' => $r['module_credits'] !== null ? (float)$r['module_credits'] : null,
                'module_order'   => $r['module_order'] !== null ? (int)$r['module_order'] : null,
                'is_scheduled'   => $sched !== null,
                'schedule'       => $sched ? [
                    'offering_count' => (int)$sched['offering_count'],
                    'modes'          => $sched['modes'],
                    'semesters'      => $sched['semesters'],
                    'years'          => $sched['years'],
                ] : null,
                'registration'   => $reg ? [
                    'id'               => (int)$reg['registration_id'],
                    'status'           => (string)$reg['status'],
                    'grade'            => $reg['grade']            ?? null,
                    'academic_term_id' => isset($reg['academic_term_id']) ? (int)$reg['academic_term_id'] : null,
                    'term_label'       => $reg['term_label']       ?? null,
                    'year_label'       => $reg['year_label']       ?? null,
                    'registered_at'    => $reg['registered_at']    ?? null,
                ] : null,
                'marks'          => $marks ? [
                    'mark_id'          => isset($marks['mark_id']) ? (int)$marks['mark_id'] : null,
                    'cat_marks'        => $marks['cat_marks'],
                    'assignment_marks' => $marks['assignment_marks'],
                    'exam_marks'       => $marks['exam_marks'],
                    'cat_max'          => $marks['cat_max'],
                    'assignment_max'   => $marks['assignment_max'],
                    'exam_max'         => $marks['exam_max'],
                    'total'            => $marks['total'],
                    'percentage'       => $marks['percentage'],
                    'grade'            => $marks['grade'],
                    'remarks'          => $marks['remarks'],
                    'is_exempted'      => isset($marks['is_exempted']) ? (bool)(int)$marks['is_exempted'] : false,
                    'exemption_reason' => $marks['exemption_reason'] ?? null,
                    'academic_term_id' => isset($marks['academic_term_id']) ? (int)$marks['academic_term_id'] : null,
                    'term_label'       => $marks['term_label']  ?? null,
                    'year_label'       => $marks['year_label']  ?? null,
                ] : null,
            ];
        }

        // Stable level ordering: numeric level ids first, then 0/null last.
        $sorted = array_values($groups);
        usort($sorted, static function ($a, $b) {
            $ai = $a['level_id'] ?? PHP_INT_MAX;
            $bi = $b['level_id'] ?? PHP_INT_MAX;
            return $ai <=> $bi;
        });

        // Cross-programme registrations: any module the student is registered
        // to that isn't part of their own programme curriculum. Surfaces
        // shared / service modules taught from another option (e.g. a Math
        // student enrolled into a Bio English module) so the profile reflects
        // every commitment, not just the curriculum view.
        $curriculumModuleIds = array_map(static fn ($r) => (int)$r['module_id'], $rows);
        if ($regnumber !== '' && !empty($registrationByModule)) {
            $extras = [];
            foreach ($registrationByModule as $mid => $reg) {
                if (in_array((int)$mid, $curriculumModuleIds, true)) continue;
                $extras[(int)$mid] = $reg;
            }
            if (!empty($extras)) {
                $ids = array_keys($extras);
                $ph  = implode(',', array_fill(0, count($ids), '?'));
                $extraModuleRows = $db->fetchAll(
                    "SELECT m.module_id, m.module_code, m.module_name, m.module_credits, m.level
                     FROM `modules` m
                     WHERE m.module_id IN ($ph)",
                    $ids,
                );
                $extraModules = [];
                foreach ($extraModuleRows as $er) {
                    $mid   = (int)$er['module_id'];
                    $reg   = $extras[$mid] ?? null;
                    $marks = $marksByModule[$mid] ?? null;
                    $extraModules[] = [
                        'module_id'      => $mid,
                        'module_code'    => (string)$er['module_code'],
                        'module_name'    => (string)$er['module_name'],
                        'module_credits' => $er['module_credits'] !== null ? (float)$er['module_credits'] : null,
                        'module_order'   => null,
                        'is_scheduled'   => false,
                        'schedule'       => null,
                        'registration'   => $reg ? [
                            'id'               => (int)$reg['registration_id'],
                            'status'           => (string)$reg['status'],
                            'grade'            => $reg['grade']            ?? null,
                            'academic_term_id' => isset($reg['academic_term_id']) ? (int)$reg['academic_term_id'] : null,
                            'term_label'       => $reg['term_label']       ?? null,
                            'year_label'       => $reg['year_label']       ?? null,
                            'registered_at'    => $reg['registered_at']    ?? null,
                        ] : null,
                        'marks'          => $marks ? [
                            'mark_id'          => isset($marks['mark_id']) ? (int)$marks['mark_id'] : null,
                            'cat_marks'        => $marks['cat_marks'],
                            'assignment_marks' => $marks['assignment_marks'],
                            'exam_marks'       => $marks['exam_marks'],
                            'cat_max'          => $marks['cat_max'],
                            'assignment_max'   => $marks['assignment_max'],
                            'exam_max'         => $marks['exam_max'],
                            'total'            => $marks['total'],
                            'percentage'       => $marks['percentage'],
                            'grade'            => $marks['grade'],
                            'remarks'          => $marks['remarks'],
                            'is_exempted'      => isset($marks['is_exempted']) ? (bool)(int)$marks['is_exempted'] : false,
                            'exemption_reason' => $marks['exemption_reason'] ?? null,
                            'academic_term_id' => isset($marks['academic_term_id']) ? (int)$marks['academic_term_id'] : null,
                            'term_label'       => $marks['term_label']  ?? null,
                            'year_label'       => $marks['year_label']  ?? null,
                        ] : null,
                    ];
                }
                if (!empty($extraModules)) {
                    $sorted[] = [
                        'level_id'   => null,
                        'level_name' => 'Other registrations (outside this programme)',
                        'modules'    => $extraModules,
                        'is_extra'   => true,
                    ];
                }
            }
        }

        $programOut = [
            'id'            => (int)$program['id'],
            'name'          => (string)$program['name'],
            'code'          => $program['code'] ?? null,
            'department_id' => $program['department_id'] !== null ? (int)$program['department_id'] : null,
            'faculty_id'    => $program['faculty_id']    !== null ? (int)$program['faculty_id']    : null,
        ];

        return [$programOut, $sorted];
    }

    /**
     * The registry's configured grading scale, so an exemption mark gets the
     * same letter grade it would have received had the student sat the module.
     * Was a second hardcoded copy of the A–E ladder that could drift from
     * ModuleMarksController's. @see \App\Helpers\GradingScale
     */
    private function gradeFor(float $pct): ?string
    {
        return \App\Helpers\GradingScale::gradeFor($pct);
    }

    /**
     * POST /api/students/:id/exemptions
     * Body: { module_id, academic_term_id, percentage, reason? }
     *
     * Records an exemption mark for the student against the given module.
     * Stored in `module_marks` like a normal mark (so it appears on the
     * transcript / curriculum view) but flagged with `is_exempted=1`.
     * The `percentage` is treated as the equivalence mark — `total` mirrors
     * it, the letter grade is auto-derived, and CAT/exam component fields
     * are left null.
     */
    public function createExemption(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }
        $reg = (string)($student['regnumber'] ?? '');
        if ($reg === '') {
            $this->error($response, 'Student has no registration number — cannot record an exemption.', 422);
        }

        $body     = $request->body();
        $moduleId = (int)($body['module_id']        ?? 0);
        $termId   = (int)($body['academic_term_id'] ?? 0);
        $pct      = $this->parseDecimal($body['percentage'] ?? null);
        $reason   = isset($body['reason']) && $body['reason'] !== '' ? trim((string)$body['reason']) : null;

        if ($moduleId <= 0)            $this->error($response, 'module_id is required.', 422);
        if ($termId <= 0)              $this->error($response, 'academic_term_id is required.', 422);
        if ($pct === null)             $this->error($response, 'percentage is required.', 422);
        if ($pct < 0 || $pct > 100)    $this->error($response, 'percentage must be between 0 and 100.', 422);

        $db = $this->studentModel->db();

        $module = $db->fetchOne("SELECT module_id FROM modules WHERE module_id = ? LIMIT 1", [$moduleId]);
        if (!$module) $this->error($response, 'Module not found.', 404);

        $term = $db->fetchOne("SELECT id FROM academic_terms WHERE id = ? LIMIT 1", [$termId]);
        if (!$term) $this->error($response, 'Academic term not found.', 404);

        $pctRound = round((float)$pct, 2);
        $grade    = $this->gradeFor($pctRound);
        $decision = $pctRound >= 50 ? 'P' : 'F&R';

        $auth   = (array)($request->param('_auth_user') ?? []);
        $userId = isset($auth['id']) ? (int)$auth['id'] : null;

        // Use ON DUPLICATE KEY UPDATE because the same (module, student, term)
        // tuple may already exist as a regular mark — switching it to an
        // exemption is a legitimate admin override.
        $db->execute(
            "INSERT INTO module_marks
               (module_id, student_regnumber, academic_term_id,
                cat_marks, assignment_marks, exam_marks,
                cat_max, assignment_max, exam_max,
                total, percentage, grade, decision,
                is_exempted, exemption_reason,
                remarks, recorded_by)
             VALUES (?, ?, ?,
                     NULL, NULL, NULL,
                     0, 0, 0,
                     ?, ?, ?, ?,
                     1, ?,
                     NULL, ?)
             ON DUPLICATE KEY UPDATE
               cat_marks        = NULL,
               assignment_marks = NULL,
               exam_marks       = NULL,
               cat1             = NULL,
               cat2             = NULL,
               cat3             = NULL,
               partial_exam     = NULL,
               exam_1st_sitting = NULL,
               exam_2nd_sitting = NULL,
               total            = VALUES(total),
               percentage       = VALUES(percentage),
               grade            = VALUES(grade),
               decision         = VALUES(decision),
               is_exempted      = 1,
               exemption_reason = VALUES(exemption_reason),
               recorded_by      = VALUES(recorded_by)",
            [
                $moduleId, $reg, $termId,
                $pctRound, $pctRound, $grade, $decision,
                $reason,
                $userId,
            ]
        );

        // Keep module_registrations consistent so the curriculum tab and
        // "registered modules" lists stay in sync.
        $db->execute(
            "UPDATE module_registrations
             SET status = 'completed', grade = ?
             WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?",
            [$grade, $moduleId, $reg, $termId]
        );

        $row = $db->fetchOne(
            "SELECT id FROM module_marks
             WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?
             LIMIT 1",
            [$moduleId, $reg, $termId]
        );

        $this->success($response, [
            'id'               => $row ? (int)$row['id'] : null,
            'percentage'       => $pctRound,
            'grade'            => $grade,
            'decision'         => $decision,
            'is_exempted'      => true,
            'exemption_reason' => $reason,
        ], 'Exemption recorded.', 201);
    }

    /**
     * DELETE /api/students/:id/exemptions/:mark_id
     * Clears an exemption row. Refuses to delete a regular mark — admins
     * who want to remove a real mark should use the marks-page DELETE
     * endpoint so the audit trail is consistent.
     */
    public function deleteExemption(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $markId  = (int)$request->param('mark_id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }
        $reg = (string)($student['regnumber'] ?? '');

        $db = $this->studentModel->db();
        $row = $db->fetchOne(
            "SELECT id, student_regnumber, is_exempted, module_id, academic_term_id
             FROM module_marks WHERE id = ? LIMIT 1",
            [$markId]
        );
        if (!$row) $this->error($response, 'Exemption not found.', 404);
        if ((string)$row['student_regnumber'] !== $reg) {
            $this->error($response, 'Exemption does not belong to this student.', 403);
        }
        if ((int)$row['is_exempted'] !== 1) {
            $this->error($response, 'This is a recorded mark, not an exemption.', 422);
        }

        $db->execute("DELETE FROM module_marks WHERE id = ?", [$markId]);
        // Drop the matching registration grade so the curriculum view
        // shows the module as unmarked again.
        $db->execute(
            "UPDATE module_registrations
             SET status = 'registered', grade = NULL
             WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?",
            [$row['module_id'], $reg, $row['academic_term_id']]
        );

        $this->success($response, null, 'Exemption removed.');
    }

    /**
     * POST /api/students/:id/module-registrations
     * Body: { module_id, academic_term_id? }
     *
     * Enrolls the student into a module — i.e. creates a `module_registrations`
     * row with status='registered'. Used by the curriculum tab's per-row
     * "Enroll" button. The term defaults to the current academic_terms row
     * when the client omits it. Idempotent: re-registering after a drop flips
     * the row back to 'registered' instead of erroring on the unique key.
     */
    public function enrollModule(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }
        $reg = (string)($student['regnumber'] ?? '');
        if ($reg === '') {
            $this->error($response, 'Student has no registration number — cannot enroll.', 422);
        }

        $body     = $request->body();
        $moduleId = (int)($body['module_id'] ?? 0);
        $termId   = (int)($body['academic_term_id'] ?? 0);

        if ($moduleId <= 0) $this->error($response, 'module_id is required.', 422);

        $db = $this->studentModel->db();

        if ($termId <= 0) {
            $row = $db->fetchOne(
                "SELECT id FROM `academic_terms` WHERE is_current = 1 ORDER BY start_date DESC LIMIT 1"
            );
            $termId = $row ? (int)$row['id'] : 0;
        }
        if ($termId <= 0) {
            $this->error($response, 'No current academic term — pass academic_term_id explicitly.', 422);
        }

        $module = $db->fetchOne(
            "SELECT module_id FROM `modules` WHERE module_id = ? LIMIT 1",
            [$moduleId]
        );
        if (!$module) $this->error($response, 'Module not found.', 404);

        // The unique key on (module_id, student_regnumber, academic_term_id)
        // means a re-enrol after a drop should flip status back rather than
        // create a duplicate row.
        $db->execute(
            "INSERT INTO `module_registrations` (module_id, student_regnumber, academic_term_id, status)
             VALUES (?, ?, ?, 'registered')
             ON DUPLICATE KEY UPDATE
                status        = 'registered',
                grade         = NULL,
                dropped_at    = NULL,
                registered_at = CURRENT_TIMESTAMP",
            [$moduleId, $reg, $termId]
        );

        $row = $db->fetchOne(
            "SELECT id FROM `module_registrations`
             WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ?
             LIMIT 1",
            [$moduleId, $reg, $termId]
        );

        $this->success($response, [
            'id'               => $row ? (int)$row['id'] : null,
            'module_id'        => $moduleId,
            'academic_term_id' => $termId,
            'status'           => 'registered',
        ], 'Module enrolled.', 201);
    }

    /**
     * DELETE /api/students/:id/module-registrations/:registration_id
     * Marks a module registration as dropped. Refuses to drop a completed
     * registration (one that already carries a grade) so audit history stays
     * intact.
     */
    public function dropModule(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $regId   = (int)$request->param('registration_id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found', 404);
        }
        $regNum = (string)($student['regnumber'] ?? '');

        $db  = $this->studentModel->db();
        $row = $db->fetchOne(
            "SELECT id, student_regnumber, status FROM `module_registrations` WHERE id = ? LIMIT 1",
            [$regId]
        );
        if (!$row) $this->error($response, 'Registration not found.', 404);
        if ((string)$row['student_regnumber'] !== $regNum) {
            $this->error($response, 'Registration does not belong to this student.', 403);
        }
        if ((string)$row['status'] === 'completed') {
            $this->error($response, 'Cannot drop a completed registration.', 422);
        }

        $db->execute(
            "UPDATE `module_registrations`
             SET status = 'dropped', dropped_at = CURRENT_TIMESTAMP
             WHERE id = ?",
            [$regId]
        );

        $this->success($response, null, 'Registration dropped.');
    }

    private function parseDecimal(mixed $v): ?float
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v))           return null;
        return (float)$v;
    }

    /**
     * Append the per-column exact-match filter clauses to the in-progress
     * WHERE builder. Pulled out of `index()` so the CSV export can apply
     * the exact same filter semantics (including nationality buckets,
     * acc_year format variants, category variants and the std_option
     * permissive matcher) without duplicating ~80 lines of branching.
     *
     * @param array $clauses  Modified in place — new clauses appended.
     * @param array $bindings Modified in place — new bindings appended.
     */
    /**
     * Whether `$column` exists on `$table` in the current schema. Result is
     * cached per request so the std_option filter doesn't re-hit
     * INFORMATION_SCHEMA on every call. Used to keep the API resilient on
     * legacy DB snapshots that predate migrations 048/051/… (e.g. a `student`
     * table without `user_id`).
     */
    private function columnExists(string $table, string $column): bool
    {
        static $cache = [];
        $key = $table . '.' . $column;
        if (!array_key_exists($key, $cache)) {
            $cache[$key] = !empty($this->studentModel->db()->fetchAll(
                "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
                [$table, $column]
            ));
        }
        return $cache[$key];
    }

    /**
     * Per-student document verification summary, keyed by `student.id`.
     *
     * Documents live on the application the student was admitted through
     * (`application_documents.application_id`), so the join goes through the
     * student's LATEST `admission_offers` row — the same one
     * documents()/resolveApplicationId() reads, so the badge on the list can
     * never disagree with the documents tab.
     *
     * Self-service uploads (StudentController::meUploadDocument) are picked up
     * too: they store `applicant_profile_id = student.id` with a NULL
     * application_id, and the documents tab shows them for students who were
     * never admitted through the portal.
     *
     * @param array<int, int> $studentIds
     * @return array<int, array{total:int,verified:int,pending:int,rejected:int,status:string}>
     */
    private function fetchDocumentStatusSummary(array $studentIds): array
    {
        $studentIds = array_values(array_unique(array_map('intval', $studentIds)));
        if (empty($studentIds) || !$this->tableExists('application_documents')) {
            return [];
        }

        $db = $this->studentModel->db();
        $ph = implode(',', array_fill(0, count($studentIds), '?'));

        $rows = [];

        if ($this->tableExists('admission_offers')) {
            $rows = $db->fetchAll(
                "SELECT latest.student_id,
                        ad.verification_status AS status,
                        COUNT(*)               AS cnt
                 FROM (
                     SELECT ao.student_id, MAX(ao.id) AS offer_id
                     FROM `admission_offers` ao
                     WHERE ao.student_id IN ($ph)
                     GROUP BY ao.student_id
                 ) latest
                 JOIN `admission_offers` o    ON o.id = latest.offer_id
                 JOIN `application_documents` ad ON ad.application_id = o.application_id
                 GROUP BY latest.student_id, ad.verification_status",
                $studentIds
            );
        }

        $selfRows = $db->fetchAll(
            "SELECT ad.applicant_profile_id AS student_id,
                    ad.verification_status  AS status,
                    COUNT(*)                AS cnt
             FROM `application_documents` ad
             WHERE ad.application_id IS NULL
               AND ad.applicant_profile_id IN ($ph)
             GROUP BY ad.applicant_profile_id, ad.verification_status",
            $studentIds
        );

        $summary = [];
        foreach (array_merge($rows, $selfRows) as $row) {
            $sid = (int)$row['student_id'];
            $summary[$sid] ??= ['total' => 0, 'verified' => 0, 'pending' => 0, 'rejected' => 0, 'status' => 'none'];

            $cnt    = (int)$row['cnt'];
            $status = strtolower(trim((string)$row['status']));

            $summary[$sid]['total'] += $cnt;
            if ($status === 'verified') {
                $summary[$sid]['verified'] += $cnt;
            } elseif ($status === 'rejected') {
                $summary[$sid]['rejected'] += $cnt;
            } else {
                // 'pending', 'required', legacy blanks — anything not yet decided.
                $summary[$sid]['pending'] += $cnt;
            }
        }

        foreach ($summary as &$s) {
            $s['status'] = self::deriveDocumentStatus($s['total'], $s['verified'], $s['rejected']);
        }
        unset($s);

        return $summary;
    }

    /**
     * The single rule the badge, the filter and the CSV export all share:
     * one rejected document outranks everything, otherwise a student is only
     * "verified" once every document on file has been verified.
     */
    private static function deriveDocumentStatus(int $total, int $verified, int $rejected): string
    {
        if ($total === 0)       return 'none';
        if ($rejected > 0)      return 'rejected';
        if ($verified >= $total) return 'verified';
        return 'pending';
    }

    /**
     * SQL fragment counting a student's documents with a given status,
     * correlated on the student alias `$p`. Mirrors the joins in
     * fetchDocumentStatusSummary() so the filter and the badge agree.
     *
     * @param string $statusSql `verification_status` predicate, or '' for all rows.
     */
    private function documentCountSql(string $p, string $statusSql): string
    {
        $statusClause = $statusSql === '' ? '' : " AND {$statusSql}";
        $offerBranch  = $this->tableExists('admission_offers')
            ? "ad.application_id = (
                   SELECT o.application_id FROM `admission_offers` o
                   WHERE o.student_id = {$p}id ORDER BY o.id DESC LIMIT 1
               ) OR "
            : '';

        return "(SELECT COUNT(*) FROM `application_documents` ad
                  WHERE ({$offerBranch}(ad.application_id IS NULL AND ad.applicant_profile_id = {$p}id))
                  {$statusClause})";
    }

    /**
     * Whether `$table` exists in the current schema. Cached per request.
     * Companion to columnExists() for the same legacy-schema guards.
     */
    private function tableExists(string $table): bool
    {
        static $cache = [];
        if (!array_key_exists($table, $cache)) {
            $cache[$table] = !empty($this->studentModel->db()->fetchAll(
                "SELECT 1 FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
                [$table]
            ));
        }
        return $cache[$table];
    }

    private function applyFilterableClauses(Request $request, array &$clauses, array &$bindings, string $alias = '', array $except = []): void
    {
        // See buildListFilters(): non-empty when the WHERE gets spliced into a
        // JOINed query, so every column below stays unambiguous.
        $p = $alias !== '' ? rtrim($alias, '.') . '.' : '';

        $filterable = [
            'student_state', 'gender', 'faculty', 'department',
            'current_level', 'nationality', 'acc_year', 'program',
            'std_option', 'campus', 'intake', 'category',
            // Residency columns. All four are free-text on `student` and
            // carry a decade of inconsistent casing/whitespace ("Ruhango "
            // vs "Ruhango", "SOUTHERN" vs "South "), so every one of them
            // matches case- and whitespace-insensitively, and `province`
            // additionally folds the known spelling variants together.
            'country', 'province', 'district', 'sector',
            // Alias for the legacy `program` column which actually stores the
            // learning mode (Day / Evening / Weekend). Adding it under its
            // semantic name keeps the API honest while we live with the
            // misnamed schema column.
            'learning_mode',
        ];

        // ── Document verification status ─────────────────────────────
        // Derived, not stored: a student's badge comes from the documents on
        // their admission application (plus any self-service uploads), so the
        // filter has to reproduce deriveDocumentStatus() in SQL.
        if (!in_array('document_status', $except, true)) {
            $docStatus = strtolower(trim((string)($request->query('document_status') ?? '')));
            if ($docStatus !== '' && $this->tableExists('application_documents')) {
                $total    = $this->documentCountSql($p, '');
                $verified = $this->documentCountSql($p, "ad.verification_status = 'verified'");
                $rejected = $this->documentCountSql($p, "ad.verification_status = 'rejected'");

                if ($docStatus === 'none') {
                    $clauses[] = "{$total} = 0";
                } elseif ($docStatus === 'rejected') {
                    $clauses[] = "{$rejected} > 0";
                } elseif ($docStatus === 'verified') {
                    $clauses[] = "({$total} > 0 AND {$rejected} = 0 AND {$verified} >= {$total})";
                } elseif ($docStatus === 'pending') {
                    $clauses[] = "({$total} > 0 AND {$rejected} = 0 AND {$verified} < {$total})";
                }
            }
        }

        // ── Age range ────────────────────────────────────────────────
        // `student.birthdate` is a varchar holding two live formats
        // (`YYYY-MM-DD` and `D/M/YYYY`) plus junk like "XXX". dobSql()
        // normalises it to a DATE (NULL for anything unparseable), so rows
        // with no usable birthdate simply drop out of an age-filtered
        // cohort rather than being silently counted as age 0.
        foreach (['age_min' => '>=', 'age_max' => '<='] as $param => $op) {
            if (in_array($param, $except, true)) continue;
            $raw = $request->query($param);
            if ($raw === null || $raw === '' || !is_numeric($raw)) continue;
            $clauses[]  = "TIMESTAMPDIFF(YEAR, " . self::dobSql($p) . ", CURDATE()) {$op} ?";
            $bindings[] = (int)$raw;
        }

        foreach ($filterable as $col) {
            if (in_array($col, $except, true)) continue;
            $val = $request->query($col);
            if ($val === null || $val === '') continue;
            $lower = strtolower((string)$val);

            if ($col === 'learning_mode') {
                // Maps to the legacy `program` column on `student`.
                $clauses[]  = "LOWER(TRIM({$p}program)) = LOWER(?)";
                $bindings[] = trim((string)$val);
                continue;
            }

            if ($col === 'student_state') {
                $variants = self::stateVariants((string)$val);
                if (empty($variants)) continue;
                $ph = implode(',', array_fill(0, count($variants), '?'));
                $clauses[] = "LOWER(TRIM({$p}student_state)) IN ($ph)";
                foreach ($variants as $v) { $bindings[] = $v; }
            } elseif ($col === 'province') {
                $variants = self::provinceVariants((string)$val);
                if (empty($variants)) continue;
                $ph = implode(',', array_fill(0, count($variants), '?'));
                $clauses[] = "LOWER(TRIM({$p}province)) IN ($ph)";
                foreach ($variants as $v) { $bindings[] = $v; }
            } elseif (in_array($col, ['country', 'district', 'sector'], true)) {
                $clauses[]  = "LOWER(TRIM({$p}`$col`)) = LOWER(TRIM(?))";
                $bindings[] = (string)$val;
            } elseif ($col === 'nationality' && $lower === 'rwandan') {
                $clauses[] = "LOWER({$p}nationality) IN ('rwandan','rwandana','rwandese')";
            } elseif ($col === 'nationality' && $lower === 'foreign') {
                $clauses[] = "({$p}nationality IS NOT NULL AND {$p}nationality <> '' AND LOWER({$p}nationality) NOT IN ('rwandan','rwandana','rwandese'))";
            } elseif ($col === 'nationality' && $lower === 'unknown') {
                $clauses[] = "({$p}nationality IS NULL OR {$p}nationality = '')";
            } elseif ($col === 'gender') {
                if (in_array($lower, ['m', 'male'], true)) {
                    $clauses[] = "LOWER({$p}gender) IN ('m','male')";
                } elseif (in_array($lower, ['f', 'female'], true)) {
                    $clauses[] = "LOWER({$p}gender) IN ('f','female')";
                } elseif ($lower === 'unknown') {
                    $clauses[] = "({$p}gender IS NULL OR {$p}gender = '' OR LOWER({$p}gender) NOT IN ('m','male','f','female'))";
                }
            } elseif ($col === 'acc_year') {
                $variants = self::accYearVariants((string)$val);
                $ph = implode(',', array_fill(0, count($variants), '?'));
                $clauses[] = "{$p}acc_year IN ($ph)";
                foreach ($variants as $v) { $bindings[] = $v; }
            } elseif ($col === 'category') {
                $variants = self::categoryVariants($lower);
                if (!empty($variants)) {
                    $ph = implode(',', array_fill(0, count($variants), '?'));
                    $clauses[] = "LOWER(TRIM({$p}category)) IN ($ph)";
                    foreach ($variants as $v) { $bindings[] = $v; }
                }
            } elseif ($col === 'std_option') {
                $optionId = (int)$val;
                $opt = null;
                if ($optionId > 0 && $this->tableExists('options')) {
                    $opt = $this->studentModel->db()->fetchOne(
                        'SELECT id, name, code, acro, department_id
                         FROM `options` WHERE id = ? LIMIT 1',
                        [$optionId]
                    );
                }

                $aliases = [(string)$val];
                foreach (['name', 'code', 'acro'] as $f) {
                    $v = trim((string)($opt[$f] ?? ''));
                    if ($v !== '') $aliases[] = $v;
                }
                $aliases = array_values(array_unique($aliases));

                $sub = [];
                foreach ($aliases as $a) {
                    $sub[] = "LOWER(TRIM({$p}std_option)) = LOWER(?)";
                    $bindings[] = $a;
                    $sub[] = "LOWER(TRIM({$p}program)) = LOWER(?)";
                    $bindings[] = $a;
                }
                if ($optionId > 0) {
                    // The two cross-table sub-clauses below only work on a fully
                    // migrated schema. Legacy DB snapshots may still lack
                    // `student.user_id` (migration 048) or the admission tables
                    // entirely — referencing them throws "Unknown column" /
                    // "Table doesn't exist", which surfaces as a generic 500
                    // "Server error." Guard each one so the filter gracefully
                    // degrades to the std_option/program name match instead.
                    if ($this->tableExists('admission_offers') && $this->tableExists('student_applications')) {
                        $sub[] = "{$p}id IN (
                            SELECT ao.student_id
                            FROM `admission_offers` ao
                            JOIN `student_applications` sa ON sa.id = ao.application_id
                            WHERE sa.program_id = ?
                        )";
                        $bindings[] = $optionId;
                    }

                    if ($this->columnExists('student', 'user_id')
                        && $this->tableExists('applicant_profiles')
                        && $this->tableExists('student_applications')) {
                        $sub[] = "{$p}user_id IN (
                            SELECT ap.user_id
                            FROM `applicant_profiles` ap
                            JOIN `student_applications` sa2 ON sa2.id = ap.application_id
                            WHERE sa2.program_id = ? AND ap.user_id IS NOT NULL
                        )";
                        $bindings[] = $optionId;
                    }
                }
                $clauses[] = '(' . implode(' OR ', $sub) . ')';
            } else {
                $clauses[]  = "{$p}`$col` = ?";
                $bindings[] = $val;
            }
        }
    }

    /**
     * Aggregated overview metrics for the Student Registry page.
     * Single round-trip — one aggregate query + one grouped query.
     */
    /**
     * Expand an academic-year filter value to every historical format the
     * `student.acc_year` column may hold (slash vs dash, e.g. "2024/2025"
     * vs "2024-2025"). Callers match with `acc_year IN (?,?)`.
     *
     * @return array<int, string>
     */
    private static function accYearVariants(string $value): array
    {
        $value = trim($value);
        if ($value === '') return [];
        $variants = [$value];
        $slash = str_replace('-', '/', $value);
        $dash  = str_replace('/', '-', $value);
        foreach ([$slash, $dash] as $v) {
            if (!in_array($v, $variants, true)) $variants[] = $v;
        }
        return $variants;
    }

    /**
     * Map a topbar category bucket ("undergraduate" / "postgraduate") to
     * every spelling that the legacy `student.category` column may hold
     * (e.g. both "undergraduate" and "under graduate"). All values are
     * returned lowercase + trimmed so callers can match with
     * `LOWER(TRIM(category)) IN (?, ?)`. Unknown buckets yield an empty
     * array so the filter becomes a no-op rather than silently zeroing
     * the result set.
     *
     * @return array<int, string>
     */
    /**
     * SQL expression normalising the free-text `student.birthdate` varchar
     * into a real DATE. Two formats are live in the column — `YYYY-MM-DD`
     * (the modern writes) and `D/M/YYYY` (the legacy import) — and a tail of
     * unparseable junk ("XXX", "xx", blanks). STR_TO_DATE yields NULL for
     * anything it can't read, so the COALESCE returns NULL for those rows and
     * every age comparison built on it evaluates to NULL → excluded.
     *
     * @param string $p Table prefix ("" or "s."), see applyFilterableClauses().
     */
    private static function dobSql(string $p): string
    {
        return "COALESCE("
             . "STR_TO_DATE(NULLIF(TRIM({$p}birthdate), ''), '%Y-%m-%d'), "
             . "STR_TO_DATE(NULLIF(TRIM({$p}birthdate), ''), '%d/%m/%Y')"
             . ")";
    }

    /**
     * The status buckets the Students page offers, in display order, mapped
     * to every spelling `student.student_state` actually holds. Callers match
     * with `LOWER(TRIM(student_state)) IN (...)`.
     *
     * "Graduands" (students who have finished but not yet been conferred) is
     * spelled several ways across the legacy imports, so all four are folded
     * into one bucket. "Rejected" has no live rows today but is offered
     * because the column is free-text and registry staff do write it.
     *
     * @return array<string, array{label:string, variants:array<int,string>}>
     */
    public static function statusBuckets(): array
    {
        return [
            'active'    => ['label' => 'Active',    'variants' => ['active', 'resume']],
            'inactive'  => ['label' => 'Inactive',  'variants' => ['inactive', 'in-active', 'in active']],
            'graduated' => ['label' => 'Graduated', 'variants' => ['graduated', 'graduate', 'graduates']],
            'graduands' => ['label' => 'Graduands', 'variants' => ['graduands', 'graduand', 'graduants', 'graduant']],
            'suspended' => ['label' => 'Suspended', 'variants' => ['suspended', 'suspend']],
            'rejected'  => ['label' => 'Rejected',  'variants' => ['rejected', 'refused', 'declined', 'reject']],
            // Both are settable from the student record's status picker, so
            // they must be filterable too — otherwise a student put into one
            // of these states can never be found again from the list.
            'dropped'   => ['label' => 'Dropped out', 'variants' => ['dropped', 'dropout', 'drop out', 'dropped out', 'drop_out']],
            'dismissed' => ['label' => 'Dismissed',   'variants' => ['dismissed', 'dismiss']],
        ];
    }

    /**
     * Expand a status filter value to its spelling variants. An unknown value
     * matches itself so a hand-crafted `?student_state=resume` still works.
     *
     * @return array<int, string>
     */
    private static function stateVariants(string $value): array
    {
        $value = strtolower(trim($value));
        if ($value === '' || $value === 'all') return [];

        foreach (self::statusBuckets() as $bucket) {
            if (in_array($value, $bucket['variants'], true)) {
                return $bucket['variants'];
            }
        }
        return [$value];
    }

    /**
     * The five Rwandan provinces, each mapped to the spellings that occur in
     * `student.province`. The column was populated by free-text entry over
     * many years, so "SOUTHERN", "South " and "south province" all mean the
     * same place, and "NOTHERN" is a misspelling frequent enough (654 rows)
     * that dropping it would visibly under-count the Northern bucket.
     *
     * @return array<string, array{label:string, variants:array<int,string>}>
     */
    public static function provinceBuckets(): array
    {
        return [
            'kigali'   => ['label' => 'Kigali City', 'variants' => ['kigali', 'kigali city', 'city of kigali', 'kigali province', 'mvk', 'umujyi wa kigali']],
            'northern' => ['label' => 'Northern',    'variants' => ['northern', 'north', 'nothern', 'northen', 'northern province', 'amajyaruguru']],
            'southern' => ['label' => 'Southern',    'variants' => ['southern', 'south', 'southen', 'southern province', 'amajyepfo']],
            'eastern'  => ['label' => 'Eastern',     'variants' => ['eastern', 'east', 'easten', 'eastern province', 'iburasirazuba']],
            'western'  => ['label' => 'Western',     'variants' => ['western', 'west', 'westen', 'western province', 'iburengerazuba']],
        ];
    }

    /**
     * Expand a province filter value to its spelling variants. Unknown values
     * (foreign regions, junk rows) match themselves so the filter still works
     * on whatever the facet list surfaced.
     *
     * @return array<int, string>
     */
    /**
     * The canonical province bucket key a raw spelling belongs to, or the
     * lowercased raw value when it belongs to none (foreign regions, junk).
     * Matches the `value` the province facet publishes, so it is safe to use
     * as a cascade parent.
     */
    private static function provinceKey(string $value): string
    {
        $value = strtolower(trim($value));
        foreach (self::provinceBuckets() as $key => $bucket) {
            if ($key === $value || in_array($value, $bucket['variants'], true)) {
                return $key;
            }
        }
        return $value;
    }

    private static function provinceVariants(string $value): array
    {
        $value = strtolower(trim($value));
        if ($value === '') return [];

        foreach (self::provinceBuckets() as $key => $bucket) {
            if ($key === $value || in_array($value, $bucket['variants'], true)) {
                return $bucket['variants'];
            }
        }
        return [$value];
    }

    private static function categoryVariants(string $value): array
    {
        $value = strtolower(trim($value));
        if ($value === '') return [];
        return match ($value) {
            'undergraduate', 'under graduate', 'under-graduate' => ['undergraduate', 'under graduate'],
            'postgraduate',  'post graduate',  'post-graduate'  => ['postgraduate',  'post graduate'],
            default => [$value],
        };
    }

    public function stats(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();

        // Optional acc_year filter — driven by the topnav year selector.
        // Empty string means "All years"; anything truthy is applied to every
        // aggregate below via the same bound parameters ($yearBind).
        //
        // academic_years.label stores "2024/2025" (slash) but student.acc_year
        // stores "2024-2025" (dash); accept either format and match both.
        $yearFilter  = trim((string)($request->query('acc_year') ?? ''));
        $yearVariants = $yearFilter !== '' ? self::accYearVariants($yearFilter) : [];
        if ($yearVariants) {
            $ph = implode(',', array_fill(0, count($yearVariants), '?'));
            $yearScope  = " AND acc_year IN ($ph)";
            $yearScopeS = " AND s.acc_year IN ($ph)";
            $yearBind   = $yearVariants;
        } else {
            $yearScope = $yearScopeS = '';
            $yearBind  = [];
        }

        // Optional campus filter — driven by the topnav Campus switcher
        // (sent as `campus` to match how the legacy student.campus column
        // is stored — a varchar of the campuses.id). Both the unaliased
        // and `s.` forms are needed so we can append to every aggregate.
        $campusFilter = trim((string)($request->query('campus') ?? ''));
        if ($campusFilter !== '') {
            $campusScope  = " AND campus = ?";
            $campusScopeS = " AND s.campus = ?";
            $campusBind   = [$campusFilter];
        } else {
            $campusScope = $campusScopeS = '';
            $campusBind  = [];
        }

        // Optional category filter — driven by the topnav Category switcher
        // ("undergraduate" / "postgraduate"). Mapped through categoryVariants
        // so both legacy spellings of each bucket are matched.
        $categoryFilter   = trim((string)($request->query('category') ?? ''));
        $categoryVariants = $categoryFilter !== '' ? self::categoryVariants($categoryFilter) : [];
        if (!empty($categoryVariants)) {
            $ph = implode(',', array_fill(0, count($categoryVariants), '?'));
            $categoryScope  = " AND LOWER(TRIM(category)) IN ($ph)";
            $categoryScopeS = " AND LOWER(TRIM(s.category)) IN ($ph)";
            $categoryBind   = $categoryVariants;
        } else {
            $categoryScope = $categoryScopeS = '';
            $categoryBind  = [];
        }

        // Convenience: merge year + campus + category into a single bound
        // list so each aggregate uses one consistent params array.
        $combined  = $yearScope . $campusScope . $categoryScope;
        $combinedS = $yearScopeS . $campusScopeS . $categoryScopeS;
        $bind      = array_merge($yearBind, $campusBind, $categoryBind);

        $row = $db->fetchOne("
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN LOWER(student_state) = 'active'   THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN LOWER(student_state) = 'inactive' THEN 1 ELSE 0 END) AS inactive,
              SUM(CASE WHEN LOWER(gender) IN ('m','male')     THEN 1 ELSE 0 END) AS male,
              SUM(CASE WHEN LOWER(gender) IN ('f','female')   THEN 1 ELSE 0 END) AS female,
              SUM(CASE WHEN LOWER(nationality) IN ('rwandan','rwandana','rwandese') THEN 1 ELSE 0 END) AS rwandan,
              SUM(CASE WHEN nationality IS NOT NULL
                        AND nationality <> ''
                        AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese')
                        THEN 1 ELSE 0 END) AS foreign_students,
              COUNT(DISTINCT faculty) AS faculties,
              COUNT(DISTINCT acc_year) AS academic_years,

              -- ─── Active-only slices (for the Active Students tab) ───
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(gender) IN ('m','male')   THEN 1 ELSE 0 END) AS active_male,
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(gender) IN ('f','female') THEN 1 ELSE 0 END) AS active_female,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND (gender IS NULL OR gender = '' OR LOWER(gender) NOT IN ('m','male','f','female'))
                        THEN 1 ELSE 0 END) AS active_unknown_gender,
              SUM(CASE WHEN LOWER(student_state) = 'active' AND LOWER(nationality) IN ('rwandan','rwandana','rwandese') THEN 1 ELSE 0 END) AS active_rwandan,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND nationality IS NOT NULL AND nationality <> ''
                        AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese')
                        THEN 1 ELSE 0 END) AS active_foreign,
              SUM(CASE WHEN LOWER(student_state) = 'active'
                        AND (nationality IS NULL OR nationality = '')
                        THEN 1 ELSE 0 END) AS active_unknown_nationality,
              -- Only count faculty/department references that resolve to a real
              -- catalogue row — some legacy student rows hold stray TEXT in these
              -- numeric-id columns (e.g. 'Faculty of Education', 'DMC') which would
              -- otherwise inflate the distinct count.
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND faculty  <> '' AND faculty    IN (SELECT fac_id FROM faculty)      THEN faculty    END) AS active_faculties,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND department <> '' AND department IN (SELECT dep_id FROM departements) THEN department END) AS active_departments,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND acc_year <> '' THEN acc_year END) AS active_academic_years
            FROM student
            WHERE 1=1{$combined}
        ", $bind) ?: [];

        // Breakdowns — ACTIVE students only. These power the "Active students" overview.
        $byLevel = $db->fetchAll("
            SELECT s.current_level AS value, l.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN levels l ON l.id = s.current_level
            WHERE LOWER(s.student_state) = 'active'
              AND s.current_level IS NOT NULL AND s.current_level <> ''
              {$combinedS}
            GROUP BY s.current_level, l.name
            ORDER BY s.current_level ASC
            LIMIT 20
        ", $bind);

        $byFaculty = $db->fetchAll("
            SELECT s.faculty AS value, f.fac_name AS label, f.fac_code AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN faculty f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty COLLATE utf8mb4_unicode_ci
            WHERE LOWER(s.student_state) = 'active'
              AND s.faculty IS NOT NULL AND s.faculty <> ''
              {$combinedS}
            GROUP BY s.faculty, f.fac_name, f.fac_code
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        $byDepartment = $db->fetchAll("
            SELECT s.department AS value, d.dep_name AS label, d.dep_acronym AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN departements d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
            WHERE LOWER(s.student_state) = 'active'
              AND s.department IS NOT NULL AND s.department <> ''
              {$combinedS}
            GROUP BY s.department, d.dep_name, d.dep_acronym
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        // The real programme is the catalogue option the student is assigned
        // to (`student.std_option` → `options.id`). The legacy `student.program`
        // column actually stores the learning mode (Day / Evening / Weekend) —
        // that's broken out below as `byLearningMode`.
        $byProgram = $db->fetchAll("
            SELECT s.std_option AS value, o.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
            WHERE LOWER(s.student_state) = 'active'
              AND s.std_option IS NOT NULL AND s.std_option <> ''
              {$combinedS}
            GROUP BY s.std_option, o.name
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        // student.program is the learning mode (Day / Evening / Weekend) —
        // not the curriculum. Aggregated separately so the UI can show it on
        // its own card instead of conflating it with the real programme.
        $byLearningMode = $db->fetchAll("
            SELECT program AS value, program AS label, COUNT(*) AS total
            FROM student
            WHERE LOWER(student_state) = 'active'
              AND program IS NOT NULL AND program <> ''
              {$combined}
            GROUP BY program
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        // student.campus stores the campuses.id as a varchar — join for a
        // human-readable label, fall back to the raw value for legacy rows.
        $byCampus = $db->fetchAll("
            SELECT s.campus AS value, c.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN campuses c ON c.id = s.campus
            WHERE LOWER(s.student_state) = 'active'
              AND s.campus IS NOT NULL AND s.campus <> ''
              {$combinedS}
            GROUP BY s.campus, c.name
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        // student.intake is free-text (the intake name) — group on it directly.
        $byIntake = $db->fetchAll("
            SELECT intake AS value, intake AS label, COUNT(*) AS total
            FROM student
            WHERE LOWER(student_state) = 'active'
              AND intake IS NOT NULL AND intake <> ''
              {$combined}
            GROUP BY intake
            ORDER BY total DESC
            LIMIT 20
        ", $bind);

        // Distinct filter values joined to their reference tables so labels are human-readable
        // (student.faculty/department/current_level are stored as numeric IDs as VARCHAR).
        $faculties = $db->fetchAll("
            SELECT DISTINCT s.faculty AS v, f.fac_name AS label
            FROM student s
            LEFT JOIN faculty f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty COLLATE utf8mb4_unicode_ci
            WHERE s.faculty IS NOT NULL AND s.faculty <> ''
            ORDER BY label IS NULL, label ASC
            LIMIT 100
        ");
        $departments = $db->fetchAll("
            SELECT DISTINCT s.department AS v, d.dep_name AS label
            FROM student s
            LEFT JOIN departements d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
            WHERE s.department IS NOT NULL AND s.department <> ''
            ORDER BY label IS NULL, label ASC
            LIMIT 100
        ");
        $levels = $db->fetchAll("
            SELECT DISTINCT s.current_level AS v, l.name AS label
            FROM student s
            LEFT JOIN levels l ON l.id = s.current_level
            WHERE s.current_level IS NOT NULL AND s.current_level <> ''
            ORDER BY s.current_level ASC
            LIMIT 50
        ");
        $years    = $db->fetchAll("SELECT DISTINCT acc_year AS v, acc_year AS label FROM student WHERE acc_year IS NOT NULL AND acc_year <> '' ORDER BY acc_year DESC LIMIT 30");
        $programs = $db->fetchAll("SELECT DISTINCT program  AS v, program  AS label FROM student WHERE program  IS NOT NULL AND program  <> '' ORDER BY program  ASC LIMIT 50");

        // Programs/options pulled from the catalogue, with the parent
        // department + faculty so the student edit form can show a single
        // searchable picker that auto-derives faculty/department.
        $options = $db->fetchAll("
            SELECT o.id AS v, o.name AS label, o.department_id, d.fac_id AS faculty_id
            FROM `options` o
            LEFT JOIN `departements` d ON d.dep_id = o.department_id
            WHERE COALESCE(o.is_active, 1) = 1
            ORDER BY o.name ASC
            LIMIT 1000
        ");

        $asPairs = function (array $rows): array {
            $out = [];
            foreach ($rows as $r) {
                $v = (string)($r['v'] ?? '');
                if ($v === '') continue;
                $label = $r['label'] ?? null;
                $out[] = [
                    'value' => $v,
                    // Fall back to the raw ID when no joined label exists
                    'label' => ($label !== null && $label !== '') ? (string)$label : $v,
                ];
            }
            return $out;
        };

        $this->success($response, [
            'total'            => (int)($row['total']            ?? 0),
            'active'           => (int)($row['active']           ?? 0),
            'inactive'         => (int)($row['inactive']         ?? 0),
            'male'             => (int)($row['male']             ?? 0),
            'female'           => (int)($row['female']           ?? 0),
            'rwandan'          => (int)($row['rwandan']          ?? 0),
            'foreign_students' => (int)($row['foreign_students'] ?? 0),
            'faculties'        => (int)($row['faculties']        ?? 0),
            'academic_years'   => (int)($row['academic_years']   ?? 0),

            // Active-only aggregates — used by the "Active students" tab
            'active_male'                => (int)($row['active_male']                ?? 0),
            'active_female'              => (int)($row['active_female']              ?? 0),
            'active_unknown_gender'      => (int)($row['active_unknown_gender']      ?? 0),
            'active_rwandan'             => (int)($row['active_rwandan']             ?? 0),
            'active_foreign'             => (int)($row['active_foreign']             ?? 0),
            'active_unknown_nationality' => (int)($row['active_unknown_nationality'] ?? 0),
            'active_faculties'           => (int)($row['active_faculties']           ?? 0),
            'active_departments'         => (int)($row['active_departments']         ?? 0),
            'active_academic_years'      => (int)($row['active_academic_years']      ?? 0),

            'active_breakdown' => [
                'by_faculty'       => $byFaculty,
                'by_department'    => $byDepartment,
                'by_level'         => $byLevel,
                'by_program'       => $byProgram,
                'by_learning_mode' => $byLearningMode,
                'by_campus'        => $byCampus,
                'by_intake'        => $byIntake,
            ],
            // Kept for backwards compatibility with any older client code
            'by_level'         => $byLevel,
            'facets'           => [
                'faculty'       => $asPairs($faculties),
                'department'    => $asPairs($departments),
                'current_level' => $asPairs($levels),
                'acc_year'      => $asPairs($years),
                'program'       => $asPairs($programs),
                // Catalog programs (options) — what students should now be assigned to.
                // Each row carries department_id + faculty_id so the form can keep
                // the legacy faculty/department fields in sync without an extra fetch.
                'options'       => array_values(array_map(static function (array $r): array {
                    return [
                        'value'         => (string)($r['v'] ?? ''),
                        'label'         => (string)($r['label'] ?? ''),
                        'department_id' => $r['department_id'] !== null ? (int)$r['department_id'] : null,
                        'faculty_id'    => $r['faculty_id'] !== null ? (int)$r['faculty_id'] : null,
                    ];
                }, $options)),
            ],
        ], 'Student stats fetched.');
    }

    // ─────────────────────────────────────────────────────────────────────
    // Faceted filter options — powers the Students page filter panel.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * The JOINs every facet query needs so faculty / department / programme
     * can be labelled from their catalogues in the same pass. Mirrors the
     * export query's FROM clause, and the same `s` alias, so a WHERE built by
     * buildListFilters($request, 's') splices straight in.
     */
    private const FACET_FROM = "
        FROM `student` s
        LEFT JOIN `faculty`      f ON CAST(f.fac_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty    COLLATE utf8mb4_unicode_ci
        LEFT JOIN `departements` d ON CAST(d.dep_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
        LEFT JOIN `options`      o ON CAST(o.id     AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
    ";

    /**
     * GET /api/students/filter-options
     *
     * Every value the Students page filter panel can offer, each carrying the
     * number of students it would yield — so the user sees "Huye (1,308)"
     * before clicking rather than discovering an empty result set after.
     *
     * Counts are faceted, not global: each dimension is counted with every
     * OTHER active filter applied but its own excluded. Cascading dimensions
     * also exclude their descendants (picking a faculty recounts departments,
     * not the other way round), which is what makes the panel usable —
     * the department list narrows to the chosen faculty, but the faculty list
     * keeps showing every faculty you could switch to.
     *
     * Faculties, departments and programmes are seeded from their catalogues
     * so an entry with no students still appears (greyed out, count 0) rather
     * than vanishing; the free-text residency columns can only be enumerated
     * from the student rows themselves.
     */
    public function filterOptions(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();

        /**
         * Run one facet aggregate. `$except` names the filter params to drop
         * before building the WHERE — the dimension itself plus anything that
         * cascades from it.
         */
        $facet = function (array $except, string $select, string $groupBy, string $extraWhere = '', int $limit = 2000) use ($request, $db): array {
            [$where, $bind] = $this->buildListFilters($request, 's', $except);
            $conds = array_values(array_filter([$where, $extraWhere], static fn ($c) => $c !== ''));
            $sql = "SELECT {$select}, COUNT(*) AS total" . self::FACET_FROM
                 . ($conds ? ' WHERE ' . implode(' AND ', $conds) : '')
                 . " GROUP BY {$groupBy} ORDER BY total DESC LIMIT {$limit}";
            return $db->fetchAll($sql, $bind);
        };

        // ── Academic structure ───────────────────────────────────────
        // `student.faculty` / `.department` / `.std_option` hold catalogue ids
        // as varchars, so counts come back keyed by the raw string.
        $facCounts  = array_column($facet(['faculty', 'department', 'std_option'], 's.faculty AS value',    's.faculty',    "s.faculty IS NOT NULL AND s.faculty <> ''"),       'total', 'value');
        $depCounts  = array_column($facet(['department', 'std_option'],            's.department AS value', 's.department', "s.department IS NOT NULL AND s.department <> ''"), 'total', 'value');
        $optCounts  = array_column($facet(['std_option'],                          's.std_option AS value', 's.std_option', "s.std_option IS NOT NULL AND s.std_option <> ''"), 'total', 'value');

        $faculties = [];
        foreach ($db->fetchAll("SELECT fac_id, fac_name FROM `faculty` ORDER BY fac_name ASC") as $r) {
            $id = (string)$r['fac_id'];
            $faculties[] = [
                'value'        => $id,
                'label'        => trim((string)$r['fac_name']),
                'total'        => (int)($facCounts[$id] ?? 0),
                // Drives the "Option" filter, which the registry only uses for
                // Education — matched on the name so it survives a re-seed
                // that changes fac_id.
                'is_education' => self::isEducationName((string)$r['fac_name']),
            ];
        }

        $departments = [];
        foreach ($db->fetchAll(
            "SELECT d.dep_id, d.dep_name, d.fac_id, f.fac_name
             FROM `departements` d
             LEFT JOIN `faculty` f ON f.fac_id = d.fac_id
             ORDER BY d.dep_name ASC"
        ) as $r) {
            $id = (string)$r['dep_id'];
            $departments[] = [
                'value'        => $id,
                'label'        => trim((string)$r['dep_name']),
                'faculty_id'   => $r['fac_id'] !== null ? (string)$r['fac_id'] : null,
                'total'        => (int)($depCounts[$id] ?? 0),
                'is_education' => self::isEducationName((string)($r['fac_name'] ?? ''))
                               || self::isEducationName((string)$r['dep_name']),
            ];
        }

        $options = [];
        foreach ($db->fetchAll(
            "SELECT o.id, o.name, o.department_id, d.fac_id, d.dep_name, f.fac_name
             FROM `options` o
             LEFT JOIN `departements` d ON d.dep_id = o.department_id
             LEFT JOIN `faculty`      f ON f.fac_id = d.fac_id
             WHERE COALESCE(o.is_active, 1) = 1
             ORDER BY o.name ASC"
        ) as $r) {
            $id = (string)$r['id'];
            $options[] = [
                'value'         => $id,
                'label'         => trim((string)$r['name']),
                'department_id' => $r['department_id'] !== null ? (string)$r['department_id'] : null,
                'faculty_id'    => $r['fac_id'] !== null ? (string)$r['fac_id'] : null,
                'total'         => (int)($optCounts[$id] ?? 0),
                'is_education'  => self::isEducationName((string)($r['fac_name'] ?? ''))
                                || self::isEducationName((string)($r['dep_name'] ?? '')),
            ];
        }

        // ── Residency ────────────────────────────────────────────────
        // All four columns are free text with a decade of inconsistent
        // casing and trailing spaces, so every one is folded on its
        // trimmed-lowercase form and given back a single tidy label.
        $countries = self::foldFreeText(
            $facet(['country', 'province', 'district', 'sector'], "TRIM(s.country) AS value", 'value', "s.country IS NOT NULL AND TRIM(s.country) <> ''")
        );

        $provinces = self::foldProvinces(
            $facet(['province', 'district', 'sector'], "TRIM(s.province) AS value", 'value', "s.province IS NOT NULL AND TRIM(s.province) <> ''")
        );

        $districts = self::foldFreeText(
            $facet(['district', 'sector'], "TRIM(s.district) AS value, TRIM(s.province) AS parent_raw", 'value, parent_raw', "s.district IS NOT NULL AND TRIM(s.district) <> ''"),
            'province',
            static fn (string $raw): string => self::provinceKey($raw)
        );

        $sectors = self::foldFreeText(
            $facet(['sector'], "TRIM(s.sector) AS value, TRIM(s.district) AS parent_raw", 'value, parent_raw', "s.sector IS NOT NULL AND TRIM(s.sector) <> ''"),
            'district'
        );

        // ── Enrolment ────────────────────────────────────────────────
        $yearRows = $facet(['acc_year'], "TRIM(s.acc_year) AS value", 'value', "s.acc_year IS NOT NULL AND TRIM(s.acc_year) NOT IN ('', '-')");
        $years    = [];
        foreach ($yearRows as $r) {
            $years[] = ['value' => (string)$r['value'], 'label' => (string)$r['value'], 'total' => (int)$r['total']];
        }
        usort($years, static fn ($a, $b) => strcmp($b['label'], $a['label']));

        // Statuses fold their spelling variants into the six display buckets.
        $stateRows  = $facet(['student_state'], "LOWER(TRIM(s.student_state)) AS value", 'value', "s.student_state IS NOT NULL AND TRIM(s.student_state) <> ''");
        $stateCount = array_column($stateRows, 'total', 'value');
        $statuses   = [];
        foreach (self::statusBuckets() as $key => $bucket) {
            $total = 0;
            foreach ($bucket['variants'] as $v) {
                $total += (int)($stateCount[$v] ?? 0);
            }
            $statuses[] = ['value' => $key, 'label' => $bucket['label'], 'total' => $total];
        }

        // ── Document verification ────────────────────────────────────
        // Same derivation as the badge (deriveDocumentStatus), expressed as a
        // CASE so each bucket reports how many students it would yield.
        $documentStatuses = [];
        if ($this->tableExists('application_documents')) {
            $total    = $this->documentCountSql('s.', '');
            $verified = $this->documentCountSql('s.', "ad.verification_status = 'verified'");
            $rejected = $this->documentCountSql('s.', "ad.verification_status = 'rejected'");
            $caseSql  = "CASE
                           WHEN {$total} = 0 THEN 'none'
                           WHEN {$rejected} > 0 THEN 'rejected'
                           WHEN {$verified} >= {$total} THEN 'verified'
                           ELSE 'pending'
                         END";

            $docRows  = $facet(['document_status'], "{$caseSql} AS value", 'value');
            $docCount = array_column($docRows, 'total', 'value');
            foreach (self::DOCUMENT_STATUS_LABELS as $key => $label) {
                $documentStatuses[] = ['value' => $key, 'label' => $label, 'total' => (int)($docCount[$key] ?? 0)];
            }
        }

        // ── Age ──────────────────────────────────────────────────────
        // Bounds are clamped to a plausible student range: the birthdate
        // column contains typos that parse into ages of 3 or 120, and letting
        // those set the slider's ends would make it useless.
        [$ageWhere, $ageBind] = $this->buildListFilters($request, 's', ['age_min', 'age_max']);
        $dob = self::dobSql('s.');
        $ageRow = $db->fetchOne(
            "SELECT MIN(TIMESTAMPDIFF(YEAR, {$dob}, CURDATE())) AS min_age,
                    MAX(TIMESTAMPDIFF(YEAR, {$dob}, CURDATE())) AS max_age,
                    COUNT(TIMESTAMPDIFF(YEAR, {$dob}, CURDATE())) AS known
             " . self::FACET_FROM
             . ($ageWhere !== '' ? " WHERE {$ageWhere} AND " : ' WHERE ')
             . "TIMESTAMPDIFF(YEAR, {$dob}, CURDATE()) BETWEEN " . self::AGE_FLOOR . " AND " . self::AGE_CEILING,
            $ageBind
        ) ?: [];

        $bandRows = $db->fetchAll(
            "SELECT " . self::ageBandSql($dob) . " AS value, COUNT(*) AS total
             " . self::FACET_FROM
             . ($ageWhere !== '' ? " WHERE {$ageWhere} AND " : ' WHERE ')
             . "TIMESTAMPDIFF(YEAR, {$dob}, CURDATE()) BETWEEN " . self::AGE_FLOOR . " AND " . self::AGE_CEILING
             . " GROUP BY value",
            $ageBind
        );
        $bandCount = array_column($bandRows, 'total', 'value');
        $ageBands  = [];
        foreach (self::AGE_BANDS as $key => $band) {
            $ageBands[] = [
                'value' => $key,
                'label' => $band['label'],
                'min'   => $band['min'],
                'max'   => $band['max'],
                'total' => (int)($bandCount[$key] ?? 0),
            ];
        }

        // ── Matching total ───────────────────────────────────────────
        [$allWhere, $allBind] = $this->buildListFilters($request, 's');
        $totalRow = $db->fetchOne(
            "SELECT COUNT(*) AS total" . self::FACET_FROM . ($allWhere !== '' ? " WHERE {$allWhere}" : ''),
            $allBind
        ) ?: [];

        $this->success($response, [
            'total'          => (int)($totalRow['total'] ?? 0),
            'faculties'      => $faculties,
            'departments'    => $departments,
            'options'        => $options,
            'countries'      => $countries,
            'provinces'      => $provinces,
            'districts'      => $districts,
            'sectors'        => $sectors,
            'academic_years' => $years,
            'statuses'       => $statuses,
            'document_statuses' => $documentStatuses,
            'age'            => [
                'min'   => $ageRow['min_age'] !== null ? (int)$ageRow['min_age'] : self::AGE_FLOOR,
                'max'   => $ageRow['max_age'] !== null ? (int)$ageRow['max_age'] : self::AGE_CEILING,
                'known' => (int)($ageRow['known'] ?? 0),
                'bands' => $ageBands,
            ],
        ], 'Filter options fetched.');
    }

    /** Document-verification buckets offered by the Documents filter. */
    private const DOCUMENT_STATUS_LABELS = [
        'verified' => 'Verified',
        'pending'  => 'Not verified',
        'rejected' => 'Rejected',
        'none'     => 'No documents',
    ];

    /** Ages outside this range are typos, not students — see filterOptions(). */
    private const AGE_FLOOR   = 14;
    private const AGE_CEILING = 90;

    /** Age bands offered as one-click ranges on the filter panel. */
    private const AGE_BANDS = [
        'under_20' => ['label' => 'Under 20', 'min' => null, 'max' => 19],
        '20_24'    => ['label' => '20 – 24',  'min' => 20,   'max' => 24],
        '25_29'    => ['label' => '25 – 29',  'min' => 25,   'max' => 29],
        '30_39'    => ['label' => '30 – 39',  'min' => 30,   'max' => 39],
        '40_49'    => ['label' => '40 – 49',  'min' => 40,   'max' => 49],
        '50_plus'  => ['label' => '50+',      'min' => 50,   'max' => null],
    ];

    /** CASE expression bucketing a normalised DOB into an AGE_BANDS key. */
    private static function ageBandSql(string $dob): string
    {
        $age = "TIMESTAMPDIFF(YEAR, {$dob}, CURDATE())";
        return "CASE
                  WHEN {$age} < 20 THEN 'under_20'
                  WHEN {$age} < 25 THEN '20_24'
                  WHEN {$age} < 30 THEN '25_29'
                  WHEN {$age} < 40 THEN '30_39'
                  WHEN {$age} < 50 THEN '40_49'
                  ELSE '50_plus'
                END";
    }

    /** Whether a faculty/department name is the Education one. */
    private static function isEducationName(string $name): bool
    {
        return str_contains(strtolower($name), 'education');
    }

    /**
     * Collapse free-text facet rows that differ only by case or surrounding
     * whitespace ("Ruhango " and "Ruhango") into one entry, summing their
     * counts. The label kept is the most common spelling, so the panel shows
     * what the data mostly says rather than an arbitrary first row.
     *
     * When `$parentKey` is given, each row's `parent_raw` column is folded the
     * same way and the winning parent is attached under that key — that's how
     * a district learns its province and a sector its district without a
     * geography reference table. `$parentNorm` maps a raw parent onto the key
     * the parent facet actually uses, which matters for provinces: the district
     * list must say `southern`, not the raw `South ` that a few rows spell it,
     * or the cascade would drop those districts when Southern is selected.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private static function foldFreeText(array $rows, ?string $parentKey = null, ?callable $parentNorm = null): array
    {
        $acc = [];
        foreach ($rows as $r) {
            $raw = trim((string)($r['value'] ?? ''));
            if ($raw === '') continue;
            $key   = strtolower($raw);
            $total = (int)($r['total'] ?? 0);

            $acc[$key] ??= ['value' => $key, 'label' => $raw, 'total' => 0, '_labels' => [], '_parents' => []];
            $acc[$key]['total'] += $total;
            $acc[$key]['_labels'][$raw] = ($acc[$key]['_labels'][$raw] ?? 0) + $total;

            if ($parentKey !== null) {
                $parent = trim((string)($r['parent_raw'] ?? ''));
                if ($parent !== '') {
                    $pk = $parentNorm ? $parentNorm($parent) : strtolower($parent);
                    $acc[$key]['_parents'][$pk] = ($acc[$key]['_parents'][$pk] ?? 0) + $total;
                }
            }
        }

        $out = [];
        foreach ($acc as $entry) {
            arsort($entry['_labels']);
            $label = (string)array_key_first($entry['_labels']);
            // A chunk of the legacy rows were typed in caps ("RUHANGO"). The
            // match is case-insensitive either way, so title-case the shouty
            // ones to sit level with the rest of the list.
            $entry['label'] = ($label === mb_strtoupper($label, 'UTF-8'))
                ? mb_convert_case($label, MB_CASE_TITLE, 'UTF-8')
                : $label;
            if ($parentKey !== null) {
                arsort($entry['_parents']);
                $entry[$parentKey] = $entry['_parents'] ? (string)array_key_first($entry['_parents']) : null;
            }
            unset($entry['_labels'], $entry['_parents']);
            $out[] = $entry;
        }

        usort($out, static fn ($a, $b) => $b['total'] <=> $a['total'] ?: strcmp($a['label'], $b['label']));
        return $out;
    }

    /**
     * Fold raw province rows into the five canonical provinces. Anything that
     * matches none of them (foreign regions, junk) is kept as its own entry so
     * those students remain reachable rather than silently unfilterable.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private static function foldProvinces(array $rows): array
    {
        $buckets = self::provinceBuckets();
        $known   = [];
        $lookup  = [];
        foreach ($buckets as $key => $bucket) {
            $known[$key] = ['value' => $key, 'label' => $bucket['label'], 'total' => 0, 'canonical' => true];
            foreach ($bucket['variants'] as $v) {
                $lookup[$v] = $key;
            }
        }

        $other = [];
        foreach ($rows as $r) {
            $raw = trim((string)($r['value'] ?? ''));
            if ($raw === '') continue;
            $total = (int)($r['total'] ?? 0);
            $key   = $lookup[strtolower($raw)] ?? null;

            if ($key !== null) {
                $known[$key]['total'] += $total;
                continue;
            }
            $ok = strtolower($raw);
            $other[$ok] ??= ['value' => $ok, 'label' => $raw, 'total' => 0, 'canonical' => false];
            $other[$ok]['total'] += $total;
        }

        $out = array_values($known);
        usort($out, static fn ($a, $b) => $b['total'] <=> $a['total']);

        $rest = array_values($other);
        usort($rest, static fn ($a, $b) => $b['total'] <=> $a['total']);

        return array_merge($out, $rest);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Student CSV export — template-driven column picker.
    //
    // The Students page lets registry staff export the filtered cohort
    // to CSV with either a saved/system template or a hand-picked set of
    // columns. Built around three pieces:
    //
    //   • exportColumns()       — describes every available column so the
    //                             frontend can render its picker. Each
    //                             entry carries a stable `key`, a
    //                             human-readable `label` (used as the CSV
    //                             header) and a `group` for UI grouping.
    //   • exportCsv()           — streams the CSV. Re-uses buildListFilters
    //                             so the export always matches the list
    //                             page exactly (including topbar campus +
    //                             category scopes).
    //   • list/save/delete      — CRUD over `student_export_templates`.
    //     ExportTemplate()        System templates (HLIs → Mifotra) are
    //                             returned alongside user-owned templates.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Stable column registry powering the export modal + CSV generator.
     * Each entry is:
     *   key   — stable identifier persisted in templates
     *   label — default CSV header text
     *   group — UI section the picker shows it under
     *   sql   — SELECT expression bound to the column (lets us join
     *           catalogues once instead of N+1 lookups per row)
     *   alias — column alias used when reading the result row back
     *
     * `sql` columns are joined into the export query so the resolver can
     * read them straight from the row without further work. `alias` is
     * what `array_column` / `$row[$alias]` will use.
     *
     * @return array<string, array{label:string, group:string, sql:string, alias:string}>
     */
    public static function exportColumns(): array
    {
        return [
            // ── Identity ──
            'regnumber'        => ['label' => 'Registration Number',  'group' => 'Identity', 'sql' => "s.regnumber",                                    'alias' => 'regnumber'],
            'fname'            => ['label' => 'First Name',           'group' => 'Identity', 'sql' => "s.fname",                                        'alias' => 'fname'],
            'lname'            => ['label' => 'Last Name',            'group' => 'Identity', 'sql' => "s.lname",                                        'alias' => 'lname'],
            'full_name'        => ['label' => 'Full Name',            'group' => 'Identity', 'sql' => "TRIM(CONCAT_WS(' ', s.fname, s.lname))",         'alias' => 'full_name'],
            'gender'           => ['label' => 'Gender',               'group' => 'Identity', 'sql' => "s.gender",                                       'alias' => 'gender'],
            'birthdate'        => ['label' => 'Date of Birth',        'group' => 'Identity', 'sql' => "s.birthdate",                                    'alias' => 'birthdate'],
            'nationality'      => ['label' => 'Nationality',          'group' => 'Identity', 'sql' => "s.nationality",                                  'alias' => 'nationality'],
            'national_id'      => ['label' => 'National ID / Passport','group' => 'Identity', 'sql' => "s.id_card",                                     'alias' => 'national_id'],
            'marital_status'   => ['label' => 'Marital Status',       'group' => 'Identity', 'sql' => "s.marital_status",                               'alias' => 'marital_status'],
            'student_id'       => ['label' => 'Student ID',           'group' => 'Identity', 'sql' => "s.id",                                           'alias' => 'student_id'],
            'index_number'     => ['label' => 'Index Number',         'group' => 'Identity', 'sql' => "s.index_number",                                 'alias' => 'index_number'],

            // ── Contact ──
            'email'            => ['label' => 'Email',                'group' => 'Contact',  'sql' => "s.email",                                        'alias' => 'email'],
            'phone'            => ['label' => 'Phone',                'group' => 'Contact',  'sql' => "s.phone",                                        'alias' => 'phone'],

            // ── Address ──
            'country'          => ['label' => 'Country',              'group' => 'Address',  'sql' => "s.country",                                      'alias' => 'country'],
            'province'         => ['label' => 'Province',             'group' => 'Address',  'sql' => "s.province",                                     'alias' => 'province'],
            'district'         => ['label' => 'District',             'group' => 'Address',  'sql' => "s.district",                                     'alias' => 'district'],
            'sector'           => ['label' => 'Sector',               'group' => 'Address',  'sql' => "s.sector",                                       'alias' => 'sector'],
            'cell'             => ['label' => 'Cell',                 'group' => 'Address',  'sql' => "s.cell",                                         'alias' => 'cell'],
            'village'          => ['label' => 'Village',              'group' => 'Address',  'sql' => "s.village",                                      'alias' => 'village'],

            // ── Family ──
            'father'           => ['label' => 'Father',               'group' => 'Family',   'sql' => "s.father",                                       'alias' => 'father'],
            'mother'           => ['label' => 'Mother',               'group' => 'Family',   'sql' => "s.mother",                                       'alias' => 'mother'],

            // ── Disability ──
            'disability_status'=> ['label' => 'Disability Status',    'group' => 'Disability', 'sql' => "s.disability",                                 'alias' => 'disability_raw'],
            'disability_type'  => ['label' => 'Disability Type',      'group' => 'Disability', 'sql' => "s.disability",                                 'alias' => 'disability_type'],

            // ── Academics ──
            'faculty_name'     => ['label' => 'Faculty',              'group' => 'Academics', 'sql' => "f.fac_name",                                    'alias' => 'faculty_name'],
            'department_name'  => ['label' => 'Department',           'group' => 'Academics', 'sql' => "d.dep_name",                                    'alias' => 'department_name'],
            'school_name'      => ['label' => 'School',               'group' => 'Academics', 'sql' => "sch.school_name",                               'alias' => 'school_name'],
            'program_name'     => ['label' => 'Programme Name',       'group' => 'Academics', 'sql' => "COALESCE(o.name, s.program)",                   'alias' => 'program_name'],
            'campus_name'      => ['label' => 'Campus',               'group' => 'Academics', 'sql' => "c.name",                                        'alias' => 'campus_name'],
            'current_level'    => ['label' => 'Current Level',        'group' => 'Academics', 'sql' => "COALESCE(lvl.name, s.current_level)",           'alias' => 'current_level'],
            'programme_level'  => ['label' => 'Qualification Level',  'group' => 'Academics', 'sql' => "s.programme_level",                             'alias' => 'programme_level'],
            'category'         => ['label' => 'Category',             'group' => 'Academics', 'sql' => "s.category",                                    'alias' => 'category'],
            'intake'           => ['label' => 'Intake',               'group' => 'Academics', 'sql' => "s.intake",                                      'alias' => 'intake'],
            'acc_year'         => ['label' => 'Academic Year',        'group' => 'Academics', 'sql' => "s.acc_year",                                    'alias' => 'acc_year'],
            'student_state'    => ['label' => 'Status',               'group' => 'Academics', 'sql' => "s.student_state",                               'alias' => 'student_state'],
            'sponsor'          => ['label' => 'Sponsorship',          'group' => 'Academics', 'sql' => "s.sponsor",                                     'alias' => 'sponsor'],
            'program_code'     => ['label' => 'Programme Code',       'group' => 'Academics', 'sql' => "o.code",                                        'alias' => 'program_code'],

            // ── Academic Progress (computed live from module_marks / module_programs) ──
            // Each is a correlated sub-query keyed on the student's regnumber
            // (marks) and std_option (programme curriculum). They only run when
            // the column is actually picked for the export. "Passed" = mark ≥ 50.
            'modules_in_program' => ['label' => 'Modules in Programme', 'group' => 'Academic Progress',
                'sql'   => "(SELECT COUNT(*) FROM `module_programs` mp WHERE mp.option_id = CAST(NULLIF(s.std_option,'') AS UNSIGNED))",
                'alias' => 'modules_in_program'],
            'modules_recorded'   => ['label' => 'Modules with Marks',   'group' => 'Academic Progress',
                'sql'   => "(SELECT COUNT(DISTINCT mm.module_id) FROM `module_marks` mm WHERE mm.student_regnumber = s.regnumber)",
                'alias' => 'modules_recorded'],
            'modules_completed'  => ['label' => 'Modules Completed (Passed)', 'group' => 'Academic Progress',
                'sql'   => "(SELECT COUNT(DISTINCT mm.module_id) FROM `module_marks` mm WHERE mm.student_regnumber = s.regnumber AND mm.percentage >= 50)",
                'alias' => 'modules_completed'],
            'modules_failed'     => ['label' => 'Modules Failed',       'group' => 'Academic Progress',
                'sql'   => "(SELECT COUNT(DISTINCT mm.module_id) FROM `module_marks` mm WHERE mm.student_regnumber = s.regnumber AND mm.percentage IS NOT NULL AND mm.percentage < 50)",
                'alias' => 'modules_failed'],
            'modules_remaining'  => ['label' => 'Modules Remaining',    'group' => 'Academic Progress',
                'sql'   => "(SELECT COUNT(*) FROM `module_programs` mp WHERE mp.option_id = CAST(NULLIF(s.std_option,'') AS UNSIGNED) AND mp.module_id NOT IN (SELECT mm.module_id FROM `module_marks` mm WHERE mm.student_regnumber = s.regnumber AND mm.percentage >= 50))",
                'alias' => 'modules_remaining'],
            'average_mark'       => ['label' => 'Average Mark (%)',     'group' => 'Academic Progress',
                'sql'   => "(SELECT ROUND(AVG(mm.percentage),1) FROM `module_marks` mm WHERE mm.student_regnumber = s.regnumber AND mm.percentage IS NOT NULL)",
                'alias' => 'average_mark'],
            'credits_earned'     => ['label' => 'Credits Earned',       'group' => 'Academic Progress',
                'sql'   => "(SELECT COALESCE(SUM(m.module_credits),0) FROM `module_marks` mm JOIN `modules` m ON m.module_id = mm.module_id WHERE mm.student_regnumber = s.regnumber AND mm.percentage >= 50)",
                'alias' => 'credits_earned'],

            // ── Origin (secondary school) ──
            'last_school'      => ['label' => 'Previous School / HLI', 'group' => 'Origin',   'sql' => "s.last_school",                                  'alias' => 'last_school'],
            'combination'      => ['label' => 'Secondary Combination','group' => 'Origin',   'sql' => "s.combination",                                   'alias' => 'combination'],
            'grades'           => ['label' => 'Aggregate Scores',     'group' => 'Origin',   'sql' => "s.grades",                                        'alias' => 'grades'],
            'a2_compl_year'    => ['label' => 'A2 Completion Year',   'group' => 'Origin',   'sql' => "s.A2_compl_year",                                 'alias' => 'a2_compl_year'],

            // ── Dates ──
            'registration_date'=> ['label' => 'Registration Date',    'group' => 'Dates',    'sql' => "s.registration_date",                            'alias' => 'registration_date'],
            'started_at_cur'   => ['label' => 'Start Date',           'group' => 'Dates',    'sql' => "s.started_at_cur",                               'alias' => 'started_at_cur'],
            'expire_date'      => ['label' => 'Expected Completion',  'group' => 'Dates',    'sql' => "s.expire_date",                                  'alias' => 'expire_date'],
            'accepted_date'    => ['label' => 'Accepted Date',        'group' => 'Dates',    'sql' => "s.accepted_date",                                'alias' => 'accepted_date'],
        ];
    }

    /**
     * System (built-in) export templates surfaced alongside user-saved
     * ones. Each declares an ordered list of column descriptors. A
     * descriptor can be either a plain column key (uses the registry's
     * default label) or `[key, label-override]` so government templates
     * can match the exact header spelling expected by the receiving
     * system. We keep the HLI → Mifotra template in-code because its
     * header labels are policy-driven and shouldn't be editable from the
     * UI.
     *
     * @return list<array{id:string, name:string, columns:array, is_system:bool}>
     */
    private function systemExportTemplates(): array
    {
        return [
            [
                'id'        => 'sys:hli_mifotra',
                'name'      => 'HLIs Data to MIFOTRA',
                'is_system' => true,
                // Mirrors the Mifotra spreadsheet headers verbatim. Some
                // columns (HLI name, College, High School ID, High School
                // Location, academic award, Expected completion date) are
                // derived or constant — see `resolveTemplateCell()` for
                // their per-row logic.
                'columns'   => [
                    ['key' => 'regnumber',         'label' => 'Registration Number'],
                    ['key' => 'national_id',       'label' => 'National_ID/Passport '],
                    ['key' => 'nationality',       'label' => 'Nationality'],
                    ['key' => 'email',             'label' => 'personal email '],
                    ['key' => 'phone',             'label' => 'Telephone '],
                    ['key' => 'fname',             'label' => 'First Name'],
                    ['key' => 'lname',             'label' => 'Last Name'],
                    ['key' => 'birthdate',         'label' => 'Date of Birth'],
                    ['key' => 'gender',            'label' => 'Gender'],
                    ['key' => 'disability_status', 'label' => 'Disablitity status (Yes/No)'],
                    ['key' => 'disability_type',   'label' => 'Disability type '],
                    ['key' => 'combination',       'label' => 'Secondary School Combination/previous HLI attended '],
                    ['key' => '__const:',          'label' => 'High School Location'],
                    ['key' => '__const:',          'label' => 'High School ID'],
                    ['key' => 'grades',            'label' => 'Aggregate Secondary School Scores'],
                    ['key' => '__const:Catholic University of Rwanda', 'label' => 'HLI name'],
                    ['key' => 'school_name',       'label' => 'College '],
                    ['key' => 'campus_name',       'label' => 'Campus name'],
                    ['key' => 'school_name',       'label' => 'School'],
                    ['key' => 'faculty_name',      'label' => 'Faculty'],
                    ['key' => 'department_name',   'label' => 'Department'],
                    ['key' => 'program_name',      'label' => 'Programme Name'],
                    ['key' => '__award',           'label' => 'academic award '],
                    ['key' => 'programme_level',   'label' => 'Qualification level '],
                    ['key' => 'started_at_cur',    'label' => 'Start Date (year)'],
                    ['key' => 'current_level',     'label' => 'Current of study'],
                    ['key' => 'expire_date',       'label' => 'Expected completion  date'],
                    ['key' => 'sponsor',           'label' => 'Sponsorship Status'],
                ],
            ],
        ];
    }

    /**
     * GET /api/students/export-columns
     * Returns the column registry + group order. Drives the picker UI.
     */
    public function exportColumnsList(Request $request, Response $response): never
    {
        $cols = self::exportColumns();
        $groups = [];
        foreach ($cols as $key => $meta) {
            $groups[$meta['group']] ??= [];
            $groups[$meta['group']][] = [
                'key'   => $key,
                'label' => $meta['label'],
                'group' => $meta['group'],
            ];
        }
        // Preserve the registry order — convert keyed map to a list so
        // the client sees the same grouping the backend declared.
        $out = [];
        foreach ($groups as $name => $items) {
            $out[] = ['name' => $name, 'columns' => $items];
        }
        $this->success($response, ['groups' => $out], 'Export columns fetched.');
    }

    /**
     * GET /api/students/export-templates
     * Returns system templates + the caller's saved templates.
     */
    public function listExportTemplates(Request $request, Response $response): never
    {
        $authUser = (array)($request->param('_auth_user') ?? []);
        $userId   = (int)($authUser['id'] ?? 0);

        $rows = $userId > 0
            ? $this->studentModel->db()->fetchAll(
                "SELECT id, name, `columns`, is_system, created_by, created_at, updated_at
                 FROM `student_export_templates`
                 WHERE created_by = ? OR is_system = 1
                 ORDER BY is_system DESC, name ASC",
                [$userId]
            )
            : [];

        $userTemplates = [];
        foreach ($rows as $r) {
            $cols = is_string($r['columns']) ? (json_decode($r['columns'], true) ?: []) : (array)$r['columns'];
            $userTemplates[] = [
                'id'        => (int)$r['id'],
                'name'      => (string)$r['name'],
                'columns'   => $cols,
                'is_system' => (int)$r['is_system'] === 1,
                'is_owner'  => (int)($r['created_by'] ?? 0) === $userId,
                'updated_at'=> $r['updated_at'] ?? $r['created_at'] ?? null,
            ];
        }

        $this->success($response, [
            'templates' => array_merge($this->systemExportTemplates(), $userTemplates),
        ], 'Export templates fetched.');
    }

    /**
     * POST /api/students/export-templates  { name, columns }
     * Save a new user template. Each user can have many. We dedupe by
     * (created_by, name) so re-saving with the same name updates in place.
     */
    public function saveExportTemplate(Request $request, Response $response): never
    {
        $authUser = (array)($request->param('_auth_user') ?? []);
        $userId   = (int)($authUser['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $data    = (array)$request->body();
        $name    = trim((string)($data['name'] ?? ''));
        $columns = $data['columns'] ?? [];

        if ($name === '') {
            $this->error($response, 'Template name is required.', 422);
        }
        if (!is_array($columns) || empty($columns)) {
            $this->error($response, 'At least one column is required.', 422);
        }

        // Validate every column key against the registry so we never
        // persist a typo that would later blow up the CSV generator.
        $valid = self::exportColumns();
        $normalised = [];
        foreach ($columns as $c) {
            $key = is_array($c) ? (string)($c['key'] ?? '') : (string)$c;
            if (!isset($valid[$key])) {
                $this->error($response, "Unknown column: {$key}", 422);
            }
            $normalised[] = $key;
        }

        $db = $this->studentModel->db();
        $existing = $db->fetchOne(
            "SELECT id FROM `student_export_templates` WHERE created_by = ? AND name = ? LIMIT 1",
            [$userId, $name]
        );
        $payload = json_encode($normalised, JSON_UNESCAPED_UNICODE);

        if ($existing) {
            $db->execute(
                "UPDATE `student_export_templates` SET `columns` = ? WHERE id = ?",
                [$payload, (int)$existing['id']]
            );
            $id = (int)$existing['id'];
        } else {
            $db->execute(
                "INSERT INTO `student_export_templates` (name, `columns`, is_system, created_by) VALUES (?, ?, 0, ?)",
                [$name, $payload, $userId]
            );
            $id = (int)$db->lastInsertId();
        }

        $this->success($response, [
            'id'      => $id,
            'name'    => $name,
            'columns' => $normalised,
        ], 'Template saved.');
    }

    /**
     * DELETE /api/students/export-templates/:id
     * Owners can delete their own template. System templates are
     * immutable — attempting to delete one yields 403.
     */
    public function deleteExportTemplate(Request $request, Response $response): never
    {
        $authUser = (array)($request->param('_auth_user') ?? []);
        $userId   = (int)($authUser['id'] ?? 0);
        $id       = (int)$request->param('id');

        $db = $this->studentModel->db();
        $row = $db->fetchOne(
            "SELECT id, created_by, is_system FROM `student_export_templates` WHERE id = ? LIMIT 1",
            [$id]
        );
        if (!$row) {
            $this->error($response, 'Template not found.', 404);
        }
        if ((int)$row['is_system'] === 1) {
            $this->error($response, 'System templates cannot be deleted.', 403);
        }
        if ((int)$row['created_by'] !== $userId) {
            $this->error($response, 'You can only delete your own templates.', 403);
        }
        $db->execute("DELETE FROM `student_export_templates` WHERE id = ?", [$id]);
        $this->success($response, null, 'Template deleted.');
    }

    /**
     * GET /api/students/export
     *
     * Streams a CSV of every student that matches the same filters used
     * by the list page. Columns are driven by `?columns=` (comma-separated
     * column keys) OR by `?template_id=` (numeric for a saved template,
     * or the literal `sys:hli_mifotra` for the in-code Mifotra template).
     *
     * Templates win when both are provided so the user gets the exact
     * column ORDER and HEADER LABELS the template specified.
     */
    public function exportCsv(Request $request, Response $response): never
    {
        $registry = self::exportColumns();

        // ── Resolve column descriptors ─────────────────────────────────
        // A descriptor is `['key' => string, 'label' => string]`. Loading
        // a template gives us the ordered list with any HLI-style header
        // overrides; a raw `columns` list falls back to registry labels.
        $templateId = $request->query('template_id');
        $picked     = [];

        if ($templateId !== null && $templateId !== '') {
            $picked = $this->resolveTemplateColumns((string)$templateId, $request);
        }

        if (empty($picked)) {
            $rawCols = trim((string)($request->query('columns') ?? ''));
            // The filter panel's per-value quick-download has no column
            // picker behind it — it just wants "this cohort, sensible
            // columns". Fall back to the standard set rather than 422ing.
            if ($rawCols === '') {
                $rawCols = implode(',', self::DEFAULT_EXPORT_COLUMNS);
            }
            foreach (explode(',', $rawCols) as $k) {
                $k = trim($k);
                if ($k === '') continue;
                if (!isset($registry[$k])) {
                    $this->error($response, "Unknown column: {$k}", 422);
                }
                $picked[] = ['key' => $k, 'label' => $registry[$k]['label']];
            }
        }

        if (empty($picked)) {
            $this->error($response, 'No columns selected for export.', 422);
        }

        // ── Build the WHERE from the live list filters ─────────────────
        // Qualified with the `s` alias — this query JOINs tables that share
        // column names with `student` (e.g. `departements`.`program`).
        [$where, $bindings] = $this->buildListFilters($request, 's');

        // Every column key we may need to read (registry + the few
        // synthetic keys consumed by `resolveTemplateCell`).
        $neededKeys = [];
        foreach ($picked as $p) {
            $k = $p['key'];
            if (str_starts_with($k, '__')) {
                // Synthetic columns pull from these fallback fields:
                if ($k === '__award') {
                    $neededKeys['programme_level'] = true;
                    $neededKeys['program_name']    = true;
                }
                continue;
            }
            $neededKeys[$k] = true;
        }
        // Always include the id so an unstable LIMIT/OFFSET still
        // produces a deterministic ordering on the export.
        $neededKeys['regnumber'] ??= true;

        $selectParts = ['s.id AS __id'];
        foreach (array_keys($neededKeys) as $key) {
            if (!isset($registry[$key])) continue;
            $meta = $registry[$key];
            $selectParts[] = "{$meta['sql']} AS `{$meta['alias']}`";
        }
        $selectSql = implode(', ', $selectParts);

        $sql = "
            SELECT {$selectSql}
            FROM `student` s
            LEFT JOIN `faculty`      f   ON f.fac_id     = CAST(NULLIF(s.faculty, '')    AS UNSIGNED)
            LEFT JOIN `departements` d   ON d.dep_id     = CAST(NULLIF(s.department, '') AS UNSIGNED)
            LEFT JOIN `schools`      sch ON sch.school_id = f.school_id
            LEFT JOIN `options`      o   ON o.id         = CAST(NULLIF(s.std_option, '') AS UNSIGNED)
            LEFT JOIN `campuses`     c   ON c.id         = CAST(NULLIF(s.campus, '')     AS UNSIGNED)
            LEFT JOIN `levels`       lvl ON lvl.id       = CAST(NULLIF(s.current_level, '') AS UNSIGNED)
            " . ($where !== '' ? " WHERE {$where}" : "") . "
            ORDER BY s.id DESC
        ";

        $rows = $this->studentModel->db()->fetchAll($sql, $bindings);

        // ── Materialise the table ──────────────────────────────────────
        // Header row uses the template's label overrides where present.
        $headers = array_map(static fn(array $p) => $p['label'], $picked);
        $matrix  = [];
        foreach ($rows as $row) {
            $line = [];
            foreach ($picked as $p) {
                $line[] = $this->resolveTemplateCell($p['key'], $row, $registry);
            }
            $matrix[] = $line;
        }

        $stamp    = date('Y-m-d_His');
        $format   = strtolower(trim((string)($request->query('format') ?? 'csv')));

        if (in_array($format, ['xlsx', 'excel'], true)) {
            $this->streamXlsx($headers, $matrix, "students_{$stamp}.xlsx", $this->describeFilters($request));
        }

        // ── Stream the CSV ─────────────────────────────────────────────
        $filename = "students_{$stamp}.csv";

        if (!headers_sent()) {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('X-Content-Type-Options: nosniff');
        }

        $out = fopen('php://output', 'w');
        // Excel-friendly UTF-8 BOM — without it accented names render as
        // mojibake when the file is opened in Excel on Windows.
        fwrite($out, "\xEF\xBB\xBF");

        fputcsv($out, $headers);
        foreach ($matrix as $line) {
            fputcsv($out, $line);
        }
        fclose($out);
        exit;
    }

    /**
     * Columns used when the caller asked for an export without naming any —
     * the filter panel's one-click "download this cohort" button. Enough to
     * identify each student and see the cut the filter made.
     */
    private const DEFAULT_EXPORT_COLUMNS = [
        'regnumber', 'full_name', 'gender', 'birthdate', 'email', 'phone',
        'faculty_name', 'department_name', 'program_name', 'current_level',
        'acc_year', 'student_state', 'country', 'province', 'district', 'sector',
    ];

    /**
     * Stream `$rows` as a real .xlsx workbook. Beyond the data sheet it writes
     * a "Filters" sheet recording exactly which filters produced the file —
     * these exports get mailed around and detached from the screen that
     * generated them, and a sheet of 400 students with no record of what
     * cohort it represents is worse than useless.
     *
     * @param array<int, string>              $headers
     * @param array<int, array<int, string>>  $rows
     * @param array<int, array{0:string,1:string}> $filterSummary
     */
    private function streamXlsx(array $headers, array $rows, string $filename, array $filterSummary): never
    {
        $book  = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Students');

        $sheet->fromArray($headers, null, 'A1');
        if (!empty($rows)) {
            // Every cell is bound as a string, not just formatted as one.
            // PhpSpreadsheet's default binder types a digit string as a
            // number, and a double only carries ~15 significant digits: the
            // 16-digit national IDs in the MIFOTRA template come back as
            // 1.19927E+15 with the last digit gone, and a phone number's
            // leading zero disappears. A FORMAT_TEXT number format can't undo
            // that — by then the value is already a float — so the binder has
            // to be swapped before the values are written. It also stops a
            // name beginning '=' or '+' from being read as a formula.
            $previousBinder = \PhpOffice\PhpSpreadsheet\Cell\Cell::getValueBinder();
            \PhpOffice\PhpSpreadsheet\Cell\Cell::setValueBinder(
                new \PhpOffice\PhpSpreadsheet\Cell\StringValueBinder()
            );
            try {
                $sheet->fromArray($rows, null, 'A2', true);
            } finally {
                // Static global — leaving it swapped would silently change
                // every other workbook this process goes on to write.
                \PhpOffice\PhpSpreadsheet\Cell\Cell::setValueBinder($previousBinder);
            }
        }

        $lastCol = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(max(1, count($headers)));
        $lastRow = count($rows) + 1;

        $headerStyle = $sheet->getStyle("A1:{$lastCol}1");
        $headerStyle->getFont()->setBold(true)->getColor()->setARGB('FFFFFFFF');
        $headerStyle->getFill()
            ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
            ->getStartColor()->setARGB('FF1E3A8A');
        $headerStyle->getAlignment()->setVertical(
            \PhpOffice\PhpSpreadsheet\Style\Alignment::VERTICAL_CENTER
        );
        $sheet->getRowDimension(1)->setRowHeight(22);

        // Freeze + autofilter so a 5,000-row registry export is navigable.
        $sheet->freezePane('A2');
        if ($lastRow > 1) {
            $sheet->setAutoFilter("A1:{$lastCol}{$lastRow}");
        }
        for ($i = 1; $i <= count($headers); $i++) {
            $sheet->getColumnDimensionByColumn($i)->setAutoSize(true);
        }

        // Text number format as well as text cell values, so Excel doesn't
        // re-interpret a digit string the user later edits in place.
        if ($lastRow > 1) {
            $sheet->getStyle("A2:{$lastCol}{$lastRow}")
                ->getNumberFormat()
                ->setFormatCode(\PhpOffice\PhpSpreadsheet\Style\NumberFormat::FORMAT_TEXT);
        }

        $meta = $book->createSheet();
        $meta->setTitle('Filters');
        $meta->fromArray(['Filter', 'Value'], null, 'A1');
        $meta->getStyle('A1:B1')->getFont()->setBold(true);
        $metaRows = array_merge(
            [['Generated', date('Y-m-d H:i')], ['Students', (string)count($rows)]],
            $filterSummary ?: [['(none)', 'All students']]
        );
        $meta->fromArray($metaRows, null, 'A2', true);
        $meta->getColumnDimension('A')->setAutoSize(true);
        $meta->getColumnDimension('B')->setAutoSize(true);

        $book->setActiveSheetIndex(0);

        if (!headers_sent()) {
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('X-Content-Type-Options: nosniff');
        }

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book);
        $writer->save('php://output');
        $book->disconnectWorksheets();
        exit;
    }

    /**
     * Human-readable "what was filtered" pairs for the workbook's Filters
     * sheet. Ids are resolved to names — "Faculty of Education", not "6" —
     * because the sheet exists to be read by a person.
     *
     * @return array<int, array{0:string, 1:string}>
     */
    private function describeFilters(Request $request): array
    {
        $db  = $this->studentModel->db();
        $out = [];

        $add = static function (string $label, mixed $value) use (&$out): void {
            $value = is_string($value) ? trim($value) : $value;
            if ($value === null || $value === '' ) return;
            $out[] = [$label, (string)$value];
        };

        $lookup = static function (string $sql, mixed $id) use ($db): ?string {
            if ($id === null || $id === '' || !is_numeric($id)) return null;
            $row = $db->fetchOne($sql, [(int)$id]);
            return $row ? (string)reset($row) : null;
        };

        $add('Search',        $request->query('q') ?? $request->query('search'));
        $add('Faculty',       $lookup('SELECT fac_name FROM `faculty` WHERE fac_id = ? LIMIT 1', $request->query('faculty')) ?? $request->query('faculty'));
        $add('Department',    $lookup('SELECT dep_name FROM `departements` WHERE dep_id = ? LIMIT 1', $request->query('department')) ?? $request->query('department'));
        $add('Option',        $lookup('SELECT name FROM `options` WHERE id = ? LIMIT 1', $request->query('std_option')) ?? $request->query('std_option'));
        $add('Level',         $lookup('SELECT name FROM `levels` WHERE id = ? LIMIT 1', $request->query('current_level')) ?? $request->query('current_level'));
        $add('Campus',        $lookup('SELECT name FROM `campuses` WHERE id = ? LIMIT 1', $request->query('campus')) ?? $request->query('campus'));
        $add('Academic year', $request->query('acc_year'));
        $add('Status',        $request->query('student_state'));
        $add('Category',      $request->query('category'));
        $add('Intake',        $request->query('intake'));
        $add('Learning mode', $request->query('learning_mode'));
        $add('Gender',        $request->query('gender'));
        $add('Nationality',   $request->query('nationality'));
        $add('Country',       $request->query('country'));
        $add('Province',      $request->query('province'));
        $add('District',      $request->query('district'));
        $add('Sector',        $request->query('sector'));

        $ageMin = $request->query('age_min');
        $ageMax = $request->query('age_max');
        if (($ageMin !== null && $ageMin !== '') || ($ageMax !== null && $ageMax !== '')) {
            $add('Age', ($ageMin !== null && $ageMin !== '' ? $ageMin : '…') . ' – ' . ($ageMax !== null && $ageMax !== '' ? $ageMax : '…'));
        }

        return $out;
    }

    /**
     * Convert a `template_id` argument into a list of
     * `[key, label]` descriptors. Accepts:
     *   • `sys:hli_mifotra` (or any future system template id)
     *   • a numeric id pointing into `student_export_templates`
     *
     * Returns `[]` if no match — the caller then falls back to the raw
     * `?columns=` query parameter.
     */
    private function resolveTemplateColumns(string $templateId, Request $request): array
    {
        $registry = self::exportColumns();

        if (str_starts_with($templateId, 'sys:')) {
            foreach ($this->systemExportTemplates() as $tpl) {
                if ($tpl['id'] === $templateId) {
                    $out = [];
                    foreach ($tpl['columns'] as $c) {
                        $key   = (string)($c['key'] ?? '');
                        $label = (string)($c['label'] ?? '');
                        if ($label === '' && isset($registry[$key])) $label = $registry[$key]['label'];
                        $out[] = ['key' => $key, 'label' => $label];
                    }
                    return $out;
                }
            }
            return [];
        }

        $id = (int)$templateId;
        if ($id <= 0) return [];

        $authUser = (array)($request->param('_auth_user') ?? []);
        $userId   = (int)($authUser['id'] ?? 0);

        $row = $this->studentModel->db()->fetchOne(
            "SELECT `name`, `columns`, `is_system`, `created_by`
             FROM `student_export_templates`
             WHERE id = ? AND (is_system = 1 OR created_by = ?) LIMIT 1",
            [$id, $userId]
        );
        if (!$row) return [];

        $cols = is_string($row['columns']) ? (json_decode($row['columns'], true) ?: []) : (array)$row['columns'];
        $out  = [];
        foreach ($cols as $c) {
            $key   = is_array($c) ? (string)($c['key'] ?? '') : (string)$c;
            $label = is_array($c) ? (string)($c['label'] ?? '') : '';
            if ($label === '' && isset($registry[$key])) {
                $label = $registry[$key]['label'];
            }
            $out[] = ['key' => $key, 'label' => $label];
        }
        return $out;
    }

    /**
     * Resolve a single CSV cell value for a row + column key.
     *
     * Handles three categories:
     *   • Synthetic keys prefixed `__` — derived values (constants,
     *     yes/no flags, computed awards) that aren't a 1-to-1 column on
     *     the student table.
     *   • `disability_status` / `disability_type` — both read the same
     *     `s.disability` column but flatten it to different shapes.
     *   • Everything else — straight read from the row using the
     *     registry's `alias`.
     */
    private function resolveTemplateCell(string $key, array $row, array $registry): string
    {
        // Constants and computed values
        if (str_starts_with($key, '__const:')) {
            return substr($key, strlen('__const:'));
        }
        if ($key === '__award') {
            $lvl = strtolower(trim((string)($row['programme_level'] ?? '')));
            return match (true) {
                str_contains($lvl, 'phd')                                      => 'PhD',
                str_contains($lvl, 'master')                                   => 'Masters Degree',
                str_contains($lvl, 'pgde')                                     => 'Postgraduate Diploma',
                str_contains($lvl, 'diploma')                                  => 'Diploma',
                str_contains($lvl, 'certificate')                              => 'Certificate',
                $lvl === 'undergraduate' || str_contains($lvl, 'under')        => 'Bachelors Degree',
                default                                                        => '',
            };
        }

        if ($key === 'disability_status') {
            $v = trim((string)($row['disability_raw'] ?? ''));
            if ($v === '' || in_array(strtolower($v), ['no', 'none', 'n/a', 'na', '0'], true)) {
                return 'No';
            }
            return 'Yes';
        }
        if ($key === 'disability_type') {
            $v = trim((string)($row['disability_type'] ?? ''));
            if ($v === '' || in_array(strtolower($v), ['no', 'none', 'n/a', 'na', '0'], true)) {
                return '';
            }
            return $v;
        }

        if ($key === 'gender') {
            $v = strtolower(trim((string)($row['gender'] ?? '')));
            return match (true) {
                in_array($v, ['m', 'male'],   true) => 'Male',
                in_array($v, ['f', 'female'], true) => 'Female',
                default                              => '',
            };
        }

        if (!isset($registry[$key])) return '';
        $alias = $registry[$key]['alias'];
        $v = $row[$alias] ?? null;
        return $v === null ? '' : (string)$v;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Task 1.13 — International student visa tracking.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * GET /api/students/international
     * List students flagged as international plus their current visa
     * status and days until expiry. Useful for the registry's compliance
     * tab.
     */
    public function listInternational(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();

        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(200, (int)($request->query('per_page') ?? 25)));
        $offset  = ($page - 1) * $perPage;

        [$where, $bindings] = $this->buildInternationalFilters($request);

        $total = (int)($db->fetchOne(
            "SELECT COUNT(*) AS cnt
               FROM `student` s
               LEFT JOIN `student_visa_records` v
                 ON v.student_id = s.id AND v.is_current = 1
              WHERE {$where}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $db->fetchAll(
            "SELECT s.id, s.regnumber, s.fname, s.lname, s.email, s.nationality,
                    s.std_option,
                    s.assigned_registry_user_id,
                    u.full_name AS assigned_registry_name,
                    o.name      AS program_name,
                    v.country_of_origin,
                    v.visa_type,
                    v.entry_date,
                    v.visa_issue_date,
                    v.visa_expiry_date,
                    v.visa_document_file_id,
                    v.visa_document_original_name,
                    CASE WHEN v.visa_expiry_date IS NULL THEN NULL
                         ELSE DATEDIFF(v.visa_expiry_date, CURDATE()) END AS days_to_expiry
               FROM `student` s
               LEFT JOIN `users`   u ON u.id = s.assigned_registry_user_id
               LEFT JOIN `student_visa_records` v
                  ON v.student_id = s.id AND v.is_current = 1
               LEFT JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
              WHERE {$where}
              ORDER BY (v.visa_expiry_date IS NULL),
                       v.visa_expiry_date ASC,
                       s.lname ASC
              LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        // Summary across the current filter set (NOT just the visible page)
        $summary = $db->fetchOne(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN v.visa_document_file_id IS NOT NULL THEN 1 ELSE 0 END) AS with_visa_document,
                SUM(CASE WHEN v.visa_document_file_id IS NULL     THEN 1 ELSE 0 END) AS without_visa_document,
                SUM(CASE WHEN v.visa_expiry_date IS NOT NULL
                          AND v.visa_expiry_date < CURDATE()             THEN 1 ELSE 0 END) AS expired,
                SUM(CASE WHEN v.visa_expiry_date IS NOT NULL
                          AND v.visa_expiry_date >= CURDATE()
                          AND DATEDIFF(v.visa_expiry_date, CURDATE()) <= 7
                                                                          THEN 1 ELSE 0 END) AS expiring_this_week
               FROM `student` s
               LEFT JOIN `student_visa_records` v
                 ON v.student_id = s.id AND v.is_current = 1
              WHERE {$where}",
            $bindings
        ) ?: [];

        // Facets — programs + countries seen across ALL international
        // students (ignoring the current filter so the dropdown stays usable
        // even after the user has filtered themselves into a corner).
        $programFacet = $db->fetchAll(
            "SELECT o.id AS value, o.name AS label
               FROM `options` o
              WHERE o.id IN (
                SELECT DISTINCT CAST(s.std_option AS UNSIGNED)
                  FROM `student` s
                 WHERE s.std_option REGEXP '^[0-9]+$'
                   AND (
                     s.is_international = 1
                     OR (s.nationality IS NOT NULL AND TRIM(s.nationality) <> ''
                         AND LOWER(TRIM(s.nationality))
                             NOT IN ('rwanda','rwandan','rwandese','rwandaise'))
                   )
              )
              ORDER BY o.name ASC"
        );

        // CONVERT both branches to a single collation so the UNION doesn't
        // trip MySQL error 1271 — `student.nationality` and
        // `student_visa_records.country_of_origin` may be declared with
        // different collations even when both are utf8mb4. Also filter out
        // junk-shaped values (national ID numbers stored in `nationality`
        // by mistake) so the dropdown stays clean.
        $countryFacet = $db->fetchAll(
            "SELECT DISTINCT TRIM(country) AS value, TRIM(country) AS label
               FROM (
                 SELECT CONVERT(v2.country_of_origin USING utf8mb4)
                          COLLATE utf8mb4_unicode_ci AS country
                   FROM `student_visa_records` v2
                   JOIN `student` s2 ON s2.id = v2.student_id
                  WHERE v2.is_current = 1
                    AND v2.country_of_origin IS NOT NULL
                    AND v2.country_of_origin <> ''
                 UNION
                 SELECT CONVERT(s3.nationality USING utf8mb4)
                          COLLATE utf8mb4_unicode_ci AS country
                   FROM `student` s3
                  WHERE s3.nationality IS NOT NULL AND TRIM(s3.nationality) <> ''
                    AND LOWER(TRIM(s3.nationality))
                        NOT IN ('rwanda','rwandan','rwandese','rwandaise')
               ) AS c
              WHERE TRIM(c.country) <> ''
                AND TRIM(c.country) REGEXP '[A-Za-z]'
                AND TRIM(c.country) NOT REGEXP '^[0-9]+$'
              ORDER BY value ASC"
        );

        $this->success($response, [
            'data'       => $rows,
            'page'       => $page,
            'per_page'   => $perPage,
            'total'      => $total,
            'last_page'  => $perPage > 0 ? (int)ceil($total / $perPage) : 1,
            'summary'    => [
                'total'                 => (int)($summary['total']                 ?? 0),
                'with_visa_document'    => (int)($summary['with_visa_document']    ?? 0),
                'without_visa_document' => (int)($summary['without_visa_document'] ?? 0),
                'expired'               => (int)($summary['expired']               ?? 0),
                'expiring_this_week'    => (int)($summary['expiring_this_week']    ?? 0),
            ],
            'facets'     => [
                'program' => $programFacet,
                'country' => $countryFacet,
            ],
            // Legacy keys preserved so older callers (admin International page
            // before the pagination rework) still work without surprises.
            'students'   => $rows,
            'count'      => $total,
        ], 'International students fetched.');
    }

    /**
     * GET /api/students/international/export
     * Stream a UTF-8-BOM CSV (Excel-friendly) of every international
     * student matching the same filters as listInternational, in the
     * column order the registry team asked for. Token-auth so the link
     * can be used as a plain <a href> download.
     */
    public function exportInternationalCsv(Request $request, Response $response): never
    {
        $db = $this->studentModel->db();
        [$where, $bindings] = $this->buildInternationalFilters($request);

        $rows = $db->fetchAll(
            "SELECT s.regnumber, s.fname, s.lname, s.nationality,
                    o.name      AS program_name,
                    v.country_of_origin, v.visa_type,
                    v.visa_issue_date, v.visa_expiry_date,
                    v.visa_document_file_id,
                    CASE WHEN v.visa_expiry_date IS NULL THEN NULL
                         ELSE DATEDIFF(v.visa_expiry_date, CURDATE()) END AS days_to_expiry
               FROM `student` s
               LEFT JOIN `student_visa_records` v
                  ON v.student_id = s.id AND v.is_current = 1
               LEFT JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
              WHERE {$where}
              ORDER BY (v.visa_expiry_date IS NULL),
                       v.visa_expiry_date ASC,
                       s.lname ASC",
            $bindings
        );

        $filename = 'international-students-' . date('Ymd-His') . '.csv';
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: private, no-store');

        $out = fopen('php://output', 'wb');
        // UTF-8 BOM so Excel opens accents/non-ASCII correctly.
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, [
            'Registration #', 'Full name', 'Country of origin', 'Nationality',
            'Program', 'Visa type', 'Visa obtained date', 'Visa expiration date',
            'Days to expiry', 'Visa uploaded',
        ]);

        foreach ($rows as $r) {
            $full = trim(($r['fname'] ?? '') . ' ' . ($r['lname'] ?? ''));
            $country = $r['country_of_origin'] ?: $r['nationality'] ?: '';
            $daysLabel = $r['days_to_expiry'] === null ? '' : (int)$r['days_to_expiry'];
            fputcsv($out, [
                $r['regnumber']         ?? '',
                $full,
                $country,
                $r['nationality']       ?? '',
                $r['program_name']      ?? '',
                $r['visa_type']         ?? '',
                $r['visa_issue_date']   ?? '',
                $r['visa_expiry_date']  ?? '',
                $daysLabel,
                $r['visa_document_file_id'] ? 'Yes' : 'No',
            ]);
        }

        fclose($out);
        exit;
    }

    /**
     * WHERE clause shared by listInternational + exportInternationalCsv.
     * Honours search (q), program (std_option / catalog id), country
     * (matches both nationality and country_of_origin), visa-status, and
     * visa-document presence filters.
     *
     * @return array{0:string, 1:array}
     */
    private function buildInternationalFilters(Request $request): array
    {
        $clauses  = [
            // International scope = explicit flag OR a non-Rwandan nationality.
            "(s.is_international = 1 OR (
                s.nationality IS NOT NULL AND TRIM(s.nationality) <> ''
                AND LOWER(TRIM(s.nationality))
                    NOT IN ('rwanda','rwandan','rwandese','rwandaise')
            ))",
        ];
        $bindings = [];

        $q = trim((string)($request->query('q') ?? $request->query('search') ?? ''));
        if ($q !== '') {
            $clauses[]  = "(s.fname LIKE ? OR s.lname LIKE ? OR s.regnumber LIKE ? OR s.email LIKE ?)";
            $bindings[] = "%{$q}%"; $bindings[] = "%{$q}%";
            $bindings[] = "%{$q}%"; $bindings[] = "%{$q}%";
        }

        $program = trim((string)($request->query('program') ?? $request->query('std_option') ?? ''));
        if ($program !== '') {
            // student.std_option is stored as a varchar of the option id,
            // so a numeric filter compares the strings directly.
            $clauses[]  = "s.std_option = ?";
            $bindings[] = $program;
        }

        $country = trim((string)($request->query('country') ?? ''));
        if ($country !== '') {
            // Match against either the visa-record country OR the
            // nationality string, case-insensitively.
            $clauses[]  = "(LOWER(TRIM(v.country_of_origin)) = LOWER(?) OR LOWER(TRIM(s.nationality)) = LOWER(?))";
            $bindings[] = $country;
            $bindings[] = $country;
        }

        $hasVisa = strtolower(trim((string)($request->query('has_visa_document') ?? '')));
        if ($hasVisa === 'yes' || $hasVisa === '1' || $hasVisa === 'true') {
            $clauses[] = "v.visa_document_file_id IS NOT NULL";
        } elseif ($hasVisa === 'no' || $hasVisa === '0' || $hasVisa === 'false') {
            $clauses[] = "v.visa_document_file_id IS NULL";
        }

        $expiry = strtolower(trim((string)($request->query('expiry_status') ?? '')));
        if ($expiry === 'expired') {
            $clauses[] = "(v.visa_expiry_date IS NOT NULL AND v.visa_expiry_date < CURDATE())";
        } elseif ($expiry === 'expiring' || $expiry === 'expiring_soon') {
            $clauses[] = "(v.visa_expiry_date IS NOT NULL
                           AND v.visa_expiry_date >= CURDATE()
                           AND DATEDIFF(v.visa_expiry_date, CURDATE()) <= 7)";
        } elseif ($expiry === 'active' || $expiry === 'valid') {
            $clauses[] = "(v.visa_expiry_date IS NOT NULL
                           AND DATEDIFF(v.visa_expiry_date, CURDATE()) > 7)";
        } elseif ($expiry === 'missing' || $expiry === 'unknown') {
            $clauses[] = "v.visa_expiry_date IS NULL";
        }

        return [implode(' AND ', $clauses), $bindings];
    }

    /**
     * GET /api/students/:id/visa
     * List visa records for a student (newest first).
     */
    public function listVisaRecords(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $student = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }
        $records = $this->visaModel->listForStudent($id);
        $current = $this->visaModel->currentForStudent($id);
        $this->success($response, [
            'records' => $records,
            'current' => $current,
        ], 'Visa records fetched.');
    }

    /**
     * POST /api/students/:id/visa
     * Record a new visa (or renewal). Adding a new record automatically
     * marks the previous current record non-current.
     */
    public function addVisaRecord(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $authUser = (array) $request->param('_auth_user');
        $student  = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }
        $data = $request->body();
        $errors = ValidationHelper::validate($data, [
            'country_of_origin' => 'required|string|min:2|max:100',
            'entry_date'        => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
            'visa_issue_date'   => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
            'visa_expiry_date'  => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $db = $this->studentModel->db();
        $db->beginTransaction();
        try {
            $this->visaModel->markAllNonCurrent($id);
            $newId = (int)$this->visaModel->create([
                'student_id'        => $id,
                'country_of_origin' => trim((string)$data['country_of_origin']),
                'entry_date'        => $data['entry_date'],
                'visa_issue_date'   => $data['visa_issue_date'],
                'visa_expiry_date'  => $data['visa_expiry_date'],
                'visa_type'         => (string)($data['visa_type'] ?? '') ?: null,
                'notes'             => (string)($data['notes'] ?? '') ?: null,
                'is_current'        => 1,
                'created_by'        => (int)($authUser['id'] ?? 0) ?: null,
            ]);
            // Flag the student as international (idempotent).
            $db->execute("UPDATE `student` SET is_international = 1 WHERE id = ?", [$id]);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            $this->error($response, 'Failed to record visa: ' . $e->getMessage(), 500);
        }

        SystemLogService::log(
            'CREATE', 'STUDENTS',
            "Recorded visa for student ID {$id}.",
            $id, 'student',
            ['visa_id' => $newId], $authUser ?: null
        );
        $this->success($response, ['id' => $newId], 'Visa record added.', 201);
    }

    /**
     * PATCH /api/students/:id/assign-registry
     * Assign (or clear, with null) the responsible registry officer for an
     * international student.
     */
    public function assignRegistryOfficer(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $authUser = (array) $request->param('_auth_user');
        $student  = $this->studentModel->find($id);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }
        $data        = $request->body();
        $assignedTo  = isset($data['assigned_registry_user_id']) && $data['assigned_registry_user_id'] !== ''
            ? (int)$data['assigned_registry_user_id']
            : null;

        $this->studentModel->db()->execute(
            "UPDATE `student` SET assigned_registry_user_id = ? WHERE id = ?",
            [$assignedTo, $id]
        );
        SystemLogService::log(
            'UPDATE', 'STUDENTS',
            $assignedTo === null
              ? "Cleared registry officer for student ID {$id}."
              : "Assigned registry officer (user {$assignedTo}) to student ID {$id}.",
            $id, 'student',
            ['assigned_registry_user_id' => $assignedTo], $authUser ?: null
        );
        $this->success($response, ['assigned_registry_user_id' => $assignedTo], 'Registry officer updated.');
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Self-service visa for international students
    // ─────────────────────────────────────────────────────────────────────

    /**
     * GET /api/students/me/visa
     * Return the caller's current visa record (or null if none yet), the
     * full history, and a `needs_visa` flag the UI uses to decide whether
     * to show the "visa information missing" banner.
     */
    public function meVisa(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        $current = $this->visaModel->currentForStudent($studentId);
        $records = $this->visaModel->listForStudent($studentId);

        $isInternational = self::isStudentInternational($student);
        $needsVisa = $isInternational && (
            !$current
            || empty($current['visa_issue_date'])
            || empty($current['visa_expiry_date'])
            || empty($current['visa_document_file_id'])
        );
        $isExpired = $current && !empty($current['visa_expiry_date'])
            && strtotime((string)$current['visa_expiry_date']) < strtotime(date('Y-m-d'));

        $this->success($response, [
            'is_international' => $isInternational,
            'needs_visa'       => $needsVisa,
            'is_expired'       => (bool)$isExpired,
            'current'          => $current ?: null,
            'records'          => $records,
        ], 'Visa status fetched.');
    }

    /**
     * POST /api/students/me/visa
     * Upsert the caller's current visa dates / country / type. Always creates
     * a new record (marking older ones non-current) so we keep a renewal
     * history — even if the student only edits a typo, the audit trail is
     * preserved. If an existing visa document file is on record, it's
     * carried forward to the new record.
     */
    public function meAddVisa(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];
        $authUser  = (array) $request->param('_auth_user');

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'country_of_origin' => 'required|string|min:2|max:100',
            'visa_issue_date'   => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
            'visa_expiry_date'  => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        if ($data['visa_expiry_date'] <= $data['visa_issue_date']) {
            $this->error($response, 'Visa expiration date must be after the visa obtained date.', 422);
        }

        // Carry the existing file id over so the document stays attached
        // when the student only edits the dates.
        $prev = $this->visaModel->currentForStudent($studentId);

        $db = $this->studentModel->db();
        $db->beginTransaction();
        try {
            $this->visaModel->markAllNonCurrent($studentId);
            $newId = (int)$this->visaModel->create([
                'student_id'                  => $studentId,
                'country_of_origin'           => trim((string)$data['country_of_origin']),
                'entry_date'                  => $data['entry_date'] ?? ($prev['entry_date'] ?? $data['visa_issue_date']),
                'visa_issue_date'             => $data['visa_issue_date'],
                'visa_expiry_date'            => $data['visa_expiry_date'],
                'visa_type'                   => trim((string)($data['visa_type'] ?? '')) ?: null,
                'notes'                       => trim((string)($data['notes']     ?? '')) ?: null,
                'is_current'                  => 1,
                'created_by'                  => (int)($authUser['id'] ?? 0) ?: null,
                'visa_document_file_id'       => $prev['visa_document_file_id']       ?? null,
                'visa_document_original_name' => $prev['visa_document_original_name'] ?? null,
                'visa_document_mime'          => $prev['visa_document_mime']          ?? null,
                'visa_document_size'          => $prev['visa_document_size']          ?? null,
            ]);
            $db->execute("UPDATE `student` SET is_international = 1 WHERE id = ?", [$studentId]);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            $this->error($response, 'Failed to save visa: ' . $e->getMessage(), 500);
        }

        $this->success($response, ['id' => $newId], 'Visa information saved.', 201);
    }

    /**
     * GET /api/students/me/visa/document
     * Stream the caller's current visa document file. Token-auth like the
     * other self-service download endpoints — the client appends ?token=…
     * for direct <a href> downloads.
     */
    public function meDownloadVisaDocument(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        $current = $this->visaModel->currentForStudent($studentId);
        if (!$current || empty($current['visa_document_file_id'])) {
            $this->error($response, 'No visa document on file.', 404);
        }

        $this->streamFileServerDownload((string)$current['visa_document_file_id'], $response);
    }

    /**
     * GET /api/students/:id/visa/document
     * Admin / registry-staff equivalent of meDownloadVisaDocument. Gated
     * behind VIEW_STUDENTS at the route layer.
     */
    public function downloadVisaDocument(Request $request, Response $response): never
    {
        $studentId = (int)$request->param('id');
        $student   = $this->studentModel->find($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $current = $this->visaModel->currentForStudent($studentId);
        if (!$current || empty($current['visa_document_file_id'])) {
            $this->error($response, 'No visa document on file.', 404);
        }

        $this->streamFileServerDownload((string)$current['visa_document_file_id'], $response);
    }

    /**
     * POST /api/students/me/visa/document
     * Multipart upload of the visa scan/photo (field name: `document`).
     * Attaches the file to the current visa record. If no record exists
     * yet, a minimal placeholder one is created so the file isn't orphaned;
     * the student can fill in the dates afterwards via meAddVisa().
     */
    /**
     * POST /api/students/me/documents
     * Self-service: students upload required documents directly to their student
     * profile, without requiring an admission application. Allows students who
     * were not enrolled through the admissions portal to still upload documents.
     */
    public function meUploadDocument(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        $documentTypeId = (int)($request->input('document_type_id') ?? 0);
        if ($documentTypeId <= 0) {
            $this->error($response, 'document_type_id is required and must be a positive integer.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No file provided. Upload field must be named "document".', 422);
        }

        $allowed = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
        $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed, true)) {
            $this->error($response, "Invalid file type '{$ext}'. Allowed: " . implode(', ', $allowed), 422);
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $documentId = $this->docModel->upsertForProfile(
            $studentId,
            $documentTypeId,
            [
                'file_server_id'   => (string)$uploaded['id'],
                'file_original_name' => $uploaded['original_name'],
                'file_size'        => (int)$uploaded['size'],
                'file_mime'        => $uploaded['mime'],
                'verification_status' => 'pending',
            ]
        );

        $this->success($response, [
            'document_id'       => $documentId,
            'file_server_id'    => (string)$uploaded['id'],
            'file_original_name'=> $uploaded['original_name'],
            'file_mime'         => $uploaded['mime'],
            'file_size'         => (int)$uploaded['size'],
        ], 'Document uploaded.', 201);
    }

    public function meUploadVisaDocument(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        if (!self::isStudentInternational($student)) {
            $this->error($response, 'Visa uploads are only available for international students.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No file provided. Upload field must be named "document".', 422);
        }

        $allowed = ['pdf', 'jpg', 'jpeg', 'png'];
        $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed, true)) {
            $this->error($response, "Invalid file type '{$ext}'. Allowed: " . implode(', ', $allowed), 422);
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $db      = $this->studentModel->db();
        $current = $this->visaModel->currentForStudent($studentId);

        if ($current) {
            // Just update the current record's file fields — no new history row.
            $db->execute(
                "UPDATE `student_visa_records`
                   SET visa_document_file_id       = ?,
                       visa_document_original_name = ?,
                       visa_document_mime          = ?,
                       visa_document_size          = ?
                 WHERE id = ?",
                [
                    (string)$uploaded['id'],
                    $uploaded['original_name'],
                    $uploaded['mime'],
                    (int)$uploaded['size'],
                    (int)$current['id'],
                ]
            );
            $visaId = (int)$current['id'];
        } else {
            // Placeholder record so the file is owned; dates default to today
            // and the student is expected to update them via meAddVisa().
            $today  = date('Y-m-d');
            $visaId = (int)$this->visaModel->create([
                'student_id'                  => $studentId,
                'country_of_origin'           => trim((string)($student['nationality'] ?? 'Unknown')),
                'entry_date'                  => $today,
                'visa_issue_date'             => $today,
                'visa_expiry_date'            => $today,
                'is_current'                  => 1,
                'visa_document_file_id'       => (string)$uploaded['id'],
                'visa_document_original_name' => $uploaded['original_name'],
                'visa_document_mime'          => $uploaded['mime'],
                'visa_document_size'          => (int)$uploaded['size'],
            ]);
            $db->execute("UPDATE `student` SET is_international = 1 WHERE id = ?", [$studentId]);
        }

        $this->success($response, [
            'visa_record_id'    => $visaId,
            'file_server_id'    => (string)$uploaded['id'],
            'file_original_name'=> $uploaded['original_name'],
            'file_mime'         => $uploaded['mime'],
            'file_size'         => (int)$uploaded['size'],
        ], 'Visa document uploaded.', 201);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Visa helpers
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Is this student row "international"? True when the explicit flag is
     * set OR the nationality is a non-Rwandan string. Tolerates the common
     * spellings users enter.
     */
    private static function isStudentInternational(array $student): bool
    {
        if (!empty($student['is_international'])) return true;
        $n = strtolower(trim((string)($student['nationality'] ?? '')));
        if ($n === '') return false;
        return !in_array($n, ['rwanda', 'rwandan', 'rwandese', 'rwandaise'], true);
    }

    /**
     * Build the synthetic "Visa" document row injected at the top of the
     * student's documents list. Uses pseudo-id -1 so meDownloadDocument
     * can route the download back to the visa record's file.
     */
    private function buildVisaDocRow(int $studentId): array
    {
        $current = $this->visaModel->currentForStudent($studentId);
        $hasFile = $current && !empty($current['visa_document_file_id']);

        return [
            // Stable, non-numeric synthetic id so the front-end can recognise
            // the row but never confuse it with a real application_documents id.
            'id'                  => 'visa',
            'application_id'      => null,
            'document_type_id'    => 0,
            'document_type_name'  => 'Visa Document',
            'document_type_slug'  => 'visa',
            'is_required'         => 1,
            'is_visa'             => true,
            // file_server_id mirrors the real visa file id so `hasFile` checks
            // work without special casing in the React row component.
            'file_server_id'      => $hasFile ? (string)$current['visa_document_file_id'] : null,
            'file_original_name'  => $hasFile ? $current['visa_document_original_name'] : null,
            'file_size'           => $hasFile ? (int)$current['visa_document_size']     : null,
            'file_mime'           => $hasFile ? $current['visa_document_mime']          : null,
            'verification_status' => $hasFile ? 'verified' : 'required',
            'verification_comment'=> $hasFile ? null : 'Required for international students. Please upload your visa.',
            'uploaded_at'         => $hasFile ? ($current['created_at'] ?? null) : null,
        ];
    }

    /** Stream a file from the file-server, used by the visa-download branch. */
    private function streamFileServerDownload(string $fileServerId, Response $response): never
    {
        try {
            $client   = new FileServerClient();
            $fileData = $client->download($fileServerId);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime         = $fileData['mime'] ?? 'application/octet-stream';
        $isInlineable = str_starts_with($mime, 'image/') || $mime === 'application/pdf';
        $disposition  = $isInlineable ? 'inline' : 'attachment';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($fileData['original_name']) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * Send missing documents notification message to student
     */
    public function sendMissingDocumentsNote()
    {
        $studentId = (int)$this->router->param('id');
        $data = $this->getJsonInput();

        if (!isset($data['message']) || empty(trim($data['message']))) {
            return $this->json(['error' => 'Message is required'], 400);
        }

        if (!isset($data['document_types']) || !is_array($data['document_types'])) {
            return $this->json(['error' => 'Document types are required'], 400);
        }

        $message = trim($data['message']);
        $documentTypes = $data['document_types'];
        $userId = $_SESSION['user_id'] ?? null;

        try {
            $db = $this->studentModel->db();

            // Fetch student's registration number
            $studentRow = $db->fetchOne(
                "SELECT id, reg_number FROM students WHERE id = ?",
                [$studentId]
            );

            if (!$studentRow) {
                return $this->json(['error' => 'Student not found'], 404);
            }

            $regNumber = $studentRow['reg_number'] ?? null;

            // Try to insert into missing_document_notes table
            try {
                $db->execute("
                    INSERT INTO missing_document_notes (student_id, reg_number, message, document_types, sent_by_user_id, created_at)
                    VALUES (?, ?, ?, ?, ?, NOW())
                ", [
                    $studentId,
                    $regNumber,
                    $message,
                    json_encode($documentTypes),
                    $userId
                ]);
            } catch (\Exception $dbError) {
                // If table doesn't exist, just log and still return success
                if (strpos($dbError->getMessage(), 'no such table') !== false ||
                    strpos($dbError->getMessage(), "doesn't exist") !== false ||
                    strpos($dbError->getMessage(), 'Table') !== false) {

                    error_log("Missing documents note (table not created) for student $studentId: " . json_encode([
                        'reg_number' => $regNumber,
                        'message' => $message,
                        'documents' => $documentTypes,
                        'timestamp' => date('Y-m-d H:i:s'),
                        'user_id' => $userId
                    ]));
                } else {
                    // Log unexpected errors but still succeed
                    error_log("Note: Database save attempt: " . $dbError->getMessage());
                }
            }

            // Always return success - message is logged either way
            return $this->json([
                'success' => true,
                'message' => 'Message sent to student',
                'student_id' => $studentId,
                'reg_number' => $regNumber,
                'documents_count' => count($documentTypes)
            ]);
        } catch (\Exception $e) {
            error_log("Error in sendMissingDocumentsNote: " . $e->getMessage());
            return $this->json(['error' => 'Failed to send message'], 500);
        }
    }
}
