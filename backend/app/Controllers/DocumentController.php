<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Helpers\DocumentHelper;
use App\Helpers\DegreePdf;

class DocumentController extends BaseController
{
    private const ALLOWED_TYPES = [
        'to_whom_visa',
        'admission_letter',
        'registration_form',
        'english_proficiency',
        'completed_modules',
        'exemption_letter',
        'degree_bachelor',
        'degree_pgde',
        'degree_undergraduate',
    ];

    /**
     * Return the document HTML as JSON so the frontend can render it via srcdoc.
     * GET /api/documents/preview?student_id=&document_type=&token=
     * Exemption Letter is excluded — use POST /api/documents/exemption-letter/preview instead.
     */
    public function preview(Request $request, Response $response): never
    {
        [$studentId, $documentType] = $this->validated($request, $response);

        // exemption_letter requires POST with custom data — reject GET attempts
        if ($documentType === 'exemption_letter') {
            $this->error($response, 'Use POST /api/documents/exemption-letter/preview for exemption letters.', 405);
        }

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $modules = in_array($documentType, ['completed_modules'], true)
            ? DocumentHelper::fetchStudentModules($student['regnumber'] ?? '')
            : [];

        $html = match ($documentType) {
            'to_whom_visa'         => DocumentHelper::buildVisaLetter($student, preview: true),
            'admission_letter'     => DocumentHelper::buildAdmissionLetter($student, preview: true),
            'registration_form'    => DocumentHelper::buildRegistrationForm($student, preview: true),
            'english_proficiency'  => DocumentHelper::buildEnglishProficiencyCertificate($student, preview: true),
            'completed_modules'    => DocumentHelper::buildCompletedModulesReport($student, $modules, preview: true),
            'degree_bachelor'      => DegreePdf::buildHtml($student, DegreePdf::TYPE_BACHELOR),
            'degree_pgde'          => DegreePdf::buildHtml($student, DegreePdf::TYPE_PGDE),
            'degree_undergraduate' => DegreePdf::buildHtml($student, DegreePdf::TYPE_MASTERS),
        };

        $this->success($response, ['html' => $html], 'Preview generated.');
    }

    /**
     * Stream the document as a PDF (inline in the browser tab).
     * GET /api/documents/download?student_id=&document_type=&token=
     * Exemption Letter is excluded — use POST /api/documents/exemption-letter/download instead.
     */
    public function download(Request $request, Response $response): never
    {
        [$studentId, $documentType] = $this->validated($request, $response);

        // exemption_letter requires POST with custom data — reject GET attempts
        if ($documentType === 'exemption_letter') {
            $this->error($response, 'Use POST /api/documents/exemption-letter/download for exemption letters.', 405);
        }

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $reg = preg_replace('/[^A-Za-z0-9_-]/', '', $student['regnumber'] ?? "s{$studentId}");

        // Handle degree certificates (use DegreePdf directly to match preview)
        if (in_array($documentType, ['degree_bachelor', 'degree_pgde', 'degree_undergraduate'], true)) {
            $type = match($documentType) {
                'degree_bachelor' => DegreePdf::TYPE_BACHELOR,
                'degree_pgde' => DegreePdf::TYPE_PGDE,
                'degree_undergraduate' => DegreePdf::TYPE_MASTERS,
            };
            DegreePdf::streamPdf($student, $type, '', '', '', "degree-{$reg}.pdf");
            exit;
        }

        $modules = in_array($documentType, ['completed_modules'], true)
            ? DocumentHelper::fetchStudentModules($student['regnumber'] ?? '')
            : [];

        [$html, $filename] = match ($documentType) {
            'to_whom_visa'        => [
                DocumentHelper::buildVisaLetter($student),
                "visa-letter-{$reg}.pdf",
            ],
            'admission_letter'    => [
                DocumentHelper::buildAdmissionLetter($student),
                "admission-letter-{$reg}.pdf",
            ],
            'registration_form'   => [
                DocumentHelper::buildRegistrationForm($student),
                "registration-form-{$reg}.pdf",
            ],
            'english_proficiency' => [
                DocumentHelper::buildEnglishProficiencyCertificate($student),
                "English_Proficiency_{$reg}.pdf",
            ],
            'completed_modules'   => [
                DocumentHelper::buildCompletedModulesReport($student, $modules),
                "Completed_Modules_{$reg}.pdf",
            ],
        };

        DocumentHelper::stream($html, $filename);
    }

