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
    private FacultyModel              $facultyModel;
    private ApplicationService        $service;

    public function __construct()
    {
        $this->appModel         = new StudentApplicationModel();
        $this->docModel         = new ApplicationDocumentModel();
        $this->requirementModel = new AdmissionRequirementModel();
        $this->logModel         = new ApplicationStatusLogModel();
        $this->offerModel       = new AdmissionOfferModel();
        $this->facultyModel     = new FacultyModel();
        $this->service          = new ApplicationService();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Portal info endpoints (used to populate application form)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/portal/active-year
     * Returns the currently active academic year.
     * The frontend uses this to confirm the system is open for applications.
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
     * GET /api/portal/faculties
     * Lists all faculties with school context for the faculty-selection step.
     */
    public function getFaculties(Request $request, Response $response): never
    {
        $faculties = $this->facultyModel->getAllWithSchool();
        $this->success($response, $faculties, 'Faculties fetched successfully.');
    }

    /**
     * GET /api/portal/faculties/:faculty_id/programs
     * Lists active programs offered by a specific faculty.
     * Applicant selects program after choosing faculty.
     */
    public function getFacultyPrograms(Request $request, Response $response): never
    {
        $facultyId = (int)$request->param('faculty_id');
        $programs  = $this->facultyModel->getProgramsByFaculty($facultyId);

        if (empty($programs)) {
            $this->success($response, [], 'No active programs found for this faculty.');
        }

        $this->success($response, $programs, 'Programs fetched successfully.');
    }

    /**
     * GET /api/portal/faculties/:faculty_id/requirements
     * Returns the document requirements for a faculty in the active academic year.
     * Applicant uses this to know what to upload.
     */
    public function getFacultyRequirements(Request $request, Response $response): never
    {
        $facultyId = (int)$request->param('faculty_id');

        try {
            $year = $this->service->getActiveAcademicYear();
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $requirements = $this->requirementModel->getForFacultyYear($facultyId, (int)$year['id']);

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
     * Submit a new student application.
     *
     * academic_year_id is never taken from the request — it is always resolved
     * server-side from the active academic year.
     * faculty_id must be supplied and must own the chosen program.
     */
    public function submitApplication(Request $request, Response $response): never
    {
        // Resolve active academic year first
        try {
            $activeYear = $this->service->getActiveAcademicYear();
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $academicYearId = (int)$activeYear['id'];

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'faculty_id'         => 'required|numeric',
            'program_id'         => 'required|numeric',
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

        $facultyId = (int)$data['faculty_id'];
        $programId = (int)$data['program_id'];

        // Verify the program belongs to the given faculty
        $programs = $this->facultyModel->getProgramsByFaculty($facultyId);
        $programIds = array_column($programs, 'id');
        if (!in_array((string)$programId, $programIds, true) && !in_array($programId, $programIds, true)) {
            $this->error($response, 'The selected program does not belong to this faculty.', 422);
        }

        // Duplicate check: active application for same email + program + intake + year
        if ($this->appModel->existsActiveForProgramIntake($data['email'], $programId, $data['intake'], $academicYearId)) {
            $this->error($response, 'An active application already exists for this email, program, and intake.', 409);
        }

        $appNumber = $this->service->generateApplicationNumber();

        $appId = (int)$this->appModel->create([
            'application_number' => $appNumber,
            'academic_year_id'   => $academicYearId,
            'faculty_id'         => $facultyId,
            'program_id'         => $programId,
            'intake'             => $data['intake'],
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
            'ip_address'         => $this->resolveIp($request),
        ]);

        $this->service->logStatusChange($appId, null, 'submitted', null, 'applicant', 'Application submitted.');

        // Fetch program name for the confirmation email
        $db          = Database::getInstance();
        $program     = $db->fetchOne("SELECT name FROM `programs` WHERE id = ? LIMIT 1", [$programId]);
        $programName = $program['name'] ?? '';

        $this->service->sendApplicationEmail('application_received', [
            'first_name' => $data['first_name'],
            'last_name'  => $data['last_name'],
            'email'      => $data['email'],
        ], [
            'application_number' => $appNumber,
            'program_name'       => $programName,
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
     * Track application status — sanitised public view (no file IDs exposed).
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

        // Fetch the document requirements for this faculty + year so the applicant
        // can see what else they need to upload
        $requirements = $this->requirementModel->getForFacultyYear(
            (int)$application['faculty_id'],
            (int)$application['academic_year_id']
        );

        // Build a map: document_type_id → uploaded doc status
        $uploadedMap = [];
        foreach ($documents as $doc) {
            $uploadedMap[(int)$doc['document_type_id']] = [
                'verification_status' => $doc['verification_status'],
                'uploaded_at'         => $doc['uploaded_at'],
                'rejection_notes'     => $doc['rejection_notes'],
            ];
        }

        // Merge requirements with upload status
        $checklist = array_map(function ($req) use ($uploadedMap) {
            $typeId   = (int)$req['document_type_id'];
            $uploaded = $uploadedMap[$typeId] ?? null;
            return [
                'document_type_id'    => $typeId,
                'document_name'       => $req['document_name'],
                'document_slug'       => $req['document_slug'],
                'is_required'         => (bool)$req['is_required'],
                'notes'               => $req['notes'],
                'sort_order'          => $req['sort_order'],
                'uploaded'            => $uploaded !== null,
                'verification_status' => $uploaded['verification_status'] ?? null,
                'uploaded_at'         => $uploaded['uploaded_at']         ?? null,
                'rejection_notes'     => $uploaded['rejection_notes']     ?? null,
            ];
        }, $requirements);

        // Active offer details (if in offered state)
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

        $db      = Database::getInstance();
        $program = $db->fetchOne("SELECT name, code FROM `programs` WHERE id = ? LIMIT 1", [(int)$application['program_id']]);
        $faculty = $db->fetchOne("SELECT fac_name FROM `faculty` WHERE fac_id = ? LIMIT 1", [(int)$application['faculty_id']]);
        $year    = $db->fetchOne("SELECT label FROM `academic_years` WHERE id = ? LIMIT 1", [(int)$application['academic_year_id']]);

        $this->success($response, [
            'application_number' => $application['application_number'],
            'academic_year'      => $year['label']    ?? '',
            'faculty_name'       => $faculty['fac_name'] ?? '',
            'program_name'       => $program['name']  ?? '',
            'program_code'       => $program['code']  ?? '',
            'intake'             => $application['intake'],
            'first_name'         => $application['first_name'],
            'last_name'          => $application['last_name'],
            'status'             => $application['status'],
            'document_status'    => $application['document_status'],
            'submitted_at'       => $application['submitted_at'],
            'document_checklist' => $checklist,
            'status_log'         => array_map(fn($l) => [
                'from_status' => $l['from_status'],
                'to_status'   => $l['to_status'],
                'actor_type'  => $l['actor_type'],
                'notes'       => $l['notes'],
                'created_at'  => $l['created_at'],
            ], $statusLog),
            'offer'              => $offer,
        ], 'Application status fetched.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Document upload
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/portal/applications/:application_number/documents
     * Upload a document for an open application.
     * Only document types configured in admission_requirements for that faculty+year are accepted.
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

        // Verify this document type is part of the faculty+year requirements
        $requirements = $this->requirementModel->getForFacultyYear(
            (int)$application['faculty_id'],
            (int)$application['academic_year_id']
        );

        $allowedTypeIds = array_column($requirements, 'document_type_id');
        if (!in_array((string)$docTypeId, $allowedTypeIds, true) && !in_array($docTypeId, $allowedTypeIds, true)) {
            $this->error($response, 'This document type is not required for your selected faculty and academic year.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No document file provided. Please attach a file.', 422);
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
            'rejection_notes'     => null,
        ]);

        // Recalculate document completeness and update application
        $docStatus = $this->service->checkDocumentCompleteness($appId);
        $this->appModel->update($appId, ['document_status' => $docStatus]);

        // Find the requirement entry to return its label
        $reqEntry = current(array_filter($requirements, fn($r) => (int)$r['document_type_id'] === $docTypeId));

        $this->success($response, [
            'id'                  => (int)$docId,
            'document_type_id'    => $docTypeId,
            'document_name'       => $reqEntry['document_name'] ?? '',
            'verification_status' => 'pending',
            'document_status'     => $docStatus,
        ], 'Document uploaded successfully.', 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Offer response
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/portal/applications/:application_number/respond
     * Applicant accepts or declines an admission offer.
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

        // Check expiry
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

        // Fetch program name for email
        $db          = Database::getInstance();
        $program     = $db->fetchOne("SELECT name FROM `programs` WHERE id = ? LIMIT 1", [(int)$application['program_id']]);
        $programName = $program['name'] ?? '';

        if ($action === 'accepted') {
            $this->service->sendApplicationEmail('offer_accepted', [
                'first_name' => $application['first_name'],
                'last_name'  => $application['last_name'],
                'email'      => $application['email'],
            ], ['program_name' => $programName]);
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
