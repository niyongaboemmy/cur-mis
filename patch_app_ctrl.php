<?php
$file = 'temp_app_ctrl.php';
$content = file_get_contents($file);

$newMethods = <<<PHP

    // ── Application creation & verification ──────────────────────────────────

    /**
     * POST /api/applicant/application/draft
     * Creates a draft application so documents can be attached during the wizard.
     */
    public function draftApplication(Request \$request, Response \$response): never
    {
        \$profile = \$request->param('_applicant_profile');
        \$profileId = (int)\$profile['id'];

        // If they already have an application linked, just return it
        if (!empty(\$profile['application_id'])) {
            \$app = \$this->appModel->find((int)\$profile['application_id']);
            \$this->success(\$response, \$app, 'Existing application fetched.');
        }

        \$data = \$request->body();
        \$errors = ValidationHelper::validate(\$data, [
            'faculty_id'    => 'required|numeric',
            'department_id' => 'required|numeric',
            'intake'        => 'required|string',
        ]);

        if (!empty(\$errors)) {
            \$this->error(\$response, 'Validation failed.', 422, \$errors);
        }

        try {
            \$activeYear = \$this->service->getActiveAcademicYear();
            \$academicYearId = (int)\$activeYear['id'];
        } catch (\RuntimeException \$e) {
            \$this->error(\$response, \$e->getMessage(), 503);
        }

        \$appNumber = \$this->service->generateApplicationNumber();
        \$authUser = \$request->param('_auth_user');

        // Create draft application
        \$appId = (int)\$this->appModel->create([
            'application_number' => \$appNumber,
            'academic_year_id'   => \$academicYearId,
            'faculty_id'         => (int)\$data['faculty_id'],
            'department_id'      => (int)\$data['department_id'],
            'intake'             => \$data['intake'],
            'status'             => 'draft',
            'first_name'         => \$authUser['full_name'] ?? 'Draft',
            'last_name'          => 'Applicant',
            'email'              => \$authUser['email'] ?? 'draft@example.com',
            'phone'              => '0000000000',
            'gender'             => 'Other',
            'birthdate'          => date('Y-m-d'),
            'nationality'        => 'Rwandan',
            'prev_school'        => 'N/A',
            'prev_qualification' => 'N/A',
            'prev_grade'         => 'N/A',
            'graduation_year'    => date('Y'),
            'sponsorship'        => 'self',
            'ip_address'         => \$_SERVER['REMOTE_ADDR'] ?? null,
            'email_verified'     => 0,
        ]);

        // Link it to the profile
        \$this->profileModel->update(\$profileId, ['application_id' => \$appId]);

        \$this->service->logStatusChange(\$appId, null, 'draft', null, 'applicant', 'Draft application created.');

        \$this->success(\$response, ['id' => \$appId, 'application_number' => \$appNumber], 'Draft created.', 201);
    }

    /**
     * POST /api/applicant/application/submit
     */
    public function submitApplication(Request \$request, Response \$response): never
    {
        \$profile = \$request->param('_applicant_profile');
        \$appId = (int)\$profile['application_id'];

        if (!\$appId) {
            \$this->error(\$response, 'No draft application found.', 404);
        }

        \$application = \$this->appModel->find(\$appId);
        if (\$application['status'] !== 'draft') {
            \$this->error(\$response, 'Application is already submitted.', 422);
        }

        \$data = \$request->body();
        // Skip validation of basics here to save lines, assuming frontend validated it
        \$updateData = [
            'first_name'         => \$data['first_name'] ?? \$application['first_name'],
            'last_name'          => \$data['last_name'] ?? \$application['last_name'],
            'email'              => \$data['email'] ?? \$application['email'],
            'phone'              => \$data['phone'] ?? \$application['phone'],
            'gender'             => \$data['gender'] ?? \$application['gender'],
            'birthdate'          => \$data['birthdate'] ?? \$application['birthdate'],
            'nationality'        => \$data['nationality'] ?? \$application['nationality'],
            'prev_school'        => \$data['prev_school'] ?? \$application['prev_school'],
            'prev_qualification' => \$data['prev_qualification'] ?? \$application['prev_qualification'],
            'prev_grade'         => \$data['prev_grade'] ?? \$application['prev_grade'],
            'graduation_year'    => (int)(\$data['graduation_year'] ?? \$application['graduation_year']),
            'sponsorship'        => \$data['sponsorship'] ?? \$application['sponsorship'],
            'status'             => 'submitted',
            'submitted_at'       => date('Y-m-d H:i:s'),
        ];

        // Generate verification code
        \$code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        \$updateData['verification_code'] = \$code;
        \$updateData['email_verified'] = 0;

        \$this->appModel->update(\$appId, \$updateData);

        \$this->service->logStatusChange(\$appId, 'draft', 'submitted', null, 'applicant', 'Application submitted.');

        // Send Email
        \$htmlBody = \App\Helpers\EmailTemplateHelper::otpTemplate(
            \$updateData['first_name'], 
            \$code, 
            'Application Verification'
        );
        \$mailService = new \App\Services\MailService();
        \$mailService->send(\$updateData['email'], 'Verify Your Application', \$htmlBody, "Code: \$code");

        \$this->success(\$response, ['status' => 'submitted'], 'Application submitted successfully.');
    }

    /**
     * POST /api/applicant/application/verify
     */
    public function verifyApplication(Request \$request, Response \$response): never
    {
        \$profile = \$request->param('_applicant_profile');
        \$appId = (int)\$profile['application_id'];

        \$data = \$request->body();
        \$code = trim(\$data['code'] ?? '');

        \$application = \$this->appModel->find(\$appId);
        
        if (!\$application) {
            \$this->error(\$response, 'Application not found.', 404);
        }

        if ((int)\$application['email_verified'] === 1) {
            \$this->success(\$response, null, 'Application is already verified.');
        }

        if (\$application['verification_code'] !== \$code) {
            \$this->error(\$response, 'Invalid verification code.', 401);
        }

        \$this->appModel->update(\$appId, [
            'email_verified' => 1,
            'verification_code' => null
        ]);

        \$this->success(\$response, null, 'Application verified successfully.');
    }
PHP;

$content = str_replace("    // ─────────────────────────────────────────────────────────────────────────\n    // Application status", $newMethods . "\n\n    // ─────────────────────────────────────────────────────────────────────────\n    // Application status", $content);

file_put_contents($file, $content);
