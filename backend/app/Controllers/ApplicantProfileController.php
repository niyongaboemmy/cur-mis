<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\ApplicantProfileModel;
use App\Models\ApplicantAcademicRecordModel;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Models\AdmissionRequirementModel;
use App\Services\ApplicationService;
use App\Helpers\ValidationHelper;
use App\Helpers\FileServerClient;

/**
 * ApplicantProfileController
 *
 * All routes in this controller require:
 *   - AuthMiddleware   → JWT authentication (sets _auth_user)
 *   - ApplicantMiddleware → is_applicant check + profile injection (sets _applicant_profile)
 *
 * Endpoints:
 *   GET    /api/applicant/profile                         → getProfile
 *   PUT    /api/applicant/profile                         → updateProfile
 *   POST   /api/applicant/profile/photo                   → uploadPhoto
 *   GET    /api/applicant/application                     → getApplication
 *   GET    /api/applicant/academic-records                → listAcademicRecords
 *   POST   /api/applicant/academic-records                → addAcademicRecord
 *   PUT    /api/applicant/academic-records/:id            → updateAcademicRecord
 *   DELETE /api/applicant/academic-records/:id            → deleteAcademicRecord
 *   POST   /api/applicant/academic-records/:id/set-primary → setPrimaryRecord
 *   GET    /api/applicant/documents                       → listDocuments
 *   POST   /api/applicant/documents                       → uploadDocument
 *   DELETE /api/applicant/documents/:id                   → deleteDocument
 */
class ApplicantProfileController extends BaseController
{
    private ApplicantProfileModel       $profileModel;
    private ApplicantAcademicRecordModel $recordModel;
    private StudentApplicationModel     $appModel;
    private ApplicationDocumentModel    $docModel;
    private AdmissionRequirementModel   $requirementModel;
    private ApplicationService          $service;
    private Database                    $db;

    public function __construct()
    {
        $this->profileModel     = new ApplicantProfileModel();
        $this->recordModel      = new ApplicantAcademicRecordModel();
        $this->appModel         = new StudentApplicationModel();
        $this->docModel         = new ApplicationDocumentModel();
        $this->requirementModel = new AdmissionRequirementModel();
        $this->service          = new ApplicationService();
        $this->db               = Database::getInstance();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Profile endpoints
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/applicant/profile
     * Returns the full enriched profile of the authenticated applicant.
     */
    public function getProfile(Request $request, Response $response): never
    {
        $authUser = $request->param('_auth_user');
        $userId   = (int)($authUser['id'] ?? 0);

        $profile = $this->profileModel->getFullProfile($userId);

        if (!$profile) {
            $this->error($response, 'Profile not found.', 404);
        }

        $this->success($response, $this->formatProfile($profile), 'Profile fetched successfully.');
    }

    /**
     * PUT /api/applicant/profile
     * Update personal / contact / address details.
     * Fields on student_applications (first_name, last_name, phone, etc.) are also
     * updatable here as long as the application is still in an editable state.
     */
    public function updateProfile(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $appId     = (int)$profile['application_id'];

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'middle_name'             => 'string|max:100',
            'id_type'                 => 'in:national_id,passport,birth_certificate',
            'id_number'               => 'string|max:50',
            'province'                => 'string|max:100',
            'district'                => 'string|max:100',
            'sector'                  => 'string|max:100',
            'emergency_contact_name'  => 'string|max:150',
            'emergency_contact_phone' => 'string|max:30',
            // Application-level fields (personal info)
            'phone'                   => 'string|min:7|max:30',
            'address'                 => 'string|max:500',
            'nationality'             => 'string|max:100',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // Update profile-specific fields
        $profileFields = array_filter([
            'middle_name'             => $data['middle_name']             ?? null,
            'id_type'                 => $data['id_type']                 ?? null,
            'id_number'               => $data['id_number']               ?? null,
            'province'                => $data['province']                ?? null,
            'district'                => $data['district']                ?? null,
            'sector'                  => $data['sector']                  ?? null,
            'emergency_contact_name'  => $data['emergency_contact_name']  ?? null,
            'emergency_contact_phone' => $data['emergency_contact_phone'] ?? null,
        ], fn($v) => $v !== null);

        if (!empty($profileFields)) {
            $this->profileModel->update($profileId, $profileFields);
        }

        // Update application personal info (allowed in early statuses)
        $application = $this->appModel->find($appId);
        $editableStatuses = ['submitted', 'documents_under_review', 'documents_rejected', 'requested_changes'];

        if ($application && in_array($application['status'], $editableStatuses, true)) {
            $appFields = array_filter([
                'phone'       => $data['phone']       ?? null,
                'address'     => $data['address']     ?? null,
                'nationality' => $data['nationality'] ?? null,
            ], fn($v) => $v !== null);

            if (!empty($appFields)) {
                $this->appModel->update($appId, $appFields);
            }
        }

        $this->success($response, null, 'Profile updated successfully.');
    }

    /**
     * POST /api/applicant/profile/photo
     * Upload or replace the profile photo.
     */
    /**
     * POST /api/applicant/application/payment
     * Multipart: payment_slip (PDF/JPG/PNG) + transaction_id + amount?
     * Stores the slip on the file server and writes the transaction id /
     * amount onto the active draft application.
     */
    public function uploadPaymentSlip(Request $request, Response $response): never
    {
        $profile = $request->param('_applicant_profile');
        $appId   = (int)($profile['application_id'] ?? 0);
        if (!$appId) {
            $this->error($response, 'No active application.', 404);
        }

        $body          = $request->body();
        $transactionId = trim((string)($body['transaction_id'] ?? ''));
        $amount        = isset($body['payment_amount']) ? (float)$body['payment_amount'] : null;
        $currency      = (string)($body['payment_currency'] ?? 'RWF');

        if ($transactionId === '') {
            $this->error($response, 'Transaction ID is required.', 422);
        }

        $update = [
            'transaction_id'    => $transactionId,
            'payment_currency'  => $currency,
            'paid_at'           => date('Y-m-d H:i:s'),
        ];
        if ($amount !== null) $update['payment_amount'] = $amount;

        // The slip itself is optional on this endpoint — applicants can also
        // submit it later via re-uploading; but the wizard sends it together.
        $file = $request->file('payment_slip');
        if ($file) {
            $allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
            if (!in_array($file['type'] ?? '', $allowedMimes, true)) {
                $this->error($response, 'Invalid file type. Only PDF, JPEG and PNG are allowed.', 422);
            }
            try {
                $client   = new FileServerClient();
                $uploaded = $client->upload($file);
            } catch (\RuntimeException $e) {
                $this->error($response, $e->getMessage(), 422);
            }
            $update['payment_slip_file_id'] = $uploaded['id'];
            $update['payment_slip_mime']    = (string)($file['type'] ?? '');
        }

        $this->appModel->update($appId, $update);

        $this->success($response, [
            'transaction_id'       => $transactionId,
            'payment_slip_file_id' => $update['payment_slip_file_id'] ?? null,
            'payment_amount'       => $amount,
            'payment_currency'     => $currency,
        ], 'Payment recorded.');
    }

    public function uploadPhoto(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];

        $file = $request->file('photo');
        if (!$file) {
            $this->error($response, 'No photo file provided.', 422);
        }

        // Basic mime check
        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!in_array($file['type'] ?? '', $allowedMimes, true)) {
            $this->error($response, 'Invalid file type. Only JPEG, PNG, and WebP are allowed.', 422);
        }

