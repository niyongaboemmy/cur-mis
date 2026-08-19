<?php

declare(strict_types=1);

namespace App\Helpers;

use RuntimeException;
use ZipArchive;

/**
 * Writes a single-sheet .xlsx workbook straight to the browser, one row at a
 * time.
 *
 * Why not PhpSpreadsheet (already a dependency)? It builds the whole sheet in
 * memory before writing. Measured against the full student export
 * (24,905 rows x 28 columns = 697,340 cells) it peaked at 468 MB and took 84
 * seconds — past the memory_limit and max_execution_time of the cPanel hosts
 * this deploys to. It stays the right tool for the small, heavily-styled
 * budget workbooks; it is the wrong tool for a bulk data dump.
 *
 * Everything here streams: the sheet XML is appended to a temp file row by
 * row, the ZIP compresses it from disk, and the finished file is sent with
 * readfile(). Peak memory is one row regardless of how many there are.
 *
 * Every cell is written as an inline string (`t="inlineStr"`), which is also
 * the point of using xlsx over CSV here. Opening a CSV, Excel guesses each
 * column's type and silently corrupts exactly the identifiers a registry
 * cares about: 11,000 student phone numbers begin with '0' (dropped) and
 * 18,012 national ID numbers are 16 digits (rendered 1.19958E+15, with the
 * trailing digits gone for good). An inline string is never re-interpreted.
 */
final class StreamingXlsx
{
    /** Excel's hard limit; the 1 is the header row. */
    private const MAX_ROWS = 1048576;

    private string $sheetPath;

    /** @var resource */
    private $sheet;

    private int $rowCount = 0;
    private int $colCount = 0;
    private bool $truncated = false;

    /** Column letters (A, B, … AA) memoised by 1-based index. */
    private static array $colNames = [];

    /**
     * @param list<string> $headers Header labels, in order. Also fixes the
     *                              column count used for widths + autofilter.
     */
    public function __construct(private array $headers)
    {
        if ($headers === []) {
            throw new RuntimeException('A worksheet needs at least one column.');
        }
        $this->colCount = count($headers);

        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        if ($tmp === false) {
            throw new RuntimeException('Could not create a temporary file for the export.');
        }
        $this->sheetPath = $tmp;
        $sheet = fopen($this->sheetPath, 'wb');
        if ($sheet === false) {
            throw new RuntimeException('Could not open the export scratch file for writing.');
        }
        $this->sheet = $sheet;

        $this->writeSheetPrologue();
        $this->addRow($headers, true);
    }

    /**
     * Append one data row. Extra values beyond the header count are dropped
     * and short rows are left ragged — Excel treats a missing <c> as blank.
     *
     * @param list<string|int|float|null> $values
     */
    public function addRow(array $values, bool $isHeader = false): void
    {
        if ($this->rowCount >= self::MAX_ROWS) {
            $this->truncated = true;
            return;
        }
        $rowNum = ++$this->rowCount;
        $style  = $isHeader ? ' s="1"' : '';

        $xml = '<row r="' . $rowNum . '"' . ($isHeader ? ' s="1" customFormat="1"' : '') . '>';
        $col = 0;
        foreach ($values as $value) {
            if (++$col > $this->colCount) break;
            $text = self::sanitise($value);
            if ($text === '') continue; // an omitted cell is an empty cell
            $xml .= '<c r="' . self::colName($col) . $rowNum . '" t="inlineStr"' . $style
                  . '><is><t xml:space="preserve">' . $text . '</t></is></c>';
        }
        $xml .= '</row>';

        fwrite($this->sheet, $xml);
    }

    /** True when rows were dropped because the sheet hit Excel's row ceiling. */
    public function wasTruncated(): bool
    {
        return $this->truncated;
    }

    /**
     * Finish the workbook and stream it to the client under `$filename`.
     * Sends the headers itself, then exits — nothing may be echoed after.
     */
    public function download(string $filename): never
    {
        $zipPath = $this->finish();

        if (!headers_sent()) {
            header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . (string)filesize($zipPath));
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('X-Content-Type-Options: nosniff');
        }

