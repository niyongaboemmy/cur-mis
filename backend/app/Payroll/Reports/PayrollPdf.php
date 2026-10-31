<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

/**
 * Renders payroll documents (payslips, part-time letters) to PDF with Dompdf, the library the rest of the
 * project uses. Returns null when Dompdf is not installed, so callers can say so instead of failing.
 */
final class PayrollPdf
{
    public static function render(string $html): ?string
    {
        if (!class_exists(\Dompdf\Dompdf::class)) {
            return null;
        }
        $options = new \Dompdf\Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();
        return $dompdf->output();
    }

    /** A complete, escaped HTML document with a plain layout. */
    public static function document(string $title, string $body): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><title>' . self::e($title) . '</title>
            <style>body{font-family:DejaVu Sans,sans-serif;font-size:11px;color:#111}
            h1{font-size:15px;margin:0 0 6px} h2{font-size:12px;margin:14px 0 4px}
            table{width:100%;border-collapse:collapse;margin-bottom:6px}
            th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
            th{background:#f2f2f2} td.num{text-align:right;white-space:nowrap}
            tr.total td{font-weight:bold;background:#fafafa}</style>
            </head><body>' . $body . '</body></html>';
    }

    public static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