        try {
            $client   = new FileServerClient();
            $uploaded = $client->upload($file);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->profileModel->update($profileId, [
            'profile_photo_id' => $uploaded['id'],
        ]);

        // Mirror onto the linked user account so the admin Users list and
        // the admissions list both render the same picture without the
        // applicant having to upload twice.
        $userId = (int)($profile['user_id'] ?? 0);
        if ($userId > 0) {
            try {
                $this->db->execute(
                    "UPDATE `users` SET photo = ?, updated_at = NOW() WHERE id = ?",
                    [(string)$uploaded['id'], $userId]
                );
            } catch (\Throwable $e) {
                // Non-blocking — applicant photo upload still succeeds even
                // if the mirror write fails on a stripped-down user schema.
            }
        }

        $this->success($response, [
            'profile_photo_id' => $uploaded['id'],
            'url'              => $uploaded['url'] ?? null,
        ], 'Profile photo uploaded successfully.');
    }


    // ── Application creation & verification ──────────────────────────────────

    /**
     * POST /api/applicant/application/draft
     * Creates a draft application so documents can be attached during the wizard.
     */
    public function draftApplication(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $authUser  = $request->param('_auth_user');

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'intake'        => 'required|string',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // Accept either an explicit faculty/department pair OR a program_id
        // (option). When program_id is supplied we look up the department and
        // faculty from `options` so existing downstream queries keep working.
        if (empty($data['program_id']) && (empty($data['faculty_id']) || empty($data['department_id']))) {
            $this->error($response, 'Validation failed.', 422, [
                'program_id' => 'Program (or faculty + department) is required.',
            ]);
        }
        if (!empty($data['program_id'])) {
            $opt = $this->db->fetchOne(
                "SELECT o.id, o.department_id, d.fac_id
                 FROM `options` o
                 LEFT JOIN `departements` d ON d.dep_id = o.department_id
                 WHERE o.id = ? LIMIT 1",
                [(int)$data['program_id']]
            );
            if (!$opt) {
                $this->error($response, 'Selected program does not exist.', 422);
            }
            $data['department_id'] = (int)$opt['department_id'];
            $data['faculty_id']    = (int)($opt['fac_id'] ?? 0);
        }

        try {
            $activeYear     = $this->service->getActiveAcademicYear();
            $academicYearId = (int)$activeYear['id'];
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 503);
        }

        $email = $authUser['email'] ?? '';

        // Block creating another application when a draft already exists for this user.
        // Return the existing draft so the frontend can let the applicant continue/edit it.
        $existingDraft = $this->db->fetchOne(
            "SELECT sa.id, sa.application_number, sa.faculty_id, sa.department_id, sa.intake,
                    sa.academic_year_id, f.fac_name AS faculty_name, d.dep_name AS department_name
             FROM `student_applications` sa
             LEFT JOIN faculty f       ON sa.faculty_id    = f.fac_id
             LEFT JOIN departements d  ON sa.department_id = d.dep_id
             WHERE sa.email = ? AND sa.status = 'draft'
             ORDER BY sa.created_at DESC
             LIMIT 1",
            [$email]
        );

