<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates attendance report HTML / PDF / CSV.
 *
 * Two report flavours:
 *   - session : roster for one specific session (date, module, status of each student)
 *   - module  : term-wide summary across all sessions of a module + per-student %s
 *
 * Uses dompdf for PDF rendering; falls back to HTML download if unavailable.
 */
class AttendanceReportPdf
{
    /* ──────────────────────────────────────────────────────────────────
     * Session roster — one specific class meeting
     * ────────────────────────────────────────────────────────────────── */
    public static function buildSessionHtml(array $session, array $roster, array $summary): string
    {
        $institution = htmlspecialchars(getenv('INSTITUTION_NAME') ?: 'Catholic University of Rwanda');
        $code   = htmlspecialchars((string)($session['module_code'] ?? '—'));
        $name   = htmlspecialchars((string)($session['module_name'] ?? ''));
        $date   = htmlspecialchars((string)($session['session_date'] ?? '—'));
        $type   = htmlspecialchars(ucfirst((string)($session['session_type'] ?? '')));
        $term   = htmlspecialchars((string)($session['term_label'] ?? '—'));
        $teacher = htmlspecialchars((string)($session['started_by_name'] ?? '—'));
        $generated = date('Y-m-d H:i');

        $totalRoster = (int)($summary['total_roster'] ?? 0);
        $present  = (int)($summary['present'] ?? 0);
        $late     = (int)($summary['late']    ?? 0);
        $absent   = (int)($summary['absent']  ?? 0);
        $excused  = (int)($summary['excused'] ?? 0);
        $unmarked = max(0, $totalRoster - $present - $late - $absent - $excused);
        $marked   = $totalRoster - $unmarked;
        $attendancePct = $marked > 0 ? (int)round((($present + $late) / $marked) * 100) : 0;

        // Roster rows
        $rows = '';
        foreach ($roster as $i => $r) {
            $n        = $i + 1;
            $reg      = htmlspecialchars((string)$r['regnumber']);
            $student  = htmlspecialchars(trim(($r['fname'] ?? '') . ' ' . ($r['lname'] ?? '')));
            $status   = (string)($r['record_status'] ?? '');
            $remarks  = htmlspecialchars((string)($r['remarks'] ?? ''));
            $statusCell = self::statusCell($status);
            $rows .= "<tr>
                <td class=\"num\">{$n}</td>
                <td class=\"reg\">{$reg}</td>
                <td>{$student}</td>
                <td class=\"status\">{$statusCell}</td>
                <td class=\"sig\"></td>
                <td class=\"remarks\">{$remarks}</td>
            </tr>";
        }
        if ($rows === '') {
            $rows = '<tr><td colspan="6" class="muted">No students registered for this module in this term.</td></tr>';
        }

        $css = self::baseCss();
        return <<<HTML
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Attendance — {$code} {$date}</title>
<style>{$css}</style></head><body>
<div class="report">
  <header class="hdr">
    <div class="brand">
      <div class="brand-name">{$institution}</div>
      <div class="brand-sub">Attendance Sheet</div>
    </div>
    <div class="meta">
      <div><span>Generated</span><b>{$generated}</b></div>
    </div>
  </header>

  <section class="info-grid">
    <div><span>Module</span><b>{$code} — {$name}</b></div>
    <div><span>Date</span><b>{$date}</b></div>
    <div><span>Type</span><b>{$type}</b></div>
    <div><span>Term</span><b>{$term}</b></div>
    <div><span>Teacher</span><b>{$teacher}</b></div>
    <div><span>Roster</span><b>{$totalRoster} students</b></div>
  </section>

  <section class="summary">
    <div class="kpi"><span>Present</span><b class="ok">{$present}</b></div>
    <div class="kpi"><span>Late</span><b class="warn">{$late}</b></div>
    <div class="kpi"><span>Excused</span><b class="info">{$excused}</b></div>
    <div class="kpi"><span>Absent</span><b class="bad">{$absent}</b></div>
    <div class="kpi"><span>Unmarked</span><b class="muted">{$unmarked}</b></div>
    <div class="kpi big"><span>Attendance</span><b>{$attendancePct}%</b></div>
  </section>

  <table class="roster">
    <thead>
      <tr>
        <th class="num">#</th>
        <th class="reg">Reg #</th>
        <th>Student name</th>
        <th class="status">Status</th>
        <th class="sig">Signature</th>
        <th class="remarks">Remarks</th>
      </tr>
    </thead>
    <tbody>{$rows}</tbody>
  </table>

  <section class="signoff">
    <div>
      <span>Lecturer signature</span>
      <div class="line"></div>
      <small>{$teacher}</small>
    </div>
    <div>
      <span>Date</span>
      <div class="line"></div>
      <small>{$date}</small>
    </div>
  </section>

  <footer class="ftr">{$institution} · {$code} · {$date} · {$type} · Generated {$generated}</footer>
</div>
</body></html>
HTML;
    }

