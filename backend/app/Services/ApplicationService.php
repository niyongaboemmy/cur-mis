<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\StudentApplicationModel;
use App\Models\ApplicationDocumentModel;
use App\Models\AdmissionRequirementModel;
use App\Models\ApplicationStatusLogModel;
use App\Models\MeritCriteriaModel;
use App\Models\MeritListModel;
use App\Models\AdmissionOfferModel;
use App\Models\AcademicYearModel;
use App\Models\StudentModel;
use App\Helpers\EmailTemplateHelper;
use App\Helpers\AdmissionLetterPdf;
use App\Models\ManualAdmissionModel;
use App\Services\FeeService;

class ApplicationService
{
    private StudentApplicationModel  $applicationModel;
    private ApplicationDocumentModel $documentModel;
    private AdmissionRequirementModel $requirementModel;
    private ApplicationStatusLogModel $logModel;
    private MeritCriteriaModel        $criteriaModel;
    private MeritListModel            $meritListModel;
    private AdmissionOfferModel       $offerModel;
    private AcademicYearModel         $yearModel;
    private StudentModel              $studentModel;
    private ManualAdmissionModel      $manualAdmissionModel;
    private MailService               $mailService;
    private Database                  $db;

    /** Letter grade → numeric score (out of 100). */
    private const GRADE_MAP = [
        'A+' => 100, 'A'  => 95, 'A-' => 90,
        'B+' => 87,  'B'  => 83, 'B-' => 80,
        'C+' => 77,  'C'  => 73, 'C-' => 70,
        'D+' => 67,  'D'  => 63, 'D-' => 60,
        'E'  => 50,  'F'  => 0,
        // Rwanda secondary school grades (Division system)
        'DIV1' => 90, 'DIV2' => 75, 'DIV3' => 60, 'DIV4' => 45, 'FAIL' => 0,
        // Common letter grades used in transcripts
        'S1' => 95, 'S2' => 80, 'S3' => 70, 'S4' => 60, 'S5' => 50, 'S6' => 40,
    ];

