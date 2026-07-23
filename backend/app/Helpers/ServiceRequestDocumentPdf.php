<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Renders the document for a completed service request. Dispatches to the
 * SAME generators DocumentController uses (DocumentHelper / DegreePdf) when
 * the service is linked to a specific document type and the requester
 * resolves to a real student record — otherwise falls back to a generic
 * confirmation letter. See ServiceRequestDocumentService::buildPdfData()
 * for how `document_type_key` / `student` are resolved.
 */
class ServiceRequestDocumentPdf
{
    /** document_type_key => DegreePdf::TYPE_* — these render via DegreePdf's own pipeline (different Dompdf options: remote images enabled, local baseUrl for its background art). */
    private const DEGREE_TYPES = [
        'degree_bachelor'      => \App\Helpers\DegreePdf::TYPE_BACHELOR,
        'degree_pgde'          => \App\Helpers\DegreePdf::TYPE_PGDE,
        'degree_undergraduate' => \App\Helpers\DegreePdf::TYPE_MASTERS,
    ];

    /** @param array{request: array, service: array, document_type_key?: string, student?: ?array} $data */
    public static function buildHtml(array $data): string
    {
        $key     = $data['document_type_key'] ?? 'generic_service_letter';
        $student = $data['student'] ?? null;

        if ($student) {
            if (isset(self::DEGREE_TYPES[$key])) {
                return \App\Helpers\DegreePdf::buildHtml($student, self::DEGREE_TYPES[$key]);
            }

            $html = match ($key) {
                'to_whom_visa'        => \App\Helpers\DocumentHelper::buildVisaLetter($student),
                'admission_letter'    => \App\Helpers\DocumentHelper::buildAdmissionLetter($student),
                'registration_form'   => \App\Helpers\DocumentHelper::buildRegistrationForm($student),
                'english_proficiency' => \App\Helpers\DocumentHelper::buildEnglishProficiencyCertificate($student),
                'completed_modules'   => \App\Helpers\DocumentHelper::buildCompletedModulesReport(
                    $student,
                    \App\Helpers\DocumentHelper::fetchStudentModules((string)($student['regnumber'] ?? ''))
                ),
                default => null,
            };
            if ($html !== null) {
                return $html;
            }
        }

        return self::buildGenericLetter($data);
    }

    /** The original, always-available fallback letter — used when a service has no linked document type, or the requester isn't a resolvable student. */
    private static function buildGenericLetter(array $data): string
    {
        $request = $data['request'];
        $service = $data['service'];

        $requestCode  = htmlspecialchars((string)($request['request_code'] ?? ''), ENT_QUOTES);
        $fullName     = htmlspecialchars((string)($request['full_name'] ?? ''), ENT_QUOTES);
        $serviceName  = htmlspecialchars((string)($service['name'] ?? ''), ENT_QUOTES);
        $regnumber    = htmlspecialchars((string)($request['student_regnumber'] ?? ''), ENT_QUOTES);
        $issuedAt     = date('F j, Y');
        $completedAt  = !empty($request['completed_at']) ? date('F j, Y', strtotime($request['completed_at'])) : $issuedAt;
        $regSuffix    = $regnumber !== '' ? "(Reg. No. {$regnumber})" : '';

        return <<<HTML
        <html>
        <head>
        <style>
            body { font-family: 'Times New Roman', serif; font-size: 13pt; color: #111; margin-top: 190px; }
            .title { text-align: center; font-size: 16pt; font-weight: bold; text-decoration: underline; margin-bottom: 30px; }
            .meta { margin-bottom: 20px; }
            .meta div { margin-bottom: 4px; }
            .body { line-height: 1.8; text-align: justify; }
            .footer { margin-top: 60px; }
        </style>
        </head>
        <body>
            <div class="title">{$serviceName}</div>
            <div class="meta">
                <div><strong>Request Code:</strong> {$requestCode}</div>
                <div><strong>Date Issued:</strong> {$issuedAt}</div>
            </div>
            <div class="body">
                <p>This is to certify that <strong>{$fullName}</strong>
                {$regSuffix}
                submitted a request for <strong>{$serviceName}</strong>, which was reviewed and approved
                through the university's internal approval process, and confirmed paid as of {$completedAt}.</p>
                <p>This document was generated automatically by the CUR Management Information System
                and is valid as proof of the above request's completion.</p>
            </div>
            <div class="footer">
                <p>Office of the Registrar<br/>Catholic University of Rwanda</p>
            </div>
        </body>
        </html>
        HTML;
    }

    public static function streamPdf(array $data, string $filename = 'service-request.pdf'): void
    {
        $key     = $data['document_type_key'] ?? 'generic_service_letter';
        $student = $data['student'] ?? null;

        if ($student && isset(self::DEGREE_TYPES[$key])) {
            \App\Helpers\DegreePdf::streamPdf($student, self::DEGREE_TYPES[$key], '', '', '', $filename);
            return; // unreachable — DegreePdf::streamPdf() exits
        }

        $html = self::buildHtml($data);

        if (class_exists('\Dompdf\Dompdf')) {
            $options = new \Dompdf\Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', false);
            $options->set('defaultFont', 'Times New Roman');

            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            PdfLayout::stampHeader($dompdf);
            $dompdf->stream($filename, ['Attachment' => true]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    public static function renderPdfBinary(array $data): ?string
    {
        $key     = $data['document_type_key'] ?? 'generic_service_letter';
        $student = $data['student'] ?? null;

        if ($student && isset(self::DEGREE_TYPES[$key])) {
            return \App\Helpers\DegreePdf::renderPdfBinary($student, self::DEGREE_TYPES[$key]);
        }

        if (!class_exists('\Dompdf\Dompdf')) {
            return null;
        }

        $html    = self::buildHtml($data);
        $options = new \Dompdf\Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'Times New Roman');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        PdfLayout::stampHeader($dompdf);

        return $dompdf->output();
    }
}
