<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates the official CUR admission letter as HTML / PDF.
 *
 * The rendering is delegated to {@see DocumentHelper::buildAdmissionLetter()}
 * so that the admin "Download letter", the applicant token-based download,
 * the email attachment and the /documents/generate route all produce the
 * exact same document layout (header bar, Times New Roman body, COPY mark,
 * QR code, "Audi et Aude" tagline, etc.).
 */
class AdmissionLetterPdf
{
    /**
     * Build the full letter HTML by mapping the letter data structure
     * returned from {@see \App\Services\ApplicationService::getLetterData()}
     * onto the shape expected by DocumentHelper.
     *
     * @param array $data Letter data (offer + application fields)
     */
    public static function buildHtml(array $data): string
    {
        return DocumentHelper::buildAdmissionLetter(self::mapToStudentRow($data));
    }

    /**
     * Output a PDF to the browser (Content-Type: application/pdf).
     * Requires dompdf. Falls back to HTML if unavailable.
     */
    public static function streamPdf(array $data, string $filename = 'admission-letter.pdf'): void
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

    /**
     * Return PDF binary string (for email attachments).
     * Returns null if dompdf is not available.
     */
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

    /**
     * Translate the {offer + application} letter data into the keys that
     * DocumentHelper::buildAdmissionLetter() reads from a $student row.
     */
    private static function mapToStudentRow(array $data): array
    {
        return [
            'fname'         => $data['first_name'] ?? '',
            'lname'         => $data['last_name']  ?? '',
            'fac_name'      => $data['faculty_name']    ?? '',
            'dep_name'      => $data['department_name'] ?? '',
            'current_level' => $data['level_name']      ?? '',
            'intake'        => $data['intake']          ?? '',
            'application_date' => $data['application_date'] ?? '',
            'program'       => $data['mode_of_study']   ?? 'Day',
            'acc_year'      => $data['academic_year']   ?? date('Y'),
            'regnumber'     => $data['application_number'] ?? '',
        ];
    }
}