    /** POST /api/documents/exemption-letter/preview — return HTML for the exemption letter. */
    public function previewExemptionLetter(Request $request, Response $response): never
    {
        $body = $request->body();
        $studentId = (int)($body['student_id'] ?? 0);

        if ($studentId <= 0) {
            $this->error($response, 'student_id is required.', 422);
        }

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $html = DocumentHelper::buildExemptionLetter($student, $body, preview: true);
        $this->success($response, ['html' => $html], 'Preview generated.');
    }

    /** POST /api/documents/exemption-letter/download — stream the exemption letter as PDF. */
    public function downloadExemptionLetter(Request $request, Response $response): never
    {
        $body = $request->body();
        $studentId = (int)($body['student_id'] ?? 0);

        if ($studentId <= 0) {
            $this->error($response, 'student_id is required.', 422);
        }

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $reg = preg_replace('/[^A-Za-z0-9_-]/', '', $student['regnumber'] ?? "s{$studentId}");
        $html = DocumentHelper::buildExemptionLetter($student, $body, preview: false);

        DocumentHelper::stream($html, "Exemption_Letter_{$reg}.pdf");
    }

    /** GET /api/documents/exemption-letter/test — test module query. */
    public function testModuleQuery(Request $request, Response $response): never
    {
        try {
            $moduleModel = new \App\Models\ModuleModel();
            $result = $moduleModel->listWithPrereqs(1, 10, ['department' => 3]);

            $this->success($response, [
                'total' => $result['total'] ?? 0,
                'count' => count($result['data'] ?? []),
                'first_module' => $result['data'][0] ?? null,
                'all_data' => $result
            ], 'Test query successful');
        } catch (\Throwable $e) {
            $this->error($response, $e->getMessage() . ' | ' . $e->getTraceAsString(), 500);
        }
    }

    /** GET /api/documents/exemption-letter/modules — list modules for exemption letter builder. */
    public function exemptionLetterModules(Request $request, Response $response): never
    {
        $department = $request->query('department');

        try {
            // Parse department parameter (can be single ID or comma-separated IDs)
            $departmentIds = [];
            if (!empty($department)) {
                $departmentIds = array_map('intval', array_filter(
                    explode(',', trim($department)),
                    fn($v) => !empty(trim($v))
                ));
            }

            if (empty($departmentIds)) {
                $this->error($response, 'At least one valid department ID is required.', 422);
            }

            // Use optimized ModuleModel method for exemption letters
            $moduleModel = new \App\Models\ModuleModel();
            $modules = $moduleModel->getModulesForExemptionLetter($departmentIds);

            error_log(sprintf(
                'exemptionLetterModules: departments=%s, found=%d modules',
                json_encode($departmentIds),
                count($modules)
            ));

            // Return in paginated format for frontend consistency
            $this->success($response, [
                'data' => [
                    'data' => $modules,
                    'total' => count($modules),
                    'per_page' => count($modules),
                    'current_page' => 1,
                    'last_page' => 1,
                ]
            ], 'Modules for exemption letter fetched.');
        } catch (\Throwable $e) {
            error_log('exemptionLetterModules ERROR: ' . $e->getMessage() . ' | ' . $e->getTraceAsString());
            $this->error($response, 'Failed to fetch modules: ' . $e->getMessage(), 500);
        }
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /** Determine certificate type based on programme_level. */
    private function determineCertificateType(array $student): string
    {
        $programmeLevel = strtolower((string)($student['programme_level'] ?? 'undergraduate'));

        return match ($programmeLevel) {
            'masters', 'master'                  => DegreePdf::TYPE_MASTERS,
            'pgde', 'postgraduate diploma'      => DegreePdf::TYPE_PGDE,
            'phd', 'doctorate', 'doctor'        => DegreePdf::TYPE_PHD,
            'undergraduate', 'bachelor'         => DegreePdf::TYPE_BACHELOR,
            default                             => DegreePdf::TYPE_BACHELOR,
        };
    }

    /** Validate common query params; exits with 422 on failure. */
    private function validated(Request $request, Response $response): array
    {
        $studentId    = (int) ($request->query('student_id') ?? 0);
        $documentType = trim((string) ($request->query('document_type') ?? ''));

        if ($studentId <= 0) {
            $this->error($response, 'student_id is required.', 422);
        }

        if (!\in_array($documentType, self::ALLOWED_TYPES, true)) {
            $this->error(
                $response,
                'Invalid document_type. Allowed: ' . implode(', ', self::ALLOWED_TYPES),
                422
            );
        }

        return [$studentId, $documentType];
    }
}
