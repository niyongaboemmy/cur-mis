<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use chillerlan\QRCode\Output\QROutputInterface;

/**
 * Shared helper for generating official CUR student documents.
 *
 * Data fetching is done here via a single comprehensive JOIN query.
 * Each document type has a dedicated static HTML builder method.
 * The stream() method handles DOMPDF rendering with an HTML fallback.
 */
class DocumentHelper
{
    // ─── Data fetching ────────────────────────────────────────────────────────

    /**
     * Fetch all data needed to populate any document template.
     * Joins faculty, department, option, and (via admission_offers) the
     * s.id_card holds the national ID number (16-digit Rwandan ID).
     */
    public static function fetchStudentData(int $id): array|false
    {
        $db = Database::getInstance();

        return $db->fetchOne(
            "SELECT
                s.*,
                f.fac_name,
                d.dep_name,
                COALESCE(o.name, dop.option_name, '') AS option_name
             FROM student s
             LEFT JOIN faculty     f   ON CAST(f.fac_id  AS CHAR) = s.faculty
             LEFT JOIN departements d  ON CAST(d.dep_id  AS CHAR) = s.department
             LEFT JOIN options      o  ON CAST(o.id      AS CHAR) = s.std_option
             LEFT JOIN dep_options  dop ON CAST(dop.op_id AS CHAR) = s.std_option
                                      AND o.id IS NULL
             WHERE s.id = ?
             LIMIT 1",
            [$id]
        );
    }

    // ─── Shared layout parts ──────────────────────────────────────────────────

    /** Returns an <img> data-URI for the CUR letterhead bar, or a CSS fallback. */
    private static function headerHtml(): string
    {
        $imgPath = dirname(__DIR__, 2) . '/../template_docs/header_bar.jpeg';

        if (file_exists($imgPath)) {
            $src = 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($imgPath));
            return '<div style="margin-bottom:18px;">
                        <img src="' . $src . '" style="width:100%;max-height:90px;object-fit:contain;" />
                    </div>';
        }