    public function __construct()
    {
        $this->applicationModel      = new StudentApplicationModel();
        $this->documentModel         = new ApplicationDocumentModel();
        $this->requirementModel      = new AdmissionRequirementModel();
        $this->logModel              = new ApplicationStatusLogModel();
        $this->criteriaModel         = new MeritCriteriaModel();
        $this->meritListModel        = new MeritListModel();
        $this->offerModel            = new AdmissionOfferModel();
        $this->yearModel             = new AcademicYearModel();
        $this->studentModel          = new StudentModel();
        $this->manualAdmissionModel  = new ManualAdmissionModel();
        $this->mailService           = new MailService();
        $this->db                    = Database::getInstance();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Active academic year resolution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolve the current active academic year.
     * Throws if none is configured — system is not ready to accept applications.
     */
    public function getActiveAcademicYear(): array
    {
        $year = $this->yearModel->getActive();

        if (!$year) {
            throw new \RuntimeException(
                'No active academic year is configured. Please contact the administrator.'
            );
        }

        return $year;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Application number generation
    // ─────────────────────────────────────────────────────────────────────────

    public function generateApplicationNumber(): string
    {
        return $this->applicationModel->generateApplicationNumber();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Status logging
    // ─────────────────────────────────────────────────────────────────────────

    public function logStatusChange(
        int     $applicationId,
        ?string $from,
        string  $to,
        ?int    $actorId,
        string  $actorType = 'system',
        ?string $notes = null
    ): void {
        $this->logModel->create([
            'application_id' => $applicationId,
            'from_status'    => $from,
            'to_status'      => $to,
            'actor_id'       => $actorId,
            'actor_type'     => $actorType,
            'notes'          => $notes,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Document completeness — faculty + year specific
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check whether all required documents for the application's faculty + year
     * have been uploaded and verified.
     *
     * Returns: 'incomplete' | 'under_review' | 'verified' | 'rejected'
     *
     * Logic:
     *   - Fetch required document types from admission_requirements for faculty + year
     *   - If no requirements configured → 'verified' (no docs needed)
     *   - If any required type has no uploaded doc → 'incomplete'
     *   - If any uploaded required doc is 'rejected' → 'rejected'
     *   - If all uploaded required docs are 'pending' → 'under_review'
     *   - If all uploaded required docs are 'verified' → 'verified'
     */
    public function checkDocumentCompleteness(int $applicationId): string
    {
        $application = $this->applicationModel->find($applicationId);
        if (!$application) {
            return 'incomplete';
        }

        $facultyId = (int)$application['faculty_id'];
        $yearId    = (int)$application['academic_year_id'];

        // Required document types configured for this faculty + year
        $requirements = $this->db->fetchAll(
            "SELECT document_type_id, is_required
             FROM `admission_requirements`
             WHERE faculty_id = ? AND academic_year_id = ? AND is_required = 1",
            [$facultyId, $yearId]
        );

        if (empty($requirements)) {
            // No requirements configured yet — treat as complete
            return 'verified';
        }

        $requiredTypeIds = array_column($requirements, 'document_type_id');

        // Documents uploaded for this application
        $placeholders = implode(',', array_fill(0, count($requiredTypeIds), '?'));
        $docs = $this->db->fetchAll(
            "SELECT document_type_id, verification_status
             FROM `application_documents`
             WHERE application_id = ?
             AND document_type_id IN ({$placeholders})",
            [$applicationId, ...$requiredTypeIds]
        );

        $uploadedTypeIds = array_column($docs, 'document_type_id');
        $missing         = array_diff($requiredTypeIds, $uploadedTypeIds);

        if (!empty($missing)) {
            return 'incomplete';
        }

        $statuses = array_column($docs, 'verification_status');

        if (in_array('rejected', $statuses, true)) {
            return 'rejected';
        }

        if (in_array('pending', $statuses, true)) {
            return 'under_review';
        }

        return 'verified';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Merit score computation
    // ─────────────────────────────────────────────────────────────────────────

    public function computeMeritScore(array $application, array $criteria): float
    {
        $gradeScore       = $this->gradeToNumeric($application['prev_grade'] ?? '');
        $combinationScore = $this->combinationScore(
            $application['combination'] ?? '',
            $criteria['required_combinations'] ?? null
        );

        $gw = (float)($criteria['grade_weight']       ?? 60.0);
        $cw = (float)($criteria['combination_weight'] ?? 30.0);

        return round(($gradeScore * $gw + $combinationScore * $cw) / 100.0, 4);
    }

    private function gradeToNumeric(string $grade): float
    {
        $grade   = strtoupper(trim($grade));
        $numeric = str_replace('%', '', $grade);

        if (is_numeric($numeric)) {
            return min(100.0, max(0.0, (float)$numeric));
        }

        return (float)(self::GRADE_MAP[$grade] ?? 0);
    }

    private function combinationScore(string $combination, ?string $requiredJson): float
    {
        if (!$requiredJson) {
            return 100.0; // No combination restriction → full score
        }

        $required    = json_decode($requiredJson, true) ?? [];
        $required    = array_map('strtoupper', $required);
        $combination = strtoupper(trim($combination));

        if (in_array($combination, $required, true)) {
            return 100.0; // Exact match
        }

        // Partial match: count overlapping subject letters
        $best = 0.0;
        foreach ($required as $req) {
            $overlap = count(array_intersect(str_split($combination), str_split($req)));
            $partial = $overlap / max(strlen($req), 1);
            if ($partial > $best) {
                $best = $partial;
            }
        }

        // Partial match is worth at most 50%
        return round($best * 50.0, 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Merit list generation
    // ─────────────────────────────────────────────────────────────────────────

    public function generateMeritList(int $departmentId, string $intake, int $yearId, int $actorId): array
    {
        $criteria = $this->criteriaModel->findForDeptIntake($departmentId, $intake, $yearId);

        if (!$criteria) {
            throw new \RuntimeException('Merit criteria not configured for this department and intake.');
        }

        $algoType = $criteria['algorithm_type'] ?? 'merit_based';

        // 1. Fetch all eligible applications
        $applications = $this->db->fetchAll(
            "SELECT sa.*, 
                    (SELECT MAX(verified_at) FROM `application_documents` WHERE application_id = sa.id) as last_verified_at
             FROM `student_applications` sa
             WHERE sa.department_id = ? AND sa.intake = ? AND sa.academic_year_id = ?
             AND sa.status = 'documents_verified'",
            [$departmentId, $intake, $yearId]
        );

        if (empty($applications)) {
            throw new \RuntimeException(
                'No verified applications found for this department and intake. '
                . 'Ensure applicants have had their documents fully verified first.'
            );
        }

        // 2. Filter by minimum grade if set
        $minGradeScore = null;
        if (!empty($criteria['min_grade'])) {
            $minGradeScore = $this->gradeToNumeric((string)$criteria['min_grade']);
        }

        $filtered = [];
        foreach ($applications as $app) {
            if ($minGradeScore !== null) {
                $applicantGradeScore = $this->gradeToNumeric((string)($app['prev_grade'] ?? ''));
                if ($applicantGradeScore < $minGradeScore) {
                    continue; // Below threshold
                }
            }
            $filtered[] = $app;
        }

        // 3. Score and Rank based on algorithm type
        $scored = [];
        foreach ($filtered as $app) {
            $score = 0.0;
            if ($algoType === 'merit_based') {
                $score = $this->computeMeritScore($app, $criteria);
            } else {
                // For non-merit, we use a neutral score or 100
                $score = 100.0;
            }

            $scored[] = [
                'application_id' => (int)$app['id'],
                'merit_score'    => $score,
                'application'    => $app,
            ];
        }

        // Sorting logic based on type
        usort($scored, function ($a, $b) use ($algoType) {
            if ($algoType === 'merit_based') {
                if ($b['merit_score'] !== $a['merit_score']) {
                    return $b['merit_score'] <=> $a['merit_score'];
                }
                // Tie-breaker: earlier graduation year first
                return $a['application']['graduation_year'] <=> $b['application']['graduation_year'];
            } 
            
            if ($algoType === 'first_come_first_served') {
                $ta = $a['application']['last_verified_at'] ?? $a['application']['created_at'];
                $tb = $b['application']['last_verified_at'] ?? $b['application']['created_at'];
                return $ta <=> $tb; // Earlier timestamp first
            }

            // Manual or unknown: default to submission order
            return $a['application_id'] <=> $b['application_id'];
        });

        // 4. Calculate qualification status based on capacity and cutoff
        $cutoff      = $criteria['cutoff_score'] !== null ? (float)$criteria['cutoff_score']  : null;
        $maxCapacity = $criteria['max_capacity']  !== null ? (int)$criteria['max_capacity']    : null;
        $now         = date('Y-m-d H:i:s');
        $qualifiedCount = 0;
        $rows        = [];

        foreach ($scored as $rank => $entry) {
            $rankNum     = $rank + 1;
            $isQualified = 1;

            // Threshold checks only for merit-based (usually)
            if ($algoType === 'merit_based' && $cutoff !== null && $entry['merit_score'] < $cutoff) {
                $isQualified = 0;
            }

            // Capacity limit applies to all except 'manual'
            if ($algoType !== 'manual' && $maxCapacity !== null && $rankNum > $maxCapacity) {
                $isQualified = 0;
            }

            if ($isQualified) {
                $qualifiedCount++;
            }

            $rows[] = [
                'application_id' => $entry['application_id'],
                'merit_score'    => $entry['merit_score'],
                'rank'           => $rankNum,
                'is_qualified'   => $isQualified,
            ];
        }

        // 5. Save results to database (Atomic)
        $this->db->transaction(function () use ($rows, $departmentId, $intake, $yearId, $now, $actorId) {
            $this->meritListModel->clearForDeptIntake($departmentId, $intake, $yearId);

            foreach ($rows as $row) {
                $this->db->execute(
                    "INSERT INTO `merit_lists`
                         (department_id, intake, academic_year_id, application_id,
                          merit_score, rank, is_qualified, generated_at, generated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [$departmentId, $intake, $yearId,
                     $row['application_id'], $row['merit_score'], $row['rank'],
                     $row['is_qualified'], $now, $actorId]
                );

                $appStatus = $row['is_qualified'] ? 'merit_listed' : 'documents_verified';
                $this->db->execute(
                    "UPDATE `student_applications`
                     SET merit_score = ?, merit_rank = ?, status = ?, updated_at = NOW()
                     WHERE id = ?",
                    [$row['merit_score'], $row['rank'], $appStatus, $row['application_id']]
                );
            }
        });

        return [
            'total'           => count($rows),
            'qualified_count' => $qualifiedCount,
            'cutoff_score'    => $cutoff,
            'max_capacity'    => $maxCapacity,
            'algorithm_type'  => $algoType,
            'top_entries'     => array_slice($rows, 0, 5),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Enrollment initiation
    // ─────────────────────────────────────────────────────────────────────────

    public function initiateEnrollment(int $offerId, int $actorId, int $levelId = 1): array
    {
        $offer = $this->offerModel->getWithApplication($offerId);

        if (!$offer) {
            throw new \RuntimeException('Offer not found.');
        }

        if ($offer['status'] !== 'accepted') {
            throw new \RuntimeException('Enrollment can only be initiated for accepted offers.');
        }

        if ((int)$offer['enrollment_initiated'] === 1) {
            throw new \RuntimeException('Enrollment has already been initiated for this offer.');
        }

        $applicationId = (int)$offer['application_id'];

        // Generate registration number: STD/YYYY/NNNNN
        $year      = date('Y');
        $row       = $this->db->fetchOne("SELECT MAX(id) AS max_id FROM `student`");
        $seq       = ((int)($row['max_id'] ?? 0)) + 1;
        $regNumber = sprintf('STD/%s/%05d', $year, $seq);

        // Map application → student table columns
        $studentData = [
            'regnumber'         => $regNumber,
            'fname'             => $offer['first_name'],
            'lname'             => $offer['last_name'],
            'email'             => $offer['email'],
            'phone'             => $offer['phone']        ?? '',
            'gender'            => $offer['gender']       ?? '',
            'birthdate'         => $offer['birthdate']    ?? null,
            'nationality'       => $offer['nationality']  ?? 'Rwandan',
            'faculty'           => $offer['faculty_name'] ?? '',
            'department'        => $offer['department_code'] ?? '',
            'program'           => $offer['department_name'] ?? $offer['department_code'],
            'combination'       => $offer['combination']   ?? '',
            'last_school'       => $offer['prev_school']   ?? '',
            'sponsor'           => $offer['sponsorship']   ?? '',
            'current_level'     => (string)$levelId,
            'registration_date' => date('Y-m-d'),
            'student_state'     => 'active',
            'intake'            => $offer['intake'] ?? '',
            'acc_year'          => $offer['academic_year_id'] ? (string)$offer['academic_year_id'] : '-',
        ];

        $studentId = (int)$this->studentModel->create($studentData);

        $this->db->execute(
            "UPDATE `admission_offers`
             SET enrollment_initiated = 1, student_id = ?, enrolled_at = NOW(), updated_at = NOW()
             WHERE id = ?",
            [$studentId, $offerId]
        );

        $this->db->execute(
            "UPDATE `student_applications`
             SET status = 'enrolled', updated_at = NOW()
             WHERE id = ?",
            [$applicationId]
        );

        // Convert user account from Applicant to Student
        $profile = $this->db->fetchOne("SELECT user_id FROM `applicant_profiles` WHERE application_id = ? LIMIT 1", [$applicationId]);
        if ($profile) {
            $userId    = (int)$profile['user_id'];
            $roleModel = new \App\Models\RoleModel();
            $studentRoleId = $roleModel->getIdByName('student');
            
            if ($studentRoleId) {
                $this->db->execute(
                    "UPDATE `users` SET role_id = ?, updated_at = NOW() WHERE id = ?",
                    [$studentRoleId, $userId]
                );
            }
        }

        $this->logStatusChange(
            $applicationId, 'offer_accepted', 'enrolled',
            $actorId, 'admin', "Enrollment initiated. Student ID: {$studentId}."
        );

        $this->sendApplicationEmail('enrollment_complete', [
            'first_name' => $offer['first_name'],
            'last_name'  => $offer['last_name'],
            'email'      => $offer['email'],
        ], [
            'reg_number'   => $regNumber,
            'program_name' => $offer['department_name'],
        ]);

        // Automatically dispatch the admission letter as part of enrollment
        try {
            $letterResult = $this->sendAdmissionLetter($offerId, $actorId);
        } catch (\Exception $e) {
            $letterResult = ['error' => $e->getMessage()];
        }

        // Auto-generate admission + registration fee invoices for the new student
        try {
            $academicYearId = (int)($offer['academic_year_id'] ?? 0);
            if ($academicYearId > 0) {
                $feeService = new FeeService();
                $feeService->autoGenerateInvoices($regNumber, $academicYearId, null, $actorId);
            }
        } catch (\Exception $e) {
            // Non-blocking: enrollment succeeds even if fee generation fails
        }

        return [
            'student_id'   => $studentId,
            'regnumber'    => $regNumber,
            'letter_sent'  => !isset($letterResult['error']),
            'letter_error' => $letterResult['error'] ?? null,
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Email notifications
    // ─────────────────────────────────────────────────────────────────────────

    public function sendApplicationEmail(string $template, array $application, array $extra = []): void
    {
        try {
            $name  = trim(($application['first_name'] ?? '') . ' ' . ($application['last_name'] ?? ''));
            $email = $application['email'] ?? '';

            if (!$email) {
                return;
            }

            $html    = '';
            $subject = '';

            switch ($template) {
                case 'application_received':
                    $html    = EmailTemplateHelper::applicationReceivedTemplate(
                        $name, 
                        $extra['application_number'] ?? '', 
                        $extra['program_name'] ?? '',
                        $extra['verification_code'] ?? null
                    );
                    $subject = 'Application Received — ' . ($extra['application_number'] ?? '');
                    break;

                case 'requested_changes':
                case 'documents_rejected':
                    $html    = EmailTemplateHelper::documentsRejectedTemplate(
                        $name, 
                        $extra['application_number'] ?? '', 
                        $extra['rejected_docs'] ?? [],
                        $extra['admin_message'] ?? ''
                    );
                    $subject = 'Action Required: Documents Need Attention';
                    break;

                case 'documents_verified':
                    $html    = EmailTemplateHelper::documentsVerifiedTemplate(
                        $name, $extra['application_number'] ?? ''
                    );
                    $subject = 'Documents Verified — Next Steps';
                    break;

                case 'admission_offer':
                    $html    = EmailTemplateHelper::admissionOfferTemplate(
                        $name, $extra['application_number'] ?? '',
                        $extra['program_name'] ?? '', $extra['offer_reference'] ?? '',
                        $extra['expires_at'] ?? '', $extra['portal_url'] ?? ''
                    );
                    $subject = 'Congratulations — Admission Offer (' . ($extra['offer_reference'] ?? '') . ')';
                    break;

                case 'offer_accepted':
                    $html    = EmailTemplateHelper::offerAcceptedConfirmationTemplate(
                        $name, $extra['program_name'] ?? ''
                    );
                    $subject = 'Enrollment Confirmed';
                    break;

                case 'enrollment_complete':
                    $html    = EmailTemplateHelper::enrollmentCompleteTemplate(
                        $name, $extra['reg_number'] ?? '', $extra['program_name'] ?? ''
                    );
                    $subject = 'Welcome — Your Registration Number';
                    break;

                case 'admission_letter':
                    $html    = EmailTemplateHelper::admissionLetterEmailTemplate(
                        $name,
                        $extra['application_number'] ?? '',
                        $extra['program_name'] ?? '',
                        $extra['offer_reference'] ?? '',
                        $extra['download_url'] ?? '',
                        $extra['expires_at'] ?? ''
                    );
                    $subject = 'Your Admission Letter — ' . ($extra['offer_reference'] ?? '');
                    break;

                default:
                    return;
            }

            if ($html && $subject) {
                $this->mailService->send($email, $subject, $html, strip_tags($html));
            }
        } catch (\Throwable $e) {
            error_log('[ApplicationService] Email error (' . $template . '): ' . $e->getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Manual Admission
    // ─────────────────────────────────────────────────────────────────────────

    public function manualAdmit(int $applicationId, int $actorId, string $reason = '', string $notes = '', ?string $expiresAt = null): array
    {
        $application = $this->applicationModel->getWithDetails($applicationId);

        if (!$application) {
            throw new \RuntimeException('Application not found.');
        }

        $allowedStatuses = ['documents_verified', 'merit_listed', 'submitted', 'documents_under_review'];
        if (!in_array($application['status'], $allowedStatuses, true)) {
            throw new \RuntimeException(
                'Manual admission is only available for applications with status: ' . implode(', ', $allowedStatuses) . '.'
            );
        }

        // Check no existing offer
        $existingOffer = $this->offerModel->findByApplicationId($applicationId);
        if ($existingOffer) {
            throw new \RuntimeException('An admission offer already exists for this application.');
        }

        $offerRef = $this->offerModel->generateOfferReference();
        $offeredAt = date('Y-m-d H:i:s');
        $expiryDate = $expiresAt ?? date('Y-m-d', strtotime('+30 days'));

        $offerId = (int)$this->offerModel->create([
            'application_id'       => $applicationId,
            'offer_letter_reference' => $offerRef,
            'offered_at'           => $offeredAt,
            'offered_by'           => $actorId,
            'expires_at'           => $expiryDate,
            'status'               => 'pending',
        ]);

        $this->db->execute(
            "UPDATE `student_applications` SET status = 'offered', updated_at = NOW() WHERE id = ?",
            [$applicationId]
        );

        $this->manualAdmissionModel->create([
            'application_id' => $applicationId,
            'admitted_by'    => $actorId,
            'reason'         => $reason,
            'notes'          => $notes,
            'offer_id'       => $offerId,
        ]);

        $this->logStatusChange($applicationId, $application['status'], 'offered', $actorId, 'admin', "Manual admission by admin. Reason: {$reason}");

        // Notify applicant
        $apiBase   = rtrim((string)(getenv('APP_URL') ?: 'http://localhost:8888/cur-mis/backend/public'), '/');
        $portalUrl = $apiBase;
        $this->sendApplicationEmail('admission_offer', $application, [
            'application_number' => $application['application_number'],
            'program_name'       => $application['department_name'] ?? '',
            'offer_reference'    => $offerRef,
            'expires_at'         => $expiryDate,
            'portal_url'         => $portalUrl,
        ]);

        return [
            'offer_id'               => $offerId,
            'offer_letter_reference' => $offerRef,
            'expires_at'             => $expiryDate,
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admission Letter: send + bulk send + get letter data
    // ─────────────────────────────────────────────────────────────────────────

    public function getLetterData(int $offerId): array
    {
        $offer = $this->offerModel->getWithApplication($offerId);
        if (!$offer) {
            throw new \RuntimeException('Offer not found.');
        }

        $year = $this->db->fetchOne(
            "SELECT ay.label AS academic_year
             FROM `student_applications` sa
             JOIN `academic_years` ay ON ay.id = sa.academic_year_id
             WHERE sa.id = ?",
            [$offer['application_id']]
        );

        $faculty = $this->db->fetchOne(
            "SELECT f.fac_name AS faculty_name
             FROM `student_applications` sa
             JOIN `faculty` f ON f.fac_id = sa.faculty_id
             WHERE sa.id = ?",
            [$offer['application_id']]
        );

        $intake = $this->db->fetchOne(
            "SELECT sa.intake FROM `student_applications` sa WHERE sa.id = ?",
            [$offer['application_id']]
        );

        return [
            'offer_letter_reference' => $offer['offer_letter_reference'],
            'first_name'             => $offer['first_name'],
            'last_name'              => $offer['last_name'],
            'email'                  => $offer['email'],
            'phone'                  => $offer['phone'] ?? '',
            'application_number'     => $offer['application_number'],
            'department_name'        => $offer['department_name'],
            'faculty_name'           => $faculty['faculty_name'] ?? '',
            'intake'                 => $intake['intake'] ?? '',
            'academic_year'          => $year['academic_year'] ?? date('Y'),
            'offered_at'             => $offer['offered_at'],
            'expires_at'             => $offer['expires_at'],
            'institution_name'       => getenv('INSTITUTION_NAME') ?: 'Catholic University of Rwanda',
            'registrar_name'         => getenv('REGISTRAR_NAME') ?: 'The Registrar',
            'registrar_title'        => getenv('REGISTRAR_TITLE') ?: 'Academic Registrar',
        ];
    }

    public function sendAdmissionLetter(int $offerId, int $actorId): array
    {
        $offer = $this->offerModel->getWithApplication($offerId);
        if (!$offer) {
            throw new \RuntimeException('Offer not found.');
        }

        if (!in_array($offer['status'], ['pending', 'accepted'], true)) {
            throw new \RuntimeException('Letter can only be sent for pending or accepted offers.');
        }

        $letterData = $this->getLetterData($offerId);
        $token      = $offer['letter_token'] ?? bin2hex(random_bytes(32));

        // Generate PDF binary
        $pdfBinary = AdmissionLetterPdf::renderPdfBinary($letterData);

        // Build download URL (token-based, no login required) — points to backend API directly
        $apiBase     = rtrim((string)(getenv('APP_URL') ?: 'http://localhost:8888/cur-mis/backend/public'), '/');
        $downloadUrl = $apiBase . '/api/portal/admission-letter?token=' . $token;

        // Send email
        $name = trim($letterData['first_name'] . ' ' . $letterData['last_name']);
        $html = EmailTemplateHelper::admissionLetterEmailTemplate(
            $name,
            $letterData['application_number'],
            $letterData['department_name'],
            $letterData['offer_letter_reference'],
            $downloadUrl,
            $letterData['expires_at']
        );
        $subject = 'Your Admission Letter — ' . $letterData['offer_letter_reference'];

        // Attach PDF if available
        if ($pdfBinary) {
            $this->mailService->sendWithAttachment(
                $offer['email'], $subject, $html, strip_tags($html),
                $pdfBinary, 'admission-letter-' . $letterData['application_number'] . '.pdf'
            );
        } else {
            $this->mailService->send($offer['email'], $subject, $html, strip_tags($html));
        }

        // Record dispatch
        $this->db->execute(
            "UPDATE `admission_offers`
             SET letter_sent_at = NOW(), letter_sent_by = ?, letter_token = ?, updated_at = NOW()
             WHERE id = ?",
            [$actorId, $token, $offerId]
        );

        return [
            'sent_to'      => $offer['email'],
            'letter_token' => $token,
            'download_url' => $downloadUrl,
        ];
    }

    public function bulkSendAdmissionLetters(int $departmentId, string $intake, int $yearId, int $actorId): array
    {
        $offers = $this->db->fetchAll(
            "SELECT ao.id
             FROM `admission_offers` ao
             JOIN `student_applications` sa ON sa.id = ao.application_id
             WHERE sa.department_id = ? AND sa.intake = ? AND sa.academic_year_id = ?
               AND ao.status IN ('pending','accepted')
               AND ao.letter_sent_at IS NULL",
            [$departmentId, $intake, $yearId]
        );

        if (empty($offers)) {
            throw new \RuntimeException('No unsent letters found for the selected department / intake / year.');
        }

        $sent  = 0;
        $errors = [];

        foreach ($offers as $row) {
            try {
                $this->sendAdmissionLetter((int)$row['id'], $actorId);
                $sent++;
            } catch (\Throwable $e) {
                $errors[] = 'Offer #' . $row['id'] . ': ' . $e->getMessage();
            }
        }

        return [
            'total'  => count($offers),
            'sent'   => $sent,
            'errors' => $errors,
        ];
    }
}
