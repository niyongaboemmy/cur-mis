<?php

declare(strict_types=1);

namespace App\Helpers;

use RuntimeException;
use ZipArchive;

/**
 * Multi-worksheet .xlsx writer that streams to disk, one row at a time.
 *
 * The multi-sheet counterpart of StreamingXlsx. Each worksheet is appended to
 * its own temp file as rows arrive, so peak memory is one row no matter how
 * many students are exported. PhpSpreadsheet builds every sheet in memory and
 * is avoided for bulk data for the same reason as in StreamingXlsx.
 *
 * Every text value is written as an inline string. That keeps a registration
 * number's leading characters intact and means a value starting with "=" is
 * stored as text, never evaluated as a formula.
 *
 * Usage:
 *   $book  = new StreamingXlsxBook();
 *   $sheet = $book->addSheet('2012-2013', ['No.', 'Name'], 'Title line');
 *   $book->addRow($sheet, [1, 'Ada']);
 *   $book->download('file.xlsx');   // sends the file and exits
 */
final class StreamingXlsxBook
{
    /** Excel's hard limit; the header/title rows count against it. */
    private const MAX_ROWS = 1048576;

    private const MIN_WIDTH   = 10;
    private const MAX_WIDTH   = 50;
    private const STYLE_HEADER = 1;
    private const STYLE_TITLE  = 2;

    /**
     * One entry per worksheet, in workbook order.
     *
     * @var list<array{
     *     name: string, path: string, handle: resource, cols: int,
     *     widths: array<int, int>, headerRow: int, lastRow: int, next: int
     * }>
     */
    private array $sheets = [];

    private bool $truncated = false;

