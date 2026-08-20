<?php

declare(strict_types=1);

namespace App\Helpers;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Cell\DataType;

/**
 * The marks-entry workbook the registry downloads, fills in offline and
 * uploads back — "Upload y'amanota hakoreshejwe Templete bakuye muri system"
 * from the August 2026 registry report.
 *
 * WHY THE SERVER ISSUES IT
 * ────────────────────────
 * The marks grid could already export its own roster from the browser, but
 * that file is only obtainable by opening the grid, and it carries nothing
 * that says which module or term it belongs to. Two consequences:
 *
 *  - a lecturer can fill in the sheet for one module and upload it against
 *    another. The importer matches on registration number alone, so any
 *    student enrolled in both silently receives the wrong module's marks;
 *  - marks can be entered against a sheet whose maxima have since changed.
 *
 * So the workbook carries an identity block (module id, term id, and the
 * maxima it was cut against) on a second sheet named `_meta`. The importer
 * reads it and refuses a mismatch. It is a plain sheet rather than document
 * metadata because Excel and LibreOffice both preserve sheets faithfully on
 * round-trip, while custom document properties are easily dropped.
 */
class MarksTemplateExcel
{
    /** Marks the file as ours, so a random spreadsheet is not read as a template. */
    public const MAGIC = 'CUR-MIS-MARKS-TEMPLATE';

    /**
     * @param array  $module  module_id, module_code, module_name
     * @param array  $term    id, label
     * @param array  $maxes   cat1, cat2, cat3, partial, final
     * @param array  $roster  rows of ['regnumber','fname','lname','sex','student_program','option_acro']
     */
    public static function build(array $module, array $term, array $maxes, array $roster): Spreadsheet
    {
        $book  = new Spreadsheet();
        $sheet = $book->getActiveSheet();
        $sheet->setTitle('Marks');

        $headers = [
            'Reg #', 'First Name', 'Surname', 'Sex', 'Program', 'Option',
            "CAT1 (/{$maxes['cat1']})",
            "CAT2 (/{$maxes['cat2']})",
            "CAT3 (/{$maxes['cat3']})",
            "Partial (/{$maxes['partial']})",
            "Exam 1st (/{$maxes['final']})",
            "Exam 2nd (/{$maxes['final']})",
            'Remarks',
        ];

        $sheet->fromArray($headers, null, 'A1');
        $sheet->getStyle('A1:M1')->getFont()->setBold(true);
        $sheet->getStyle('A1:M1')->getFill()
              ->setFillType(Fill::FILL_SOLID)
              ->getStartColor()->setRGB('E8EEF4');
        $sheet->getStyle('A1:M1')->getAlignment()
              ->setWrapText(true)->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->freezePane('A2');

        $row = 2;
        foreach ($roster as $r) {
            // Registration numbers are written as explicit strings. Left to
            // infer, Excel turns "05399" into 5399 and renders values like
            // 1CUR22AK06756 inconsistently — and the importer then fails to
            // match a student who is plainly on the roster.
            $sheet->setCellValueExplicit("A{$row}", (string) ($r['regnumber'] ?? ''), DataType::TYPE_STRING);
            $sheet->setCellValue("B{$row}", (string) ($r['fname'] ?? ''));
            $sheet->setCellValue("C{$row}", (string) ($r['lname'] ?? ''));
            $sheet->setCellValue("D{$row}", (string) ($r['sex'] ?? ''));
            $sheet->setCellValue("E{$row}", (string) ($r['student_program'] ?? ''));
            $sheet->setCellValue("F{$row}", (string) ($r['option_acro'] ?? ''));
            // G–M (the mark columns and remarks) are deliberately left empty —
            // this is a blank entry sheet, not an export of current marks.
            $row++;
        }

        foreach ([
            'A' => 18, 'B' => 18, 'C' => 18, 'D' => 6, 'E' => 14, 'F' => 10,
            'G' => 10, 'H' => 10, 'I' => 10, 'J' => 11,
            'K' => 12, 'L' => 12, 'M' => 26,
        ] as $col => $width) {
            $sheet->getColumnDimension($col)->setWidth($width);
        }

        // Identity sheet — read by the importer, not meant for human editing.
        $meta = $book->createSheet();
        $meta->setTitle('_meta');
        $meta->fromArray([
            ['key', 'value'],
            ['magic',        self::MAGIC],
            ['module_id',    (string) ($module['module_id'] ?? '')],
            ['module_code',  (string) ($module['module_code'] ?? '')],
            ['term_id',      (string) ($term['id'] ?? '')],
            ['term_label',   (string) ($term['label'] ?? '')],
            ['cat1_max',     (string) $maxes['cat1']],
            ['cat2_max',     (string) $maxes['cat2']],
            ['cat3_max',     (string) $maxes['cat3']],
            ['partial_max',  (string) $maxes['partial']],
            ['final_max',    (string) $maxes['final']],
            ['issued_at',    date('Y-m-d H:i:s')],
            ['note',         'Do not edit or delete this sheet — the upload is rejected without it.'],
        ], null, 'A1');
        $meta->getStyle('A1:B1')->getFont()->setBold(true);
        $meta->getColumnDimension('A')->setWidth(16);
        $meta->getColumnDimension('B')->setWidth(58);

        $book->setActiveSheetIndex(0);
        return $book;
    }

    /** Stream the workbook as a download and end the request. */
    public static function stream(Spreadsheet $book, string $filename): never
    {
        // PhpSpreadsheet writes to php://output; anything already buffered
        // would be prepended to the zip container and corrupt the file.
        if (ob_get_length()) {
            ob_end_clean();
        }

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: max-age=0');

        (new Xlsx($book))->save('php://output');
        exit;
    }
}
