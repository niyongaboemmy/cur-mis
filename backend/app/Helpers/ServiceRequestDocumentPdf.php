<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates the generic service-request confirmation letter as HTML / PDF.
 * Same buildHtml()/streamPdf()/renderPdfBinary() skeleton as AdmissionLetterPdf.
 */
class ServiceRequestDocumentPdf
{
    /** @param array{request: array, service: array} $data */
    public static function buildHtml(array $data): string
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