    /**
     * Start a worksheet. If `$title` is given it is written as a bold line
     * above the header row and is not counted toward column widths. Returns
     * the worksheet index to pass to addRow().
     *
     * @param list<string> $headers
     */
    public function addSheet(string $name, array $headers, ?string $title = null): int
    {
        if ($headers === []) {
            throw new RuntimeException('A worksheet needs at least one column.');
        }
        $name = self::cleanSheetName($name);
        foreach ($this->sheets as $existing) {
            if (strcasecmp($existing['name'], $name) === 0) {
                throw new RuntimeException("Duplicate worksheet name: {$name}");
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'xlsxbody');
        if ($path === false) {
            throw new RuntimeException('Could not create a temporary file for the export.');
        }
        $handle = fopen($path, 'wb');
        if ($handle === false) {
            @unlink($path);
            throw new RuntimeException('Could not open the export scratch file for writing.');
        }

        // Header labels seed the widths so an empty group still reads sensibly.
        $widths = [];
        foreach ($headers as $i => $label) {
            $widths[$i + 1] = mb_strlen((string)$label);
        }

        $this->sheets[] = [
            'name'      => $name,
            'path'      => $path,
            'handle'    => $handle,
            'cols'      => count($headers),
            'widths'    => $widths,
            'headerRow' => 0,
            'lastRow'   => 0,
            'next'      => 1,
        ];
        $idx = count($this->sheets) - 1;

        if ($title !== null) {
            $this->writeRow($idx, [$title], self::STYLE_TITLE, false);
        }
        $this->sheets[$idx]['headerRow'] = $this->sheets[$idx]['next'];
        $this->writeRow($idx, $headers, self::STYLE_HEADER, false);

        return $idx;
    }

    /**
     * Append one data row to a worksheet. Extra values beyond the header count
     * are dropped. Empty values are left as blank cells.
     *
     * @param list<string|int|null> $values
     */
    public function addRow(int $sheet, array $values): void
    {
        $this->writeRow($sheet, $values, 0, true);
    }

    /** True when rows were dropped because a sheet reached Excel's row ceiling. */
    public function wasTruncated(): bool
    {
        return $this->truncated;
    }

    /**
     * Finish the workbook and stream it to the client. Sends the headers
     * itself, then exits. Nothing may be echoed after this.
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

        // Drop output buffering so the finished archive is not held in memory.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        readfile($zipPath);
        @unlink($zipPath);
        exit;
    }

    private function writeRow(int $idx, array $values, int $style, bool $isData): void
    {
        if ($this->sheets[$idx]['next'] > self::MAX_ROWS) {
            $this->truncated = true;
            return;
        }

        $rowNum = $this->sheets[$idx]['next']++;
        $attr   = $style > 0 ? ' s="' . $style . '"' : '';
        $xml    = '<row r="' . $rowNum . '">';

        $col = 0;
        foreach ($values as $value) {
            if (++$col > $this->sheets[$idx]['cols']) {
                break;
            }
            if ($value === null || $value === '') {
                continue;
            }

            $ref = self::colName($col) . $rowNum;
            if (is_int($value)) {
                // Numbers stay numeric so No. and Age sort as numbers in Excel.
                $xml .= '<c r="' . $ref . '"' . $attr . '><v>' . $value . '</v></c>';
                $length = strlen((string)$value);
            } else {
                $clean = self::stripControlChars((string)$value);
                if ($clean === '') {
                    continue;
                }
                $xml .= '<c r="' . $ref . '" t="inlineStr"' . $attr . '><is><t xml:space="preserve">'
                      . htmlspecialchars($clean, ENT_QUOTES | ENT_XML1, 'UTF-8')
                      . '</t></is></c>';
                $length = mb_strlen($clean);
            }

            if ($isData) {
                $this->sheets[$idx]['widths'][$col] = max($this->sheets[$idx]['widths'][$col] ?? 0, $length);
            }
        }
        $xml .= '</row>';

        if ($isData) {
            $this->sheets[$idx]['lastRow'] = $rowNum;
        }
        fwrite($this->sheets[$idx]['handle'], $xml);
    }

    /**
     * Close every sheet, assemble the workbook ZIP and return its path. The
     * caller owns the returned file.
     */
    private function finish(): string
    {
        if ($this->sheets === []) {
            throw new RuntimeException('The workbook has no worksheets.');
        }

        $zipPath = tempnam(sys_get_temp_dir(), 'xlsxzip');
        if ($zipPath === false) {
            throw new RuntimeException('Could not create a temporary file for the workbook.');
        }

        $scratch = [];
        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($zipPath);
            throw new RuntimeException('Could not assemble the workbook archive.');
        }

        try {
            foreach ($this->sheets as $i => $sheet) {
                fclose($sheet['handle']);
                $scratch[] = $sheet['path'];

                // Each worksheet = prologue (views, column widths) + the streamed
                // rows + epilogue (autofilter). The prologue needs final widths,
                // so the sheet is assembled here by copying the row file across.
                $sheetPath = tempnam(sys_get_temp_dir(), 'xlsxsheet');
                if ($sheetPath === false) {
                    throw new RuntimeException('Could not create a temporary worksheet file.');
                }
                $scratch[] = $sheetPath;

                $out = fopen($sheetPath, 'wb');
                if ($out === false) {
                    throw new RuntimeException('Could not open a temporary worksheet file for writing.');
                }
                fwrite($out, $this->sheetPrologue($sheet, $i === 0));
                $in = fopen($sheet['path'], 'rb');
                if ($in !== false) {
                    stream_copy_to_stream($in, $out);
                    fclose($in);
                }
                fwrite($out, $this->sheetEpilogue($sheet));
                fclose($out);

                $zip->addFile($sheetPath, 'xl/worksheets/sheet' . ($i + 1) . '.xml');
            }

            $zip->addFromString('[Content_Types].xml', $this->contentTypesXml());
            $zip->addFromString('_rels/.rels', self::rootRelsXml());
            $zip->addFromString('xl/workbook.xml', $this->workbookXml());
            $zip->addFromString('xl/_rels/workbook.xml.rels', $this->workbookRelsXml());
            $zip->addFromString('xl/styles.xml', self::stylesXml());

            $closed = $zip->close();
        } finally {
            // Only after close(): the archive reads the worksheet files then.
            foreach ($scratch as $file) {
                @unlink($file);
            }
        }

        if (!$closed) {
            @unlink($zipPath);
            throw new RuntimeException('Could not finalise the workbook archive.');
        }
        return $zipPath;
    }

