<?php

declare(strict_types=1);

namespace App\Helpers;


/**
 * Renders the official CUR student transcript as HTML / PDF.
 *
 * The layout reproduces the printed transcript the registry issues, sheet for
 * sheet: **one page per level of study**, each carrying its own module table,
 * its own totals, and its own weighted average / grade / decision. A student
 * who has marks at levels 1–4 gets a four-page PDF, not one long table — the
 * registrar signs and stamps each sheet separately.
 *
 * Per page:
 *   - Catholic University of Rwanda letterhead (painted by {@see PdfLayout})
 *   - Surname / Other names / Reg # · Faculty / Department / Option / Level
 *   - Modules table: No · code · title · credits · marks/100 · credit point · grade
 *   - TOTAL row, then weighted average / grade / decision beside the grading key
 *   - Registrar sign-off and the university motto
 *
 * The grading key is generated from the configured scale rather than hardcoded.
 * It used to print a fixed A–E ladder while the GRADE column was filled from
 * `grading_scales`, so a transcript could show a "B+" the key did not explain.
 * Both now read {@see GradingScale::displayBands()}, which folds the scale's
 * sub-bands into whole letters — CUR awards A/B/C/D/E, never a B+.
 */
class TranscriptPdf
{
    /** Body type for the whole document — the registry's house style. */
    private const FONT_STACK = '"Times New Roman", Times, "Times-Roman", serif';
    private const FONT_SIZE  = '10pt';

    /**
     * @param array<string,mixed>             $student
     * @param array<int,array<string,mixed>>  $rows  every graded module, any level
     */
    public static function buildHtml(array $student, array $rows): string
    {
        $groups   = self::groupByLevel($rows);
        $semMap   = self::semesterMap($groups);

        if (!$groups) {
            $pages = self::pageHtml(
                self::bioHtml($student, self::levelLine(null)),
                '',
                self::closingHtml('', ''),
                true
            );
        } else {
            $pages    = '';
            $lastKey  = array_key_last($groups);
            foreach ($groups as $level => $list) {
                $totals = self::levelTotals($list);
                $isLast = $level === $lastKey;
                $pages .= self::pageHtml(
                    self::bioHtml($student, self::levelLine($level, $semMap[$level] ?? [])),
                    self::tableHtml($list, $totals),
                    self::closingHtml(
                        self::summaryHtml($totals),
                        self::semesterNote($semMap[$level] ?? []),
                    ),
                    false,
                    !$isLast
                );
            }
        }

        $reg = htmlspecialchars((string)($student['regnumber'] ?? ''));
        $css = self::css();

        return <<<HTML
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Academic Transcript — {$reg}</title>
<style>{$css}</style></head><body>
{$pages}
</body></html>
HTML;
    }

