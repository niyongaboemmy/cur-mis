<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

/**
 * Writes the payroll exports as one Excel workbook: the run sheet, the bank transfers, and the statutory totals.
 * Amounts are whole RWF and are formatted with thousands separators.
 */
final class PayrollWorkbook
{
    private const AMOUNT_FORMAT = '#,##0';

    /**
     * @param array<string, mixed>                                           $run         payroll_runs row
     * @param array{headings: list<string>, rows: list<list<int|string>>, totals: list<int|string>} $sheet
     * @param array{banks: list<array<string, mixed>>, total: int}           $bankList
     * @param array<string, mixed>                                           $statutory   output of StatutoryTotals::build()
     */
    public static function build(array $run, array $sheet, array $bankList, array $statutory): Spreadsheet
    {
        $book = new Spreadsheet();

        $payroll = $book->getActiveSheet();
        $payroll->setTitle('Payroll');
        $payroll->setCellValue('A1', (string) $run['title']);
        $payroll->setCellValue('A2', 'Period ' . substr((string) $run['period_date'], 0, 7) . ' · status ' . $run['status']);
        self::writeRow($payroll, 4, $sheet['headings']);
        self::writeRows($payroll, 5, $sheet['rows']);
        $totalRow = 5 + count($sheet['rows']);
        self::writeRow($payroll, $totalRow, $sheet['totals'], true);
        self::format($payroll, 5, $totalRow, count($sheet['headings']));
        $payroll->getStyle('A4:' . self::col(count($sheet['headings'])) . '4')->getFont()->setBold(true);

        $banks = $book->createSheet();
        $banks->setTitle('Bank transfers');
        self::writeRow($banks, 1, ['Bank', 'Name', 'Account', 'Amount (RWF)'], false);
        $row = 2;
        foreach ($bankList['banks'] as $group) {
            foreach ($group['payments'] as $payment) {
                self::writeRow($banks, $row++, [$group['bank'], $payment['name'], $payment['account'], $payment['amount']]);
            }
            self::writeRow($banks, $row++, ['', $group['bank'] . ' total', '', $group['total']], true);
        }
        self::writeRow($banks, $row, ['', 'GRAND TOTAL', '', $bankList['total']], true);
        self::format($banks, 2, $row, 4, 4);

        $tax = $book->createSheet();
        $tax->setTitle('Statutory');
        self::writeRow($tax, 1, ['Body', 'Item', 'Employee (RWF)', 'Employer (RWF)'], false);
        $lines = [
            ['RRA', 'PAYE', $statutory['rra']['employee'] ?? 0, 0],
            ['RSSB', 'Pension', $statutory['rssb']['pension']['employee'], $statutory['rssb']['pension']['employer']],
            ['RSSB', 'Maternity', $statutory['rssb']['maternity']['employee'], $statutory['rssb']['maternity']['employer']],
            ['RSSB', 'Occupational hazard', 0, $statutory['rssb']['hazard']['employer']],
            ['RSSB', 'Total', $statutory['rssb']['total']['employee'], $statutory['rssb']['total']['employer']],
            ['RAMA', 'Health insurance', $statutory['rama']['employee'], $statutory['rama']['employer']],
            ['CBHI', 'Community health insurance', $statutory['cbhi']['employee'], 0],
        ];
        $row = 2;
        foreach ($lines as $line) {
            self::writeRow($tax, $row++, $line);
        }
        self::format($tax, 2, $row - 1, 4, 4);

        $book->setActiveSheetIndex(0);
        return $book;
    }

    /** Returns the workbook as .xlsx bytes. */
    public static function toXlsx(Spreadsheet $book): string
    {
        $path = tempnam(sys_get_temp_dir(), 'payroll');
        try {
            (new Xlsx($book))->save($path);
            return (string) file_get_contents($path);
        } finally {
            @unlink($path);
        }
    }

    /** @param list<int|string> $values */
    private static function writeRow(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet, int $row, array $values, bool $bold = false): void
    {
        foreach (array_values($values) as $i => $value) {
            $sheet->setCellValue(self::col($i + 1) . $row, $value);
        }
        if ($bold) {
            $sheet->getStyle('A' . $row . ':' . self::col(count($values)) . $row)->getFont()->setBold(true);
        }
    }

    /** @param list<list<int|string>> $rows */
    private static function writeRows(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet, int $firstRow, array $rows): void
    {
        foreach ($rows as $offset => $values) {
            self::writeRow($sheet, $firstRow + $offset, $values);
        }
    }

    /** Thousands separator on amount columns from $fromCol (1-based) to the last column. */
    private static function format(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet, int $fromRow, int $toRow, int $lastCol, int $fromCol = 4): void
    {
        if ($toRow < $fromRow) {
            return;
        }
        $range = self::col($fromCol) . $fromRow . ':' . self::col($lastCol) . $toRow;
        $sheet->getStyle($range)->getNumberFormat()->setFormatCode(self::AMOUNT_FORMAT);
    }

    private static function col(int $index): string
    {
        return Coordinate::stringFromColumnIndex($index);
    }
}