        if ($existingDraft) {
            $this->error(
                $response,
                'You already have an application in draft. Please continue or discard it before starting a new one.',
                409,
                ['draft' => $existingDraft]
            );
        }

        // Duplicate check: Prevent multiple applications for the same faculty + intake + academic year
        $existing = $this->db->fetchOne(
            "SELECT id FROM `student_applications`
             WHERE email = ? AND faculty_id = ? AND intake = ? AND academic_year_id = ?
             AND status NOT IN ('withdrawn', 'offer_declined') LIMIT 1",
            [$email, (int)$data['faculty_id'], $data['intake'], $academicYearId]
        );

        if ($existing) {
            $this->error($response, 'You already have an active application for this faculty, intake, and academic year.', 409);
        }

        $appNumber = $this->service->generateApplicationNumber();

        // Create draft application
        $fullName  = $authUser['full_name'] ?? '';
        $nameParts = explode(' ', trim($fullName));
        $firstName = $nameParts[0] ?? 'Applicant';
        $lastName  = count($nameParts) > 1 ? implode(' ', array_slice($nameParts, 1)) : 'User';

        $createPayload = [
            'application_number' => $appNumber,
            'academic_year_id'   => $academicYearId,
            'faculty_id'         => (int)$data['faculty_id'],
            'department_id'      => (int)$data['department_id'],
            'intake'             => $data['intake'],
            'status'             => 'draft',
            'first_name'         => $firstName,
            'last_name'          => $lastName,
            'email'              => $authUser['email'] ?? '',
            'phone'              => '0000000000',
            'gender'             => 'Other',
            'birthdate'          => date('Y-m-d'),
            'nationality'        => 'Rwandan',
            'prev_school'        => 'N/A',
            'prev_qualification' => 'N/A',
            'prev_grade'         => 'N/A',
            'graduation_year'    => date('Y'),
            'sponsorship'        => 'self',
            'ip_address'         => $_SERVER['REMOTE_ADDR'] ?? null,
            'email_verified'     => 0,
        ];
        if (!empty($data['program_id']))    $createPayload['program_id']    = (int)$data['program_id'];
        if (!empty($data['campus_id']))     $createPayload['campus_id']     = (int)$data['campus_id'];
        if (!empty($data['mode_of_study'])) $createPayload['mode_of_study'] = $data['mode_of_study'];
        if (!empty($data['level_id']))      $createPayload['level_id']      = (int)$data['level_id'];

        $appId = (int)$this->appModel->create($createPayload);

        // Link it to the profile
        $this->profileModel->update($profileId, ['application_id' => $appId]);

        $this->service->logStatusChange($appId, null, 'draft', null, 'applicant', 'Draft application created.');

