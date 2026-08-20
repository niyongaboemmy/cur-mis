<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates fee invoice/bill PDFs for students.
 * Follows the same pattern as AdmissionLetterPdf.php:
 * - buildHtml() delegates to DocumentHelper
 * - streamPdf() renders via dompdf with PdfLayout stamping
 * - renderPdfBinary() returns binary for email attachments
 */
class FeeInvoicePdf
{
    /**
     * Build the full invoice HTML.
     *
     * @param array $student Student info (regnumber, fname, lname, fac_name, dep_name, current_level, acc_year)
     * @param array $invoiceLines Array of invoice line items
     * @param array $meta Metadata (title, academic_year, semester, generated_date)
     */
    public static function buildHtml(array $student, array $invoiceLines, array $meta = []): string
    {
        return DocumentHelper::buildFeeInvoice($student, $invoiceLines, $meta);
    }

    /**
     * Stream the invoice as a PDF to the browser.
     */
    public static function streamPdf(array $student, array $invoiceLines, array $meta = [], string $filename = 'fee-invoice.pdf'): void
    {
        $html = self::buildHtml($student, $invoiceLines, $meta);

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
    public static function renderPdfBinary(array $student, array $invoiceLines, array $meta = []): ?string
    {
        if (!class_exists('\Dompdf\Dompdf')) {
            return null;
        }

        $html    = self::buildHtml($student, $invoiceLines, $meta);
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