    /* ──────────────────────────────────────────────────────────────────
     * Module-level summary — across all sessions of a module/term
     * ────────────────────────────────────────────────────────────────── */
    public static function buildModuleHtml(array $module, ?string $termLabel, array $sessions, array $studentSummary, array $totals): string
    {
        $institution = htmlspecialchars(getenv('INSTITUTION_NAME') ?: 'Catholic University of Rwanda');
        $code = htmlspecialchars((string)($module['module_code'] ?? '—'));
        $name = htmlspecialchars((string)($module['module_name'] ?? ''));
        $term = htmlspecialchars((string)($termLabel ?? '—'));
        $generated = date('Y-m-d H:i');

        // Sessions table
        $sessionRows = '';
        foreach ($sessions as $i => $s) {
            $n          = $i + 1;
            $date       = htmlspecialchars((string)$s['session_date']);
            $type       = htmlspecialchars(ucfirst((string)$s['session_type']));
            $status     = htmlspecialchars((string)$s['status']);
            $marked     = (int)($s['recorded_count'] ?? 0);
            $present    = (int)($s['present_count']  ?? 0);
            $late       = (int)($s['late_count']     ?? 0);
            $absent     = (int)($s['absent_count']   ?? 0);
            $excused    = (int)($s['excused_count']  ?? 0);
            $pct        = $marked > 0 ? (int)round((($present + $late) / $marked) * 100) : 0;
            $sessionRows .= "<tr>
                <td class=\"num\">{$n}</td>
                <td>{$date}</td>
                <td>{$type}</td>
                <td>{$status}</td>
                <td class=\"num\">{$marked}</td>
                <td class=\"num ok\">{$present}</td>
                <td class=\"num warn\">{$late}</td>
                <td class=\"num info\">{$excused}</td>
                <td class=\"num bad\">{$absent}</td>
                <td class=\"num\"><b>{$pct}%</b></td>
            </tr>";
        }
        if ($sessionRows === '') {
            $sessionRows = '<tr><td colspan="10" class="muted">No sessions recorded for this module in this term.</td></tr>';
        }

        // Student summary table
        $studentRows = '';
        foreach ($studentSummary as $i => $s) {
            $n        = $i + 1;
            $reg      = htmlspecialchars((string)$s['regnumber']);
            $student  = htmlspecialchars(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
            $tot      = (int)($s['total_records'] ?? 0);
            $present  = (int)($s['present'] ?? 0);
            $late     = (int)($s['late']    ?? 0);
            $absent   = (int)($s['absent']  ?? 0);
            $excused  = (int)($s['excused'] ?? 0);
            $pct      = (int)($s['attendance_pct'] ?? 0);
            $pctClass = $pct >= 75 ? 'ok' : ($pct >= 50 ? 'warn' : 'bad');
            $studentRows .= "<tr>
                <td class=\"num\">{$n}</td>
                <td class=\"reg\">{$reg}</td>
                <td>{$student}</td>
                <td class=\"num\">{$tot}</td>
                <td class=\"num ok\">{$present}</td>
                <td class=\"num warn\">{$late}</td>
                <td class=\"num info\">{$excused}</td>
                <td class=\"num bad\">{$absent}</td>
                <td class=\"num {$pctClass}\"><b>{$pct}%</b></td>
            </tr>";
        }
        if ($studentRows === '') {
            $studentRows = '<tr><td colspan="9" class="muted">No attendance records yet.</td></tr>';
        }

        $totSessions = (int)($totals['sessions']        ?? 0);
        $totRecords  = (int)($totals['records']         ?? 0);
        $avgPct      = (int)($totals['attendance_pct']  ?? 0);
        $totPresent  = (int)($totals['present']         ?? 0);
        $totLate     = (int)($totals['late']            ?? 0);
        $totAbsent   = (int)($totals['absent']          ?? 0);
        $totExcused  = (int)($totals['excused']         ?? 0);

        $css = self::baseCss();
        return <<<HTML
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Attendance Report — {$code}</title>
<style>{$css}</style></head><body>
<div class="report">
  <header class="hdr">
    <div class="brand">
      <div class="brand-name">{$institution}</div>
      <div class="brand-sub">Module Attendance Report</div>
    </div>
    <div class="meta">
      <div><span>Generated</span><b>{$generated}</b></div>
    </div>
  </header>

  <section class="info-grid">
    <div><span>Module</span><b>{$code} — {$name}</b></div>
    <div><span>Term</span><b>{$term}</b></div>
    <div><span>Sessions held</span><b>{$totSessions}</b></div>
    <div><span>Records marked</span><b>{$totRecords}</b></div>
  </section>

  <section class="summary">
    <div class="kpi"><span>Present</span><b class="ok">{$totPresent}</b></div>
    <div class="kpi"><span>Late</span><b class="warn">{$totLate}</b></div>
    <div class="kpi"><span>Excused</span><b class="info">{$totExcused}</b></div>
    <div class="kpi"><span>Absent</span><b class="bad">{$totAbsent}</b></div>
    <div class="kpi big"><span>Avg attendance</span><b>{$avgPct}%</b></div>
  </section>

  <h3>Sessions</h3>
  <table class="roster compact">
    <thead><tr>
      <th class="num">#</th><th>Date</th><th>Type</th><th>Status</th>
      <th class="num">Marked</th><th class="num">Present</th><th class="num">Late</th>
      <th class="num">Excused</th><th class="num">Absent</th><th class="num">%</th>
    </tr></thead>
    <tbody>{$sessionRows}</tbody>
  </table>

  <h3 class="page-break-before">Per-student summary</h3>
  <table class="roster compact">
    <thead><tr>
      <th class="num">#</th><th class="reg">Reg #</th><th>Student name</th>
      <th class="num">Records</th><th class="num">Present</th><th class="num">Late</th>
      <th class="num">Excused</th><th class="num">Absent</th><th class="num">Attendance %</th>
    </tr></thead>
    <tbody>{$studentRows}</tbody>
  </table>

  <footer class="ftr">{$institution} · {$code} · {$term} · Generated {$generated}</footer>
</div>
</body></html>
HTML;
    }

    /* ──────────────────────────────────────────────────────────────────
     * CSV builders
     * ────────────────────────────────────────────────────────────────── */
    public static function buildSessionCsv(array $session, array $roster, array $summary): string
    {
        $code = (string)($session['module_code'] ?? '');
        $name = (string)($session['module_name'] ?? '');
        $date = (string)($session['session_date'] ?? '');
        $type = (string)($session['session_type'] ?? '');
        $term = (string)($session['term_label'] ?? '');
        $teacher = (string)($session['started_by_name'] ?? '');
        $totalRoster = (int)($summary['total_roster'] ?? 0);

        $out  = self::csvRow(['Module',  "{$code} - {$name}"]);
        $out .= self::csvRow(['Date',    $date]);
        $out .= self::csvRow(['Type',    $type]);
        $out .= self::csvRow(['Term',    $term]);
        $out .= self::csvRow(['Teacher', $teacher]);
        $out .= self::csvRow(['Roster',  (string)$totalRoster]);
        $out .= self::csvRow(['Generated', date('Y-m-d H:i')]);
        $out .= "\n";
        $out .= self::csvRow(['#', 'Reg #', 'First name', 'Last name', 'Status', 'Remarks', 'Course attendance %']);
        foreach ($roster as $i => $r) {
            $out .= self::csvRow([
                (string)($i + 1),
                (string)$r['regnumber'],
                (string)($r['fname'] ?? ''),
                (string)($r['lname'] ?? ''),
                (string)($r['record_status'] ?? ''),
                (string)($r['remarks'] ?? ''),
                (string)($r['attendance_pct'] ?? 0) . '%',
            ]);
        }
        return $out;
    }

    public static function buildModuleCsv(array $module, ?string $termLabel, array $sessions, array $studentSummary, array $totals): string
    {
        $code = (string)($module['module_code'] ?? '');
        $name = (string)($module['module_name'] ?? '');

        $out  = self::csvRow(['Module',          "{$code} - {$name}"]);
        $out .= self::csvRow(['Term',            (string)($termLabel ?? '')]);
        $out .= self::csvRow(['Sessions held',   (string)($totals['sessions'] ?? 0)]);
        $out .= self::csvRow(['Records marked',  (string)($totals['records']  ?? 0)]);
        $out .= self::csvRow(['Avg attendance',  (string)($totals['attendance_pct'] ?? 0) . '%']);
        $out .= self::csvRow(['Generated',       date('Y-m-d H:i')]);
        $out .= "\n";

        $out .= self::csvRow(['SESSIONS']);
        $out .= self::csvRow(['#','Date','Type','Status','Marked','Present','Late','Excused','Absent','Attendance %']);
        foreach ($sessions as $i => $s) {
            $marked  = (int)($s['recorded_count'] ?? 0);
            $present = (int)($s['present_count']  ?? 0);
            $late    = (int)($s['late_count']     ?? 0);
            $absent  = (int)($s['absent_count']   ?? 0);
            $excused = (int)($s['excused_count']  ?? 0);
            $pct     = $marked > 0 ? (int)round((($present + $late) / $marked) * 100) : 0;
            $out .= self::csvRow([
                (string)($i + 1),
                (string)$s['session_date'],
                (string)$s['session_type'],
                (string)$s['status'],
                (string)$marked,
                (string)$present,
                (string)$late,
                (string)$excused,
                (string)$absent,
                "{$pct}%",
            ]);
        }
        $out .= "\n";

        $out .= self::csvRow(['PER-STUDENT SUMMARY']);
        $out .= self::csvRow(['#','Reg #','First name','Last name','Records','Present','Late','Excused','Absent','Attendance %']);
        foreach ($studentSummary as $i => $s) {
            $out .= self::csvRow([
                (string)($i + 1),
                (string)$s['regnumber'],
                (string)($s['fname'] ?? ''),
                (string)($s['lname'] ?? ''),
                (string)($s['total_records'] ?? 0),
                (string)($s['present'] ?? 0),
                (string)($s['late']    ?? 0),
                (string)($s['excused'] ?? 0),
                (string)($s['absent']  ?? 0),
                (string)($s['attendance_pct'] ?? 0) . '%',
            ]);
        }
        return $out;
    }

    /* ──────────────────────────────────────────────────────────────────
     * Output to browser
     * ────────────────────────────────────────────────────────────────── */
    public static function streamPdf(string $html, string $filename): void
    {
        if (class_exists('\Dompdf\Dompdf')) {
            // dompdf 2.0.8 emits a wave of E_DEPRECATED warnings on PHP 8.4+ that
            // would otherwise corrupt the binary PDF response stream. Silence
            // them only for the duration of the render.
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
        // Fallback — serve printable HTML when dompdf is missing
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    public static function streamCsv(string $csv, string $filename): void
    {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        // BOM for Excel compatibility with UTF-8
        echo "\xEF\xBB\xBF" . $csv;
        exit;
    }

    /* ──────────────────────────────────────────────────────────────────
     * Internal helpers
     * ────────────────────────────────────────────────────────────────── */
    private static function csvRow(array $cells): string
    {
        $escaped = array_map(function ($c) {
            $c = (string)$c;
            if (preg_match('/[",\n\r]/', $c)) return '"' . str_replace('"', '""', $c) . '"';
            return $c;
        }, $cells);
        return implode(',', $escaped) . "\n";
    }

    private static function statusCell(string $status): string
    {
        $map = [
            'present' => ['ok',   'Present'],
            'late'    => ['warn', 'Late'],
            'absent'  => ['bad',  'Absent'],
            'excused' => ['info', 'Excused'],
        ];
        if (!isset($map[$status])) return '<span class="muted">—</span>';
        [$cls, $label] = $map[$status];
        return "<span class=\"chip {$cls}\">{$label}</span>";
    }

    private static function baseCss(): string
    {
        return <<<CSS
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: #1f2937; font-size: 11px; margin: 0; }
.report { padding: 28px 32px; }
.hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
.brand-name { font-size: 16px; font-weight: 700; color: #1e3a8a; letter-spacing: 0.3px; }
.brand-sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }
.meta { font-size: 10px; color: #6b7280; text-align: right; }
.meta div span { display: block; text-transform: uppercase; letter-spacing: 0.5px; font-size: 9px; }
.meta div b { color: #1f2937; font-weight: 600; }

.info-grid { display: table; width: 100%; border-collapse: separate; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 4px; }
.info-grid > div { display: table-cell; width: 33%; padding: 8px 12px; border-right: 1px solid #e5e7eb; vertical-align: top; }
.info-grid > div:last-child { border-right: 0; }
.info-grid span { display: block; text-transform: uppercase; font-size: 8.5px; color: #6b7280; letter-spacing: 0.5px; margin-bottom: 2px; }
.info-grid b { font-size: 11px; color: #111827; font-weight: 600; }

.summary { display: table; width: 100%; margin-bottom: 16px; }
.summary .kpi { display: table-cell; padding: 8px 10px; border: 1px solid #e5e7eb; border-right: 0; text-align: center; vertical-align: middle; }
.summary .kpi:last-child { border-right: 1px solid #e5e7eb; }
.summary .kpi span { display: block; font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
.summary .kpi b { display: block; font-size: 16px; margin-top: 4px; }
.summary .kpi.big b { font-size: 22px; color: #1e3a8a; }

h3 { font-size: 12.5px; color: #1e3a8a; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }

table.roster { width: 100%; border-collapse: collapse; }
table.roster th, table.roster td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: middle; }
table.roster thead th { background: #f3f4f6; color: #374151; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; }
table.roster.compact th, table.roster.compact td { padding: 4px 6px; font-size: 10px; }
table.roster .num     { text-align: right; width: 32px; }
table.roster .reg     { font-family: "Courier New", monospace; font-size: 10px; width: 90px; }
table.roster .status  { width: 70px; }
table.roster .sig     { width: 110px; }
table.roster .remarks { width: 180px; }
table.roster tbody tr:nth-child(even) td { background: #f9fafb; }
table.roster td.muted { text-align: center; color: #9ca3af; padding: 14px; }

.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }
.chip.ok   { background: #d1fae5; color: #065f46; }
.chip.warn { background: #fef3c7; color: #92400e; }
.chip.bad  { background: #fee2e2; color: #991b1b; }
.chip.info { background: #e0f2fe; color: #075985; }

.ok    { color: #047857; }
.warn  { color: #b45309; }
.bad   { color: #b91c1c; }
.info  { color: #0369a1; }
.muted { color: #9ca3af; }

.signoff { display: table; width: 100%; margin-top: 28px; }
.signoff > div { display: table-cell; width: 50%; padding: 0 16px; }
.signoff span { display: block; font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; margin-bottom: 28px; }
.signoff .line { border-bottom: 1px solid #6b7280; height: 0; margin-bottom: 4px; }
.signoff small { color: #6b7280; font-size: 10px; }

.ftr { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; text-align: center; }
.page-break-before { page-break-before: always; }
CSS;
    }
}
