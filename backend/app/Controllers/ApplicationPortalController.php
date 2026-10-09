<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Models\AdmissionRequirementModel;
use App\Models\ApplicationStatusLogModel;
use App\Models\AdmissionOfferModel;
use App\Models\IntakeModel;
use App\Models\FacultyModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;

class ApplicationPortalController extends BaseController
{
    private StudentApplicationModel   $appModel;
    private ApplicationDocumentModel  $docModel;
    private AdmissionRequirementModel $requirementModel;
    private ApplicationStatusLogModel $logModel;
    private AdmissionOfferModel       $offerModel;
    private IntakeModel               $intakeModel;
    private FacultyModel              $facultyModel;
    private ApplicationService        $service;

    public function __construct()
    {
        $this->appModel         = new StudentApplicationModel();
        $this->docModel         = new ApplicationDocumentModel();
        $this->requirementModel = new AdmissionRequirementModel();
        $this->logModel         = new ApplicationStatusLogModel();
        $this->offerModel       = new AdmissionOfferModel();
        $this->intakeModel      = new IntakeModel();
        $this->facultyModel     = new FacultyModel();
        $this->service          = new ApplicationService();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Portal info endpoints (used to populate application form)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/portal/active-year
     */
    public function getActiveYear(Request $request, Response $response): never
    {
        try {
            $year = $this->service->getActiveAcademicYear();
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $this->success($response, [
            'id'         => $year['id'],
            'label'      => $year['label'],
            'start_date' => $year['start_date'],
            'end_date'   => $year['end_date'],
        ], 'Active academic year fetched.');
    }

    /**
     * GET /api/portal/intakes
     */
    public function getIntakes(Request $request, Response $response): never
    {
        $intakes = $this->intakeModel->getActive();
        $this->success($response, $intakes, 'Active intakes fetched successfully.');
    }

    /**
     * GET /api/portal/faculties
     */
    public function getFaculties(Request $request, Response $response): never
    {
        $faculties = $this->facultyModel->getAllWithSchool();
        $this->success($response, $faculties, 'Faculties fetched successfully.');
    }

    /**
     * GET /api/portal/document-types
     */
    public function getDocumentTypes(Request $request, Response $response): never
    {
        $types = (new \App\Models\ApplicationDocumentTypeModel())->getActive();
        $this->success($response, $types, 'Document types fetched.');
    }

    /**
     * POST /api/portal/check-identity
     *
     * Uniqueness pre-check for the apply wizard's personal step. Each of
     * phone / email / national_id must not already belong to an enrolled
     * student, so the wizard can block the applicant before they proceed
     * instead of failing much later at admission time.
     *
     * Body: any subset of { phone, email, national_id }.
     * Returns per-field { taken: bool, message: ?string } for the supplied
     * fields only — never any student's identity, so it can stay public.
     */
    public function checkIdentity(Request $request, Response $response): never
    {
        $body = $request->body();
        $db   = Database::getInstance();

        $results = [];

        $phone = trim((string)($body['phone'] ?? ''));
        if ($phone !== '') {
            $results['phone'] = $this->identityResult(
                $this->phoneBelongsToStudent($db, $phone),
                'This phone number is already registered to a student.'
            );
        }

        $email = strtolower(trim((string)($body['email'] ?? '')));
        if ($email !== '') {
            $taken = (bool)$db->fetchOne(
                "SELECT 1 FROM `student` WHERE LOWER(TRIM(email)) = ? LIMIT 1",
                [$email]
            );
            $results['email'] = $this->identityResult(
                $taken,
                'This email address is already registered to a student.'
            );
        }

        $nid = self::normaliseIdNumber((string)($body['national_id'] ?? ''));
        if ($nid !== '') {
            $taken = (bool)$db->fetchOne(
                "SELECT 1 FROM `student`
                  WHERE UPPER(REPLACE(REPLACE(REPLACE(TRIM(id_card), ' ', ''), '-', ''), '/', '')) = ?
                  LIMIT 1",
                [$nid]
            );
            $results['national_id'] = $this->identityResult(
                $taken,
                'This National ID / Passport number is already registered to a student.'
            );
        }

        $available = true;
        foreach ($results as $r) {
            if ($r['taken']) { $available = false; }
        }

        $this->success($response, [
            'available' => $available,
            'fields'    => $results,
        ], 'Identity check completed.');
    }

    /** @return array{taken: bool, message: ?string} */
    private function identityResult(bool $taken, string $message): array
    {
        return ['taken' => $taken, 'message' => $taken ? $message : null];
    }

    /**
     * Student phone numbers are stored unnormalised — "(078) 540-4943",
     * "+250788…", "0788…" all occur — so both sides are reduced to digits
     * and compared on the last 9 (the subscriber part of a Rwandan number),
     * which makes the check independent of separators and country prefix.
     */
    private function phoneBelongsToStudent(Database $db, string $phone): bool
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return false;
        }

        $stripped = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone, ''), ' ', ''), '(', ''), ')', ''), '-', ''), '+', ''), '.', ''), '/', '')";

        if (strlen($digits) >= 9) {
            $tail = substr($digits, -9);
            return (bool)$db->fetchOne(
                "SELECT 1 FROM `student` WHERE RIGHT($stripped, 9) = ? LIMIT 1",
                [$tail]
            );
        }

        return (bool)$db->fetchOne(
            "SELECT 1 FROM `student` WHERE $stripped = ? LIMIT 1",
            [$digits]
        );
    }

    /** Uppercased, separator-free form of an ID / passport number. */
    private static function normaliseIdNumber(string $value): string
    {
        return strtoupper(str_replace([' ', '-', '/'], '', trim($value)));
    }

    /**
     * GET /api/portal/faculties/:faculty_id/departments
     * Lists departments offered by a specific faculty for the application form.
     */
    public function getFacultyDepartments(Request $request, Response $response): never
    {
        $facultyId   = (int)$request->param('faculty_id');
        $departments = $this->facultyModel->getDepartmentsByFaculty($facultyId);

        $this->success($response, $departments, 'Departments fetched successfully.');
    }

    /**
     * GET /api/portal/programs
     * Returns every active program (option) with its department/faculty,
     * the campuses it's offered on, and basic metadata. Used by the
     * public apply wizard step 3 to render the program picker.
     */
    public function getPrograms(Request $request, Response $response): never
    {
        $db = Database::getInstance();

        // Optional `campus_id` — when supplied, only programs offered at that
        // campus are returned (prevents applicants from picking a program
        // that's not physically run at their chosen campus).
        $campusId = (int)($request->query('campus_id') ?? 0);

        $where = [];
        $bind  = [];
        $join  = '';
        $where[] = '(o.is_active = 1 OR o.is_active IS NULL)';
        if ($campusId > 0) {
            $join    = ' INNER JOIN `option_campuses` oc_filter ON oc_filter.option_id = o.id';
            $where[] = 'oc_filter.campus_id = ?';
            $bind[]  = $campusId;
        }
        $whereSql = empty($where) ? '' : 'WHERE ' . implode(' AND ', $where);

        $programs = $db->fetchAll(
            "SELECT DISTINCT o.id, o.name, o.is_active,
                    o.department_id,
                    d.dep_name AS department_name, d.dep_acronym AS department_code,
                    d.fac_id AS faculty_id,
                    f.fac_name AS faculty_name, f.fac_code AS faculty_code
             FROM `options` o
             LEFT JOIN `departements` d ON d.dep_id = o.department_id
             LEFT JOIN `faculty` f       ON f.fac_id = d.fac_id
             $join
             $whereSql
             ORDER BY o.name ASC",
            $bind
        );

        if (!empty($programs)) {
            $ids = array_map(static fn($r) => (int)$r['id'], $programs);
            $ph  = implode(',', array_fill(0, count($ids), '?'));
            $links = $db->fetchAll(
                "SELECT oc.option_id, oc.campus_id,
                        c.name AS campus_name, c.code AS campus_code, c.location AS campus_location
                 FROM `option_campuses` oc
                 JOIN `campuses` c ON c.id = oc.campus_id
                 WHERE oc.option_id IN ($ph)
                   AND (c.is_active = 1 OR c.is_active IS NULL)
                 ORDER BY c.name ASC",
                $ids,
            );
            $byProgram = [];
            foreach ($links as $l) {
                $pid = (int)$l['option_id'];
                $byProgram[$pid][] = [
                    'id'       => (int)$l['campus_id'],
                    'name'     => $l['campus_name'],
                    'code'     => $l['campus_code'],
                    'location' => $l['campus_location'],
                ];
            }
            foreach ($programs as &$p) {
                $p['campuses'] = $byProgram[(int)$p['id']] ?? [];
            }
            unset($p);
        }

        $this->success($response, $programs, 'Programs fetched successfully.');
    }

    /**
     * GET /api/portal/levels
     * Lookup list for the apply form.
     */
    public function getLevels(Request $request, Response $response): never
    {
        $db = Database::getInstance();
        $rows = $db->fetchAll("SELECT id, name FROM `levels` ORDER BY id ASC");
        $this->success($response, $rows, 'Levels fetched successfully.');
    }

    /**
     * GET /api/portal/departments/:department_id/options
     */
    public function getDepartmentOptions(Request $request, Response $response): never
    {
        $departmentId = (int)$request->param('department_id');
        $db = Database::getInstance();

        // Query options table for the given department
        $rows = $db->fetchAll(
            "SELECT id, name FROM `options` WHERE department_id = ? AND is_active = 1 ORDER BY name ASC",
            [$departmentId]
        );

        $this->success($response, $rows, 'Department options fetched successfully.');
    }

    /**
     * GET /api/portal/faculties/:faculty_id/requirements
     */
    public function getFacultyRequirements(Request $request, Response $response): never
    {
        $facultyId = (int)$request->param('faculty_id');

        try {
            $year = $this->service->getActiveAcademicYear();
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $requirements = $this->requirementModel->getForFaculty($facultyId, activeOnly: true);

        $this->success($response, [
            'academic_year' => ['id' => $year['id'], 'label' => $year['label']],
            'faculty_id'    => $facultyId,
            'requirements'  => $requirements,
        ], 'Document requirements fetched.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Application submission
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/portal/applications
     */
    public function submitApplication(Request $request, Response $response): never
    {
        try {
            $activeYear = $this->service->getActiveAcademicYear();
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $academicYearId = (int)$activeYear['id'];

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'faculty_id'         => 'required|numeric',
            'department_id'      => 'required|numeric',
            'intake'             => 'required|string|min:3|max:20',
            'first_name'         => 'required|string|min:2|max:100',
            'last_name'          => 'required|string|min:2|max:100',
            'email'              => 'required|email|max:150',
            'phone'              => 'required|string|min:7|max:30',
            'gender'             => 'required|in:M,F,Other',
            'birthdate'          => 'required|regex:/^\d{4}-\d{2}-\d{2}$/',
            'nationality'        => 'required|string|max:100',
            'prev_school'        => 'required|string|min:3|max:255',
            'prev_qualification' => 'required|string|max:150',
            'prev_grade'         => 'required|string|max:50',
            'graduation_year'    => 'required|numeric|min:1990|max:2030',
            'sponsorship'        => 'required|in:government,self,private,scholarship',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $facultyId    = (int)$data['faculty_id'];
        $departmentId = (int)$data['department_id'];

        // Verify the department belongs to the given faculty
        $departments   = $this->facultyModel->getDepartmentsByFaculty($facultyId);
        $departmentIds = array_column($departments, 'id');
        if (!in_array($departmentId, $departmentIds, false)) {
            $this->error($response, 'The selected department does not belong to this faculty.', 422);
        }

        // Program ↔ Campus sanity check (Task 1.5). If both program_id and
        // campus_id are supplied, the link must exist in `option_campuses`.
        $programId = isset($data['program_id']) ? (int)$data['program_id'] : 0;
        $campusId  = isset($data['campus_id'])  ? (int)$data['campus_id']  : 0;
        if ($programId > 0 && $campusId > 0) {
            $link = Database::getInstance()->fetchOne(
                "SELECT 1 FROM `option_campuses` WHERE option_id = ? AND campus_id = ? LIMIT 1",
                [$programId, $campusId]
            );
            if (!$link) {
                $this->error(
                    $response,
                    'The selected program is not offered at the chosen campus. Please pick a campus that hosts this program.',
                    422
                );
            }
        }

        // Duplicate check: active application for same email + department + intake + year
        if ($this->appModel->existsActiveForDeptIntake($data['email'], $departmentId, $data['intake'], $academicYearId)) {
            $this->error($response, 'An active application already exists for this email, department, and intake.', 409);
        }

        $appNumber = $this->service->generateApplicationNumber();
        $verificationCode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Task 1.11 — credit transfer / upgrading. The applicant flags it on
        // the form; the registry confirms exemption letters later.
        $isCreditTransfer  = !empty($data['is_credit_transfer']) ? 1 : 0;
        $creditTransferFrom = $isCreditTransfer
            ? (string)($data['credit_transfer_from'] ?? '')
            : null;
        $exemptionLetterStatus = $isCreditTransfer ? 'pending' : 'not_required';

        $appId = (int)$this->appModel->create([
            'application_number' => $appNumber,
            'academic_year_id'   => $academicYearId,
            'faculty_id'         => $facultyId,
            'department_id'      => $departmentId,
            'intake'             => $data['intake'],
            'is_credit_transfer'      => $isCreditTransfer,
            'credit_transfer_from'    => $creditTransferFrom,
            'exemption_letter_status' => $exemptionLetterStatus,
            'first_name'         => trim($data['first_name']),
            'last_name'          => trim($data['last_name']),
            'email'              => strtolower(trim($data['email'])),
            'phone'              => $data['phone'],
            'gender'             => $data['gender'],
            'birthdate'          => $data['birthdate'],
            'nationality'        => $data['nationality'] ?? 'Rwandan',
            'address'            => $data['address']     ?? null,
            'prev_school'        => $data['prev_school'],
            'prev_qualification' => $data['prev_qualification'],
            'prev_grade'         => $data['prev_grade'],
            'combination'        => $data['combination'] ?? null,
            'graduation_year'    => (int)$data['graduation_year'],
            'sponsorship'        => $data['sponsorship'],
            'sponsor_name'       => $data['sponsor_name'] ?? null,
            'status'             => 'submitted',
            'submitted_at'       => date('Y-m-d H:i:s'),
            'verification_code'  => $verificationCode,
            'ip_address'         => $this->resolveIp($request),
        ]);

        $this->service->logStatusChange($appId, null, 'submitted', null, 'applicant', 'Application submitted.');

        // Fetch department name for the confirmation email
        $db             = Database::getInstance();
        $dept           = $db->fetchOne("SELECT dep_name FROM `departements` WHERE dep_id = ? LIMIT 1", [$departmentId]);
        $departmentName = $dept['dep_name'] ?? '';

        $this->service->sendApplicationEmail('application_received', [
            'first_name' => $data['first_name'],
            'last_name'  => $data['last_name'],
            'email'      => $data['email'],
        ], [
            'application_number' => $appNumber,
            'program_name'       => $departmentName,
            'verification_code'  => $verificationCode,
        ]);

        $this->success($response, [
            'id'                 => $appId,
            'application_number' => $appNumber,
            'academic_year'      => $activeYear['label'],
            'status'             => 'submitted',
        ], 'Application submitted successfully. Please upload your required documents.', 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Application tracking
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/portal/applications/:application_number
     */
    public function trackApplication(Request $request, Response $response): never
    {
        $appNumber   = $request->param('application_number');
        $application = $this->appModel->findByApplicationNumber($appNumber);

        if (!$application) {
            $this->error($response, 'Application not found. Please check your application number.', 404);
        }

        $documents = $this->docModel->getForApplication((int)$application['id']);
        $statusLog = $this->logModel->getForApplication((int)$application['id']);

        $requirements = $this->requirementModel->getForFaculty(
            (int)$application['faculty_id']
        );

        $uploadedMap = [];
        foreach ($documents as $doc) {
            $uploadedMap[(int)$doc['document_type_id']] = [
                'verification_status' => $doc['verification_status'],
                'uploaded_at'         => $doc['uploaded_at'],
                'verification_comment'     => $doc['verification_comment'],
            ];
        }

        $checklist = array_map(function ($req) use ($uploadedMap) {
            $typeId   = (int)$req['document_type_id'];
            $uploaded = $uploadedMap[$typeId] ?? null;
            return [
                'document_type_id'    => $typeId,
                'document_type_name'  => $req['document_type_name'],
                'document_type_slug'  => $req['document_type_slug'],
                'is_required'         => (bool)$req['is_required'],
                'notes'               => $req['notes'],
                'sort_order'          => $req['sort_order'],
                'uploaded'            => $uploaded !== null,
                'verification_status' => $uploaded['verification_status'] ?? null,
                'uploaded_at'         => $uploaded['uploaded_at']         ?? null,
                'verification_comment'     => $uploaded['verification_comment']     ?? null,
            ];
        }, $requirements);

        $offer = null;
        if ($application['status'] === 'offered') {
            $rawOffer = $this->offerModel->findByApplicationId((int)$application['id']);
            if ($rawOffer) {
                $offer = [
                    'offer_letter_reference' => $rawOffer['offer_letter_reference'],
                    'expires_at'             => $rawOffer['expires_at'],
                    'status'                 => $rawOffer['status'],
                ];
            }
        }

        $db   = Database::getInstance();
        $dept = $db->fetchOne(
            "SELECT dep_name, dep_acronym FROM `departements` WHERE dep_id = ? LIMIT 1",
            [(int)$application['department_id']]
        );
        $faculty = $db->fetchOne(
            "SELECT fac_name FROM `faculty` WHERE fac_id = ? LIMIT 1",
            [(int)$application['faculty_id']]
        );
        $year = $db->fetchOne(
            "SELECT label FROM `academic_years` WHERE id = ? LIMIT 1",
            [(int)$application['academic_year_id']]
        );

        $this->success($response, [
            'application_number'  => $application['application_number'],
            'id'                  => (int)$application['id'],
            'faculty_id'          => (int)$application['faculty_id'],
            'department_id'       => (int)$application['department_id'],
            'academic_year_id'    => (int)$application['academic_year_id'],
            'academic_year'       => $year['label']       ?? '',
            'faculty_name'        => $faculty['fac_name'] ?? '',
            'department_name'     => $dept['dep_name']    ?? '',
            'department_code'     => $dept['dep_acronym'] ?? '',
            'intake'              => $application['intake'],
            'first_name'          => $application['first_name'],
            'last_name'           => $application['last_name'],
            'email'               => $application['email'],
            'email_verified'      => (int)$application['email_verified'],
            'status'              => $application['status'],
            'document_status'     => $application['document_status'],
            'submitted_at'        => $application['submitted_at'],
            'documents'           => $documents,
            'document_checklist'  => $checklist,
            'status_log'          => array_map(fn($l) => [
                'from_status' => $l['from_status'],
                'to_status'   => $l['to_status'],
                'actor_type'  => $l['actor_type'],
                'notes'       => $l['notes'],
                'created_at'  => $l['created_at'],
            ], $statusLog),
            'offer'               => $offer,
        ], 'Application status fetched.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Document upload
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/portal/applications/:application_number/documents
     */
    public function uploadDocument(Request $request, Response $response): never
    {
        $appNumber   = $request->param('application_number');
        $application = $this->appModel->findByApplicationNumber($appNumber);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $allowedStatuses = ['submitted', 'documents_under_review', 'documents_rejected'];
        if (!in_array($application['status'], $allowedStatuses, true)) {
            $this->error($response, 'Documents cannot be uploaded at this stage of the application.', 422);
        }

        $body   = $request->body();
        $errors = ValidationHelper::validate($body, [
            'document_type_id' => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $docTypeId = (int)$body['document_type_id'];

        $requirements   = $this->requirementModel->getForFaculty(
            (int)$application['faculty_id']
        );

        $allowedTypeIds = array_column($requirements, 'document_type_id');
        if (!in_array((string)$docTypeId, $allowedTypeIds, true) && !in_array($docTypeId, $allowedTypeIds, true)) {
            $this->error($response, 'This document type is not required for your selected faculty.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No document file provided. Please attach a file.', 422);
        }

        // Validate file extension against requirement rules
        $matchingReq = null;
        foreach ($requirements as $req) {
            if ((int)$req['document_type_id'] === $docTypeId) {
                $matchingReq = $req;
                break;
            }
        }

        if ($matchingReq && !empty($matchingReq['allowed_extensions'])) {
            $allowed = array_map('trim', explode(',', strtolower($matchingReq['allowed_extensions'])));
            $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $allowed, true)) {
                $this->error($response, "Invalid file type '{$ext}'. Allowed extensions: " . implode(', ', $allowed), 422);
            }
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $appId = (int)$application['id'];

        $docId = $this->docModel->upsert($appId, $docTypeId, [
            'file_server_id'      => $uploaded['id'],
            'file_original_name'  => $uploaded['original_name'],
            'file_size'           => $uploaded['size'],
            'file_mime'           => $uploaded['mime'],
            'verification_status' => 'pending',
            'verified_by'         => null,
            'verified_at'         => null,
            'verification_comment'     => null,
        ]);

        $docStatus = $this->service->checkDocumentCompleteness($appId);
        $this->appModel->update($appId, ['document_status' => $docStatus]);

        $reqEntry = current(array_filter($requirements, fn($r) => (int)$r['document_type_id'] === $docTypeId));

        $this->success($response, [
            'id'                  => (int)$docId,
            'document_type_id'    => $docTypeId,
            'document_type_name'  => $reqEntry['document_type_name'] ?? '',
            'verification_status' => 'pending',
            'document_status'     => $docStatus,
        ], 'Document uploaded successfully.', 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Offer response
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/portal/applications/:application_number/respond
     */
    public function respondToOffer(Request $request, Response $response): never
    {
        $appNumber   = $request->param('application_number');
        $application = $this->appModel->findByApplicationNumber($appNumber);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        if ($application['status'] !== 'offered') {
            $this->error($response, 'No active offer found for this application.', 422);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'response' => 'required|in:accepted,declined',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $appId = (int)$application['id'];
        $offer = $this->offerModel->findByApplicationId($appId);

        if (!$offer) {
            $this->error($response, 'Offer record not found.', 404);
        }

        if (strtotime($offer['expires_at']) < strtotime(date('Y-m-d'))) {
            $this->offerModel->update((int)$offer['id'], ['status' => 'expired']);
            $this->error($response, 'This offer has expired. Please contact the admissions office.', 422);
        }

        $action    = $data['response'];
        $newStatus = $action === 'accepted' ? 'offer_accepted' : 'offer_declined';
        $from      = $application['status'];

        $this->offerModel->update((int)$offer['id'], [
            'status'         => $action === 'accepted' ? 'accepted' : 'declined',
            'responded_at'   => date('Y-m-d H:i:s'),
            'response_notes' => $data['notes'] ?? null,
        ]);

        $this->appModel->update($appId, ['status' => $newStatus]);
        $this->service->logStatusChange(
            $appId, $from, $newStatus, null,
            'applicant', "Applicant responded: {$action}."
        );

        // Fetch department name for email
        $db             = Database::getInstance();
        $dept           = $db->fetchOne(
            "SELECT dep_name FROM `departements` WHERE dep_id = ? LIMIT 1",
            [(int)$application['department_id']]
        );
        $departmentName = $dept['dep_name'] ?? '';

        if ($action === 'accepted') {
            $this->service->sendApplicationEmail('offer_accepted', [
                'first_name' => $application['first_name'],
                'last_name'  => $application['last_name'],
                'email'      => $application['email'],
            ], ['program_name' => $departmentName]);
        }

        $this->success($response, ['status' => $newStatus], 'Your response has been recorded successfully.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function resolveIp(Request $request): ?string
    {
        $forwarded = $request->header('X-Forwarded-For');
        if ($forwarded) {
            return trim(explode(',', $forwarded)[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? null;
    }
}