    /** @param array{name: string, cols: int, widths: array<int, int>, headerRow: int} $sheet */
    private function sheetPrologue(array $sheet, bool $selected): string
    {
        // Freeze everything down to and including the header row.
        $frozen = $sheet['headerRow'];

        $cols = '<cols>';
        for ($c = 1; $c <= $sheet['cols']; $c++) {
            $width = min(self::MAX_WIDTH, max(self::MIN_WIDTH, ($sheet['widths'][$c] ?? 0) + 3));
            $cols .= '<col min="' . $c . '" max="' . $c . '" width="' . $width . '" customWidth="1"/>';
        }
        $cols .= '</cols>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetViews><sheetView workbookViewId="0"' . ($selected ? ' tabSelected="1"' : '') . '>'
            . '<pane ySplit="' . $frozen . '" topLeftCell="A' . ($frozen + 1)
            . '" activePane="bottomLeft" state="frozen"/>'
            . '</sheetView></sheetViews>'
            . $cols
            . '<sheetData>';
    }

    /** @param array{cols: int, headerRow: int, lastRow: int} $sheet */
    private function sheetEpilogue(array $sheet): string
    {
        $xml = '</sheetData>';
        // Filter dropdowns over the header and the data beneath it. An empty
        // group has no data rows, so it gets no filter.
        if ($sheet['lastRow'] > $sheet['headerRow']) {
            $xml .= '<autoFilter ref="A' . $sheet['headerRow'] . ':'
                  . self::colName($sheet['cols']) . $sheet['lastRow'] . '"/>';
        }
        return $xml . '</worksheet>';
    }

    private function contentTypesXml(): string
    {
        $overrides = '';
        foreach ($this->sheets as $i => $_sheet) {
            $overrides .= '<Override PartName="/xl/worksheets/sheet' . ($i + 1) . '.xml" '
                . 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . $overrides
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

    private function workbookXml(): string
    {
        $sheets  = '';
        $filters = '';
        foreach ($this->sheets as $i => $sheet) {
            $n = $i + 1;
            $sheets .= '<sheet name="' . htmlspecialchars($sheet['name'], ENT_QUOTES | ENT_XML1, 'UTF-8')
                . '" sheetId="' . $n . '" r:id="rId' . $n . '"/>';

            // Excel expects a _FilterDatabase name alongside each autofilter.
            if ($sheet['lastRow'] > $sheet['headerRow']) {
                $ref = "'" . str_replace("'", "''", $sheet['name']) . "'!"
                     . '$A$' . $sheet['headerRow'] . ':$' . self::colName($sheet['cols']) . '$' . $sheet['lastRow'];
                $filters .= '<definedName name="_xlnm._FilterDatabase" localSheetId="' . $i
                          . '" hidden="1">' . htmlspecialchars($ref, ENT_QUOTES | ENT_XML1, 'UTF-8') . '</definedName>';
            }
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<bookViews><workbookView activeTab="0"/></bookViews>'
            . '<sheets>' . $sheets . '</sheets>'
            . ($filters !== '' ? '<definedNames>' . $filters . '</definedNames>' : '')
            . '</workbook>';
    }

    private function workbookRelsXml(): string
    {
        $rels = '';
        foreach ($this->sheets as $i => $_sheet) {
            $n = $i + 1;
            $rels .= '<Relationship Id="rId' . $n . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $n . '.xml"/>';
        }
        $styleId = count($this->sheets) + 1;
        $rels .= '<Relationship Id="rId' . $styleId . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . $rels
            . '</Relationships>';
    }

    /** 0 = default, 1 = bold on a blue-grey fill (header), 2 = bold larger (title). */
    private static function stylesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="3">'
            . '<font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="12"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>'
            . '</fonts>'
            . '<fills count="3">'
            . '<fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>'
            . '</fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="3">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            . '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
            . '</cellXfs>'
            . '</styleSheet>';
    }

    /** Excel forbids []:*?/\ in sheet names and caps them at 31 characters. */
    private static function cleanSheetName(string $name): string
    {
        $name = trim(str_replace(['[', ']', ':', '*', '?', '/', '\\'], '', $name));
        $name = mb_substr($name, 0, 31);
        if ($name === '') {
            throw new RuntimeException('A worksheet name cannot be empty.');
        }
        return $name;
    }

    /**
     * Drop the control characters XML 1.0 forbids. Hand-typed legacy student
     * rows carry them, and one stray 0x0B makes Excel refuse the whole file.
     */
    private static function stripControlChars(string $text): string
    {
        return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? '';
    }

    /** 1 => A, 26 => Z, 27 => AA. */
    private static function colName(int $index): string
    {
        $name = '';
        for ($n = $index; $n > 0; $n = intdiv($n - 1, 26)) {
            $name = chr(65 + (($n - 1) % 26)) . $name;
        }
        return $name;
    }
}