        // CSS text fallback when image file is missing
        return '<div style="border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:18px;text-align:center;">
                    <strong style="font-size:13pt;font-family:serif;letter-spacing:1px;">
                        CATHOLIC UNIVERSITY OF RWANDA
                    </strong><br>
                    <span style="font-size:8.5pt;">P.o Box 49 Butare/Huye – RWANDA</span><br>
                    <span style="font-size:8pt;">
                        Registry: 250 733 214 677 &nbsp;–&nbsp; Administration: 250 733 214 678<br>
                        email: catholic.university.rwanda@gmail.com &nbsp;|&nbsp; website: www.cur.ac.rw
                    </span>
                </div>';
    }

    /**
     * Returns an <img> tag with a QR code encoded as a PNG data URI.
     * Falls back to an SVG string, then to a placeholder box if GD is absent.
     */
    private static function qrHtml(string $content, int $sizePx = 72): string
    {
        try {
            if (extension_loaded('gd')) {
                $opts = new QROptions([
                    'outputType'  => QROutputInterface::GDIMAGE_PNG,
                    'outputBase64' => true,
                    'scale'        => 5,
                    'eccLevel'     => QRCode::ECC_L,
                ]);
                $uri = (new QRCode($opts))->render($content);
                return '<img src="' . $uri . '" width="' . $sizePx . '" height="' . $sizePx . '" />';
            }

            // SVG fallback (rendered as a data-URI <img> so DOMPDF embeds it).
            $opts = new QROptions([
                'outputType' => QROutputInterface::MARKUP_SVG,
                'eccLevel'   => QRCode::ECC_L,
            ]);
            $uri = (new QRCode($opts))->render($content);
            return '<img src="' . $uri . '" width="' . $sizePx . '" height="' . $sizePx . '" />';

        } catch (\Throwable) {
            return '<div style="width:' . $sizePx . 'px;height:' . $sizePx
                 . 'px;border:1px solid #bbb;font-size:7pt;color:#999;'
                 . 'display:flex;align-items:center;justify-content:center;text-align:center;">QR</div>';
        }
    }

    // ─── Document HTML builders ───────────────────────────────────────────────

    public static function buildAdmissionLetter(array $s, bool $preview = false): string
    {
        $header     = self::headerHtml();
        $fullName   = strtoupper(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
        $today      = date('m-d-Y');
        $facultyRaw = $s['fac_name'] ?? $s['faculty'] ?? '';
        $faculty    = htmlspecialchars(self::normalizeFacultyName($facultyRaw), ENT_QUOTES);
        $department = htmlspecialchars($s['dep_name']   ?? $s['department'] ?? '', ENT_QUOTES);
        $level      = htmlspecialchars($s['current_level'] ?? '', ENT_QUOTES);
        $intake     = htmlspecialchars(self::formatSemester($s['intake'] ?? ''), ENT_QUOTES);
        $program    = htmlspecialchars(ucfirst(strtolower($s['program'] ?? 'Day')), ENT_QUOTES);
        $accYear    = htmlspecialchars($s['acc_year'] ?? date('Y'), ENT_QUOTES);
        $regnumber  = $s['regnumber'] ?? '';

        $qr = self::qrHtml("https://mis.cur.ac.rw/verify?doc=admission&reg={$regnumber}&d={$today}");

        $previewWatermark = $preview
            ? '<div style="position:fixed;top:38%;left:10%;color:rgba(200,0,0,0.08);
                           font-size:90pt;font-weight:bold;transform:rotate(-30deg);
                           pointer-events:none;z-index:0;white-space:nowrap;">PREVIEW</div>'
            : '';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 30px 44px 28px 44px;
            line-height: 1.55;
            position: relative;
          }
          .bold      { font-weight:bold; }
          .for-name  { font-weight:bold; text-decoration:underline; margin:14px 0; }
          .para      { margin-bottom:13px; text-align:justify; }
          .blist     { margin:0 0 13px 22px; }
          .blist li  { margin-bottom:4px; }
          .slist     { margin:3px 0 3px 26px; list-style-type:lower-alpha; }
          .slist li  { margin-bottom:2px; }
          .sign      { margin-top:22px; }
          .cc        { margin-top:18px; }
          .tagline   { text-align:center; font-style:italic; margin-top:16px; font-size:10.5pt; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border-collapse:collapse;">
            <tr>
              <td style="font-weight:bold;vertical-align:top;">OFFICE OF THE ACADEMIC REGISTRAR</td>
              <td width="110" style="text-align:right;vertical-align:top;color:#cc0000;font-size:30pt;font-weight:bold;line-height:1;">COPY</td>
            </tr>
          </table>

          <p class="bold">TABA, {$today}</p>
          <br>
          <p class="bold">Re: Admission Letter</p>
          <br>
          <p class="for-name">For: {$fullName}</p>
          <br>

          <p class="para">
            Referring to your application received on <strong>{$today}</strong> to study at the
            Catholic University of Rwanda, with the recommendations of the Faculty, I am pleased
            to inform you that your request was accepted. You are hence admitted as a Full-Time
            student in the <strong>Faculty of {$faculty}</strong>, Department of
            <strong>{$department}</strong> . Level <strong>{$level} {$intake}</strong>,
            Program: <strong>{$program}</strong>, Academic Year: <strong>{$accYear}</strong>.
          </p>

          <p>However, you will receive your registration number after:</p>
          <ul class="blist">
            <li>Submission of:
              <ol class="slist">
                <li>The index number issued by the Rwanda Allied Health Professional Council
                    (RAHPC) for Biomedical Laboratory Sciences and Public Health and Human
                    Nutrition, or by the National Council of Nurses and Midwives (NCNM)
                    for Nursing and Midwifery.</li>
                <li>The exemption letter if you are an upgrading candidate.</li>
              </ol>
            </li>
            <li>Fulfillment of financial requirements as detailed in the fees structure
                (see attached).</li>
          </ul>

          <p class="para">Yours sincerely,</p>

          <div class="sign">
            <p class="bold">MUTAYOMBA Sylvestre</p>
            <p>Academic Registrar</p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <p>CC:</p>
                <ul class="blist">
                  <li>Dean of Faculty of {$faculty}</li>
                  <li>Academic Vice Rector</li>
                  <li>Director of Administration and Finance</li>
                </ul>
              </td>
              <td width="100" style="text-align:right;vertical-align:top;">
                {$qr}
              </td>
            </tr>
          </table>

          <div style="text-align:right;margin-top:6px;">
            <span style="font-size:7.5pt;color:#555;">Automatically Generated by CUR MIS</span>
          </div>

          <p class="tagline"><em>Audi et Aude</em></p>
        </body>
        </html>
        HTML;
    }

    public static function buildVisaLetter(array $s, bool $preview = false): string
    {
        $header     = self::headerHtml();
        $fullName   = strtoupper(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
        $today      = self::ordinalDate();
        $faculty    = htmlspecialchars($s['fac_name']   ?? $s['faculty']    ?? '', ENT_QUOTES);
        $department = htmlspecialchars($s['dep_name']   ?? $s['department'] ?? '', ENT_QUOTES);
        $option     = htmlspecialchars($s['option_name'] ?? '', ENT_QUOTES);
        $accYear    = htmlspecialchars($s['acc_year'] ?? date('Y'), ENT_QUOTES);
        $regnumber  = htmlspecialchars($s['regnumber'] ?? '—', ENT_QUOTES);
        $nationalId = htmlspecialchars($s['id_card'] ?? '—', ENT_QUOTES);

        $gender  = strtolower($s['gender'] ?? '');
        $he      = ($gender === 'f' || $gender === 'female') ? 'She' : 'He';
        $him     = ($gender === 'f' || $gender === 'female') ? 'her' : 'him';
        $his     = ($gender === 'f' || $gender === 'female') ? 'her' : 'his';

        $qr = self::qrHtml("https://mis.cur.ac.rw/verify?doc=visa&reg={$s['regnumber']}&d=" . date('Ymd'));

        $previewWatermark = $preview
            ? '<div style="position:fixed;top:38%;left:10%;color:rgba(200,0,0,0.08);
                           font-size:90pt;font-weight:bold;transform:rotate(-30deg);
                           pointer-events:none;z-index:0;white-space:nowrap;">PREVIEW</div>'
            : '';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 30px 44px 28px 44px;
            line-height: 1.6;
            position: relative;
          }
          .date-line { text-align:right; margin-bottom:26px; }
          .to-block  { margin-bottom:20px; }
          .re-line   { font-weight:bold; font-size:11.5pt; margin-bottom:16px; }
          .para      { margin-bottom:12px; text-align:justify; }
          .sign      { margin-top:22px; }
          .bold      { font-weight:bold; }
          .cc        { margin-top:18px; }
          .cclist    { margin:4px 0 4px 24px; }
          .cclist li { margin-bottom:2px; }
          .tagline   { text-align:center; font-style:italic; margin-top:16px; font-size:10.5pt; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}

          <p class="date-line">Huye, {$today}</p>

          <div class="to-block">
            <p>To: Director General of Immigration and Emigration</p>
            <p>Huye-Rwanda</p>
          </div>

          <p class="para">Dear Sir,</p>

          <p class="re-line">Re: Recommendation for {$fullName}</p>

          <p class="para">
            I, the undersigned, <strong>MUTAYOMBA Sylvestre</strong>, Academic Registrar of the
            Catholic University of Rwanda (CUR), hereby recommend {$fullName},
            a {$nationalId} citizen with passport number: <strong>{$nationalId}</strong>.
          </p>

          <p class="para">
            {$he}/She registered at our university in the Faculty of {$faculty},
            Department of {$department}, Option of {$option} for the {$accYear} academic year
            and would like to get official documents authorizing {$him}/her to stay in Rwanda
            during {$his}/her studies.
          </p>

          <p class="para">
            {$he}/Her registration number is <strong>{$regnumber}</strong>.
          </p>

          <p class="para">
            For further information don&apos;t hesitate to contact us:<br>
            0780604140 (Ms. GASANGO Liliane, Director of Administration and Finance, CUR.)<br>
            0786891397 (Mr. BIZIMANA Protais, In charge of International students, CUR).
          </p>

          <div class="sign">
            <p class="bold">Mutayomba Sylvestre</p>
            <p>The Academic Registrar</p>
          </div>

          <div class="cc">
            <p>Cc:</p>
            <ul class="cclist">
              <li>DAF</li>
              <li>In charge of International students</li>
            </ul>
          </div>

          <div style="text-align:right;margin-top:36px;">{$qr}</div>

          <p class="tagline"><em>Audi et Aude</em></p>
        </body>
        </html>
        HTML;
    }

    public static function buildRegistrationForm(array $s, bool $preview = false): string
    {
        $header     = self::headerHtml();
        $surname    = htmlspecialchars(strtoupper($s['lname'] ?? ''), ENT_QUOTES);
        $firstName  = htmlspecialchars(strtoupper($s['fname'] ?? ''), ENT_QUOTES);
        $regnumber  = htmlspecialchars($s['regnumber']   ?? '—',    ENT_QUOTES);
        $faculty    = htmlspecialchars($s['fac_name']    ?? $s['faculty']    ?? '', ENT_QUOTES);
        $department = htmlspecialchars($s['dep_name']    ?? $s['department'] ?? '', ENT_QUOTES);
        $option     = htmlspecialchars($s['option_name'] ?? '',                ENT_QUOTES);
        $level      = htmlspecialchars($s['current_level'] ?? '',              ENT_QUOTES);
        $intake     = htmlspecialchars($s['intake']      ?? '',                ENT_QUOTES);
        $program    = htmlspecialchars(strtoupper($s['program'] ?? 'DAY'),     ENT_QUOTES);
        $accYear    = htmlspecialchars($s['acc_year']    ?? date('Y'),         ENT_QUOTES);
        $category   = htmlspecialchars(strtoupper($s['category'] ?? 'FULL'),   ENT_QUOTES);
        $sponsor    = htmlspecialchars(strtoupper($s['sponsor']  ?? ''),       ENT_QUOTES);
        $lastSchool = htmlspecialchars($s['last_school'] ?? $s['last_university'] ?? '', ENT_QUOTES);
        $phone      = htmlspecialchars($s['phone']       ?? '',                ENT_QUOTES);
        $email      = htmlspecialchars($s['email']       ?? '',                ENT_QUOTES);
        $reference  = htmlspecialchars($s['reference']   ?? $s['phone'] ?? '', ENT_QUOTES);
        $today      = date('d/m/Y');

        $classLabel  = $level ? "Level {$level} {$intake}" : $intake;
        $sponsorHtml = $sponsor
            ? ' | <strong>SPONSOR:</strong> ' . $sponsor
            : '';

        $qr = self::qrHtml("https://mis.cur.ac.rw/verify?doc=reg&reg={$s['regnumber']}&d=" . date('Ymd'), 75);

        $previewWatermark = $preview
            ? '<div style="position:fixed;top:38%;left:10%;color:rgba(200,0,0,0.08);
                           font-size:90pt;font-weight:bold;transform:rotate(-30deg);
                           pointer-events:none;z-index:0;white-space:nowrap;">PREVIEW</div>'
            : '';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 9.5pt;
            color: #000;
            padding: 22px 36px 22px 36px;
            position: relative;
          }
          .form-title { text-align:center; font-weight:bold; text-decoration:underline;
                        font-size:11pt; margin:8px 0 12px; }
          .sec-title  { font-weight:bold; font-size:10pt; margin:12px 0 6px; }
          .ftbl       { width:100%; border-collapse:collapse; margin-bottom:7px; }
          .ftbl td    { font-size:9pt; vertical-align:bottom; padding:0 4px 0 0; }
          .lbl        { font-weight:bold; white-space:nowrap; }
          .val        { border-bottom:1px dotted #444; width:100%; }
          .val-sm     { border-bottom:1px dotted #444; width:38%; }
          .sign-line  { border-bottom:1px solid #333; width:200px; margin:22px 0 3px; }
          .appr-line  { border-bottom:1px solid #333; display:inline-block;
                        padding-bottom:1px; margin-top:8px; }
          .tagline    { text-align:center; font-style:italic; margin-top:14px; font-size:10.5pt; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <p style="font-weight:bold;font-size:10pt;margin-bottom:2px;">ACADEMIC VICE-RECTORATE</p>
                <p style="font-weight:bold;font-size:10pt;">OFFICE OF THE REGISTRAR</p>
              </td>
              <td width="84" style="vertical-align:top;text-align:center;border:1px solid #aaa;width:84px;height:100px;font-size:7pt;color:#999;padding:4px;">Photo</td>
            </tr>
          </table>

          <p class="form-title">REGISTRATION FORM</p>

          <p class="sec-title">1. STUDENT IDENTIFICATION</p>

          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">SURNAME:</td>
            <td class="val">{$surname}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">FIRST NAME:</td>
            <td class="val">{$firstName}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">REGISTRATION NUMBER:</td>
            <td class="val">{$regnumber}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">FACULTY:</td>
            <td class="val-sm">{$faculty}</td>
            <td class="lbl" style="width:1%;padding-left:8px;">DEPARTMENT:</td>
            <td class="val">{$department}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">OPTION:</td>
            <td class="val-sm">{$option}</td>
            <td class="lbl" style="width:1%;padding-left:8px;">CLASS:</td>
            <td class="val">{$classLabel}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">PROGRAM:</td>
            <td class="val-sm">{$program}</td>
            <td class="lbl" style="width:1%;padding-left:8px;">ACADEMIC YEAR:</td>
            <td class="val">{$accYear}</td>
          </tr></table>

          <p class="sec-title">2. CATEGORY OF STUDENT</p>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">CATEGORY:</td>
            <td>{$category}{$sponsorHtml}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">STUDENT TYPE:</td>
            <td>FULL TIME</td>
          </tr></table>

          <p class="sec-title">3. HIGHER INSTITUTION INFORMATION</p>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">UNIVERSITY/INSTITUTE:</td>
            <td class="val">{$lastSchool}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">LAST LEVEL:</td>
            <td class="val-sm"></td>
            <td class="lbl" style="width:1%;padding-left:8px;">AVERAGE:</td>
            <td class="val"></td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">CERTIFICATE/DIPLOMA AWARDED:</td>
            <td class="val">--------</td>
          </tr></table>

          <p class="sec-title">4. CONTACTS</p>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">PERSONAL PHONE:</td>
            <td class="val-sm">{$phone}</td>
            <td class="lbl" style="width:1%;padding-left:8px;">E-MAIL:</td>
            <td class="val">{$email}</td>
          </tr></table>
          <table class="ftbl"><tr>
            <td class="lbl" style="width:1%;">REFERENCE:</td>
            <td class="val-sm">{$reference}</td>
            <td class="lbl" style="width:1%;padding-left:8px;">PHONE:</td>
            <td class="val">{$phone}</td>
          </tr></table>

          <div class="sign-line"></div>
          <p>Signature</p>
          <p>Date: {$today}</p>

          <br>
          <p><span class="appr-line">Approved by: NIYONSABA ESPERANCE</span></p>

          <div style="text-align:right;margin-top:18px;">{$qr}</div>

          <p class="tagline"><em>AUDI ET AUDE</em></p>
        </body>
        </html>
        HTML;
    }

    // ─── PDF / HTML streaming ─────────────────────────────────────────────────

    /**
     * Stream the document as PDF (via DOMPDF) or as printable HTML if DOMPDF
     * is unavailable. The browser opens the result inline in its PDF viewer.
     */
    public static function stream(string $html, string $filename): never
    {
        if (class_exists('\\Dompdf\\Dompdf')) {
            $opts = new \Dompdf\Options();
            $opts->set('isHtml5ParserEnabled', true);
            $opts->set('isRemoteEnabled', false);
            $opts->set('defaultFont', 'Times New Roman');

            $pdf = new \Dompdf\Dompdf($opts);
            $pdf->loadHtml($html);
            $pdf->setPaper('A4', 'portrait');
            $pdf->render();
            $pdf->stream($filename, ['Attachment' => 1]); // force download
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . addslashes($filename) . '"');
        echo $html;
        exit;
    }

    // ─── Private utilities ────────────────────────────────────────────────────

    /** "Faculty of Health Sciences" → "Health Sciences" so callers can re-prefix safely. */
    private static function normalizeFacultyName(string $raw): string
    {
        $trim = trim($raw);
        if ($trim === '') return '';
        // Case-insensitive strip of leading "Faculty of "
        if (preg_match('/^faculty\s+of\s+/i', $trim)) {
            return preg_replace('/^faculty\s+of\s+/i', '', $trim);
        }
        return $trim;
    }

    /** "S5" → "Semester 5", "S7&S8" → "S7&S8" (already readable), else pass-through. */
    private static function formatSemester(string $raw): string
    {
        if (preg_match('/^S(\d+)$/i', $raw, $m)) {
            return 'Semester ' . $m[1];
        }
        return $raw;
    }

    /** Returns today formatted as e.g. "May 9th 2026". */
    private static function ordinalDate(): string
    {
        $d  = (int) date('j');
        $sfx = match (true) {
            $d % 100 >= 11 && $d % 100 <= 13 => 'th',
            $d % 10 === 1  => 'st',
            $d % 10 === 2  => 'nd',
            $d % 10 === 3  => 'rd',
            default        => 'th',
        };
        return date('F') . " {$d}{$sfx} " . date('Y');
    }
}
