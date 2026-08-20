<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates Budget Execution report PDFs. Follows the same pattern as
 * FeeSchedulePdf.php: buildHtml() renders the table, streamPdf() renders via
 * dompdf with PdfLayout stamping.
 */
class BudgetExecutionPdf
{
    public static function buildHtml(array $rows, array $meta = []): string
    {
        $acYear        = htmlspecialchars((string)($meta['academic_year'] ?? date('Y')), ENT_QUOTES);
        $generatedDate = $meta['generated_date'] ?? date('Y-m-d');
        $fmtNum        = fn ($n) => number_format((float)$n, 0, '', ',') . ' RWF';

        $tbody = '';
        foreach ($rows as $r) {
            $overspend     = !empty($r['is_overspend']);
            $rowStyle      = $overspend ? 'background: #fdecea;' : '';
            $categoryName  = htmlspecialchars((string)$r['category_name'], ENT_QUOTES);
            $departmentName = htmlspecialchars((string)($r['department_name'] ?: 'All Departments'), ENT_QUOTES);
            $statusColor   = $overspend ? '#c0392b' : '#27ae60';
            $statusLabel   = $overspend ? 'OVER' : 'OK';
            $planned       = $fmtNum($r['planned_budget']);
            $spent         = $fmtNum($r['amount_spent']);
            $balance       = $fmtNum($r['balance']);
            $variance      = $fmtNum($r['variance']);
            $tbody .= <<<HTML
            <tr style="border: 1px solid #ddd; {$rowStyle}">
                <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">{$categoryName}</td>
                <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">{$departmentName}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$planned}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$spent}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$balance}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px; font-weight: bold;">{$variance}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; color: {$statusColor};">{$statusLabel}</td>
            </tr>
            HTML;
        }

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Budget Execution {$acYear}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #333; line-height: 1.3; }
                .page { max-width: 29.7cm; margin: 0 auto; padding: 15mm; background: white; }
                .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 3px; }
                .header p { font-size: 10px; color: #666; margin: 2px 0; }
                .title { font-size: 14px; font-weight: bold; margin: 15px 0 10px 0; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                table th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px; text-align: left; font-weight: bold; font-size: 10px; }
                table td { border: 1px solid #ddd; padding: 8px; font-size: 10px; }
                .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center; }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="header">
                    <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
                    <p>Budget Execution Report — Academic Year {$acYear}</p>
                </div>
                <div class="title">Planned vs. Actual Spend</div>
                <table>
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Department</th>
                            <th style="text-align:right;">Planned Budget</th>
                            <th style="text-align:right;">Amount Spent</th>
                            <th style="text-align:right;">Balance</th>
                            <th style="text-align:right;">Variance</th>
                            <th style="text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$tbody}
                    </tbody>
                </table>
                <div class="footer">Generated on {$generatedDate}</div>
            </div>
        </body>
        </html>
        HTML;
    }

    public static function streamPdf(array $rows, array $meta = [], string $filename = 'budget-execution.pdf'): void
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
}
