<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\StudentModel;
use App\Models\ApplicationDocumentModel;
use App\Models\StudentApplicationModel;
use App\Models\StudentVisaRecordModel;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;
use App\Services\SystemLogService;

class StudentController extends BaseController
{
    private StudentModel $studentModel;
    private ApplicationDocumentModel $docModel;
    private StudentVisaRecordModel $visaModel;

    public function __construct()
    {
        $this->studentModel = new StudentModel();
        $this->docModel     = new ApplicationDocumentModel();
        $this->visaModel    = new StudentVisaRecordModel();
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

        if (!$applicationId) {
            $this->success($response, [
                'application_id'  => null,
                'documents'       => [],
                'admission_offer' => $offer,
            ], 'Student has no linked application.');
        }

        $documents = $this->docModel->getForApplication($applicationId);

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
     * List all students with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? $request->query('q') ?? '';
        
        $sortBy  = $request->query('sort_by');
        $sortDir = strtoupper($request->query('sort_dir') ?? 'DESC');

        $allowedSorts = ['id', 'fname', 'lname', 'regnumber', 'email', 'gender', 'nationality'];
        if (!in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'id';
        }
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(fname LIKE ? OR lname LIKE ? OR regnumber LIKE ? OR email LIKE ?)";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
        }

        // Exact-match filter columns accepted from the query string.
        $filterable = [
            'student_state', 'gender', 'faculty', 'department',
            'current_level', 'nationality', 'acc_year', 'program',
            'std_option', 'campus', 'intake',
        ];

