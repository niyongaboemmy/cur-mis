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
        'degree_bachelor',
        'degree_pgde',
        'degree_undergraduate',
    ];

    /**
     * Return the document HTML as JSON so the frontend can render it via srcdoc.
     * GET /api/documents/preview?student_id=&document_type=&token=
     */
    public function preview(Request $request, Response $response): never
    {
        [$studentId, $documentType] = $this->validated($request, $response);

        $student = DocumentHelper::fetchStudentData($studentId);
        if (!$student) {
            $this->error($response, 'Student not found.', 404);
        }

        $modules = in_array($documentType, ['completed_modules'], true)
            ? DocumentHelper::fetchStudentModules($studentId)
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
     */
    public function download(Request $request, Response $response): never
    {
        [$studentId, $documentType] = $this->validated($request, $response);

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
            ? DocumentHelper::fetchStudentModules($studentId)
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
