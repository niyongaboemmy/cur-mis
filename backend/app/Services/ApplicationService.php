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
        $this->applicationModel  = new StudentApplicationModel();
        $this->documentModel     = new ApplicationDocumentModel();
        $this->requirementModel  = new AdmissionRequirementModel();
        $this->logModel          = new ApplicationStatusLogModel();
        $this->criteriaModel     = new MeritCriteriaModel();
        $this->meritListModel    = new MeritListModel();
        $this->offerModel        = new AdmissionOfferModel();
        $this->yearModel         = new AcademicYearModel();
        $this->studentModel      = new StudentModel();
        $this->mailService       = new MailService();
        $this->db                = Database::getInstance();
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

    public function generateMeritList(int $programId, string $intake, int $yearId, int $actorId): array
    {
        $criteria = $this->criteriaModel->findForProgramIntake($programId, $intake, $yearId);

        if (!$criteria) {
            throw new \RuntimeException('Merit criteria not configured for this program and intake.');
        }

        $applications = $this->db->fetchAll(
            "SELECT * FROM `student_applications`
             WHERE program_id = ? AND intake = ? AND academic_year_id = ?
             AND status = 'documents_verified'",
            [$programId, $intake, $yearId]
        );

        if (empty($applications)) {
            throw new \RuntimeException(
                'No verified applications found for this program and intake. '
                . 'Ensure applicants have had their documents fully verified first.'
            );
        }

        // Score every applicant
        $scored = [];
        foreach ($applications as $app) {
            $scored[] = [
                'application_id' => (int)$app['id'],
                'merit_score'    => $this->computeMeritScore($app, $criteria),
                'application'    => $app,
            ];
        }

        // Sort by score descending, then by graduation_year ascending (earlier = priority)
        usort($scored, function ($a, $b) {
            if ($b['merit_score'] !== $a['merit_score']) {
                return $b['merit_score'] <=> $a['merit_score'];
            }
            return $a['application']['graduation_year'] <=> $b['application']['graduation_year'];
        });

        $cutoff      = $criteria['cutoff_score'] !== null ? (float)$criteria['cutoff_score']  : null;
        $maxCapacity = $criteria['max_capacity']  !== null ? (int)$criteria['max_capacity']    : null;
        $now         = date('Y-m-d H:i:s');
        $qualifiedCount = 0;
        $rows        = [];

        foreach ($scored as $rank => $entry) {
            $rankNum     = $rank + 1;
            $isQualified = 1;

            if ($cutoff !== null && $entry['merit_score'] < $cutoff) {
                $isQualified = 0;
            }

            if ($maxCapacity !== null && $rankNum > $maxCapacity) {
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

        // Atomic: clear old list → insert new → update application scores
        $this->db->transaction(function () use ($rows, $programId, $intake, $yearId, $now, $actorId) {
            $this->meritListModel->clearForProgramIntake($programId, $intake, $yearId);

            foreach ($rows as $row) {
                $this->db->execute(
                    "INSERT INTO `merit_lists`
                         (program_id, intake, academic_year_id, application_id,
                          merit_score, rank, is_qualified, generated_at, generated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [$programId, $intake, $yearId,
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
            'top_entries'     => array_slice($rows, 0, 5),
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Enrollment initiation
    // ─────────────────────────────────────────────────────────────────────────

    public function initiateEnrollment(int $offerId, int $actorId): array
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
            'nationality'       => $offer['nationality']  ?? 'Rwandan',
            'program'           => $offer['program_code'] ?? $offer['program_name'],
            'registration_date' => date('Y-m-d'),
            'student_state'     => 'active',
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
            'program_name' => $offer['program_name'],
        ]);

        return [
            'student_id' => $studentId,
            'regnumber'  => $regNumber,
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
                        $name, $extra['application_number'] ?? '', $extra['program_name'] ?? ''
                    );
                    $subject = 'Application Received — ' . ($extra['application_number'] ?? '');
                    break;

                case 'documents_rejected':
                    $html    = EmailTemplateHelper::documentsRejectedTemplate(
                        $name, $extra['application_number'] ?? '', $extra['rejected_docs'] ?? []
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
}