        foreach ($filterable as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '') {
                $lower = strtolower((string)$val);
                // Treat "rwandan" family as a single bucket for the Rwandan vs Foreign overview
                if ($col === 'nationality' && $lower === 'rwandan') {
                    $clauses[]  = "LOWER(nationality) IN ('rwandan','rwandana','rwandese')";
                } elseif ($col === 'nationality' && $lower === 'foreign') {
                    $clauses[]  = "(nationality IS NOT NULL AND nationality <> '' AND LOWER(nationality) NOT IN ('rwandan','rwandana','rwandese'))";
                } elseif ($col === 'nationality' && $lower === 'unknown') {
                    $clauses[] = "(nationality IS NULL OR nationality = '')";
                } elseif ($col === 'gender') {
                    if (in_array($lower, ['m', 'male'], true)) {
                        $clauses[]  = "LOWER(gender) IN ('m','male')";
                    } elseif (in_array($lower, ['f', 'female'], true)) {
                        $clauses[]  = "LOWER(gender) IN ('f','female')";
                    } elseif ($lower === 'unknown') {
                        $clauses[] = "(gender IS NULL OR gender = '' OR LOWER(gender) NOT IN ('m','male','f','female'))";
                    }
                } elseif ($col === 'acc_year') {
                    // academic_years.label uses "2024/2025" (slash) while student.acc_year
                    // is historically stored as "2024-2025" (dash). Accept either format
                    // from the client and match against both.
                    $variants = self::accYearVariants((string)$val);
                    $ph = implode(',', array_fill(0, count($variants), '?'));
                    $clauses[] = "acc_year IN ($ph)";
                    foreach ($variants as $v) { $bindings[] = $v; }
                } elseif ($col === 'std_option') {
                    // Programme scoping. Match the option through every place
                    // a programme link can live for a student row — but never
                    // widen to the option's *department*, otherwise every
                    // programme in the same department returns the same
                    // cohort and switching programmes appears to do nothing.
                    $optionId = (int)$val;
                    $opt      = null;
                    if ($optionId > 0) {
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
                        $sub[] = 'LOWER(TRIM(std_option)) = LOWER(?)';
                        $bindings[] = $a;
                        $sub[] = 'LOWER(TRIM(program)) = LOWER(?)';
                        $bindings[] = $a;
                    }
                    if ($optionId > 0) {
                        $sub[] = 'id IN (
                            SELECT ao.student_id
                            FROM `admission_offers` ao
                            JOIN `student_applications` sa ON sa.id = ao.application_id
                            WHERE sa.program_id = ?
                        )';
                        $bindings[] = $optionId;

                        $sub[] = 'user_id IN (
                            SELECT ap.user_id
                            FROM `applicant_profiles` ap
                            JOIN `student_applications` sa2 ON sa2.id = ap.application_id
                            WHERE sa2.program_id = ? AND ap.user_id IS NOT NULL
                        )';
                        $bindings[] = $optionId;
                    }
                    $clauses[] = '(' . implode(' OR ', $sub) . ')';
                } else {
                    $clauses[]  = "`$col` = ?";
                    $bindings[] = $val;
                }
            }
        }

        $where = $clauses ? implode(' AND ', $clauses) : '';

        $paginated = $this->studentModel->paginate($page, $perPage, $where, $bindings, $sortBy, $sortDir);

        $this->success($response, $paginated, 'Students fetched successfully.');
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

        $this->success($response, $student, 'Student profile fetched.');
    }

    /**
     * GET /api/students/me/documents
     * Self-service: documents uploaded by the authenticated student during
     * their admission application. Mirrors `documents()` but doesn't require
     * VIEW_STUDENTS — the row is auto-resolved to the caller.
     */
    public function meDocuments(Request $request, Response $response): never
    {
        $student   = $this->resolveSelfStudent($request, $response);
        $studentId = (int)$student['id'];

        $applicationId = $this->resolveApplicationId($studentId);
        $offer         = $this->resolveAdmissionOffer($studentId);

        if (!$applicationId) {
            $this->success($response, [
                'application_id'  => null,
                'documents'       => [],
                'admission_offer' => $offer,
            ], 'You have no linked application.');
        }

        $documents = $this->docModel->getForApplication($applicationId);

        $this->success($response, [
            'application_id'  => $applicationId,
            'documents'       => $documents,
            'admission_offer' => $offer,
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

        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!in_array($file['type'] ?? '', $allowedMimes, true)) {
            $this->error($response, 'Invalid file type. Only JPEG, PNG and WebP are allowed.', 422);
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
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

        // Whitelist of self-editable columns. Anything else in the payload is
        // silently dropped so a malicious client can't promote themselves to a
        // different program / level / faculty.
        $editable = [
            'phone', 'marital_status',
            // Residency — student-controlled location data. `address` and
            // `residence_district` live on the application record and stay
            // admin-only on purpose.
            'province', 'district', 'sector', 'cell', 'village',
        ];

        $patch = [];
        foreach ($editable as $col) {
            if (array_key_exists($col, $body)) {
                $val = $body[$col];
                $patch[$col] = is_string($val) ? trim($val) : $val;
            }
        }

        $errors = ValidationHelper::validate($patch, [
            'phone'          => ['min:6', 'max:30'],
            'marital_status' => ['in:single,married,divorced,widowed'],
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
     * Official CUR grading scheme — kept in sync with ModuleMarksController
     * so an exemption mark gets the same letter grade it would have received
     * had the student sat the module.
     */
    private function gradeFor(float $pct): string
    {
        if ($pct >= 80) return 'A'; // Very Good
        if ($pct >= 70) return 'B'; // Good
        if ($pct >= 60) return 'C'; // Satisfaction
        if ($pct >= 50) return 'D'; // Pass
        return 'E';                 // Fail
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
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND faculty  <> '' THEN faculty  END) AS active_faculties,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND department <> '' THEN department END) AS active_departments,
              COUNT(DISTINCT CASE WHEN LOWER(student_state) = 'active' AND acc_year <> '' THEN acc_year END) AS active_academic_years
            FROM student
            WHERE 1=1{$yearScope}
        ", $yearBind) ?: [];

        // Breakdowns — ACTIVE students only. These power the "Active students" overview.
        $byLevel = $db->fetchAll("
            SELECT s.current_level AS value, l.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN levels l ON l.id = s.current_level
            WHERE LOWER(s.student_state) = 'active'
              AND s.current_level IS NOT NULL AND s.current_level <> ''
              {$yearScopeS}
            GROUP BY s.current_level, l.name
            ORDER BY s.current_level ASC
            LIMIT 20
        ", $yearBind);

        $byFaculty = $db->fetchAll("
            SELECT s.faculty AS value, f.fac_name AS label, f.fac_code AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN faculty f ON f.fac_id = s.faculty
            WHERE LOWER(s.student_state) = 'active'
              AND s.faculty IS NOT NULL AND s.faculty <> ''
              {$yearScopeS}
            GROUP BY s.faculty, f.fac_name, f.fac_code
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        $byDepartment = $db->fetchAll("
            SELECT s.department AS value, d.dep_name AS label, d.dep_acronym AS code, COUNT(*) AS total
            FROM student s
            LEFT JOIN departements d ON d.dep_id = s.department
            WHERE LOWER(s.student_state) = 'active'
              AND s.department IS NOT NULL AND s.department <> ''
              {$yearScopeS}
            GROUP BY s.department, d.dep_name, d.dep_acronym
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        $byProgram = $db->fetchAll("
            SELECT program AS value, program AS label, COUNT(*) AS total
            FROM student
            WHERE LOWER(student_state) = 'active'
              AND program IS NOT NULL AND program <> ''
              {$yearScope}
            GROUP BY program
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        // student.campus stores the campuses.id as a varchar — join for a
        // human-readable label, fall back to the raw value for legacy rows.
        $byCampus = $db->fetchAll("
            SELECT s.campus AS value, c.name AS label, COUNT(*) AS total
            FROM student s
            LEFT JOIN campuses c ON c.id = s.campus
            WHERE LOWER(s.student_state) = 'active'
              AND s.campus IS NOT NULL AND s.campus <> ''
              {$yearScopeS}
            GROUP BY s.campus, c.name
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        // student.intake is free-text (the intake name) — group on it directly.
        $byIntake = $db->fetchAll("
            SELECT intake AS value, intake AS label, COUNT(*) AS total
            FROM student
            WHERE LOWER(student_state) = 'active'
              AND intake IS NOT NULL AND intake <> ''
              {$yearScope}
            GROUP BY intake
            ORDER BY total DESC
            LIMIT 20
        ", $yearBind);

        // Distinct filter values joined to their reference tables so labels are human-readable
        // (student.faculty/department/current_level are stored as numeric IDs as VARCHAR).
        $faculties = $db->fetchAll("
            SELECT DISTINCT s.faculty AS v, f.fac_name AS label
            FROM student s
            LEFT JOIN faculty f ON f.fac_id = s.faculty
            WHERE s.faculty IS NOT NULL AND s.faculty <> ''
            ORDER BY label IS NULL, label ASC
            LIMIT 100
        ");
        $departments = $db->fetchAll("
            SELECT DISTINCT s.department AS v, d.dep_name AS label
            FROM student s
            LEFT JOIN departements d ON d.dep_id = s.department
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
                'by_faculty'    => $byFaculty,
                'by_department' => $byDepartment,
                'by_level'      => $byLevel,
                'by_program'    => $byProgram,
                'by_campus'     => $byCampus,
                'by_intake'     => $byIntake,
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
        $rows = $db->fetchAll("
            SELECT s.id, s.regnumber, s.fname, s.lname, s.email, s.nationality,
                   s.assigned_registry_user_id,
                   u.full_name AS assigned_registry_name,
                   v.country_of_origin,
                   v.visa_type,
                   v.entry_date,
                   v.visa_issue_date,
                   v.visa_expiry_date,
                   CASE WHEN v.visa_expiry_date IS NULL THEN NULL
                        ELSE DATEDIFF(v.visa_expiry_date, CURDATE()) END AS days_to_expiry
              FROM `student` s
              LEFT JOIN `users` u ON u.id = s.assigned_registry_user_id
              LEFT JOIN `student_visa_records` v
                ON v.student_id = s.id AND v.is_current = 1
             WHERE s.is_international = 1
             ORDER BY days_to_expiry ASC, s.lname ASC
        ");
        $this->success($response, ['students' => $rows, 'count' => count($rows)], 'International students fetched.');
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
}
