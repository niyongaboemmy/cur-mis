<?php

declare(strict_types=1);

namespace App\Helpers;

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use chillerlan\QRCode\Output\QROutputInterface;

/**
 * Renders a printable student ID card (front + back) as HTML / PDF.
 *
 * Modelled on the official CUR student card — a black "STUDENT CARD" spine,
 * the university name + "Audi et Aude" motto + crest header, the student photo,
 * their academic details, a QR code that opens the PUBLIC verification page,
 * and the registration number with the valid academic year.
 *
 * Layout is built with TABLES (not flexbox) because DOMPDF does not support
 * CSS flexbox/grid.
 *
 * @param array $opts {
 *   photo_data_uri?: string|null  pre-fetched data: URI for the student photo
 *   verify_url?:     string       URL the QR code resolves to (public verify page)
 * }
 */
class StudentIdCardHelper
{
    public static function buildHtml(array $student, array $card, array $opts = []): string
    {
        $name    = trim(((string) ($student['fname'] ?? '')) . ' ' . ((string) ($student['lname'] ?? '')));
        $name    = htmlspecialchars(strtoupper($name) ?: '—');
        $reg     = htmlspecialchars((string) ($student['regnumber'] ?? '—'));
        $faculty = htmlspecialchars((string) ($student['fac_name'] ?? ($student['faculty'] ?? '—')));
        $dept    = htmlspecialchars((string) ($student['dep_name'] ?? ($student['department'] ?? '—')));
        $level   = htmlspecialchars((string) ($student['current_level'] ?? '—'));
        $mode    = htmlspecialchars(self::normalizeMode((string) ($student['program'] ?? '')));

        $barcode = (string) ($card['barcode'] ?? $reg);
        $issue   = self::fmt($card['issue_date'] ?? null);
        $expiry  = self::fmt($card['expiry_date'] ?? null);
        $acadYear = self::academicYear($student, $card);

        $institution = htmlspecialchars(getenv('INSTITUTION_NAME') ?: 'CATHOLIC UNIVERSITY OF RWANDA');

        // Prefer an embedded data URI (travels with a downloaded PDF); fall back to
        // a plain URL the browser can load directly — used for the HTML preview so
        // the card shows the SAME photo as the students list even when the server
        // itself can't reach the legacy photo store.
        $photoUri  = $opts['photo_data_uri'] ?? null;
        $photoUrl  = $opts['photo_url'] ?? null;
        $photoSrc  = ($photoUri !== null && $photoUri !== '') ? $photoUri : $photoUrl;
        $verifyUrl = (string) ($opts['verify_url'] ?? ('https://cur.ac.rw/umis/verify/student?code=' . rawurlencode($barcode)));

        // data-card-photo lets the browser preview JS find and swap in a data URI.
        $photoCell = ($photoSrc !== null && $photoSrc !== '')
            ? '<img data-card-photo="1" src="' . htmlspecialchars((string) $photoSrc, ENT_QUOTES) . '" style="width:24mm;height:30mm;object-fit:cover;border:1px solid #94a3b8;" />'
            : '<div data-card-photo="1" style="width:24mm;height:30mm;border:1px solid #94a3b8;background:#e2e8f0;color:#64748b;font-size:15pt;font-weight:bold;text-align:center;line-height:30mm;">'
                . htmlspecialchars(self::initials($name)) . '</div>';

        $crest   = self::imageDataUri(dirname(__DIR__, 2) . '/public/logo.png');
        $crestImg = $crest ? '<img src="' . $crest . '" style="height:9mm;" />' : '';
        $crestSm  = $crest ? '<img src="' . $crest . '" style="height:11mm;" />' : '';
        $qr       = self::qrTag($verifyUrl, 26);

        // Vertical spine — one letter per line (DOMPDF-safe alternative to rotation).
        $spine = '';
        foreach (str_split('STUDENT CARD') as $ch) {
            $spine .= ($ch === ' ') ? '<div style="height:2.2mm;"></div>' : '<div>' . $ch . '</div>';
        }

        return <<<HTML
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            @page { margin: 10mm; }
            * { font-family: 'Times New Roman', Times, serif; }
            body { margin:0; }
            .card {
                width: 150mm; border: 1.4pt solid #1e40af; border-radius: 2mm;
                border-collapse: separate; background:#fff; margin-bottom: 8mm;
            }
            .spine {
                width: 11mm; background:#000; color:#fff; text-align:center;
                font-weight:bold; font-size:8.5pt; letter-spacing:1px; line-height:4.4mm;
                vertical-align:middle; border-top-left-radius:2mm; border-bottom-left-radius:2mm;
            }
            .main { padding: 0; vertical-align: top; }
            .uni { color:#1e40af; font-weight:bold; font-size:17pt; letter-spacing:.5px; }
            .motto { color:#1e3a8a; font-style:italic; font-weight:bold; font-size:9pt; }
            .hr { border:0; border-top:1.2pt solid #1e40af; margin:1.5mm 0 0 0; }
            .lbl { font-weight:bold; color:#0f172a; font-size:10.5pt; }
            .val { color:#1d4ed8; font-size:10.5pt; }
            .nm  { color:#1e40af; font-weight:bold; font-size:12.5pt; }
            .reg .lbl, .reg .val { font-size:11pt; }
            .valid { color:#dc2626; font-weight:bold; font-size:10pt; }
            .scan { font-size:6.5pt; color:#64748b; text-align:center; }
            .backnote { padding:5mm; font-size:8pt; color:#334155; line-height:1.6; }
            .backnote .h { color:#1e40af; font-weight:bold; font-size:9.5pt; margin-bottom:1.5mm; }
        </style></head><body>

        <!-- ───────── FRONT ───────── -->
        <table class="card" cellpadding="0" cellspacing="0"><tr>
            <td class="spine">{$spine}</td>
            <td class="main">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <!-- Header -->
                    <tr><td style="padding:3mm 4mm 0 4mm; text-align:center;">
                        <div class="uni">{$institution}</div>
                        <div class="motto">Audi et Aude</div>
                        <div style="margin-top:0.5mm;">{$crestImg}</div>
                        <hr class="hr"/>
                    </td></tr>
                    <!-- Body -->
                    <tr><td style="padding:3mm 4mm;">
                        <table width="100%" cellpadding="0" cellspacing="0"><tr>
                            <td width="26mm" style="vertical-align:top;">{$photoCell}</td>
                            <td style="vertical-align:top; padding-left:5mm;">
                                <div class="nm">{$name}</div>
                                <table cellpadding="0" cellspacing="0" style="margin-top:1.5mm;">
                                    <tr><td class="lbl">Faculty:&nbsp;</td><td class="val">{$faculty}</td></tr>
                                    <tr><td class="lbl">Dep:&nbsp;</td><td class="val">{$dept}</td></tr>
                                    <tr><td class="lbl">Class:&nbsp;</td><td class="val">Level {$level}</td></tr>
                                    <tr><td class="lbl">Mode:&nbsp;</td><td class="val">{$mode}</td></tr>
                                </table>
                            </td>
                            <td width="30mm" style="vertical-align:top; text-align:center;">
                                {$qr}
                                <div class="scan">Scan to verify</div>
                            </td>
                        </tr></table>
                    </td></tr>
                    <!-- Footer -->
                    <tr><td style="padding:0 4mm 3mm 4mm;">
                        <table width="100%" cellpadding="0" cellspacing="0"><tr>
                            <td style="vertical-align:bottom;">
                                <div class="reg"><span class="lbl">RegNo:&nbsp;</span><span class="val">{$reg}</span></div>
                                <div class="valid">Valid academic year for {$acadYear}</div>
                            </td>
                            <td width="16mm" style="text-align:right; vertical-align:bottom;">{$crestSm}</td>
                        </tr></table>
                    </td></tr>
                </table>
            </td>
        </tr></table>

        <!-- ───────── BACK ───────── -->
        <table class="card" cellpadding="0" cellspacing="0"><tr>
            <td class="main">
                <div class="backnote">
                    <div class="h">{$institution}</div>
                    <div class="h" style="font-size:8.5pt;color:#0f172a;">Conditions of use</div>
                    This card remains the property of the University. It is strictly personal and
                    non-transferable, and must be presented on request. If found, please return it to
                    the University Registry, P.O. Box 49, Butare/Huye — RWANDA.<br><br>
                    Issued: {$issue} &nbsp;·&nbsp; Expires: {$expiry} &nbsp;·&nbsp; Card No: {$barcode}<br><br>
                    Holder's signature: ____________________________ &nbsp;&nbsp;&nbsp;
                    Registrar: ____________________________
                </div>
            </td>
        </tr></table>

        </body></html>
        HTML;
    }

    /** Stream as a landscape PDF (front + back stacked). Falls back to HTML. */
    public static function stream(string $html, string $filename, bool $download = true): never
    {
        if (class_exists('\\Dompdf\\Dompdf')) {
            $opts = new \Dompdf\Options();
            $opts->set('isHtml5ParserEnabled', true);
            $opts->set('isRemoteEnabled', true);
            $pdf = new \Dompdf\Dompdf($opts);
            $pdf->loadHtml($html);
            $pdf->setPaper('A4', 'portrait');
            $pdf->render();
            $pdf->stream($filename, ['Attachment' => $download ? 1 : 0]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . addslashes($filename) . '"');
        echo $html;
        exit;
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /**
     * Resolve a stored photo reference to a base64 data URI, or null.
     * Tries the file server (the canonical store), then any direct URL/path.
     */
    public static function resolvePhotoDataUri(?string $photoRef): ?string
    {
        $photoRef = trim((string) $photoRef);
        if ($photoRef === '') return null;
        if (str_starts_with($photoRef, 'data:image')) return $photoRef;

        // 0) Legacy CUR filename (e.g. "photo_6a1af….jpg") → fetch straight from
        //    the old photo store and embed; skips the file server (never has these).
        $legacyUrl = \App\Helpers\PhotoHelper::legacyUrl($photoRef);
        if ($legacyUrl !== null) {
            $bytes = self::httpGet($legacyUrl, 5);
            return ($bytes !== false && strlen($bytes) > 100)
                ? 'data:image/jpeg;base64,' . base64_encode($bytes)
                : null;
        }

        // 1) File server (most student photos are stored here by file id).
        try {
            $client = new FileServerClient();
            $file   = $client->download($photoRef);
            if (!empty($file['content'])) {
                $mime = $file['mime'] ?? 'image/jpeg';
                if (!str_starts_with($mime, 'image/')) $mime = 'image/jpeg';
                return 'data:' . $mime . ';base64,' . base64_encode($file['content']);
            }
        } catch (\Throwable) { /* fall through */ }

        // 2) Absolute URL, or a relative path resolved against known bases.
        //    Legacy student photos imported from the old system are stored as
        //    relative paths like "documents/std_photo/<file>.jpeg" and live on
        //    the legacy host — set LEGACY_PHOTO_BASE_URL to wherever that folder
        //    is served (e.g. https://cur.ac.rw/curac).
        $candidates = [];
        if (preg_match('#^https?://#i', $photoRef)) {
            $candidates[] = $photoRef;
        } else {
            $rel    = ltrim($photoRef, '/');
            $legacy = rtrim((string) ($_ENV['LEGACY_PHOTO_BASE_URL'] ?? getenv('LEGACY_PHOTO_BASE_URL') ?: ''), '/');
            $fs     = rtrim((string) ($_ENV['FILE_SERVER_URL'] ?? getenv('FILE_SERVER_URL') ?: ''), '/');
            if ($legacy !== '') $candidates[] = $legacy . '/' . $rel;
            if ($fs !== '')     $candidates[] = $fs . '/' . $rel;
            $candidates[] = dirname(__DIR__, 2) . '/file-server/public/' . $rel;
            $candidates[] = dirname(__DIR__, 2) . '/file-server/storage/uploads/' . $rel;
        }
        foreach ($candidates as $src) {
            $bytes = preg_match('#^https?://#i', $src)
                ? self::httpGet($src, 4)
                : @file_get_contents($src);
            if ($bytes !== false && strlen($bytes) > 100) {
                return 'data:image/jpeg;base64,' . base64_encode($bytes);
            }
        }
        return null;
    }

    /**
     * Best-effort HTTP(S) GET for embedding a remote image. Sends a User-Agent
     * (some stores reject blank-UA requests), follows redirects, and relaxes TLS
     * verification — the photo store is a trusted first-party host and a strict
     * CA chain on the server shouldn't block a public image fetch. Returns the
     * body or false.
     */
    private static function httpGet(string $url, int $timeout): string|false
    {
        $ctx = stream_context_create([
            'http' => [
                'timeout'         => $timeout,
                'follow_location' => 1,
                'max_redirects'   => 3,
                'user_agent'      => 'CUR-MIS/1.0 (+id-card)',
            ],
            'ssl' => [
                'verify_peer'      => false,
                'verify_peer_name' => false,
            ],
        ]);
        return @file_get_contents($url, false, $ctx);
    }

    private static function imageDataUri(string $path): ?string
    {
        if (!is_file($path)) return null;
        $bytes = @file_get_contents($path);
        if ($bytes === false) return null;
        $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = $ext === 'png' ? 'image/png' : ($ext === 'svg' ? 'image/svg+xml' : 'image/jpeg');
        return 'data:' . $mime . ';base64,' . base64_encode($bytes);
    }

    /**
     * Mode of learning (student.program holds Day / Evening / Weekend / Holiday).
     * Normalises casing/whitespace; returns "—" when blank.
     */
    private static function normalizeMode(string $mode): string
    {
        $mode = ucfirst(strtolower(trim($mode)));
        return $mode !== '' ? $mode : '—';
    }

    private static function initials(string $name): string
    {
        $out = '';
        foreach (preg_split('/\s+/', trim($name)) as $w) {
            if ($w !== '') $out .= mb_substr($w, 0, 1);
            if (mb_strlen($out) >= 2) break;
        }
        return strtoupper($out) ?: '?';
    }

    /**
     * The academic year the card is valid for, e.g. "2025-2026" — derived from
     * the issue date (the current year), NOT the student's admission cohort.
     * The Rwandan academic year rolls over mid-year, so Aug+ starts Y..Y+1.
     */
    private static function academicYear(array $student, array $card): string
    {
        $ts    = strtotime((string) ($card['issue_date'] ?? 'now')) ?: time();
        $y     = (int) date('Y', $ts);
        $start = ((int) date('n', $ts) >= 8) ? $y : $y - 1;
        return $start . '-' . ($start + 1);
    }

    private static function qrTag(string $content, int $sizeMm): string
    {
        try {
            if (extension_loaded('gd')) {
                $opts = new QROptions([
                    'outputType'   => QROutputInterface::GDIMAGE_PNG,
                    'outputBase64' => true,
                    'scale'        => 5,
                    'eccLevel'     => QRCode::ECC_M,
                ]);
                return '<img src="' . (new QRCode($opts))->render($content) . '" style="width:' . $sizeMm . 'mm;height:' . $sizeMm . 'mm;" />';
            }
            $opts = new QROptions(['outputType' => QROutputInterface::MARKUP_SVG, 'eccLevel' => QRCode::ECC_M]);
            return '<img src="' . (new QRCode($opts))->render($content) . '" style="width:' . $sizeMm . 'mm;height:' . $sizeMm . 'mm;" />';
        } catch (\Throwable) {
            return '<div style="width:' . $sizeMm . 'mm;height:' . $sizeMm . 'mm;border:1px solid #bbb;"></div>';
        }
    }

    private static function fmt(mixed $date): string
    {
        if (!$date) return '—';
        $ts = strtotime((string) $date);
        return $ts ? date('d M Y', $ts) : htmlspecialchars((string) $date);
    }
}
