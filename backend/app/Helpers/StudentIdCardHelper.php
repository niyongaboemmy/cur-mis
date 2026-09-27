<?php

declare(strict_types=1);

namespace App\Helpers;

use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

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
 * SIZE
 * ────
 * Every dimension below is written for the 165 x 94mm CUR card and then scaled
 * by `width / 165`, so a preset only has to state its millimetres: fonts, the
 * photo, the QR and the spine all follow. Without that the 16pt heading on an
 * 85.6mm CR80 card would run off the edge.
 *
 * @param array $opts {
 *   photo_data_uri?: string|null  pre-fetched data: URI for the student photo
 *   verify_url?:     string       URL the QR code resolves to (public verify page)
 *   size?:           string       a key of self::SIZES; unknown falls back to default
 * }
 */
class StudentIdCardHelper
{
    /** The design these measurements were drawn at; everything scales off it. */
    private const BASE_W = 165.0;

    /** Printable presets, widest first. `default` is what an unset size gets. */
    public const SIZES = [
        'cur'   => ['w' => 165.0, 'h' => 94.0,  'label' => 'CUR standard (165 x 94 mm)'],
        'a5'    => ['w' => 148.0, 'h' => 100.0, 'label' => 'Large / A5 (148 x 100 mm)'],
        'cr80'  => ['w' => 85.6,  'h' => 54.0,  'label' => 'Plastic card CR80 (85.6 x 54 mm)'],
    ];

    public const SIZE_DEFAULT = 'cur';

    /**
     * Resolve a size key to its millimetres.
     *
     * An unknown or missing key returns the default rather than failing: a card
     * that prints at the wrong size is recoverable, one that 500s mid-print run
     * is not.
     *
     * @return array{w: float, h: float, key: string, label: string}
     */
    public static function sizeSpec(mixed $key): array
    {
        $k = is_string($key) ? strtolower(trim($key)) : '';
        if (!isset(self::SIZES[$k])) {
            $k = self::SIZE_DEFAULT;
        }
        return self::SIZES[$k] + ['key' => $k];
    }

