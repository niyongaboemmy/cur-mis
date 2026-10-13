<?php

declare(strict_types=1);

namespace App\Helpers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

/**
 * The graduation list workbook in the layout the Higher Education Council
 * (HEC) asks for: one sheet per programme (award), with the institution,
 * faculty, academic year and award at the top, then student identification,
 * admission criteria and the average for each level.
 *
 * Columns follow the registry's template exactly, A to AB. Anything the
 * system does not hold is left blank rather than guessed; see
 * {@see self::COLUMNS} for the source of each one.
 */
class HecGraduationTemplate
{
    public const INSTITUTION = 'CATHOLIC UNIVERSITY OF RWANDA';

    /** Level number → the word the template prints above its column. */
    public const LEVEL_WORDS = [1 => 'ONE', 2 => 'TWO', 3 => 'THREE', 4 => 'FOUR', 5 => 'FIVE'];

    /**
     * Column key, heading and width, in template order (A…AB).
     *
     * @var array<int, array{0:string,1:string,2:int}>
     */
    public const COLUMNS = [
        ['sno',                'S/NO',                                                  6],
        ['surname',            'Surname',                                               16],
        ['firstname',          'First name',                                            16],
        ['gender',             'Gender (Male/ Female)',                                 10],
        ['birth_date',         'Date of Birth (Day/ Month/ Year)',                      13],
        ['phone',              'Telephone number',                                      15],
        ['email',              'Email Address',                                         24],
        ['national_id',        'ID Number/ Passport Number',                            18],
        ['nationality',        'Nationality',                                           12],
        ['regnumber',          'Registration No.',                                      18],
        ['sponsorship',        'Sponsorship',                                           12],
        ['father_surname',     'Surname',                                               14],
        ['father_firstname',   'Firstname',                                             14],
        ['mother_surname',     'Surname',                                               14],
        ['mother_firstname',   'Firstname',                                             14],
        ['combination',        'Combination attended at high school/ Section',          26],
        ['principal_passes',   'No of Principal Passes',                                12],
        ['eligibility',        'Eligibility (Yes/No)',                                  12],
        ['credits_transferred','Number of credits Transfered',                          13],
        ['year_registration',  'Year of registration',                                  12],
        ['year_completion',    'Year of completion',                                    12],
        ['level_1',            'Average score in Level ONE',                            12],
        ['level_2',            'Average score in Level TWO',                            12],
        ['level_3',            'Average score in Level THREE',                          12],
        ['level_4',            'Average score in Level FOUR',                           12],
        ['level_5',            'Average score in Level FIVE',                           12],
        ['cumulative',         'Cummulative average grade',                             13],
        ['hec_eligible',       'Eligible to graduate/Not Eligible to graduate (For HEC)', 22],
    ];

    /**
     * Build the workbook.
     *
     * @param array<int, array{sheet:string, faculty:string, award:string, students:array<int,array<string,mixed>>}> $programmes
     *        one entry per sheet; `students` are rows already shaped by {@see rowFor()}
     */
    public static function build(array $programmes, string $academicYear): Spreadsheet
    {
        // Building the workbook trips PhpSpreadsheet's PHP 8.3 "Increment on
        // non-numeric string" deprecations. Echoed mid-download they would
        // corrupt the file, so buffer them away here, as MarksTemplateExcel does.
        ob_start();
        try {
            return self::compose($programmes, $academicYear);
        } finally {
            ob_end_clean();
        }
    }

