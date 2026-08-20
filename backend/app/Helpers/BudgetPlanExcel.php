<?php

declare(strict_types=1);

namespace App\Helpers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Rebuilds the "UNIVERSITY BUDGET" workbook layout (BUDGET sheet with monthly
 * columns Sept-Aug + General Total, and the Execution sheet when actuals
 * exist) from the budget_plans/* tables (migration 106/107), so the original
 * .xlsx report can be regenerated from the database instead of the disposable
 * source files in template_docs/.
 */
class BudgetPlanExcel
{
    private const HEADER_FILL = 'FFD9E1F2';
    private const SUBTOTAL_FILL = 'FFF2F2F2';

    public const SECTIONS = [
        'revenue', 'staff_cost', 'admin_cost', 'academic_cost', 'ict_cost',
        'finance_cost', 'capex', 'financing', 'arrears', 'cashflow',
    ];
    public const ROW_TYPES = ['data', 'subtotal', 'header'];

    /** Columns of the upload/download template, in order. Month columns use the same 1..12 (Sept..Aug) keys as budget_line_item_monthly_values. */
    private const TEMPLATE_COLUMNS = [
        'ID', 'Section', 'Label', 'Row Type',
        'September', 'October', 'November', 'December', 'January', 'February',
        'March', 'April', 'May', 'June', 'July', 'August',
        'General Total', 'Executed Total',
    ];

    private static function col(int $index): string
    {
        return Coordinate::stringFromColumnIndex($index);
    }