    public static function buildHtml(array $student, array $card, array $opts = []): string
    {
        $name    = trim(((string) ($student['fname'] ?? '')) . ' ' . ((string) ($student['lname'] ?? '')));
        $name    = htmlspecialchars(strtoupper($name) ?: '—');
        $reg     = htmlspecialchars((string) ($student['regnumber'] ?? '—'));
        $faculty = htmlspecialchars((string) ($student['fac_name'] ?? ($student['faculty'] ?? '—')));
        $dept    = htmlspecialchars((string) ($student['dep_name'] ?? ($student['department'] ?? '—')));
        $level   = htmlspecialchars(LevelHelper::name($student['level_name'] ?? $student['current_level'] ?? null, '—'));
        $mode    = htmlspecialchars(self::normalizeMode((string) ($student['program'] ?? '')));

        // ── Postgraduate vs undergraduate ───────────────────────────────────
        // Masters and postgraduate students sit under the Centre for Post
        // Graduate Studies, not a faculty, so their card names the centre and
        // splits the award into programme + specialisation. `programme_category`
        // is the only column that reliably says which: `programme_level` and
        // `category` still read "undergraduate" on every postgraduate row, so
        // they are not usable. The registration prefix is the same signal the
        // category was derived from, kept as a fallback for rows predating it.
        $isPostgrad = strtolower(trim((string) ($student['programme_category'] ?? ''))) === 'postgraduate'
            || str_starts_with(strtoupper((string) ($student['regnumber'] ?? '')), '2CUR');

        [$award, $specialisation] = self::splitAward(
            (string) ($student['dep_name'] ?? ($student['option_name'] ?? '')),
        );
        $awardTxt = htmlspecialchars($award !== '' ? $award : (string) ($student['dep_name'] ?? '—'));
        $specTxt  = htmlspecialchars($specialisation);

        // `student.program` mixes the study mode with subject names ("Day",
        // "Weekend", but also "Public Health"). Only print it as the mode when
        // it actually is one, rather than repeating the programme.
        $isMode   = in_array(strtolower(trim((string) ($student['program'] ?? ''))),
                             ['day', 'weekend', 'holiday', 'evening'], true);

        if ($isPostgrad) {
            $detailRows = '<div class="details-row"><span class="lbl">Center of Post Graduate Studies</span></div>'
                . '<div class="details-row"><span class="lbl">Program:</span> <span class="val">' . $awardTxt . '</span></div>';
            if ($specTxt !== '') {
                $detailRows .= '<div class="details-row"><span class="lbl">Specialization:</span> <span class="val">' . $specTxt . '</span></div>';
            }
            $detailRows .= '<div class="details-row"><span class="lbl">Class:</span> <span class="val">' . $level . '</span></div>';
            if ($isMode) {
                $detailRows .= '<div class="details-row"><span class="lbl">Mode:</span> <span class="val">' . $mode . '</span></div>';
            }
        } else {
            $detailRows = '<div class="details-row"><span class="lbl">Faculty:</span> <span class="val">' . $faculty . '</span></div>'
                . '<div class="details-row"><span class="lbl">Dep:</span> <span class="val">' . $dept . '</span></div>'
                . '<div class="details-row"><span class="lbl">Class:</span> <span class="val">' . $level . '</span></div>'
                . '<div class="details-row"><span class="lbl">Program:</span> <span class="val">' . $mode . '</span></div>';
        }

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

        // ── Size ────────────────────────────────────────────────────────────
        // Resolved first because every measurement below is scaled by it.
        $spec = self::sizeSpec($opts['size'] ?? null);
        $cw   = $spec['w'];
        $ch   = $spec['h'];
        $k    = $cw / self::BASE_W;

        // Scaled millimetres / points, trimmed so the CSS stays readable.
        $u  = static function (float $v) use ($k): string {
            $n = round($v * $k, 2);
            return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.') ?: '0';
        };
        $mm = static fn (float $v): string => $u($v) . 'mm';
        $pt = static fn (float $v): string => $u($v) . 'pt';

        // Absolute millimetres — the card and page are stated in real-world
        // units, NOT scaled. Only measurements drawn against the 165mm design
        // go through $mm()/$pt(); passing $cw through the scaler shrinks the
        // card by its own scale factor (148mm came out as 133mm).
        $abs = static function (float $v): string {
            return (rtrim(rtrim(number_format(round($v, 2), 2, '.', ''), '0'), '.') ?: '0') . 'mm';
        };

        // The page hugs the card plus its margin, so a CR80 run does not come
        // out centred on a sheet of A5 with 90mm of blank around it.
        $mgV    = 5.0;
        // DOMPDF renders the 2pt border outside the declared box, so the card
        // occupies ~1.5mm more than $cw x $ch. Budget for that plus a hair,
        // measured from the rendered PDF — without it every card spills a
        // blank sheet after itself.
        $slack  = 3.0;
        $pageW  = $abs($cw + $mgV * 2 + $slack);
        $pageH  = $abs($ch + $mgV * 2 + $slack);
        $margin = $abs($mgV);

        $cardW  = $abs($cw);
        $cardH  = $abs($ch);
        $spineW = $mm(12);                 // design unit — scales
        $mainW  = $abs($cw - 12 * $k);     // whatever the spine leaves

        $photoW  = $mm(24);
        $photoH  = $mm(30);
        $photoFs = $pt(15);
        $qrMm    = max(8, (int) round(26 * $k));

        // data-card-photo lets the browser preview JS find and swap in a data URI.
        $photoCell = ($photoSrc !== null && $photoSrc !== '')
            ? '<img data-card-photo="1" src="' . htmlspecialchars((string) $photoSrc, ENT_QUOTES) . '" style="width:' . $photoW . ';height:' . $photoH . ';object-fit:cover;border:1px solid #B5C7E3;" />'
            : '<div data-card-photo="1" style="width:' . $photoW . ';height:' . $photoH . ';border:1px solid #B5C7E3;background:#F0F4FA;color:#2B5FA8;font-size:' . $photoFs . ';font-weight:bold;text-align:center;line-height:' . $photoH . ';">'
                . htmlspecialchars(self::initials($name)) . '</div>';

        $crest   = self::imageDataUri(dirname(__DIR__, 2) . '/public/logo.png');
        $crestImg = $crest ? '<img src="' . $crest . '" style="height:' . $mm(9) . ';" />' : '';
        $crestSm  = $crest ? '<img src="' . $crest . '" style="height:' . $mm(11) . ';" />' : '';
        $qr       = self::qrTag($verifyUrl, $qrMm);

        // ── Scaled CSS values used inside the template below ────────────────
        $bdW      = $pt(2);    $hdBd    = $pt(1.5);  $ftBd    = $pt(1);
        $spFs     = $pt(8);    $spLh    = $mm(3.5);  $spPad   = $mm(2);
        $spGap    = $mm(2.2);
        $hdPad    = $mm(3) . ' ' . $mm(4) . ' ' . $mm(1) . ' ' . $mm(4);
        $uniFs    = $pt(16);   $mottoFs = $pt(8);    $mottoMt = $mm(1);
        $crestMt  = $mm(1);
        $bodyPad  = $mm(3) . ' ' . $mm(4);
        $colW     = $mm(28);
        $nmFs     = $pt(12);   $nmMb    = $mm(1);
        $lblFs    = $pt(9);    $rowMb   = $mm(0.5);
        $scanFs   = $pt(6);    $scanMt  = $mm(0.5);
        $ftPad    = $mm(2) . ' ' . $mm(4);
        $regFs    = $pt(9);    $validFs = $pt(9);
        $bnPad    = $mm(4);    $bnFs    = $pt(9);
        $bhPb     = $mm(2);    $bhUniFs = $pt(14);   $propFs  = $pt(6);
        $ciMy     = $mm(2);    $ciFs    = $pt(9);
        $bfMt     = $mm(2);    $bfPt    = $mm(1);
        $slMy     = $mm(3);    $slFs    = $pt(8);
        $mbFs     = $pt(8);    $mbMt    = $mm(1);
        $noteFs   = $pt(9);

        // Vertical spine — one letter per line (DOMPDF-safe alternative to
        // rotation, which DOMPDF ignores).
        $spineText = 'STUDENT CARD';
        $spine = '';
        foreach (str_split($spineText) as $chr) {
            $spine .= ($chr === ' ')
                ? '<div style="height:' . $mm(2.2) . ';"></div>'
                : '<div>' . $chr . '</div>';
        }
        // Pad the spine down to the card's height. Setting `height` on the cell
        // instead makes DOMPDF add that height to the flow and spill an extra
        // page per card, so the black band is filled with a spacer rather than
        // sized — otherwise it stops three-quarters of the way down.
        $letters   = strlen($spineText) - substr_count($spineText, ' ');
        $spineUsed = (2.0 + $letters * 3.5 + substr_count($spineText, ' ') * 2.2) * $k;
        if ($ch - $spineUsed > 1) {
            $spine .= '<div style="height:' . $abs($ch - $spineUsed) . ';font-size:0;line-height:0;">&nbsp;</div>';
        }

        // The back face is the second printed page. The in-app preview shows a
        // card, not a print run, so it asks for the front alone — two stacked
        // faces in a short iframe cut the front in half.
        $frontOnly = !empty($opts['front_only']);
        $backFace  = $frontOnly ? '' : <<<BACKHTML
        <div style="page-break-after: always; height:0; font-size:0; line-height:0;"></div>

        <!-- ───────── BACK ───────── -->
        <div class="card"><div class="spine">{$spine}</div><div class="main">
            <div class="backnote">
                <div class="back-header">
                    <div style="font-size:6pt; margin-bottom:1mm;">This student card remains a property of</div>
                    <div class="uni">{$institution}</div>
                </div>
                <div class="contact-info">
                    <div><span class="contact-label">Email:</span> catholic.university.rwanda@cur.ac.rw</div>
                    <div><span class="contact-label">Phone:</span> +250733214677</div>
                </div>
                <div style="text-align:center; margin:2mm 0; font-size:9pt; color:#000;">
                    If found please return it to the university
                </div>
                <div class="back-footer">
                    <div class="signature-line" style="margin:3mm 0;">_________________________</div>
                    <div style="font-size:8pt; margin-top:-2mm;">Academic Vice Rector</div>
                    <div class="motto-bottom">Audi et Aude</div>
                </div>
            </div>
        </div></div>
BACKHTML;

        return <<<HTML
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            @page { size: {$pageW} {$pageH}; margin: {$margin}; }
            * { font-family: 'Times New Roman', Times, serif; box-sizing: border-box; }
            body { margin: 0; padding: 0; }
            /* Screen only — browsers ignore @page margins, so without this the
               preview renders flush against the top-left of the iframe. */
            @media screen {
                body { padding: {$margin}; background: #F0F4FA; }
                .card { margin: 0 auto; box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
            }
            /* Every length here is scaled from the 165mm design — see the class
               docblock. Change a number and change it there, not per preset. */
            .card {
                width: {$cardW}; height: {$cardH}; border: {$bdW} solid #0A2A5E;
                background:#fff; margin: 0; display: table;
            }
            .spine {
                width: {$spineW}; background:#000; color:#fff; text-align:center;
                font-weight:bold; font-size:{$spFs}; letter-spacing:1px; line-height:{$spLh};
                vertical-align:top; padding-top:{$spPad}; display: table-cell;
            }
            .main { padding: 0; vertical-align: top; width: {$mainW}; display: table-cell; }
            .card-header { padding: {$hdPad}; text-align:center; border-bottom: {$hdBd} solid #0A2A5E; }
            .uni { color:#0A2A5E; font-weight:bold; font-size:{$uniFs}; letter-spacing:0.5px; line-height:1.2; }
            .motto { color:#0A2A5E; font-style:italic; font-weight:bold; font-size:{$mottoFs}; margin-top:{$mottoMt}; }
            /* Tables, not flexbox: DOMPDF ignores `display:flex`, which stacked
               the photo, details and QR vertically and spilled the card across
               five pages. Browsers render these identically, so the in-app
               preview is unchanged. */
            .card-body { padding: {$bodyPad}; }
            .body-tbl, .footer-tbl { width: 100%; border-collapse: collapse; }
            .body-tbl > tr > td { vertical-align: top; padding: 0; }
            .photo-section { width: {$colW}; text-align:center; vertical-align: top; }
            .info-section { vertical-align: top; }
            .qr-section { width: {$colW}; text-align:center; vertical-align: top; }
            .nm { color:#000; font-weight:bold; font-size:{$nmFs}; margin-bottom:{$nmMb}; }
            .lbl { font-weight:bold; color:#000; font-size:{$lblFs}; }
            .val { color:#1A4A8C; font-size:{$lblFs}; }
            .details-row { margin-bottom:{$rowMb}; }
            .scan { font-size:{$scanFs}; color:#2B5FA8; margin-top:{$scanMt}; }
            .card-footer { padding: {$ftPad}; border-top: {$ftBd} solid #0A2A5E; }
            .footer-tbl > tr > td { vertical-align: middle; padding: 0; }
            .reg { font-size:{$regFs}; }
            .reg .val { font-weight:bold; color:#000; font-size:{$regFs}; }
            .valid { color:#dc2626; font-weight:bold; font-size:{$validFs}; }
            .backnote { padding: {$bnPad}; font-size: {$bnFs}; line-height: 1.6; }
            .back-header { text-align:center; border-bottom: {$hdBd} solid #0A2A5E; padding-bottom:{$bhPb}; }
            .back-header .uni { font-size:{$bhUniFs}; }
            .contact-info { margin: {$ciMy} 0; font-size:{$ciFs}; color:#000; text-align:center; }
            .contact-label { font-weight:bold; }
            .back-footer { margin-top:{$bfMt}; text-align:center; border-top: {$ftBd} solid #0A2A5E; padding-top:{$bfPt}; }
            .signature-line { margin: {$slMy} 0; font-size:{$slFs}; }
            .motto-bottom { font-style:italic; color:#0A2A5E; font-weight:bold; font-size:{$mbFs}; margin-top:{$mbMt}; }
        </style></head><body>

        <!-- ───────── FRONT ───────── -->
        <div class="card"><div class="spine">{$spine}</div><div class="main">
            <div class="card-header">
                <div class="uni">{$institution}</div>
                <div class="motto">Audi et Aude</div>
                <div style="margin-top:{$crestMt};">{$crestImg}</div>
            </div>
            <div class="card-body">
                <table class="body-tbl"><tr>
                    <td class="photo-section">{$photoCell}</td>
                    <td class="info-section">
                        <div class="nm">{$name}</div>
                        {$detailRows}
                    </td>
                    <td class="qr-section">
                        {$qr}
                        <div class="scan">Scan to verify</div>
                    </td>
                </tr></table>
            </div>
            <div class="card-footer">
                <table class="footer-tbl"><tr>
                    <td>
                        <div class="reg"><span class="lbl">Registration No:</span> <span class="val">{$reg}</span></div>
                        <div class="valid">Valid academic year for {$acadYear}</div>
                    </td>
                    <td style="text-align:right;">{$crestSm}</td>
                </tr></table>
            </div>
        </div></div>

        {$backFace}

        </body></html>
        HTML;
    }

    /**
     * One document holding many cards, each starting on a fresh page.
     *
     * Built by reusing buildHtml() per card and keeping only the first
     * document's shell, so the stylesheet is defined exactly once and the
     * batch can never drift from the single-card layout.
     *
     * @param array<int, array{student: array, card: array, opts?: array}> $items
     */
    public static function buildBatchHtml(array $items): string
    {
        if ($items === []) {
            return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
        }

        $shellOpen  = '';
        $shellClose = '</body></html>';
        $bodies     = [];

        foreach ($items as $item) {
            $html = self::buildHtml($item['student'], $item['card'], $item['opts'] ?? []);

            $openAt = strpos($html, '<body>');
            $endAt  = strrpos($html, '</body>');
            if ($openAt === false || $endAt === false) {
                // Shape changed unexpectedly — fall back to the whole document
                // rather than emitting a half-parsed card.
                $bodies[] = $html;
                continue;
            }

            if ($shellOpen === '') {
                $shellOpen = substr($html, 0, $openAt + strlen('<body>'));
            }

            $bodies[] = substr($html, $openAt + strlen('<body>'), $endAt - $openAt - strlen('<body>'));
        }

        $break = '<div style="page-break-after: always;"></div>';

        return $shellOpen . implode($break, $bodies) . $shellClose;
    }

    /** Stream as a landscape PDF (front + back stacked). Falls back to HTML. */
    public static function stream(string $html, string $filename, bool $download = true): never
    {
        if (class_exists('\\Dompdf\\Dompdf')) {
            // Dompdf trips a pile of PHP 8.4 "implicitly nullable parameter"
            // deprecations. With display_errors on (any dev box) they are
            // echoed BEFORE the PDF body, so the download arrives starting
            // with `<br /><b>Deprecated</b>…` and no reader will open it.
            // Buffer everything Dompdf emits and discard it, so only the
            // rendered document reaches the client.
            ob_start();
            try {
                $opts = new \Dompdf\Options();
                $opts->set('isHtml5ParserEnabled', true);
                $opts->set('isRemoteEnabled', true);
                // DOMPDF defaults to the "screen" media type, so it would apply
                // the preview-only @media screen rules and page the card out
                // across seven sheets. This is a print document.
                $opts->set('defaultMediaType', 'print');
                $pdf = new \Dompdf\Dompdf($opts);
                $pdf->loadHtml($html);
                $pdf->setPaper('A4', 'portrait');
                $pdf->render();
                $output = $pdf->output();
            } finally {
                // Drop the notices; never let them prepend the body.
                ob_end_clean();
            }

            header('Content-Type: application/pdf');
            header('Content-Disposition: ' . ($download ? 'attachment' : 'inline')
                . '; filename="' . addslashes($filename) . '"');
            header('Content-Length: ' . strlen((string) $output));
            echo $output;
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
    /**
     * Split a postgraduate award into its programme and its specialisation.
     *
     * There is no specialisation column on `student` — the award name carries
     * it: "Master of Public Health in Maternal and Child Health" is a Master of
     * Public Health specialising in Maternal and Child Health. Splitting on the
     * first " in " reproduces exactly the split the printed cards use.
     *
     * Names with no " in " ("Master of Education Technology and Instructional
     * Design") have no specialisation to show, and return the whole name with
     * an empty second element so the caller can omit the row rather than print
     * an empty label.
     *
     * @return array{0: string, 1: string} [programme, specialisation]
     */
    private static function splitAward(string $award): array
    {
        $award = trim(preg_replace('/\s+/u', ' ', $award) ?? $award);
        if ($award === '') {
            return ['', ''];
        }
        // Case-insensitive so "Master of Science In Human Nutrition" splits too.
        $parts = preg_split('/\s+in\s+/iu', $award, 2);
        if (!is_array($parts) || count($parts) < 2 || trim($parts[1]) === '') {
            return [$award, ''];
        }
        return [trim($parts[0]), trim($parts[1])];
    }

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

    /**
     * Render the verification QR as a self-contained data URI.
     *
     * Constant names matter here and are version-specific: chillerlan/php-qrcode
     * v4 (what composer.lock pins, 4.4.2) puts the output modes on QRCode as
     * OUTPUT_IMAGE_PNG / OUTPUT_MARKUP_SVG and base64-encodes via `imageBase64`.
     * QROutputInterface::GDIMAGE_PNG and `outputBase64` are the v5 spellings —
     * referencing them on v4 raises an Error, which the catch below turned into
     * a blank grey box, so every card printed with an empty QR panel and no
     * complaint. Log the failure rather than swallowing it, so the next
     * breakage is visible instead of shipping on thousands of ID cards.
     */
    private static function qrTag(string $content, int $sizeMm): string
    {
        try {
            $opts = new QROptions([
                'outputType'  => extension_loaded('gd')
                    ? QRCode::OUTPUT_IMAGE_PNG
                    : QRCode::OUTPUT_MARKUP_SVG,
                'imageBase64' => true,
                'scale'       => 5,
                'eccLevel'    => QRCode::ECC_M,
            ]);
            return '<img src="' . (new QRCode($opts))->render($content) . '" style="width:' . $sizeMm . 'mm;height:' . $sizeMm . 'mm;" />';
        } catch (\Throwable $e) {
            error_log('[StudentIdCardHelper] QR render failed: ' . $e->getMessage());
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