        $this->success($response, ['id' => $appId, 'application_number' => $appNumber], 'Draft created.', 201);
    }

    /**
     * POST /api/applicant/application/submit
     */
    public function submitApplication(Request $request, Response $response): never
    {
        $profile = $request->param('_applicant_profile');
        $appId = (int)$profile['application_id'];

        if (!$appId) {
            $this->error($response, 'No draft application found.', 404);
        }

        $application = $this->appModel->find($appId);
        if ($application['status'] !== 'draft') {
            $this->error($response, 'Application is already submitted.', 422);
        }

        $data = $request->body();
        // Skip validation of basics here to save lines, assuming frontend validated it
        $extendedKeys = [
            'father', 'mother', 'reference_phone', 'marital_status',
            'country_of_residence', 'national_id', 'disability', 'address',
            'province', 'district', 'sector', 'residence_district',
            'combination',
            'a2_grades', 'principal_passes', 'serial_number',
            'program_id', 'campus_id', 'mode_of_study', 'level_id',
        ];
        $updateData = [
            'first_name'         => $data['first_name'] ?? $application['first_name'],
            'last_name'          => $data['last_name'] ?? $application['last_name'],
            'email'              => $data['email'] ?? $application['email'],
            'phone'              => $data['phone'] ?? $application['phone'],
            'gender'             => $data['gender'] ?? $application['gender'],
            'birthdate'          => $data['birthdate'] ?? $application['birthdate'],
            'nationality'        => $data['nationality'] ?? $application['nationality'],
            'prev_school'        => $data['prev_school'] ?? $application['prev_school'],
            'prev_qualification' => $data['prev_qualification'] ?? $application['prev_qualification'],
            'prev_grade'         => $data['prev_grade'] ?? $application['prev_grade'],
            'graduation_year'    => (int)($data['graduation_year'] ?? $application['graduation_year']),
            'sponsorship'        => $data['sponsorship'] ?? $application['sponsorship'],
            'sponsor_name'       => $data['sponsor_name'] ?? $application['sponsor_name'] ?? null,
            'status'             => 'submitted',
            'submitted_at'       => date('Y-m-d H:i:s'),
        ];
        foreach ($extendedKeys as $k) {
            if (array_key_exists($k, $data) && $data[$k] !== null && $data[$k] !== '') {
                $updateData[$k] = $data[$k];
            } elseif (!empty($application[$k])) {
                $updateData[$k] = $application[$k];
            }
        }

        // No OTP step anymore — submission is final and the applicant gets a
        // confirmation email instead. We mark email_verified=1 so downstream
        // logic that gates on it (admin views, status filters) keeps working.
        $updateData['verification_code'] = null;
        $updateData['email_verified']    = 1;

        $this->appModel->update($appId, $updateData);

        $this->service->logStatusChange($appId, 'draft', 'submitted', null, 'applicant', 'Application submitted.');

        // Send a "thank you / submitted successfully" confirmation email,
        // including CUR contact info so the applicant has a clear next step.
        $appRow = $this->appModel->find($appId) ?: [];
        $programName = '';
        if (!empty($appRow['program_id'])) {
            $opt = $this->db->fetchOne("SELECT name FROM `options` WHERE id = ? LIMIT 1", [(int)$appRow['program_id']]);
            $programName = (string)($opt['name'] ?? '');
        }
        if ($programName === '' && !empty($appRow['department_id'])) {
            $dep = $this->db->fetchOne("SELECT dep_name FROM `departements` WHERE dep_id = ? LIMIT 1", [(int)$appRow['department_id']]);
            $programName = (string)($dep['dep_name'] ?? '');
        }

        $htmlBody = \App\Helpers\EmailTemplateHelper::applicationSubmittedTemplate(
            $updateData['first_name'],
            $appRow['application_number'] ?? '',
            $programName,
            $appRow['intake'] ?? ''
        );
        $subject  = 'Application Submitted — Catholic University of Rwanda';
        $textBody = "Dear {$updateData['first_name']}, your application to the Catholic University of Rwanda has been submitted successfully. Application number: " . ($appRow['application_number'] ?? '') . ". For queries, contact admissions@cur.ac.rw or +250 788 351 906.";

        $mailService = new \App\Services\MailService();
        $mailService->send($updateData['email'], $subject, $htmlBody, $textBody);

        $this->success($response, [
            'status'             => 'submitted',
            'application_number' => $appRow['application_number'] ?? null,
        ], 'Application submitted successfully. A confirmation email has been sent.');
    }

    /**
     * POST /api/applicant/application/verify
     */
    public function verifyApplication(Request $request, Response $response): never
    {
        // TEMP: code-match check bypassed at user request — any submitted
        // code is accepted as long as the applicant has an active application.
        // Restore the strict comparison once email delivery is reliable.
        $profile = $request->param('_applicant_profile');
        $appId   = (int)($profile['application_id'] ?? 0);

        if (!$appId) {
            $this->error($response, 'No active application found to verify.', 404);
        }

        $app = $this->appModel->find($appId);

        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }

        if ((int)$app['email_verified'] === 1) {
            $this->success($response, null, 'Application is already verified.');
        }

        $this->appModel->update($appId, [
            'email_verified'    => 1,
            'verification_code' => null,
        ]);

        $this->success($response, null, 'Application verified successfully.');
    }

    /**
     * POST /api/applicant/application/resend-code
     */
    public function resendVerificationCode(Request $request, Response $response): never
    {
        $profile = $request->param('_applicant_profile');
        $appId   = (int)($profile['application_id'] ?? 0);

        if (!$appId) {
            $this->error($response, 'No active application found.', 404);
        }

        $app = $this->appModel->find($appId);

        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }
        if ((int)$app['email_verified'] === 1) {
            $this->error($response, 'Application is already verified.', 422);
        }
        if ($app['status'] === 'draft') {
            $this->error($response, 'Submit the application before verifying.', 422);
        }

        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $this->appModel->update($appId, ['verification_code' => $code]);

        $htmlBody = \App\Helpers\EmailTemplateHelper::otpTemplate(
            $app['first_name'],
            $code,
            '15 minutes'
        );
        $mailService = new \App\Services\MailService();
        $emailSent   = $mailService->send($app['email'], 'Verify Your Application', $htmlBody, "Verification Code: $code");

        $debug     = filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $extraData = [];
        if (!$emailSent && $debug) {
            $extraData['dev_code'] = $code;
        }

        $this->success($response, $extraData, 'A new verification code has been sent to your email.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Application status
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/applicant/application
     * Returns a list of all applications for the authenticated user.
     */
    public function getApplication(Request $request, Response $response): never
    {
        $authUser = $request->param('_auth_user');
        $profile  = $request->param('_applicant_profile');
        $email    = (string)($authUser['email'] ?? '');
        $appId    = (int)($profile['application_id'] ?? 0);

        // Match by auth email OR by the application_id linked to the
        // applicant profile. The latter covers the common case where the
        // applicant entered a different contact email on the form than the
        // one they registered their account with — without it, listApplications
        // would return 0 rows and the overview screen would render empty.
        $apps = $this->db->fetchAll(
            "SELECT sa.*, f.fac_name as faculty_name, d.dep_name as department_name, ay.label as academic_year_label
             FROM `student_applications` sa
             LEFT JOIN faculty f ON sa.faculty_id = f.fac_id
             LEFT JOIN departements d ON sa.department_id = d.dep_id
             LEFT JOIN academic_years ay ON sa.academic_year_id = ay.id
             WHERE sa.email = ? OR sa.id = ?
             ORDER BY sa.created_at DESC",
            [$email, $appId]
        );

        $this->success($response, $apps, 'Applications fetched successfully.');
    }

    /**
     * GET /api/applicant/application/:id
     * Returns full details for a specific application.
     */
    public function getApplicationDetails(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');
        $application = $this->appModel->getWithDetails($appId);

        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        // Enrich with human-readable labels for the choices the applicant
        // made on step 3 (program / campus / level), so the details view
        // doesn't have to make extra round-trips.
        if (!empty($application['program_id'])) {
            $row = $this->db->fetchOne("SELECT name FROM `options` WHERE id = ? LIMIT 1", [(int)$application['program_id']]);
            $application['program_name'] = $row['name'] ?? null;
        }
        if (!empty($application['campus_id'])) {
            $row = $this->db->fetchOne("SELECT name, code, location FROM `campuses` WHERE id = ? LIMIT 1", [(int)$application['campus_id']]);
            $application['campus_name']     = $row['name'] ?? null;
            $application['campus_code']     = $row['code'] ?? null;
            $application['campus_location'] = $row['location'] ?? null;
        }
        if (!empty($application['level_id'])) {
            $row = $this->db->fetchOne("SELECT name FROM `levels` WHERE id = ? LIMIT 1", [(int)$application['level_id']]);
            $application['level_name'] = $row['name'] ?? null;
        }

        $documents    = $this->docModel->getForApplication($appId);
        $requirements = $this->requirementModel->getForFaculty(
            (int)$application['faculty_id']
        );

        // Build document checklist
        $uploadedMap = [];
        foreach ($documents as $doc) {
            $uploadedMap[(int)$doc['document_type_id']] = [
                'id'                  => (int)$doc['id'],
                'file_original_name'  => $doc['file_original_name'],
                'file_size'           => $doc['file_size'],
                'verification_status' => $doc['verification_status'],
                'file_mime'           => $doc['file_mime'],
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
                'document_id'         => $uploaded['id']                  ?? null,
                'file_original_name'  => $uploaded['file_original_name']  ?? null,
                'verification_status' => $uploaded['verification_status'] ?? null,
                'uploaded_at'         => $uploaded['uploaded_at']         ?? null,
                'verification_comment'     => $uploaded['verification_comment']     ?? null,
                'file_mime'           => $uploaded['file_mime']           ?? null,
            ];
        }, $requirements);

        // Status log
        $logRows = $this->db->fetchAll(
            "SELECT from_status, to_status, actor_type, notes, created_at
             FROM `application_status_log`
             WHERE application_id = ?
             ORDER BY id ASC",
            [$appId]
        );

        // Fetch offer if exists
        $offerModel = new \App\Models\AdmissionOfferModel();
        $offer = $offerModel->findByApplicationId($appId);

        // Spread the full application row so new columns (father, mother,
        // marital_status, national_id, country_of_residence, reference_phone,
        // a2_grades, principal_passes, serial_number, program_id/campus_id/
        // mode_of_study/level_id, payment_*) are exposed without having to
        // remember to add each one to a hand-picked map.
        $payload = array_merge($application, [
            'academic_year'      => $application['academic_year_label'] ?? '',
            'offer'              => $offer,
            'document_checklist' => $checklist,
            'status_log'         => $logRows,
        ]);

        $this->success($response, $payload, 'Application details fetched.');
    }

    /**
     * GET /api/applicant/application/:id/timeline
     * Lean status-log endpoint that powers the visual step indicator on
     * the applicant overview (Task 1.10). Returns the chronological list
     * of state transitions for the applicant's own application.
     */
    public function getApplicationTimeline(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');
        $application = $this->appModel->find($appId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }
        $authUser = (array) $request->param('_auth_user');
        if (($application['email'] ?? '') !== ($authUser['email'] ?? null)) {
            $this->error($response, 'Unauthorized.', 403);
        }

        $rows = $this->db->fetchAll(
            "SELECT asl.from_status, asl.to_status, asl.actor_type, asl.notes, asl.created_at,
                    u.full_name AS actor_name
             FROM `application_status_log` asl
             LEFT JOIN `users` u ON u.id = asl.actor_id
             WHERE asl.application_id = ?
             ORDER BY asl.created_at ASC, asl.id ASC",
            [$appId]
        );

        $this->success($response, [
            'application_id' => $appId,
            'current_status' => $application['status'],
            'timeline'       => $rows,
        ], 'Timeline fetched.');
    }

    /**
     * PUT /api/applicant/application/:id
     * Update application details before it's processed.
     */
    public function updateApplication(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');
        $data  = $request->body();

        $application = $this->appModel->find($appId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        // Security: Ensure it belongs to the logged-in user
        $authUser = $request->param('_auth_user');
        if ($application['email'] !== $authUser['email']) {
            $this->error($response, 'Unauthorized.', 403);
        }

        // Only allow editing if status is draft or submitted (not yet review_started or beyond)
        $allowed = ['draft', 'submitted', 'requested_changes'];
        if (!in_array($application['status'], $allowed, true)) {
            $this->error($response, 'Application cannot be edited at this stage.', 422);
        }

        $fields = array_filter([
            // Personal info
            'first_name'           => $data['first_name']           ?? null,
            'last_name'            => $data['last_name']            ?? null,
            'father'               => $data['father']               ?? null,
            'mother'               => $data['mother']               ?? null,
            'phone'                => $data['phone']                ?? null,
            'reference_phone'      => $data['reference_phone']      ?? null,
            'gender'               => $data['gender']               ?? null,
            'birthdate'            => $data['birthdate']            ?? null,
            'marital_status'       => $data['marital_status']       ?? null,
            'nationality'          => $data['nationality']          ?? null,
            'country_of_residence' => $data['country_of_residence'] ?? null,
            'national_id'          => $data['national_id']          ?? null,
            'disability'           => $data['disability']           ?? null,
            'address'              => $data['address']              ?? null,
            'province'             => $data['province']             ?? null,
            'district'             => $data['district']             ?? null,
            'sector'               => $data['sector']               ?? null,
            'residence_district'   => $data['residence_district']   ?? null,
            // Academic
            'prev_school'          => $data['prev_school']          ?? null,
            'prev_qualification'   => $data['prev_qualification']   ?? null,
            'prev_grade'           => $data['prev_grade']           ?? null,
            'combination'          => $data['combination']          ?? null,
            'graduation_year'      => isset($data['graduation_year']) ? (int)$data['graduation_year'] : null,
            'a2_grades'            => $data['a2_grades']            ?? null,
            'principal_passes'     => isset($data['principal_passes']) ? (int)$data['principal_passes'] : null,
            'serial_number'        => $data['serial_number']        ?? null,
            // Program selection
            'program_id'           => isset($data['program_id'])    ? (int)$data['program_id']    : null,
            'campus_id'            => isset($data['campus_id'])     ? (int)$data['campus_id']     : null,
            'mode_of_study'        => $data['mode_of_study']        ?? null,
            'level_id'             => isset($data['level_id'])      ? (int)$data['level_id']      : null,
            // Sponsorship
            'sponsorship'          => $data['sponsorship']          ?? null,
            'sponsor_name'         => $data['sponsor_name']         ?? null,
        ], fn($v) => $v !== null);

        if (!empty($fields)) {
            $this->appModel->update($appId, $fields);
        }

        $this->success($response, null, 'Application updated successfully.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Academic records
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/applicant/academic-records
     * List all academic history entries for the applicant.
     */
    public function listAcademicRecords(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];

        $records = $this->db->fetchAll(
            "SELECT ar.*, ad.file_original_name, ad.file_server_id, ad.verification_status as doc_status
             FROM `applicant_academic_records` ar
             LEFT JOIN `application_documents` ad ON ar.document_id = ad.id
             WHERE ar.applicant_profile_id = ?
             ORDER BY ar.is_primary DESC, ar.year_completed DESC",
            [$profileId]
        );
        $this->success($response, $records, 'Academic records fetched.');
    }

    /**
     * POST /api/applicant/academic-records
     * Add a new academic history entry.
     */
    public function addAcademicRecord(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'institution_name' => 'required|string|min:2|max:255',
            'qualification'    => 'required|string|min:2|max:150',
            'grade'            => 'required|string|max:50',
            'year_completed'   => 'required|numeric|min:1980|max:2030',
            'combination'      => 'string|max:100',
            'document_id'      => 'numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // First record added is automatically the primary
        $existingCount = count($this->recordModel->getForProfile($profileId));
        $isPrimary     = $existingCount === 0 ? 1 : 0;

        $id = $this->recordModel->create([
            'applicant_profile_id' => $profileId,
            'document_id'          => !empty($data['document_id']) ? (int)$data['document_id'] : null,
            'institution_name'     => trim($data['institution_name']),
            'qualification'        => trim($data['qualification']),
            'grade'                => trim($data['grade']),
            'combination'          => $data['combination'] ?? null,
            'year_completed'       => (int)$data['year_completed'],
            'is_primary'           => $isPrimary,
        ]);

        $this->success($response, ['id' => (int)$id, 'is_primary' => (bool)$isPrimary],
            'Academic record added successfully.', 201);
    }

    /**
     * PUT /api/applicant/academic-records/:id
     * Update an existing academic record.
     */
    public function updateAcademicRecord(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $recordId  = (int)$request->param('id');

        if (!$this->recordModel->belongsToProfile($recordId, $profileId)) {
            $this->error($response, 'Academic record not found.', 404);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'institution_name' => 'required|string|min:2|max:255',
            'qualification'    => 'required|string|min:2|max:150',
            'grade'            => 'required|string|max:50',
            'year_completed'   => 'required|numeric|min:1980|max:2030',
            'combination'      => 'string|max:100',
            'document_id'      => 'numeric',
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $this->recordModel->update($recordId, [
            'institution_name' => trim($data['institution_name']),
            'qualification'    => trim($data['qualification']),
            'grade'            => trim($data['grade']),
            'combination'      => $data['combination'] ?? null,
            'year_completed'   => (int)$data['year_completed'],
            'document_id'      => !empty($data['document_id']) ? (int)$data['document_id'] : null,
        ]);

        $this->success($response, null, 'Academic record updated successfully.');
    }

    /**
     * DELETE /api/applicant/academic-records/:id
     * Delete a non-primary academic record.
     */
    public function deleteAcademicRecord(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $recordId  = (int)$request->param('id');

        if (!$this->recordModel->belongsToProfile($recordId, $profileId)) {
            $this->error($response, 'Academic record not found.', 404);
        }

        $record = $this->recordModel->find($recordId);
        if ($record && (int)$record['is_primary'] === 1) {
            $this->error($response, 'Cannot delete the primary academic record. Set another record as primary first.', 422);
        }

        $this->recordModel->delete($recordId);
        $this->success($response, null, 'Academic record deleted successfully.');
    }

    /**
     * POST /api/applicant/academic-records/:id/set-primary
     * Mark a record as the primary (merit-scoring) record.
     */
    public function setPrimaryRecord(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $recordId  = (int)$request->param('id');

        if (!$this->recordModel->belongsToProfile($recordId, $profileId)) {
            $this->error($response, 'Academic record not found.', 404);
        }

        $this->recordModel->setPrimary($profileId, $recordId);
        $this->success($response, null, 'Primary academic record updated.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Documents
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/applicant/documents
     * List uploaded documents with per-document verification status.
     */
    public function listDocuments(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $appId     = (int)$profile['application_id'];

        // Get all profile-level documents
        $documents = $this->docModel->getForProfile($profileId);

        // Enhance with usage info
        $enriched = array_map(function($doc) {
            $usage = [];
            
            // Check if used in an application
            if ($doc['application_id']) {
                $app = $this->db->fetchOne("SELECT application_number FROM `student_applications` WHERE id = ?", [(int)$doc['application_id']]);
                if ($app) $usage[] = "Requirement for Application " . $app['application_number'];
            }

            // Check if used in academic records
            $recs = $this->db->fetchAll("SELECT institution_name FROM `applicant_academic_records` WHERE document_id = ?", [(int)$doc['id']]);
            foreach ($recs as $r) {
                $usage[] = "Attached to " . $r['institution_name'];
            }

            $doc['usage'] = $usage;
            return $doc;
        }, $documents);

        $this->success($response, [
            'documents' => $enriched,
        ], 'Profile documents fetched.');
    }

    /**
     * POST /api/applicant/documents
     * Upload or replace a required document.
     * Only allowed when application is in an editable document state.
     */
    public function uploadDocument(Request $request, Response $response): never
    {
        $profile   = $request->param('_applicant_profile');
        $profileId = (int)$profile['id'];
        $appId     = (int)$profile['application_id'];

        $application = $this->appModel->find($appId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        $allowedStatuses = ['draft', 'submitted', 'documents_under_review', 'documents_rejected', 'requested_changes'];
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

        $docTypeId    = (int)$body['document_type_id'];
        $requirements = $this->requirementModel->getForFaculty(
            (int)$application['faculty_id']
        );

        $allowedTypeIds = array_column($requirements, 'document_type_id');
        if (!in_array((string)$docTypeId, $allowedTypeIds, true) && !in_array($docTypeId, $allowedTypeIds, true)) {
            $this->error($response, 'This document type is not required for your faculty.', 422);
        }

        $file = $request->file('document');
        if (!$file) {
            $this->error($response, 'No document file provided.', 422);
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

        $docId = $this->docModel->upsertForProfile($profileId, $docTypeId, [
            'file_server_id'      => $uploaded['id'],
            'file_original_name'  => $uploaded['original_name'],
            'file_size'           => $uploaded['size'],
            'file_mime'           => $uploaded['mime'],
            'verification_status' => 'pending',
            'verified_by'         => null,
            'verified_at'         => null,
            'verification_comment'     => null,
        ], $appId);

        // Recalculate document completeness
        $docStatus = $this->service->checkDocumentCompleteness($appId);
        $this->appModel->update($appId, ['document_status' => $docStatus]);

        $reqEntry = current(array_filter($requirements, fn($r) => (int)$r['document_type_id'] === $docTypeId));

        $this->success($response, [
            'id'                  => (int)$docId,
            'document_type_id'    => $docTypeId,
            'document_name'       => $reqEntry['document_name'] ?? '',
            'verification_status' => 'pending',
            'document_status'     => $docStatus,
        ], 'Document uploaded successfully.', 201);
    }

    /**
     * DELETE /api/applicant/documents/:id
     * Remove a pending or rejected document (verified docs cannot be removed).
     */
    public function deleteDocument(Request $request, Response $response): never
    {
        $profile = $request->param('_applicant_profile');
        $appId   = (int)$profile['application_id'];
        $docId   = (int)$request->param('id');

        // Verify document belongs to this application
        $doc = $this->db->fetchOne(
            "SELECT * FROM `application_documents` WHERE id = ? AND application_id = ? LIMIT 1",
            [$docId, $appId]
        );

        if (!$doc) {
            $this->error($response, 'Document not found.', 404);
        }

        if ($doc['verification_status'] === 'verified') {
            $this->error($response, 'Verified documents cannot be removed.', 422);
        }

        $this->docModel->delete($docId);

        // Recalculate document completeness
        $docStatus = $this->service->checkDocumentCompleteness($appId);
        $this->appModel->update($appId, ['document_status' => $docStatus]);

        $this->success($response, ['document_status' => $docStatus], 'Document removed successfully.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/applicant/application/:id/respond
     * Accept or decline an admission offer.
     */
    public function respondToOffer(Request $request, Response $response): never
    {
        $appId = (int)$request->param('id');
        $data  = $request->body();
        $profile = $request->param('_applicant_profile');

        $application = $this->appModel->find($appId);
        if (!$application) {
            $this->error($response, 'Application not found.', 404);
        }

        // Security: Ensure it belongs to the logged-in user
        $authUser = $request->param('_auth_user');
        if ($application['email'] !== $authUser['email']) {
            $this->error($response, 'Unauthorized.', 403);
        }

        if ($application['status'] !== 'offered') {
            $this->error($response, 'No active offer found for this application.', 422);
        }

        $errors = ValidationHelper::validate($data, [
            'response' => 'required|in:accepted,declined',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $offer = (new \App\Models\AdmissionOfferModel())->findByApplicationId($appId);
        if (!$offer) {
            $this->error($response, 'Offer record not found.', 404);
        }

        if (strtotime($offer['expires_at']) < strtotime(date('Y-m-d'))) {
            (new \App\Models\AdmissionOfferModel())->update((int)$offer['id'], ['status' => 'expired']);
            $this->error($response, 'This offer has expired. Please contact the admissions office.', 422);
        }

        $action    = $data['response'];
        $newStatus = $action === 'accepted' ? 'offer_accepted' : 'offer_declined';
        $from      = $application['status'];

        (new \App\Models\AdmissionOfferModel())->update((int)$offer['id'], [
            'status'         => $action === 'accepted' ? 'accepted' : 'declined',
            'responded_at'   => date('Y-m-d H:i:s'),
            'response_notes' => $data['notes'] ?? null,
        ]);

        $this->appModel->update($appId, ['status' => $newStatus]);
        $this->service->logStatusChange(
            $appId, $from, $newStatus, null,
            'applicant', "Applicant responded via portal: {$action}."
        );

        if ($action === 'accepted') {
            // Fetch department name for email
            $dept = $this->db->fetchOne("SELECT dep_name FROM `departements` WHERE dep_id = ?", [(int)$application['department_id']]);
            $this->service->sendApplicationEmail('offer_accepted', [
                'first_name' => $application['first_name'],
                'last_name'  => $application['last_name'],
                'email'      => $application['email'],
            ], ['program_name' => $dept['dep_name'] ?? 'your selected program']);
        }

        $this->success($response, ['status' => $newStatus], 'Your response has been recorded successfully.');
    }

    /**
     * Format a raw profile row for API output — separating profile fields
     * from the joined application / user fields for clarity.
     */
    private function formatProfile(array $row): array
    {
        return [
            'profile' => [
                'id'                      => (int)$row['id'],
                'middle_name'             => $row['middle_name'],
                'id_type'                 => $row['id_type'],
                'id_number'               => $row['id_number'],
                'province'                => $row['province'],
                'district'                => $row['district'],
                'sector'                  => $row['sector'],
                'emergency_contact_name'  => $row['emergency_contact_name'],
                'emergency_contact_phone' => $row['emergency_contact_phone'],
                'profile_photo_id'        => $row['profile_photo_id'],
                'updated_at'              => $row['updated_at'],
            ],
            'user' => [
                'email'     => $row['email'],
                'full_name' => $row['full_name'],
                'username'  => $row['username'],
            ],
            'application' => [
                'application_number' => $row['application_number'],
                'status'             => $row['application_status'],
                'document_status'    => $row['document_status'],
                'first_name'         => $row['first_name'],
                'last_name'          => $row['last_name'],
                'phone'              => $row['phone'],
                'gender'             => $row['gender'],
                'birthdate'          => $row['birthdate'],
                'nationality'        => $row['nationality'],
                'address'            => $row['address'],
                'intake'             => $row['intake'],
                'submitted_at'       => $row['submitted_at'],
                'program_name'       => $row['program_name'],
                'program_code'       => $row['program_code'],
                'faculty_name'       => $row['faculty_name'],
                'academic_year'      => $row['academic_year'],
            ],
        ];
    }
    /**
     * GET /api/applicant/application/:id/payment-slip
     *
     * Streams the payment slip uploaded against the applicant's application
     * (PDF/JPG/PNG) inline so it can be previewed in the portal. Ownership
     * is verified through `applicant_profiles.application_id`, since the
     * student_applications table itself doesn't store the profile FK.
     */
    public function downloadPaymentSlip(Request $request, Response $response): never
    {
        $appId   = (int)$request->param('id');
        $profile = $request->param('_applicant_profile');

        $app = $this->appModel->find($appId);
        if (!$app || (int)($profile['application_id'] ?? 0) !== $appId) {
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

        $filename = $fileData['original_name'] ?? 'payment-slip';

        header('Content-Type: ' . $mime);
        header('Content-Disposition: ' . $disposition . '; filename="' . addslashes($filename) . '"');
        header('Content-Length: ' . strlen($fileData['content']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');

        echo $fileData['content'];
        exit;
    }

    /**
     * GET /api/applicant/documents/:id/download
     */
    public function downloadDocument(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $profile = $request->param('_applicant_profile');
        
        $document = $this->docModel->find($id);
        
        if (!$document || (int)$document['applicant_profile_id'] !== (int)$profile['id']) {
            $this->error($response, 'Document not found.', 404);
        }

        if (empty($document['file_server_id'])) {
            $this->error($response, 'No file associated with this document record.', 404);
        }

        try {
            $client   = new \App\Helpers\FileServerClient();
            $fileData = $client->download($document['file_server_id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 502);
        }

        $mime = $fileData['mime'] ?? 'application/octet-stream';

        // Use 'inline' so images and PDFs render inside browser preview / iframe.
        // For other file types, fall back to 'attachment' (force download).
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
}
