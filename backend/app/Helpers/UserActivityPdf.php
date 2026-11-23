<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * PDF report of one user's activity: profile, sign-in sessions with time
 * spent, most-used modules, and a timeline of what they did and when.
 * Rendered with DOMPDF and the shared CUR letterhead, like the other reports.
 */
final class UserActivityPdf
{
    /** @param array<string, mixed> $d  payload built by UserActivityController */
    public static function render(array $d): string
    {
        // DOMPDF 2.x emits deprecation notices on PHP 8.4+ that would corrupt
        // the binary output. Silence them only while rendering.
        $prev = error_reporting();
        error_reporting($prev & ~E_DEPRECATED & ~E_USER_DEPRECATED);
        try {
            $options = new \Dompdf\Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', false);
            $options->set('defaultFont', 'Helvetica');
            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml(self::html($d));
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            PdfLayout::stampHeader($dompdf);
            return (string) $dompdf->output();
        } finally {
            error_reporting($prev);
        }
    }

    /** @param array<string, mixed> $d */
    public static function html(array $d): string
    {
        $e    = static fn(mixed $v): string => htmlspecialchars((string) ($v ?? ''), ENT_QUOTES, 'UTF-8');
        $user = $d['user'];
        $sum  = $d['summary'];
        $avg  = $sum['sessions'] > 0 ? (int) round($sum['total_seconds'] / $sum['sessions']) : 0;

        $statusLabel = ['active' => 'Active', 'logged_out' => 'Logged out', 'timed_out' => 'Timed out'];

        $sessionRows = '';
        foreach ($d['sessions'] as $s) {
            $sessionRows .= '<tr>'
                . '<td>' . $e(self::fmtDate($s['login_at'])) . '</td>'
                . '<td>' . $e(self::fmtDate($s['logout_at'])) . '</td>'
                . '<td class="num">' . $e(self::fmtDuration((int) $s['duration_seconds'])) . '</td>'
                . '<td>' . $e($statusLabel[$s['status']] ?? $s['status']) . '</td>'
                . '<td>' . $e($s['ip_address'] ?: '—') . '</td>'
                . '</tr>';
        }
        if ($sessionRows === '') {
            $sessionRows = '<tr><td colspan="5" class="muted">No sign-ins recorded.</td></tr>';
        }

        $moduleRows = '';
        foreach ($d['top_modules'] as $m) {
            $moduleRows .= '<tr><td>' . $e(self::moduleLabel((string) $m['module'])) . '</td>'
                . '<td class="num">' . (int) $m['views'] . '</td></tr>';
        }
        if ($moduleRows === '') {
            $moduleRows = '<tr><td colspan="2" class="muted">No page visits recorded.</td></tr>';
        }

        $activityRows = '';
        foreach ($d['activity'] as $a) {
            $isPage  = $a['type'] === 'page';
            $details = $isPage
                ? 'Opened ' . (string) ($a['path'] ?? '')
                : (string) ($a['description'] ?? '');
            $action  = $isPage ? 'View' : (string) ($a['action'] ?? '');
            $activityRows .= '<tr>'
                . '<td class="nowrap">' . $e(self::fmtDate($a['at'])) . '</td>'
                . '<td>' . $e(self::moduleLabel((string) $a['module'])) . '</td>'
                . '<td>' . $e(ucfirst(strtolower($action))) . '</td>'
                . '<td class="wrap">' . $e($details) . '</td>'
                . '</tr>';
        }
        if ($activityRows === '') {
            $activityRows = '<tr><td colspan="4" class="muted">No activity recorded.</td></tr>';
        }

        $generated = $e(date('d M Y, H:i'));
        $css       = PdfLayout::pageCss();

        return '<!doctype html><html><head><meta charset="utf-8"><style>' . $css . '
            body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #1f2937; }
            h1 { font-size: 16px; margin: 0 0 2px 0; color: #111827; }
            h2 { font-size: 12px; margin: 16px 0 6px 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
            .meta { color: #6b7280; font-size: 9px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #4b5563; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; vertical-align: top; }
            td.num { text-align: right; white-space: nowrap; }
            td.nowrap { white-space: nowrap; }
            td.wrap { word-wrap: break-word; }
            .muted { color: #9ca3af; text-align: center; padding: 10px; }
            .cards { width: 100%; margin-top: 6px; }
            .cards td { border: 1px solid #e5e7eb; padding: 8px; width: 25%; }
            .cards .label { font-size: 8px; text-transform: uppercase; color: #6b7280; }
            .cards .value { font-size: 13px; font-weight: bold; color: #111827; margin-top: 2px; }
            .badge { display: inline-block; padding: 1px 6px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 9px; }
        </style></head><body>
            <h1>User activity report</h1>
            <div class="meta">Generated ' . $generated . '</div>

            <table>
                <tr><th style="width:18%">Name</th><td>' . $e($user['full_name']) . '</td></tr>
                <tr><th>Email</th><td>' . $e($user['email']) . '</td></tr>
                <tr><th>Role</th><td>' . $e($user['role_name'] ?? 'No role') . '</td></tr>
                <tr><th>Account</th><td>' . ($user['is_active'] ? 'Active' : 'Disabled') . '</td></tr>
            </table>

            <table class="cards"><tr>
                <td><div class="label">Logins</div><div class="value">' . (int) $sum['sessions'] . '</div></td>
                <td><div class="label">Time in system</div><div class="value">' . $e(self::fmtDuration((int) $sum['total_seconds'])) . '</div></td>
                <td><div class="label">Average session</div><div class="value">' . $e($avg ? self::fmtDuration($avg) : '—') . '</div></td>
                <td><div class="label">Last login</div><div class="value" style="font-size:10px">' . $e(self::fmtDate($sum['last_login'])) . '</div></td>
            </tr></table>

            <h2>Sign-in sessions</h2>
            <table>
                <tr><th>Signed in</th><th>Signed out</th><th style="text-align:right">Duration</th><th>Status</th><th>IP address</th></tr>
                ' . $sessionRows . '
            </table>

            <h2>Most used modules</h2>
            <table>
                <tr><th>Module</th><th style="text-align:right">Page visits</th></tr>
                ' . $moduleRows . '
            </table>

            <h2>Activity timeline (most recent first)</h2>
            <table>
                <tr><th>Date and time</th><th>Module</th><th>Action</th><th>Details</th></tr>
                ' . $activityRows . '
            </table>
        </body></html>';
    }

    public static function fmtDuration(int $seconds): string
    {
        $s = max(0, $seconds);
        $h = intdiv($s, 3600);
        $m = intdiv($s % 3600, 60);
        if ($h > 0) {
            return "{$h}h {$m}m";
        }
        return $m > 0 ? "{$m}m" : "{$s}s";
    }

    private static function fmtDate(?string $value): string
    {
        if ($value === null || $value === '') {
            return '—';
        }
        $ts = strtotime($value);
        return $ts === false ? $value : date('d M Y, H:i', $ts);
    }

    private static function moduleLabel(string $module): string
    {
        return $module === '' ? 'Other' : ucfirst(strtolower(str_replace('_', ' ', $module)));
    }
}