    /**
     * Turn one student into a row keyed by {@see self::COLUMNS} keys.
     *
     * Expected keys on `$s`: lname, fname, gender, birthdate, phone, email,
     * id_card, nationality, regnumber, sponsor, father, mother, combination,
     * principle_pass, intake_year, weighted_avg, failed (int), graduation_date
     * (string|null), graduand_status, levels (array<int,float|null>).
     *
     * @return array<string, string|int|float>
     */
    public static function rowFor(array $s, int $seq): array
    {
        [$fSur, $fFirst] = self::splitName((string)($s['father'] ?? ''));
        [$mSur, $mFirst] = self::splitName((string)($s['mother'] ?? ''));
        $eligible = (int)($s['failed'] ?? 0) === 0;

        $row = [
            'sno'                 => $seq,
            'surname'             => (string)($s['lname'] ?? ''),
            'firstname'           => (string)($s['fname'] ?? ''),
            'gender'              => self::gender($s['gender'] ?? null),
            'birth_date'          => self::birthDate($s['birthdate'] ?? null),
            'phone'               => (string)($s['phone'] ?? ''),
            'email'               => (string)($s['email'] ?? ''),
            'national_id'         => (string)($s['id_card'] ?? ''),
            'nationality'         => (string)($s['nationality'] ?? ''),
            'regnumber'           => (string)($s['regnumber'] ?? ''),
            'sponsorship'         => (string)($s['sponsor'] ?? ''),
            'father_surname'      => $fSur,
            'father_firstname'    => $fFirst,
            'mother_surname'      => $mSur,
            'mother_firstname'    => $mFirst,
            'combination'         => (string)($s['combination'] ?? ''),
            'principal_passes'    => (string)($s['principle_pass'] ?? ''),
            'eligibility'         => $eligible ? 'Yes' : 'No',
            // The system does not record transferred credits, so this stays
            // blank for the registry to complete by hand.
            'credits_transferred' => '',
            'year_registration'   => $s['intake_year'] !== null ? (int)$s['intake_year'] : '',
            'year_completion'     => self::yearOf($s['graduation_date'] ?? null),
        ];

        foreach (array_keys(self::LEVEL_WORDS) as $n) {
            $avg = $s['levels'][$n] ?? null;
            $row["level_{$n}"] = $avg !== null ? round((float)$avg, 2) : '';
        }

        $row['cumulative']   = $s['weighted_avg'] !== null ? round((float)$s['weighted_avg'], 2) : '';
        $row['hec_eligible'] = $eligible ? 'Eligible' : 'Not Eligible';

        return $row;
    }

    /* ── Workbook ──────────────────────────────────────────────────────────── */

    private static function compose(array $programmes, string $academicYear): Spreadsheet
    {
        $book = new Spreadsheet();
        $book->removeSheetByIndex(0);

        $used = [];
        foreach ($programmes as $p) {
            $sheet = $book->createSheet();
            $sheet->setTitle(self::sheetTitle((string)$p['sheet'], $used));
            self::writeProgramme($sheet, $p, $academicYear);
        }
        $book->setActiveSheetIndex(0);
        return $book;
    }

    private static function writeProgramme($sheet, array $p, string $academicYear): void
    {
        $colCount = count(self::COLUMNS);
        $lastCol  = Coordinate::stringFromColumnIndex($colCount);

        // Title block, rows 1–4.
        $sheet->setCellValue('A1', 'INSTITUTION : ' . self::INSTITUTION);
        $sheet->setCellValue('A2', 'FACULTY : ' . $p['faculty']);
        $sheet->setCellValue('A3', 'ACADEMIC YEAR : ' . $academicYear);
        $sheet->setCellValue('A4', 'AWARD : Bachelor with honours in ' . $p['award']);
        $sheet->getStyle('A1:A4')->getFont()->setBold(true)->setSize(11);

        // Band headings, row 5.
        self::band($sheet, 'A5:O5', "STUDENTS' IDENTIFICATION");
        self::band($sheet, 'P5:U5', 'Admission criteria');
        self::band($sheet, 'V5:AB5', 'Grades/marks scored by the student');

        // Sub-headings for the parents, row 6.
        self::band($sheet, 'L6:M6', "Father's name", false);
        self::band($sheet, 'N6:O6', "Mother's name", false);

        // Column headings, row 7, printed vertically as on the registry's form.
        foreach (self::COLUMNS as $i => [, $heading, $width]) {
            $col = Coordinate::stringFromColumnIndex($i + 1);
            $sheet->setCellValue("{$col}7", $heading);
            $sheet->getColumnDimension($col)->setWidth($width);
        }
        $head = $sheet->getStyle("A7:{$lastCol}7");
        $head->getAlignment()
            ->setTextRotation(90)
            ->setWrapText(true)
            ->setHorizontal(Alignment::HORIZONTAL_CENTER)
            ->setVertical(Alignment::VERTICAL_CENTER);
        $head->getFont()->setBold(true);
        $sheet->getRowDimension(7)->setRowHeight(175);

        // Student rows from row 8.
        $r = 8;
        foreach ($p['students'] as $row) {
            foreach (self::COLUMNS as $i => [$key]) {
                $col = Coordinate::stringFromColumnIndex($i + 1);
                $value = $row[$key] ?? '';
                // Phone, ID and registration numbers are text: as numbers Excel
                // would turn long digit strings into 1.2E+15.
                if (in_array($key, ['phone', 'national_id', 'regnumber'], true)) {
                    $sheet->setCellValueExplicit("{$col}{$r}", (string)$value, DataType::TYPE_STRING);
                } else {
                    $sheet->setCellValue("{$col}{$r}", $value);
                }
            }
            $r++;
        }

        $lastRow = max(7, $r - 1);
        $grid = $sheet->getStyle("A5:{$lastCol}{$lastRow}");
        $grid->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN);
        $grid->getFont()->setSize(10);
        $sheet->getStyle("A5:{$lastCol}7")->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('FCE4D6');

