<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Renders the official CUR student transcript as HTML / PDF.
 *
 * Layout mirrors the printed transcript:
 *   - Catholic University of Rwanda header
 *   - Surname / Other names / Reg # / Faculty / Department / Level
 *   - Modules table: # · code · title · credits · marks/100 · credit point · grade
 *   - Totals row + grading legend + weighted average / decision / registrar
 */
class TranscriptPdf
{
    public static function buildHtml(array $student, array $rows, array $totals): string
    {
        $institution = htmlspecialchars(getenv('INSTITUTION_NAME') ?: 'Catholic University of Rwanda');
        $email       = htmlspecialchars(getenv('INSTITUTION_EMAIL') ?: 'catholic.university.rwanda@gmail.com');
        $website     = htmlspecialchars(getenv('INSTITUTION_WEBSITE') ?: 'www.cur.ac.rw');
        $address     = htmlspecialchars(getenv('INSTITUTION_ADDRESS') ?: 'P.o Box 49 Butare/Huye - RWANDA');
        $phones      = htmlspecialchars(getenv('INSTITUTION_PHONES') ?: 'Registry: 250 733 214 677  -  Administration: 250 733 214 678');

        $surname = htmlspecialchars(strtoupper((string)($student['lname'] ?? '')));
        $names   = htmlspecialchars(strtoupper((string)($student['fname'] ?? '')));
        $reg     = htmlspecialchars((string)($student['regnumber'] ?? ''));
        $faculty = htmlspecialchars(strtoupper((string)($student['fac_name'] ?? 'Faculty —')));
        $dept    = htmlspecialchars((string)($student['dep_name'] ?? '—'));
        $level   = htmlspecialchars((string)($student['current_level'] ?? '—'));

        $modules = (int)($totals['modules'] ?? 0);
        $totalCredits = (int)($totals['total_credits'] ?? 0);
        $totalCp = number_format((float)($totals['total_credit_points'] ?? 0), 0);
        $weighted = $totals['weighted_average'] !== null
            ? number_format((float)$totals['weighted_average'], 1)
            : '—';
        $overallLabel = htmlspecialchars((string)($totals['overall_grade_label'] ?? '—'));
        $decision = htmlspecialchars((string)($totals['decision'] ?? '—'));

        $registrar = htmlspecialchars(getenv('ACADEMIC_REGISTRAR_NAME') ?: 'MUTAYOMBA Sylvestre');
        $issueLoc  = htmlspecialchars(getenv('TRANSCRIPT_ISSUE_LOCATION') ?: 'TABA');
        $issueDate = date('d-m-y');

        // Body rows
        $body = '';
        if (empty($rows)) {
            $body = '<tr><td colspan="7" class="muted">No marks have been recorded yet.</td></tr>';
        } else {
            foreach ($rows as $i => $r) {
                $n      = $i + 1;
                $code   = htmlspecialchars((string)($r['module_code'] ?? ''));
                $title  = htmlspecialchars((string)($r['module_name'] ?? ''));
                $credits = (int)($r['module_credits'] ?? 0);
                $pct    = $r['percentage'] !== null ? (int)round((float)$r['percentage']) : null;
                $cp     = $r['credit_point'] !== null ? number_format((float)$r['credit_point'], 0) : '—';
                $grade  = htmlspecialchars((string)($r['grade'] ?? '—'));
                $marks  = $pct !== null ? (string)$pct : '—';

                $body .= "<tr>
                    <td class=\"num\">{$n}</td>
                    <td class=\"code\">{$code}</td>
                    <td>{$title}</td>
                    <td class=\"num\">{$credits}</td>
                    <td class=\"num\">{$marks}</td>
                    <td class=\"num\">{$cp}</td>
                    <td class=\"grade\">{$grade}</td>
                </tr>";
            }
        }

        $css = self::css();
        return <<<HTML
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Academic Transcript — {$reg}</title>
<style>{$css}</style></head><body>
<div class="page">
  <header class="hdr">
    <div class="brand">
      <div class="brand-name">{$institution}</div>
      <div class="brand-meta">{$address}</div>
      <div class="brand-meta">{$phones}</div>
      <div class="brand-meta">email: {$email} &nbsp;·&nbsp; website: {$website}</div>
    </div>
  </header>

  <h1 class="doc-title">ACADEMIC TRANSCRIPT</h1>

  <section class="bio">
    <div class="col">
      <div class="row"><span>SURNAME:</span> <b>{$surname}</b></div>
      <div class="row"><span>OTHER NAMES:</span> <b>{$names}</b></div>
      <div class="row"><span>REGISTRATION NUMBER:</span> <b>{$reg}</b></div>
    </div>
    <div class="col">
      <div class="row"><span>FACULTY OF</span> <b>{$faculty}</b></div>
      <div class="row"><span>DEPARTMENT:</span> <b>{$dept}</b></div>
      <div class="row"><span>LEVEL:</span> <b>{$level}</b></div>
    </div>
  </section>

  <table class="grid">
    <thead>
      <tr>
        <th class="num">No</th>
        <th>MODULE CODE</th>
        <th>MODULE TITLE</th>
        <th class="num">NUMBER OF CREDITS</th>
        <th class="num">MARKS/100</th>
        <th class="num">CREDIT POINT</th>
        <th>GRADE</th>
      </tr>
    </thead>
    <tbody>
      {$body}
      <tr class="totals">
        <td colspan="3"><b>TOTAL</b></td>
        <td class="num"><b>{$totalCredits}</b></td>
        <td class="num"><b>{$weighted} %</b></td>
        <td class="num"><b>{$totalCp}</b></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <section class="footer-grid">
    <div class="col">
      <div class="row"><span>Weighted Average:</span> <b>{$weighted} %</b></div>
      <div class="row"><span>Grade:</span> <b>{$overallLabel}</b></div>
      <div class="row"><span>Decision:</span> <b>{$decision}</b></div>
    </div>
    <div class="col legend">
      <div class="legend-title">Grading System:</div>
      <div>A = Very Good (80-100%)</div>
      <div>B = Good (70-79%)</div>
      <div>C = Satisfaction (60-69%)</div>
      <div>D = Pass (50-59%)</div>
      <div>E = Fail (Below-50%)</div>
    </div>
  </section>

  <section class="signoff">
    <div>
      <div class="reg-name">{$registrar}</div>
      <div class="reg-title">Academic Registrar</div>
      <div class="issued">Issued at {$issueLoc} {$issueDate}</div>
    </div>
  </section>

  <footer class="motto">Audi et Aude</footer>
</div>
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
                $options->set('defaultFont', 'Helvetica');
                $dompdf = new \Dompdf\Dompdf($options);
                $dompdf->loadHtml($html);
                $dompdf->setPaper('A4', 'portrait');
                $dompdf->render();
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

    private static function css(): string
    {
        return <<<CSS
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; }
.page { padding: 24px 32px; }

.hdr { border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px; text-align: center; }
.brand-name { font-size: 18px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.6px; }
.brand-meta { font-size: 10px; color: #4b5563; margin-top: 2px; }

.doc-title { text-align: center; font-size: 16px; letter-spacing: 1px; margin: 14px 0 18px; font-weight: 800; }

.bio { display: table; width: 100%; margin-bottom: 14px; }
.bio .col { display: table-cell; width: 50%; padding: 0 6px; vertical-align: top; }
.bio .row { padding: 4px 0; font-size: 11px; }
.bio .row span { color: #374151; font-weight: 700; margin-right: 4px; text-transform: uppercase; }
.bio .row b { color: #111827; font-weight: 600; }

table.grid { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
table.grid th, table.grid td { border: 1px solid #1f2937; padding: 6px 8px; vertical-align: middle; }
table.grid thead th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; text-align: left; }
table.grid th.num, table.grid td.num { text-align: center; }
table.grid td.code { font-family: "Courier New", monospace; font-size: 10.5px; }
table.grid td.grade { text-align: center; font-weight: 700; }
table.grid tbody tr:nth-child(even) td { background: #fafafa; }
table.grid tr.totals td { background: #f3f4f6; }
table.grid td.muted { text-align: center; color: #9ca3af; padding: 14px; }

.footer-grid { display: table; width: 100%; margin-top: 6px; }
.footer-grid .col { display: table-cell; width: 50%; padding: 0 6px; vertical-align: top; }
.footer-grid .row { padding: 3px 0; font-size: 11px; }
.footer-grid .row span { font-weight: 700; color: #374151; margin-right: 4px; }

.legend { font-size: 10.5px; color: #1f2937; }
.legend-title { font-weight: 800; text-align: center; margin-bottom: 4px; }

.signoff { margin-top: 22px; }
.reg-name { font-weight: 700; }
.reg-title { font-size: 10.5px; color: #4b5563; }
.issued { font-size: 10.5px; color: #4b5563; margin-top: 8px; }

.motto { margin-top: 28px; text-align: center; font-style: italic; color: #6b7280; font-size: 11px; }
CSS;
    }
}
