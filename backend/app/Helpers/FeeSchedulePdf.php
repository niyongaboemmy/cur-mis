<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates fee schedule PDFs matching the official CUR fee structure layout.
 * Follows the same pattern as FeeInvoicePdf.php:
 * - buildHtml() delegates to DocumentHelper
 * - streamPdf() renders via dompdf with PdfLayout stamping
 */
class FeeSchedulePdf
{
    /**
     * Build the full fee schedule HTML.
     *
     * @param array $rows Pivoted fee schedule rows (from FeeStructureModel::scheduleExport)
     * @param array $meta Metadata (academic_year, generated_date)
     */
    public static function buildHtml(array $rows, array $meta = []): string
    {
        return DocumentHelper::buildFeeSchedule($rows, $meta);
    }

    /**
     * Stream the fee schedule as a PDF to the browser.
     */
    public static function streamPdf(array $rows, array $meta = [], string $filename = 'fee-schedule.pdf'): void
    {
        $html = self::buildHtml($rows, $meta);

        if (class_exists('\Dompdf\Dompdf')) {
            $options = new \Dompdf\Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', false);
            $options->set('defaultFont', 'Times New Roman');

            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'landscape');
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
     * Return PDF binary string (for email attachments or storage).
     */
    public static function renderPdfBinary(array $rows, array $meta = []): ?string
    {
        if (!class_exists('\Dompdf\Dompdf')) {
            return null;
        }

        $html    = self::buildHtml($rows, $meta);
        $options = new \Dompdf\Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'Times New Roman');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');
        $dompdf->render();
        PdfLayout::stampHeader($dompdf);

        return $dompdf->output();
    }
}
