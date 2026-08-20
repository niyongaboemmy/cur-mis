<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates the Postgraduate Studies fee schedule PDF (local/EAC or international),
 * matching the signed Finance layout. Follows the same pattern as FeeSchedulePdf.php.
 */
class PostgraduateFeeSchedulePdf
{
    public static function buildHtml(array $rows, array $otherFees, array $meta = []): string
    {
        return DocumentHelper::buildPostgraduateFeeSchedule($rows, $otherFees, $meta);
    }

    public static function streamPdf(array $rows, array $otherFees, array $meta = [], string $filename = 'postgraduate-fee-schedule.pdf'): void
    {
        $html = self::buildHtml($rows, $otherFees, $meta);

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
}