    public static function stream(string $html, string $filename): void
    {
        if (class_exists('\\Dompdf\\Dompdf')) {
            $prev = error_reporting();
            error_reporting($prev & ~E_DEPRECATED & ~E_USER_DEPRECATED);
            try {
                $options = new \Dompdf\Options();
                $options->set('isHtml5ParserEnabled', true);
                $options->set('isRemoteEnabled', false);
                // DOMPDF ships no "Times New Roman" metrics — the CSS stack
                // falls through to its bundled `times`, and so must the default
                // used for any element the stack somehow misses.
                $options->set('defaultFont', 'times');
                $dompdf = new \Dompdf\Dompdf($options);
                $dompdf->loadHtml($html);
                $dompdf->setPaper('A4', 'portrait');
                $dompdf->render();
                PdfLayout::stampHeader($dompdf);
                $dompdf->stream($filename, ['Attachment' => true]);
            } finally {
                error_reporting($prev);
            }
            exit;
        }
        // Fallback — printable HTML
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    /* ── page assembly ─────────────────────────────────────────────────── */

    private static function pageHtml(
        string $bio,
        string $table,
        string $closing,
        bool $empty = false,
        bool $break = false
    ): string {
        $header = PdfLayout::headerHtml();
        $brk    = $break ? ' brk' : '';
        $body   = $empty
            ? '<p class="none">No marks have been recorded for this student yet.</p>'
            : $table;

        return <<<HTML
<div class="page{$brk}">
  {$header}
  <h1 class="doc-title">ACADEMIC TRANSCRIPT</h1>

  <section class="bio">{$bio}</section>

  {$body}

  {$closing}
</div>
HTML;
    }

    /**
     * Everything under the table, in the three columns the printed form uses:
     * the level's result on the left, "Grading System:" as a heading of its own
     * in the middle, and the grading bands on the right with the semester
     * footnote hanging below them.
     *
     * The gap the middle column leaves is where the registrar's stamp lands on
     * the signed copy, which is why the bands sit far right rather than beside
     * the results.
     */
    private static function closingHtml(string $summary, string $note): string
    {
        $legend  = self::legendHtml();
        $signoff = self::signoffHtml();

        return <<<HTML
  <div class="closing">
    <table class="closing-grid"><tr>
      <td class="c1">{$summary}</td>
      <td class="c2"><div class="legend-title">Grading System:</div></td>
      <td class="c3">{$legend}{$note}</td>
    </tr></table>

    {$signoff}
    <div class="motto">Audi et Aude</div>
  </div>
HTML;
    }

    /**
     * The identity block above the table: three rows on the left, four on the
     * right, with LEVEL as the right column's last row rather than a line of
     * its own — that is where the printed form puts it, and it keeps the two
     * columns reading as one block.
     */
    private static function bioHtml(array $student, string $levelLine): string
    {
        $surname = htmlspecialchars(strtoupper(trim((string)($student['lname'] ?? ''))));
        $names   = htmlspecialchars(strtoupper(trim((string)($student['fname'] ?? ''))));
        $reg     = htmlspecialchars(trim((string)($student['regnumber'] ?? '')));
        $dept    = htmlspecialchars(trim((string)($student['dep_name'] ?? ''))) ?: '—';
        $option  = htmlspecialchars(trim((string)($student['option_name'] ?? ''))) ?: '—';

        // The label on the printed form is "FACULTY OF", and `faculty.fac_name`
        // is stored as "Faculty of Education" — printing both gives "FACULTY OF
        // FACULTY OF EDUCATION".
        $faculty = trim((string)($student['fac_name'] ?? ''));
        $faculty = (string)preg_replace('/^faculty\s+of\s+/i', '', $faculty);
        $faculty = htmlspecialchars(strtoupper($faculty)) ?: '—';

        return <<<HTML
    <div class="col col-l">
      <div class="row nowrap">SURNAME: {$surname}</div>
      <div class="row nowrap">OTHER NAMES: {$names}</div>
      <div class="row nowrap">REGISTRATION NUMBER: {$reg}</div>
    </div>
    <div class="col col-r">
      <div class="row">FACULTY OF {$faculty}</div>
      <div class="row">DEPARTMENT: {$dept}</div>
      <div class="row">Option: {$option}</div>
      <div class="row">{$levelLine}</div>
    </div>
HTML;
    }

    private static function tableHtml(array $rows, array $totals): string
    {
        $body = '';
        foreach ($rows as $i => $r) {
            $n       = $i + 1;
            $code    = htmlspecialchars((string)($r['module_code'] ?? ''));
            $title   = htmlspecialchars((string)($r['module_name'] ?? ''));
            $credits = (int)($r['module_credits'] ?? 0);
            $pct     = $r['percentage'] !== null ? (int)round((float)$r['percentage']) : null;
            // A curriculum gap prints "0" here — never counted in the level
            // TOTAL row above (that recomputes from `percentage`, which this
            // row leaves NULL) — so the sheet is honest that nothing was
            // actually awarded while still showing the module is outstanding.
            $notMarked = !empty($r['not_marked']);
            $marks   = $pct !== null ? (string)$pct : ($notMarked ? '0' : '—');
            $cp      = $r['credit_point'] !== null ? self::plain((float)$r['credit_point']) : '—';
            // The API already grades from the scale in whole letters; a row
            // carrying a stored "B+" straight from `module_marks` is normalised
            // here too, so no path can print a suffix onto the signed form.
            $grade   = htmlspecialchars(GradingScale::normalize((string)($r['grade'] ?? '')) ?? '—');

            // The row number sits left in its column on the printed form, not
            // centred like the marks.
            $body .= "<tr>
                <td>{$n}</td>
                <td class=\"code\">{$code}</td>
                <td>{$title}</td>
                <td class=\"num\">{$credits}</td>
                <td class=\"num\">{$marks}</td>
                <td class=\"num\">{$cp}</td>
                <td class=\"num\">{$grade}</td>
            </tr>";
        }

        $credits = (int)$totals['credits'];
        $cp      = self::plain((float)$totals['credit_points']);
        $avg     = $totals['weighted_average'] !== null
            ? number_format((float)$totals['weighted_average'], 2) . ' %'
            : '—';

        // Headers sit left in every column on the printed form, including the
        // numeric ones whose values are centred beneath them.
        return <<<HTML
  <table class="grid">
    <thead>
      <tr>
        <th>No</th>
        <th>MODULE CODE</th>
        <th>MODULE TITLE</th>
        <th>NUMBER OF CREDITS</th>
        <th>MARKS/100</th>
        <th>CREDIT POINT</th>
        <th>GRADE</th>
      </tr>
    </thead>
    <tbody>
      {$body}
      <tr class="totals">
        <td colspan="3">TOTAL</td>
        <td class="num">{$credits}</td>
        <td class="num">{$avg}</td>
        <td class="num">{$cp}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
HTML;
    }

    private static function summaryHtml(array $totals): string
    {
        $avg = $totals['weighted_average'] !== null
            ? number_format((float)$totals['weighted_average'], 2) . ' %'
            : '—';
        $grade    = htmlspecialchars((string)($totals['grade_label'] ?? '—'));
        $decision = htmlspecialchars((string)($totals['decision'] ?? '—'));

        return "<div class=\"row\">Weighted Average: {$avg}</div>
                <div class=\"row\">Grade: {$grade}</div>
                <div class=\"row\">Decision: {$decision}</div>";
    }

    /**
     * The grading key, built from the bands the registry has configured, folded
     * to whole letters. Set as "A= Very Good (80-100%)" — the form closes the
     * letter up against its equals sign.
     */
    private static function legendHtml(): string
    {
        $items = '';
        foreach (GradingScale::displayBands() as $b) {
            $grade = htmlspecialchars((string)($b['grade'] ?? ''));
            $desc  = htmlspecialchars((string)($b['description'] ?? ''));
            $min   = self::num($b['min_marks'] ?? 0);
            $max   = self::num($b['max_marks'] ?? 100);
            $items .= "<div class=\"row\">{$grade}= {$desc} ({$min}-{$max}%)</div>";
        }
        return $items;
    }

    private static function signoffHtml(): string
    {
        $registrar = htmlspecialchars(Signatories::academicRegistrar());
        $issueLoc  = htmlspecialchars(getenv('TRANSCRIPT_ISSUE_LOCATION') ?: 'TABA');
        $issueDate = date('d-m-y');

        return "<section class=\"signoff\">
                  <div>{$registrar}</div>
                  <div>Academic Registrar</div>
                  <div class=\"issued\">Issued at {$issueLoc} {$issueDate}</div>
                </section>";
    }

    /* ── level grouping ────────────────────────────────────────────────── */

    /**
     * Split the marks into one bucket per level of study, lowest level first.
     *
     * Rows whose module carries no level are collected under `null` and printed
     * last on a sheet of their own — the legacy import left a handful of modules
     * unclassified, and dropping them would silently shorten the transcript.
     *
     * @param  array<int,array<string,mixed>> $rows
     * @return array<array-key,array<int,array<string,mixed>>>
     */
    private static function groupByLevel(array $rows): array
    {
        $groups = [];
        foreach ($rows as $r) {
            $raw = $r['level'] ?? null;
            $key = ($raw === null || $raw === '') ? 'unclassified' : (string)(int)$raw;
            $groups[$key][] = $r;
        }

        uksort($groups, static function ($a, $b): int {
            if ($a === 'unclassified') return 1;
            if ($b === 'unclassified') return -1;
            return (int)$a <=> (int)$b;
        });

        // Within a sheet, the registrar's transcripts list the first
        // semester's modules before the second's — so order by the semester
        // the code carries, then by code so the result is stable. (The signed
        // copies are not consistently ordered inside a semester block: page 1
        // ascends by code, page 2 descends, which is manual entry order and
        // not reproducible from data. Code order is the deterministic choice;
        // populate `module_programs.module_order` if the registry wants an
        // explicit sequence instead.)
        foreach ($groups as &$list) {
            usort($list, static function (array $x, array $y): int {
                $sx = self::semesterDigit($x['module_code'] ?? '') ?? 9;
                $sy = self::semesterDigit($y['module_code'] ?? '') ?? 9;
                return $sx <=> $sy
                    ?: strcmp(
                        strtoupper((string)preg_replace('/\s+/', '', (string)($x['module_code'] ?? ''))),
                        strtoupper((string)preg_replace('/\s+/', '', (string)($y['module_code'] ?? '')))
                    );
            });
        }
        unset($list);

        return $groups;
    }

    /**
     * Totals for one level — the same arithmetic the API reports for the whole
     * record, applied to a single sheet.
     *
     * @param array<int,array<string,mixed>> $rows
     */
    private static function levelTotals(array $rows): array
    {
        $credits = 0;
        $points  = 0.0;
        $failed  = 0;

        foreach ($rows as $r) {
            $pct = $r['percentage'] !== null ? (float)$r['percentage'] : null;
            if ($pct === null) continue;
            $c        = (int)($r['module_credits'] ?? 0);
            $credits += $c;
            $points  += $c * $pct;
            if ($pct < GradingScale::PASS_MARK) $failed++;
        }

        $avg = $credits > 0 ? round($points / $credits, 2) : null;

        return [
            'credits'          => $credits,
            'credit_points'    => $points,
            'weighted_average' => $avg,
            'grade_label'      => $avg !== null ? (GradingScale::labelFor($avg) ?? '—') : null,
            'decision'         => $avg === null ? null
                : (($failed === 0 && $avg >= GradingScale::PASS_MARK) ? 'Promoted' : 'Repeat'),
        ];
    }

    /**
     * "LEVEL: 8 S1 & S2*" — the qualification level, then the two semesters the
     * sheet covers.
     *
     * The number is the level of the *award* (Rwanda's NQF level 8 for an
     * honours bachelor's degree), which is a constant of the document and not
     * something the student record carries; it is env-overridable in the same
     * way the registrar's name and the issuing office already are. The semester
     * pair is derived from the level of study: level 1 is semesters 1 & 2,
     * level 2 is 3 & 4, and so on.
     */
    /** @param array<int,int> $sems semester numbers this sheet covers */
    private static function levelLine(mixed $level, array $sems = []): string
    {
        $qual = htmlspecialchars(getenv('TRANSCRIPT_QUALIFICATION_LEVEL') ?: '8');
        if (!$sems) return "LEVEL: {$qual}";
        return "LEVEL: {$qual} " . implode(' &amp; ', array_map(static fn ($s) => "S{$s}", $sems)) . '*';
    }

    /** @param array<int,int> $sems */
    private static function semesterNote(array $sems): string
    {
        if (!$sems) return '';
        $words = array_map(static fn ($s) => "Semester {$s}", $sems);
        $last  = array_pop($words);
        $text  = $words ? implode(', ', $words) . ' and ' . $last : $last;
        return "<div class=\"note row\">* {$text}</div>";
    }

    /**
     * Semester digit a module code carries: CUR codes read
     * <SUBJECT><level><?><semester><sequence>, so "STSK 1312" is level 1
     * semester 1 and "ENGS 1321" is level 1 semester 2. Null when the code
     * has no usable 4-digit block.
     */
    private static function semesterDigit(mixed $code): ?int
    {
        if (!preg_match('/(\d{4})/', (string)$code, $m)) return null;
        $d = (int)$m[1][2];
        return ($d === 1 || $d === 2) ? $d : null;
    }

    /**
     * Which semester numbers each level's sheet covers.
     *
     * A level does NOT always span two semesters: this programme teaches
     * level 3 in semester 5 only and level 4 in semester 6 only, then two
     * semesters again at level 5 — exactly what the registrar's signed
     * transcripts print. Assuming `level × 2` mislabelled every sheet from
     * level 3 onward. So the semesters are counted, not assumed: walk the
     * levels in order and give each one as many consecutive semester slots
     * as it has distinct semester digits among its module codes.
     *
     * A level whose codes carry no usable digit falls back to two slots,
     * which is the conventional shape and the previous behaviour.
     *
     * @param  array<array-key,array<int,array<string,mixed>>> $groups
     * @return array<array-key,array<int,int>>
     */
    private static function semesterMap(array $groups): array
    {
        $map  = [];
        $next = 1;
        foreach ($groups as $key => $list) {
            if ($key === 'unclassified') { $map[$key] = []; continue; }
            $digits = [];
            foreach ($list as $r) {
                $d = self::semesterDigit($r['module_code'] ?? '');
                if ($d !== null) $digits[$d] = true;
            }
            $slots = $digits ? count($digits) : 2;
            ksort($digits);
            $map[$key] = [];
            for ($i = 0; $i < $slots; $i++) $map[$key][] = $next++;
        }
        return $map;
    }

    /** Trim a band boundary to how a human writes it: 79.00 → 79, 49.99 → 49.99. */
    private static function num(mixed $v): string
    {
        return rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.');
    }

    /** Credit points print unseparated on the form — 1065, never 1,065. */
    private static function plain(float $v): string
    {
        return number_format($v, 0, '.', '');
    }

    /* ── styling ───────────────────────────────────────────────────────── */

    private static function css(): string
    {
        // A level's worth of modules, its totals, the grading key and the
        // sign-off all have to share one sheet, so the transcript reserves a
        // tighter letterhead band than the shared default and prints on A4 —
        // which is what `setPaper()` already asks for and what the registry
        // actually prints on. The shared `@page` hardcodes US Letter, 50pt
        // shorter, so the size is restated below to win the cascade.
        // 48px side margins = the 36pt {@see PdfLayout::stampHeader} insets the
        // letterhead by, so the table's edges line up with the letterhead rule
        // above it instead of running wider or narrower than the header.
        $pageCss = PdfLayout::pageCss(48, 24, 143);
        $font    = self::FONT_STACK;
        $size    = self::FONT_SIZE;

        return <<<CSS
{$pageCss}
@page { size: A4 portrait; }
* { box-sizing: border-box; }
/* `pageCss` pins every other document to a centred 6.5in column; the transcript
   table wants the full width between the page margins instead, so the width is
   released here. `width: auto` must come after `pageCss` to win the cascade. */
body { font-family: {$font}; font-size: {$size}; color: #000; margin: 0; width: auto; }

/* One sheet per level. The last page must not carry a break or DOMPDF emits a
   trailing blank page. */
.page { padding: 0; }
.page.brk { page-break-after: always; }

.doc-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 0 0 8pt; }

/* The identity block is set bold throughout and well leaded on the printed
   form — it reads as a single heavy header, not as label/value pairs. It runs
   at the table's size, not the body's: at 10pt the registration number is wide
   enough to touch the Option value in the next column. */
.bio { width: 100%; margin-bottom: 8pt; font-size: 9pt; }
.bio .col { display: inline-block; vertical-align: top; }
.bio .col-l { width: 38%; }
.bio .col-r { width: 61%; }
/* Bold is set on the row itself — DOMPDF does not carry it into these
   inline-block columns from the section. */
.bio .row { padding: 3pt 0; font-weight: bold; }
/* Names and the reg number must stay on one line — the reg number is the field
   a verifier reads first, and a wrapped one reads as two fields. */
.bio .row.nowrap { white-space: nowrap; }

/* The table runs a size below the body text, as it does on the printed form,
   so the narrow MODULE TITLE column holds most titles to one or two lines. */
table.grid { width: 100%; border-collapse: collapse; margin-bottom: 8pt; font-size: 9pt; }
table.grid th, table.grid td { border: 1px solid #000; padding: 1.5pt 5pt; vertical-align: middle; line-height: 1.2; }
table.grid thead th { font-weight: bold; text-align: left; }
/* Headers stay left; only the values below them centre. */
table.grid td.num { text-align: center; }
table.grid tr.totals td { font-weight: bold; }
/* A wrapped "ENGS 1321" costs a whole extra line on an already tight sheet. */
table.grid td.code { white-space: nowrap; }

/* Column widths taken off the printed transcript, which gives MODULE TITLE far
   less room than a web table would and spends it on the numeric columns. */
table.grid th:nth-child(1) { width: 8.5%; }
table.grid th:nth-child(2) { width: 14%; }
table.grid th:nth-child(3) { width: 24.5%; }
table.grid th:nth-child(4) { width: 15%; }
table.grid th:nth-child(5) { width: 12%; }
table.grid th:nth-child(6) { width: 14.5%; }
table.grid th:nth-child(7) { width: 11.5%; }

/* Totals, grading key, sign-off and motto belong to the sheet above them. When
   a level runs long enough to push them off, they travel together rather than
   leaving the grading key severed halfway down its own list. */
.closing { page-break-inside: avoid; }

/* Result · "Grading System:" · bands, in thirds. The middle third carries only
   the heading; the empty space beneath it is where the registrar's stamp goes
   on the signed copy. A real table is used rather than inline-blocks so the
   three columns land on exact thirds regardless of markup whitespace. */
.closing-grid { width: 100%; border-collapse: collapse; margin-top: 4pt; }
.closing-grid td { vertical-align: top; border: none; padding: 0; font-size: 9pt; }
.closing-grid .c1 { width: 33%; }
.closing-grid .c2 { width: 33%; }
.closing-grid .c3 { width: 34%; }

/* Everything below the table is bold and leaded like the identity block. */
.closing .row { padding: 3pt 0; font-weight: bold; }
.legend-title { font-weight: bold; text-align: center; font-size: 11pt; }
/* The footnote hangs a clear line below the last band. */
.note { margin-top: 10pt; }

.signoff { margin-top: 16pt; font-size: 9pt; font-weight: bold; }
.signoff div { padding: 3pt 0; }
.signoff .issued { margin-top: 4pt; }

.motto { margin-top: 12pt; text-align: center; font-weight: bold; }
.none { text-align: center; padding: 20pt 0; }
CSS;
    }
}
