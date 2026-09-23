<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates Payment Calendar PDFs matching the official CUR
 * "PROPOSED PAYMENT CALENDAR" workbook layout.
 * Follows the same pattern as FeeSchedulePdf.php:
 * - buildHtml() delegates to DocumentHelper
 * - streamPdf() renders via dompdf with PdfLayout stamping
 */
class PaymentCalendarPdf
{
    public static function buildHtml(array $document, array $items, array $meta = []): string
    {
        return DocumentHelper::buildPaymentCalendar($document, $items, $meta);
    }

    /** Stream the payment calendar as a PDF to the browser. */
    public static function streamPdf(array $document, array $items, array $meta = [], string $filename = 'payment-calendar.pdf'): void
    {
        $html = self::buildHtml($document, $items, $meta);

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
}