        $sheet->freezePane('A8');
    }

    /** A merged, centred, shaded heading across `$range`. */
    private static function band($sheet, string $range, string $text, bool $shaded = true): void
    {
        $sheet->mergeCells($range);
        $first = explode(':', $range)[0];
        $sheet->setCellValue($first, $text);
        $style = $sheet->getStyle($range);
        $style->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        $style->getFont()->setBold(true);
        if ($shaded) {
            $style->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('FCE4D6');
        }
    }

    /**
     * A sheet title Excel accepts: at most 31 characters, none of []:*?/\ ,
     * and unique within the workbook.
     */
    private static function sheetTitle(string $name, array &$used): string
    {
        $base = trim(str_replace(['[', ']', ':', '*', '?', '/', '\\'], ' ', $name));
        $base = $base !== '' ? mb_substr($base, 0, 31) : 'Programme';
        $title = $base;
        for ($n = 2; in_array(strtolower($title), $used, true); $n++) {
            $suffix = " ({$n})";
            $title  = mb_substr($base, 0, 31 - mb_strlen($suffix)) . $suffix;
        }
        $used[] = strtolower($title);
        return $title;
    }

    /* ── Field shaping ─────────────────────────────────────────────────────── */

    /**
     * Split "John Doe" into [surname, firstname]. The system stores a parent's
     * name as one field, usually given first, so the last word is taken as the
     * surname. Confirm this against the registry's own records.
     *
     * @return array{0:string,1:string}
     */
    private static function splitName(string $full): array
    {
        $parts = preg_split('/\s+/', trim($full), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($parts) === 0) return ['', ''];
        if (count($parts) === 1) return [$parts[0], ''];
        $surname = (string)array_pop($parts);
        return [$surname, implode(' ', $parts)];
    }

    /** Male / Female, from whatever the student record holds. */
    private static function gender(mixed $raw): string
    {
        $g = strtolower(trim((string)$raw));
        if (in_array($g, ['m', 'male', 'mr'], true))    return 'Male';
        if (in_array($g, ['f', 'female', 'mrs', 'ms'], true)) return 'Female';
        return (string)$raw;
    }

    /**
     * The date as "d/m/Y". Accepts ISO dates and the day-first forms the
     * registry uses; anything else is passed through unchanged so nothing is
     * silently rewritten.
     */
    private static function birthDate(mixed $raw): string
    {
        $text = trim((string)$raw);
        if ($text === '') return '';
        foreach (['Y-m-d', 'd/m/Y', 'd-m-Y', 'Y/m/d', 'Y-m-d H:i:s'] as $fmt) {
            $d = \DateTime::createFromFormat('!' . $fmt, $text);
            // Round-trip must reproduce the input exactly, so "03/04/2002"
            // is read day-first only if it formats back identically.
            if ($d !== false && $d->format($fmt) === $text) {
                return $d->format('d/m/Y');
            }
        }
        return $text;
    }

    private static function yearOf(mixed $date): string|int
    {
        if ($date === null || trim((string)$date) === '') return '';
        $ts = strtotime((string)$date);
        return $ts === false ? '' : (int)date('Y', $ts);
    }
}