    public static function buildWorkbook(array $plan): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);

        self::buildBudgetSheet($spreadsheet, $plan);

        $hasExecution = false;
        foreach ($plan['line_items'] as $item) {
            if ($item['executed_total'] !== null) { $hasExecution = true; break; }
        }
        if ($hasExecution) {
            self::buildExecutionSheet($spreadsheet, $plan);
        }

        return $spreadsheet;
    }

    private static function buildBudgetSheet(Spreadsheet $spreadsheet, array $plan): void
    {
        $sheet = $spreadsheet->createSheet();
        $sheet->setTitle('BUDGET ' . str_replace('/', '-', $plan['academic_year_label']));

        $months = $plan['month_names'];

        $sheet->setCellValue('A1', $plan['title']);
        $sheet->mergeCells('A1:N1');
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(13);

        $colIdx = 2; // B
        foreach ($months as $name) {
            $sheet->setCellValue(self::col($colIdx) . '2', $name);
            $colIdx++;
        }
        $totalCol = self::col($colIdx);
        $sheet->setCellValue($totalCol . '2', 'GENERAL TOTAL');
        $headerRange = "A2:{$totalCol}2";
        $sheet->getStyle($headerRange)->getFont()->setBold(true);
        $sheet->getStyle($headerRange)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB(self::HEADER_FILL);

        $row = 3;
        foreach ($plan['line_items'] as $item) {
            $sheet->setCellValue("A{$row}", str_repeat('  ', $item['parent_id'] ? 1 : 0) . $item['label']);

            $c = 2;
            foreach (array_keys($months) as $m) {
                $val = $item['months'][$m] ?? null;
                if ($val !== null) {
                    $coord = self::col($c) . $row;
                    $sheet->setCellValue($coord, $val);
                    $sheet->getStyle($coord)->getNumberFormat()->setFormatCode('#,##0.00');
                }
                $c++;
            }
            if ($item['general_total'] !== null) {
                $coord = self::col($c) . $row;
                $sheet->setCellValue($coord, $item['general_total']);
                $sheet->getStyle($coord)->getNumberFormat()->setFormatCode('#,##0.00');
            }

            if ($item['row_type'] !== 'data') {
                $lastCol = self::col($c);
                $sheet->getStyle("A{$row}:{$lastCol}{$row}")->getFont()->setBold(true);
                if ($item['row_type'] === 'subtotal') {
                    $sheet->getStyle("A{$row}:{$lastCol}{$row}")->getFill()
                        ->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB(self::SUBTOTAL_FILL);
                }
            }
            $row++;
        }

        $sheet->getColumnDimension('A')->setWidth(45);
        foreach (range('B', 'N') as $c) {
            $sheet->getColumnDimension($c)->setWidth(14);
        }
        $sheet->freezePane('B4');
    }

    private static function buildExecutionSheet(Spreadsheet $spreadsheet, array $plan): void
    {
        $sheet = $spreadsheet->createSheet();
        $sheet->setTitle('Execution ' . str_replace('/', '-', $plan['academic_year_label']));

        $sheet->setCellValue('A1', 'BUDGET EXECUTION FOR ACADEMIC YEAR ' . $plan['academic_year_label']);
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(13);

        $headers = ['PARTICULARS', 'BUDGET (GENERAL TOTAL)', 'BUDGET EXECUTION', 'VARIANCE', '% OF REALISATION'];
        foreach ($headers as $i => $h) {
            $sheet->setCellValue(self::col($i + 1) . '3', $h);
        }
        $sheet->getStyle('A3:E3')->getFont()->setBold(true);
        $sheet->getStyle('A3:E3')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB(self::HEADER_FILL);

        $row = 4;
        foreach ($plan['line_items'] as $item) {
            if ($item['executed_total'] === null) continue;

            $sheet->setCellValue("A{$row}", $item['label']);
            $sheet->setCellValue("B{$row}", $item['general_total']);
            $sheet->setCellValue("C{$row}", $item['executed_total']);
            $sheet->setCellValue("D{$row}", $item['variance']);
            $sheet->setCellValue("E{$row}", $item['pct_realisation'] !== null ? $item['pct_realisation'] / 100 : null);
            $sheet->getStyle("B{$row}:D{$row}")->getNumberFormat()->setFormatCode('#,##0.00');
            $sheet->getStyle("E{$row}")->getNumberFormat()->setFormatCode('0.00%');

            if ($item['row_type'] !== 'data') {
                $sheet->getStyle("A{$row}:E{$row}")->getFont()->setBold(true);
            }
            $row++;
        }

        if (!empty($plan['student_executions'])) {
            $row += 2;
            $sheet->setCellValue("A{$row}", 'Income in Details — Number of Students');
            $sheet->getStyle("A{$row}")->getFont()->setBold(true);
            $row++;
            foreach (['Faculty', 'Budgeted', 'Execution', 'Variance', 'Rank'] as $i => $h) {
                $sheet->setCellValue(self::col($i + 1) . $row, $h);
            }
            $sheet->getStyle("A{$row}:E{$row}")->getFont()->setBold(true);
            $row++;
            foreach ($plan['student_executions'] as $se) {
                $sheet->setCellValue("A{$row}", $se['faculty_code']);
                $sheet->setCellValue("B{$row}", $se['budgeted']);
                $sheet->setCellValue("C{$row}", $se['executed']);
                $sheet->setCellValue("D{$row}", $se['executed'] - $se['budgeted']);
                $sheet->setCellValue("E{$row}", $se['rank']);
                $row++;
            }
        }

        $sheet->getColumnDimension('A')->setWidth(45);
        foreach (range('B', 'E') as $c) {
            $sheet->getColumnDimension($c)->setWidth(18);
        }
        $sheet->freezePane('A4');
    }

    public static function streamWorkbook(array $plan, string $filename): void
    {
        $spreadsheet = self::buildWorkbook($plan);
        $writer      = new Xlsx($spreadsheet);

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: max-age=0');

        $writer->save('php://output');
        exit;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Upload/download template — a flat, re-uploadable line-item sheet used to
    // bulk-create a new plan or bulk-update an existing one. Rows with an ID
    // match an existing line item (update in place); blank ID rows are created.
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Build the template workbook. When $plan is given, one row per existing
     * line item is prefilled (with its ID) plus a few blank rows for new
     * entries; when $plan is null, only the header/instructions are written.
     */
    public static function buildTemplate(?array $plan): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $spreadsheet->removeSheetByIndex(0);

        $sheet = $spreadsheet->createSheet();
        $sheet->setTitle('Budget Plan Template');

        foreach (self::TEMPLATE_COLUMNS as $i => $h) {
            $sheet->setCellValue(self::col($i + 1) . '1', $h);
        }
        $lastCol = self::col(count(self::TEMPLATE_COLUMNS));
        $sheet->getStyle("A1:{$lastCol}1")->getFont()->setBold(true);
        $sheet->getStyle("A1:{$lastCol}1")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB(self::HEADER_FILL);

        $row = 2;
        if ($plan) {
            foreach ($plan['line_items'] as $item) {
                $sheet->setCellValue("A{$row}", $item['id']);
                $sheet->setCellValue("B{$row}", $item['section']);
                $sheet->setCellValue("C{$row}", $item['label']);
                $sheet->setCellValue("D{$row}", $item['row_type']);
                $c = 5;
                for ($m = 1; $m <= 12; $m++) {
                    $sheet->setCellValue(self::col($c) . $row, $item['months'][$m] ?? null);
                    $c++;
                }
                $sheet->setCellValue(self::col($c) . $row, $item['general_total']);
                $sheet->setCellValue(self::col($c + 1) . $row, $item['executed_total']);
                $row++;
            }
        }
        $blankRows = $plan ? 10 : 30;
        $row += $blankRows;

        // Legend sheet documenting allowed values for Section / Row Type.
        $legend = $spreadsheet->createSheet();
        $legend->setTitle('Legend');
        $legend->setCellValue('A1', 'Allowed Section values');
        $legend->getStyle('A1')->getFont()->setBold(true);
        foreach (self::SECTIONS as $i => $s) {
            $legend->setCellValue('A' . ($i + 2), $s);
        }
        $legend->setCellValue('C1', 'Allowed Row Type values');
        $legend->getStyle('C1')->getFont()->setBold(true);
        foreach (self::ROW_TYPES as $i => $t) {
            $legend->setCellValue('C' . ($i + 2), $t);
        }
        $legend->setCellValue('E1', 'Notes');
        $legend->getStyle('E1')->getFont()->setBold(true);
        $legend->setCellValue('E2', 'Leave ID blank to create a new line item; keep it to update an existing one.');
        $legend->setCellValue('E3', 'Month columns are optional — leave blank if this row has no monthly breakdown.');
        $legend->setCellValue('E4', 'General Total is stored as entered and is not required to equal the sum of the months.');
        $legend->getColumnDimension('A')->setWidth(20);
        $legend->getColumnDimension('C')->setWidth(16);
        $legend->getColumnDimension('E')->setWidth(70);

        $sheet->getColumnDimension('A')->setWidth(8);
        $sheet->getColumnDimension('B')->setWidth(16);
        $sheet->getColumnDimension('C')->setWidth(45);
        $sheet->getColumnDimension('D')->setWidth(12);
        foreach (range('E', 'R') as $c) {
            $sheet->getColumnDimension($c)->setWidth(14);
        }
        $sheet->freezePane('E2');
        $spreadsheet->setActiveSheetIndex(0);

        return $spreadsheet;
    }

    public static function streamTemplate(?array $plan, string $filename): void
    {
        $spreadsheet = self::buildTemplate($plan);
        $writer      = new Xlsx($spreadsheet);

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: max-age=0');

        $writer->save('php://output');
        exit;
    }

    /**
     * Parse an uploaded template file into a list of row arrays ready for
     * BudgetPlanModel::createLineItem()/updateLineItem(). Throws
     * \InvalidArgumentException on structural problems (missing headers,
     * invalid section/row_type values) so the controller can surface a 422.
     */
    public static function parseTemplate(string $filePath): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sheet       = $spreadsheet->getSheetByName('Budget Plan Template') ?? $spreadsheet->getSheet(0);

        $headerRow = [];
        $highestCol = $sheet->getHighestDataColumn();
        foreach ($sheet->getRowIterator(1, 1) as $r) {
            foreach ($r->getCellIterator('A', $highestCol) as $cell) {
                $headerRow[$cell->getColumn()] = trim((string)$cell->getValue());
            }
        }
        $colByHeader = array_flip(array_filter($headerRow, fn($h) => $h !== ''));

        $required = ['Section', 'Label'];
        foreach ($required as $r) {
            if (!isset($colByHeader[$r])) {
                throw new \InvalidArgumentException("Template is missing required column: {$r}");
            }
        }

        $monthCols = [];
        foreach (self::monthColumnNames() as $m => $name) {
            if (isset($colByHeader[$name])) $monthCols[$m] = $colByHeader[$name];
        }

        $rows = [];
        $highestRow = $sheet->getHighestDataRow();
        for ($r = 2; $r <= $highestRow; $r++) {
            $label = isset($colByHeader['Label']) ? trim((string)$sheet->getCell($colByHeader['Label'] . $r)->getValue()) : '';
            if ($label === '') continue; // blank template row

            $section = isset($colByHeader['Section']) ? trim((string)$sheet->getCell($colByHeader['Section'] . $r)->getValue()) : '';
            if (!in_array($section, self::SECTIONS, true)) {
                throw new \InvalidArgumentException("Row {$r}: invalid Section \"{$section}\" (label: {$label}).");
            }

            $rowType = isset($colByHeader['Row Type']) ? trim((string)$sheet->getCell($colByHeader['Row Type'] . $r)->getValue()) : 'data';
            $rowType = $rowType !== '' ? $rowType : 'data';
            if (!in_array($rowType, self::ROW_TYPES, true)) {
                throw new \InvalidArgumentException("Row {$r}: invalid Row Type \"{$rowType}\" (label: {$label}).");
            }

            $idVal = isset($colByHeader['ID']) ? trim((string)$sheet->getCell($colByHeader['ID'] . $r)->getValue()) : '';

            $months = [];
            foreach ($monthCols as $m => $col) {
                $v = $sheet->getCell($col . $r)->getValue();
                if ($v !== null && $v !== '') $months[$m] = (float)$v;
            }

            $generalTotal = null;
            if (isset($colByHeader['General Total'])) {
                $v = $sheet->getCell($colByHeader['General Total'] . $r)->getValue();
                $generalTotal = ($v !== null && $v !== '') ? (float)$v : null;
            }

            $executedTotal = null;
            if (isset($colByHeader['Executed Total'])) {
                $v = $sheet->getCell($colByHeader['Executed Total'] . $r)->getValue();
                $executedTotal = ($v !== null && $v !== '') ? (float)$v : null;
            }

            $rows[] = [
                'id'             => $idVal !== '' ? (int)$idVal : null,
                'section'        => $section,
                'label'          => $label,
                'row_type'       => $rowType,
                'months'         => $months,
                'general_total'  => $generalTotal,
                'executed_total' => $executedTotal,
            ];
        }

        return $rows;
    }

    private static function monthColumnNames(): array
    {
        return [
            1 => 'September', 2 => 'October', 3 => 'November', 4 => 'December',
            5 => 'January', 6 => 'February', 7 => 'March', 8 => 'April',
            9 => 'May', 10 => 'June', 11 => 'July', 12 => 'August',
        ];
    }
}