        // Drop any output buffering so a 30 MB workbook is not held in memory
        // on its way out — the whole point of streaming it.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        readfile($zipPath);
        @unlink($zipPath);
        exit;
    }

    /**
     * Close the sheet, build the .xlsx around it and return the ZIP's path.
     * The caller owns the returned file.
     */
    private function finish(): string
    {
        fwrite($this->sheet, '</sheetData>');
        // Autofilter over the populated range, so the header row gets Excel's
        // filter dropdowns — on a 25k-row cohort that is the difference
        // between a usable sheet and a wall of text.
        $lastCol = self::colName($this->colCount);
        fwrite($this->sheet, '<autoFilter ref="A1:' . $lastCol . max(1, $this->rowCount) . '"/>');
        fwrite($this->sheet, '</worksheet>');
        fclose($this->sheet);

        $zipPath = tempnam(sys_get_temp_dir(), 'xlsxzip');
        if ($zipPath === false) {
            @unlink($this->sheetPath);
            throw new RuntimeException('Could not create a temporary file for the workbook.');
        }

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($this->sheetPath);
            @unlink($zipPath);
            throw new RuntimeException('Could not assemble the workbook archive.');
        }

        $zip->addFromString('[Content_Types].xml', self::contentTypesXml());
        $zip->addFromString('_rels/.rels', self::rootRelsXml());
        $zip->addFromString('xl/workbook.xml', self::workbookXml());
        $zip->addFromString('xl/_rels/workbook.xml.rels', self::workbookRelsXml());
        $zip->addFromString('xl/styles.xml', self::stylesXml());
        // Added from disk, so the sheet is compressed straight out of the temp
        // file rather than being read into a string first.
        $zip->addFile($this->sheetPath, 'xl/worksheets/sheet1.xml');

        if (!$zip->close()) {
            @unlink($this->sheetPath);
            @unlink($zipPath);
            throw new RuntimeException('Could not finalise the workbook archive.');
        }
        @unlink($this->sheetPath);

        return $zipPath;
    }

    private function writeSheetPrologue(): void
    {
        // Width each column to its header, clamped — the labels ("Modules
        // Completed (Passed)") are longer than most of the values under them.
        $cols = '<cols>';
        foreach ($this->headers as $i => $label) {
            $width = min(46, max(10, mb_strlen((string)$label) + 4));
            $cols .= '<col min="' . ($i + 1) . '" max="' . ($i + 1)
                   . '" width="' . $width . '" customWidth="1"/>';
        }
        $cols .= '</cols>';

        fwrite($this->sheet,
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            // Freeze the header so it stays visible while scrolling a long cohort.
            . '<sheetViews><sheetView workbookViewId="0">'
            . '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            . '</sheetView></sheetViews>'
            . $cols
            . '<sheetData>'
        );
    }

    /**
     * XML-escape a value and drop the control characters that XML 1.0 forbids.
     * The legacy `student` rows carry hand-typed junk, and a single stray
     * 0x0B makes Excel refuse to open the whole workbook.
     */
    private static function sanitise(string|int|float|null $value): string
    {
        if ($value === null) return '';
        $text = (string)$value;
        if ($text === '') return '';
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? '';
        return htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /** 1 => A, 26 => Z, 27 => AA. */
    private static function colName(int $index): string
    {
        if (isset(self::$colNames[$index])) {
            return self::$colNames[$index];
        }
        $name = '';
        for ($n = $index; $n > 0; $n = intdiv($n - 1, 26)) {
            $name = chr(65 + (($n - 1) % 26)) . $name;
        }
        return self::$colNames[$index] = $name;
    }

    private static function contentTypesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';
    }

    private static function rootRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private static function workbookXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';
    }

    private static function workbookRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';
    }

    /** Two formats: 0 = default, 1 = bold on a grey fill (the header row). */
    private static function stylesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2">'
            . '<font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><name val="Calibri"/></font>'
            . '</fonts>'
            . '<fills count="3">'
            . '<fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>'
            . '</fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="2">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            . '</cellXfs>'
            . '</styleSheet>';
    }
}
