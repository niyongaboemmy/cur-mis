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
             LEFT JOIN faculty     f   ON CAST(f.fac_id  AS CHAR) COLLATE utf8mb4_unicode_ci = s.faculty COLLATE utf8mb4_unicode_ci
             LEFT JOIN departements d  ON CAST(d.dep_id  AS CHAR) COLLATE utf8mb4_unicode_ci = s.department COLLATE utf8mb4_unicode_ci
             LEFT JOIN options      o  ON CAST(o.id      AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
             LEFT JOIN dep_options  dop ON CAST(dop.op_id AS CHAR) COLLATE utf8mb4_unicode_ci = s.std_option COLLATE utf8mb4_unicode_ci
                                      AND o.id IS NULL
             WHERE s.id = ?
             LIMIT 1",
            [$id]
        );
    }

    // ─── Shared layout parts ──────────────────────────────────────────────────

    /**
     * Repeating CUR letterhead, shown at the top of every page.
     * Pair the returned markup with {@see PdfLayout::pageCss()} in the
     * document's <style> block so DOMPDF reserves room for it on each page.
     */
    private static function headerHtml(): string
    {
        return PdfLayout::headerHtml();
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
        $pageCss    = PdfLayout::pageCss(44, 28);
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
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 0;
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
        $pageCss    = PdfLayout::pageCss(44, 28);
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
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 0;
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
        $pageCss    = PdfLayout::pageCss(36, 22);
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
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 9.5pt;
            color: #000;
            padding: 0;
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

    public static function buildEnglishProficiencyCertificate(array $s, bool $preview = false): string
    {
        $header    = self::headerHtml();
        $pageCss   = PdfLayout::pageCss(30, 20);
        $fullName  = strtoupper(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
        $regnumber = htmlspecialchars($s['regnumber'] ?? '—', ENT_QUOTES);
        $today     = date('d F Y');
        $issueLoc  = 'TABA';

        $qr = self::qrHtml("https://mis.cur.ac.rw/verify?doc=eng-prof&reg={$s['regnumber']}&d=" . date('Ymd'), 80);

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
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 0;
            position: relative;
          }
          .outer-border {
            border: 6px double #1a3a6b;
            padding: 30px 40px 28px 40px;
            min-height: 600px;
            position: relative;
          }
          .heading     { text-align:center; font-size:12pt; margin-bottom:6px; }
          .title       { text-align:center; font-size:16pt; font-weight:bold;
                         text-decoration:underline; margin:12px 0 28px; letter-spacing:0.5px; }
          .body-text   { text-align:justify; font-size:11.5pt; line-height:1.8;
                         margin-bottom:36px; }
          .date-line   { text-align:center; margin-bottom:32px; font-size:11pt; }
          .sign-block  { text-align:center; }
          .sign-name   { font-weight:bold; font-size:11.5pt; }
          .sign-title  { font-size:11pt; font-style:italic; margin-bottom:16px; }
          .tagline     { text-align:center; font-style:italic; font-size:11pt; margin-top:20px; }
          .qr-wrap     { position:absolute; bottom:30px; right:40px; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}
          <div class="outer-border">
            <p class="heading">Office of the Academic Registrar</p>
            <p class="title">ENGLISH PROFICIENCY CERTIFICATE</p>

            <p class="body-text">
              This is to certify that the student <strong>{$fullName}</strong>,
              Registration number <strong>{$regnumber}</strong>, has successfully
              completed all modules for undergraduate studies at
              <strong>Catholic University of Rwanda</strong> where the medium
              of instruction is <strong>English</strong>.
            </p>

            <p class="date-line">Done at {$issueLoc} on {$today}</p>

            <div class="sign-block">
              <p class="sign-name">MUTAYOMBA Sylvestre</p>
              <p class="sign-title">Academic Registrar</p>
            </div>

            <div class="qr-wrap">{$qr}</div>

            <p class="tagline"><em>AUDI ET AUDE</em></p>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Fetch all module marks for a student.
     * Returns rows with module_code, module_name, level, module_credits, percentage, grade, is_exempted.
     */
    public static function fetchStudentModules(string $regnumber): array
    {
        $db = Database::getInstance();

        return $db->fetchAll(
            "SELECT m.module_code, m.module_name, m.level, m.module_credits,
                    mm.percentage, mm.grade
             FROM module_marks mm
             LEFT JOIN modules m ON m.module_id = mm.module_id
             WHERE mm.student_regnumber = ?
               AND mm.percentage IS NOT NULL
             ORDER BY m.level ASC, m.module_code ASC",
            [$regnumber]
        );
    }

    public static function buildCompletedModulesReport(array $s, array $modules, bool $preview = false): string
    {
        $header     = self::headerHtml();
        $pageCss    = PdfLayout::pageCss(40, 28);
        $fullName   = strtoupper(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
        $regnumber  = htmlspecialchars($s['regnumber'] ?? '—', ENT_QUOTES);
        $faculty    = htmlspecialchars(
            isset($s['fac_name']) && $s['fac_name'] !== ''
                ? 'Faculty of ' . self::normalizeFacultyName($s['fac_name'])
                : ($s['faculty'] ?? '—'),
            ENT_QUOTES
        );
        $department = htmlspecialchars($s['dep_name']   ?? $s['department'] ?? '—', ENT_QUOTES);
        $option     = htmlspecialchars($s['option_name'] ?? '-', ENT_QUOTES);
        $today      = date('d-m-y');
        $issueLoc   = 'TABA';

        $qr = self::qrHtml(
            "https://mis.cur.ac.rw/verify?doc=modules&reg={$s['regnumber']}&d=" . date('Ymd'),
            72
        );

        // Build table rows and compute totals
        $tableRows    = '';
        $totalModules = 0;
        $totalCredits = 0;
        $levelGroups  = [];  // level → [credits, passed, failed]

        if (empty($modules)) {
            $tableRows = '<tr><td colspan="6" style="text-align:center;color:#777;padding:8px 0;">
                            No modules with marks found.
                          </td></tr>';
        } else {
            foreach ($modules as $r) {
                $code     = htmlspecialchars($r['module_code'] ?? '', ENT_QUOTES);
                $name     = htmlspecialchars($r['module_name'] ?? '', ENT_QUOTES);
                $level    = htmlspecialchars($r['level'] ?? '', ENT_QUOTES);
                $credits  = (int) ($r['module_credits'] ?? 0);
                $pct      = $r['percentage'] !== null ? (float) $r['percentage'] : null;
                $grade    = htmlspecialchars($r['grade'] ?? '—', ENT_QUOTES);

                if ($pct !== null) {
                    $marksDisplay  = (string) round($pct) . '%';
                    $statusDisplay = $pct >= 50
                        ? '<span style="color:#1a7a1a;font-weight:bold;">Pass</span>'
                        : '<span style="color:#cc0000;font-weight:bold;">Fail</span>';
                } else {
                    $marksDisplay  = '—';
                    $statusDisplay = '—';
                }

                $tableRows .= "<tr>
                    <td>{$code}</td>
                    <td>{$name}</td>
                    <td style=\"text-align:center;\">{$level}</td>
                    <td style=\"text-align:center;\">{$credits}</td>
                    <td style=\"text-align:center;\">{$marksDisplay}</td>
                    <td style=\"text-align:center;\">{$statusDisplay}</td>
                </tr>";

                $totalModules++;
                if (!$exempt) $totalCredits += $credits;

                $lvl = $r['level'] ?? 'N/A';
                if (!isset($levelGroups[$lvl])) {
                    $levelGroups[$lvl] = ['credits' => 0, 'passed' => 0, 'failed' => 0, 'exempted' => 0];
                }
                if ($exempt) {
                    $levelGroups[$lvl]['exempted']++;
                } elseif ($pct !== null) {
                    $levelGroups[$lvl]['credits'] += $credits;
                    if ($pct >= 50) $levelGroups[$lvl]['passed']++;
                    else            $levelGroups[$lvl]['failed']++;
                }
            }
        }

        // Level breakdown rows
        $levelRows = '';
        if (!empty($levelGroups)) {
            foreach ($levelGroups as $lvl => $data) {
                $lvlEsc   = htmlspecialchars((string) $lvl, ENT_QUOTES);
                $levelRows .= "<tr>
                    <td style=\"padding:3px 8px;\">Level {$lvlEsc}</td>
                    <td style=\"padding:3px 8px;text-align:center;\">{$data['credits']} credits</td>
                    <td style=\"padding:3px 8px;text-align:center;color:#1a7a1a;\">{$data['passed']} passed</td>
                    <td style=\"padding:3px 8px;text-align:center;color:#cc0000;\">{$data['failed']} failed</td>
                    <td style=\"padding:3px 8px;text-align:center;color:#555;\">{$data['exempted']} exempted</td>
                </tr>";
            }
        } else {
            $levelRows = '<tr><td colspan="5" style="color:#777;padding:4px 8px;">No level data.</td></tr>';
        }

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
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 10.5pt;
            color: #000;
            padding: 0;
            position: relative;
          }
          .doc-title   { text-align:center; font-weight:bold; font-size:13pt;
                         margin:10px 0 16px; }
          .info-lbl    { font-weight:bold; }
          .modules-tbl { width:100%; border-collapse:collapse; margin:14px 0; font-size:9.5pt; }
          .modules-tbl th {
            background:#1a3a6b; color:#fff; padding:5px 8px;
            border:1px solid #1a3a6b; font-size:9.5pt; text-align:left;
          }
          .modules-tbl td {
            border:1px solid #ccc; padding:4px 8px; vertical-align:middle;
          }
          .modules-tbl tr:nth-child(even) td { background:#f5f7fa; }
          .totals      { margin:8px 0; font-size:10.5pt; }
          .total-line  { font-weight:bold; margin-bottom:4px; }
          .breakdown   { margin-top:14px; }
          .breakdown-tbl { border-collapse:collapse; font-size:9.5pt; margin-top:6px; }
          .breakdown-tbl td { padding:3px 8px; }
          .sign-block  { margin-top:22px; }
          .sign-name   { font-weight:bold; font-size:11pt; }
          .tagline     { text-align:center; font-style:italic; margin-top:16px; font-size:10.5pt; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}

          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px;">
            <tr>
              <td style="vertical-align:top;">
                <p class="doc-title">Completed Modules Report</p>
                <p><span class="info-lbl">Name:</span> {$fullName}</p>
                <p><span class="info-lbl">Reg Number:</span> {$regnumber}</p>
                <p><span class="info-lbl">Faculty:</span> {$faculty}</p>
                <p><span class="info-lbl">Department:</span> {$department}</p>
                <p><span class="info-lbl">Option:</span> {$option}</p>
              </td>
              <td width="80" style="vertical-align:top;text-align:right;">{$qr}</td>
            </tr>
          </table>

          <p style="font-weight:bold;margin-top:10px;">Modules Overview</p>
          <table class="modules-tbl">
            <thead>
              <tr>
                <th>Module Code</th>
                <th>Module Name</th>
                <th style="text-align:center;">Level</th>
                <th style="text-align:center;">Credits</th>
                <th style="text-align:center;">Marks</th>
                <th style="text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              {$tableRows}
            </tbody>
          </table>

          <div class="totals">
            <p class="total-line">Total Modules Covered: {$totalModules} Modules</p>
            <p class="total-line">Total Credits Covered: {$totalCredits} Credits</p>
          </div>

          <div class="breakdown">
            <p style="font-weight:bold;">Level Breakdown</p>
            <table class="breakdown-tbl">
              <tbody>{$levelRows}</tbody>
            </table>
          </div>

          <div class="sign-block">
            <p>Done at {$issueLoc}: {$today}</p>
            <br>
            <p class="sign-name">MUTAYOMBA Sylvestre</p>
            <p>Academic Registrar</p>
          </div>

          <p class="tagline"><em>Audi et Aude</em></p>
        </body>
        </html>
        HTML;
    }

    /**
     * Build the exemption letter from user-submitted data (module rows, dean details, etc.).
     * Signature: array $s (student data from fetchStudentData),
     *           array $letter (user form data with rows, dean name/title, etc.)
     *           bool $preview (adds watermark)
     *
     * Letter data shape: {
     *   source_institution, source_faculty?, target_level, academic_year,
     *   issue_location, dean_name, dean_title,
     *   rows: [{ cur_module_label, other_module_title, level, credits, marks }]
     * }
     */
    public static function buildExemptionLetter(array $s, array $letter, bool $preview = false): string
    {
        $header     = self::headerHtml();
        $pageCss    = PdfLayout::pageCss(44, 28);
        $fullName   = strtoupper(trim(($s['fname'] ?? '') . ' ' . ($s['lname'] ?? '')));
        $regnumber  = htmlspecialchars($s['regnumber'] ?? '—', ENT_QUOTES);
        $faculty    = htmlspecialchars($s['fac_name']   ?? $s['faculty']    ?? '', ENT_QUOTES);
        $department = htmlspecialchars($s['dep_name']   ?? $s['department'] ?? '', ENT_QUOTES);

        // Extract from letter data, with sensible defaults
        $sourceInstitution = htmlspecialchars(trim((string)($letter['source_institution'] ?? '')), ENT_QUOTES);
        $sourceFaculty     = htmlspecialchars(trim((string)($letter['source_faculty'] ?? '')), ENT_QUOTES);
        $targetLevel       = htmlspecialchars(trim((string)($letter['target_level'] ?? '')), ENT_QUOTES);
        $academicYear      = htmlspecialchars(trim((string)($letter['academic_year'] ?? '')), ENT_QUOTES);
        $issueLoc          = htmlspecialchars(trim((string)($letter['issue_location'] ?? 'TABA')), ENT_QUOTES);
        $deanName          = htmlspecialchars(trim((string)($letter['dean_name'] ?? '')), ENT_QUOTES);
        $deanTitle         = htmlspecialchars(trim((string)($letter['dean_title'] ?? '')), ENT_QUOTES);
        $today             = date('d/m/Y');

        // Build table rows and compute total credits
        $tableRows    = '';
        $totalCredits = 0;
        $rowNum       = 1;

        $rows = (array)($letter['rows'] ?? []);
        if (empty($rows)) {
            $tableRows = '<tr><td colspan="6" style="text-align:center;padding:12px;color:#777;">
                            No transferred modules recorded.
                          </td></tr>';
        } else {
            foreach ($rows as $row) {
                $rowNo              = (int)$rowNum;
                $curModuleLabel     = htmlspecialchars(trim((string)($row['cur_module_label'] ?? '')), ENT_QUOTES);
                $otherModuleTitle   = htmlspecialchars(trim((string)($row['other_module_title'] ?? '')), ENT_QUOTES);
                $level              = htmlspecialchars(trim((string)($row['level'] ?? '')), ENT_QUOTES);
                $credits            = (int)($row['credits'] ?? 0);
                $marks              = htmlspecialchars(trim((string)($row['marks'] ?? '')), ENT_QUOTES);

                $tableRows .= "<tr>
                    <td style=\"text-align:center;width:30px;\">{$rowNo}</td>
                    <td>{$curModuleLabel}</td>
                    <td>{$otherModuleTitle}</td>
                    <td style=\"text-align:center;\">{$level}</td>
                    <td style=\"text-align:center;\">{$credits}</td>
                    <td style=\"text-align:center;\">{$marks}</td>
                </tr>";

                $totalCredits += $credits;
                $rowNum++;
            }
        }

        $qr = self::qrHtml(
            "https://mis.cur.ac.rw/verify?doc=exemption&reg={$s['regnumber']}&d=" . date('Ymd'),
            72
        );

        $previewWatermark = $preview
            ? '<div style="position:fixed;top:38%;left:10%;color:rgba(200,0,0,0.08);
                           font-size:90pt;font-weight:bold;transform:rotate(-30deg);
                           pointer-events:none;z-index:0;white-space:nowrap;">PREVIEW</div>'
            : '';

        $optionalSourceFaculty = $sourceFaculty !== ''
            ? "<div class=\"info-row\">\n            <span class=\"info-label\">Source Faculty:</span>\n            <span>{$sourceFaculty}</span>\n          </div>"
            : '';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            padding: 0;
            line-height: 1.6;
            position: relative;
          }
          .doc-title   { text-align:center; font-weight:bold; font-size:13pt;
                         margin:12px 0 16px; text-decoration:underline; }
          .info-row    { margin-bottom:10px; }
          .info-label  { font-weight:bold; display:inline-block; width:140px; }
          .exemption-tbl { width:100%; border-collapse:collapse; margin:16px 0; font-size:10pt; }
          .exemption-tbl th {
            background:#2c3e50; color:#fff; padding:6px 8px;
            border:1px solid #2c3e50; font-size:10pt; text-align:left;
            font-weight:bold;
          }
          .exemption-tbl td {
            border:1px solid #bbb; padding:5px 8px; vertical-align:middle;
          }
          .exemption-tbl tr:nth-child(even) td { background:#f9fafb; }
          .totals      { margin:14px 0; font-size:11pt; }
          .total-line  { font-weight:bold; margin-bottom:6px; }
          .note        { margin:16px 0; font-size:10.5pt; text-align:justify; }
          .sign-block  { margin-top:28px; }
          .sign-name   { font-weight:bold; font-size:11pt; margin-top:12px; }
          .tagline     { text-align:center; font-style:italic; margin-top:16px; font-size:10.5pt; }
          .qr-section  { text-align:right; margin-top:20px; }
        </style>
        </head>
        <body>
          {$previewWatermark}
          {$header}

          <div class="doc-title">EXEMPTION LETTER</div>

          <div class="info-row">
            <span class="info-label">Student Name:</span>
            <span>{$fullName}</span>
          </div>

          <div class="info-row">
            <span class="info-label">Registration Number:</span>
            <span>{$regnumber}</span>
          </div>

          <div class="info-row">
            <span class="info-label">Faculty:</span>
            <span>{$faculty}</span>
          </div>

          <div class="info-row">
            <span class="info-label">Department:</span>
            <span>{$department}</span>
          </div>

          <div class="info-row">
            <span class="info-label">Prior Institution:</span>
            <span>{$sourceInstitution}</span>
          </div>
          {$optionalSourceFaculty}

          <div class="info-row">
            <span class="info-label">Target Level:</span>
            <span>{$targetLevel}</span>
          </div>

          <div class="info-row">
            <span class="info-label">Academic Year:</span>
            <span>{$academicYear}</span>
          </div>

          <p class="note">
            After a thorough examination of the Transcript from {$sourceInstitution}, the Faculty recommends the student
            to be registered as a full-time/part-time student. The student is exempted for the
            credits as detailed in the table below:
          </p>

          <table class="exemption-tbl">
            <thead>
              <tr>
                <th style="width:30px;">No.</th>
                <th>Module Title and Code (CUR)</th>
                <th>Module Title (Prior Institution)</th>
                <th>Level</th>
                <th>Transferred Credits</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {$tableRows}
            </tbody>
          </table>

          <div class="totals">
            <p class="total-line">Total number of transferred credits: {$totalCredits}</p>
          </div>

          <p style="font-size:10pt;color:#555;">
            NB: Number of credits for the entire program: 480/510
          </p>

          <div class="sign-block">
            <p>Done at {$issueLoc} on {$today}</p>
            <p class="sign-name">{$deanName}</p>
            <p>{$deanTitle}</p>
          </div>

          <div class="qr-section">
            {$qr}
          </div>

          <p class="tagline"><em>Audi et Aude</em></p>
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
            PdfLayout::stampHeader($pdf);
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

    /**
     * Build an HTML fee invoice/bill statement for a student.
     *
     * @param array $student Student info (regnumber, fname, lname, fac_name, dep_name, current_level, acc_year)
     * @param array $invoiceLines Array of invoice line items (fee_type, label, amount_due, amount_paid, balance)
     * @param array $meta Metadata: 'title' (e.g. "Statement of Account"), 'academic_year', 'semester', 'generated_date'
     */
    public static function buildFeeInvoice(array $student, array $invoiceLines, array $meta = []): string
    {
        $title = $meta['title'] ?? 'Statement of Account';
        $acYear = $meta['academic_year'] ?? $student['acc_year'] ?? date('Y');
        $semester = $meta['semester'] ?? null;
        $generatedDate = $meta['generated_date'] ?? date('Y-m-d');

        // Calculate totals
        $totalDue = 0;
        $totalPaid = 0;
        foreach ($invoiceLines as $line) {
            $totalDue += (float)($line['amount_due'] ?? 0);
            $totalPaid += (float)($line['amount_paid'] ?? 0);
        }
        $totalBalance = $totalDue - $totalPaid;

        // Format numbers
        $fmtNum = fn ($n) => number_format((float)$n, 0, '', ',');

        $tbody = '';
        foreach ($invoiceLines as $line) {
            $due = (float)($line['amount_due'] ?? 0);
            $paid = (float)($line['amount_paid'] ?? 0);
            $balance = $due - $paid;
            $tbody .= <<<HTML
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-size: 12px;">{$line['label']}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px;">{$fmtNum($due)} RWF</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px;">{$fmtNum($paid)} RWF</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; font-weight: bold;">{$fmtNum($balance)} RWF</td>
            </tr>
            HTML;
        }

        $statusClass = $totalBalance <= 0 ? 'green' : 'red';
        $statusText = $totalBalance <= 0 ? 'CLEARED' : 'OUTSTANDING';

        $semesterBlock = $semester ? "<label>Semester:</label><value>Semester {$semester}</value>" : '';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{$title}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #333; line-height: 1.4; }
                .page { max-width: 21cm; margin: 0 auto; padding: 20mm; background: white; }
                .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #333; }
                .header h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
                .header p { font-size: 11px; color: #666; margin: 2px 0; }
                .info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 12px; }
                .info-block { }
                .info-block label { font-weight: bold; display: block; margin-bottom: 3px; }
                .info-block value { display: block; margin-bottom: 8px; }
                .title { font-size: 16px; font-weight: bold; margin: 20px 0 10px 0; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                table th { background: #f5f5f5; border: 1px solid #ddd; padding: 10px; text-align: left; font-weight: bold; font-size: 12px; }
                table td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
                .total-row { background: #f9f9f9; font-weight: bold; }
                .status { margin-top: 20px; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; }
                .status.cleared { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .status.outstanding { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="header">
                    <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
                    <p>Management Information System</p>
                </div>

                <div class="info">
                    <div class="info-block">
                        <label>Student Name:</label>
                        <value>{$student['fname']} {$student['lname']}</value>
                        <label>Registration Number:</label>
                        <value>{$student['regnumber']}</value>
                        <label>Program:</label>
                        <value>{$student['dep_name']}</value>
                    </div>
                    <div class="info-block">
                        <label>Level:</label>
                        <value>{$student['current_level']}</value>
                        <label>Academic Year:</label>
                        <value>{$acYear}</value>
                        {$semesterBlock}
                        <label>Generated:</label>
                        <value>{$generatedDate}</value>
                    </div>
                </div>

                <div class="title">{$title}</div>

                <table>
                    <thead>
                        <tr>
                            <th>Fee Description</th>
                            <th style="text-align: right;">Amount Due</th>
                            <th style="text-align: right;">Amount Paid</th>
                            <th style="text-align: right;">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$tbody}
                        <tr class="total-row">
                            <td>TOTAL</td>
                            <td style="text-align: right;">{$fmtNum($totalDue)} RWF</td>
                            <td style="text-align: right;">{$fmtNum($totalPaid)} RWF</td>
                            <td style="text-align: right;">{$fmtNum($totalBalance)} RWF</td>
                        </tr>
                    </tbody>
                </table>

                <div class="status {$statusClass}">
                    Status: {$statusText}
                </div>

                <div class="footer">
                    <p>This is an official document. Generated on {$generatedDate}</p>
                    <p>For inquiries, contact the Finance Office</p>
                </div>
            </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Build the official fee schedule table (14 columns, grouped by faculty).
     * Output is a styled HTML table matching the PDF template layout.
     */
    public static function buildFeeSchedule(array $rows, array $meta = []): string
    {
        $acYear = $meta['academic_year'] ?? date('Y');
        $generatedDate = $meta['generated_date'] ?? date('Y-m-d');

        $fmtNum = fn ($n) => $n !== null ? number_format((float)$n, 0, '', ',') . ' RWF' : '—';

        // Group rows by faculty
        $grouped = [];
        foreach ($rows as $row) {
            $fac = $row['fac_name'] ?? 'Ungrouped';
            if (!isset($grouped[$fac])) {
                $grouped[$fac] = [];
            }
            $grouped[$fac][] = $row;
        }

        $tbody = '';
        $sn = 1;
        foreach ($grouped as $facName => $facRows) {
            // Faculty header row
            $tbody .= <<<HTML
            <tr style="background: #e8e8e8; font-weight: bold; border: 1px solid #ddd;">
                <td colspan="14" style="padding: 10px; border: 1px solid #ddd;">{$facName}</td>
            </tr>
            HTML;

            // Program rows under this faculty
            foreach ($facRows as $row) {
                $progName = $row['option_name'] ?? 'Unknown Program';
                $semesterLabel = $row['semester'] ? 'Semester ' . $row['semester'] : 'Full year';
                $duration = $row['level_name'] ? ' (' . $row['level_name'] . ')' : '';

                $tbody .= <<<HTML
                <tr style="border: 1px solid #ddd;">
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 11px;">{$sn}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-size: 11px;">{$progName}{$duration}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 11px;">{$semesterLabel}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['application_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['registration_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['cursu_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px; font-weight: bold;">{$fmtNum($row['tuition_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['internship_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['final_project_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">{$fmtNum($row['graduation_fee'])}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 11px;">—</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 11px;">—</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">—</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 11px;">—</td>
                </tr>
                HTML;
                $sn++;
            }
        }

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Academic Fees Structure {$acYear}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #333; line-height: 1.3; }
                .page { max-width: 29.7cm; margin: 0 auto; padding: 15mm; background: white; }
                .header { text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 3px; }
                .header p { font-size: 10px; color: #666; margin: 2px 0; }
                .title { font-size: 14px; font-weight: bold; margin: 15px 0 10px 0; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                table th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px; text-align: left; font-weight: bold; font-size: 10px; }
                table td { border: 1px solid #ddd; padding: 8px; font-size: 10px; }
                .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center; }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="header">
                    <h1>CATHOLIC UNIVERSITY OF RWANDA</h1>
                    <p>Academic Fees Structure {$acYear}</p>
                </div>

                <div class="title">Fee Schedule by Faculty and Program</div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 3%;">S/N</th>
                            <th style="width: 18%;">Program</th>
                            <th style="width: 8%;">Duration</th>
                            <th style="width: 8%;">Application Fee</th>
                            <th style="width: 8%;">Registration Fee</th>
                            <th style="width: 8%;">CURSU Fee</th>
                            <th style="width: 8%;">Total Tuition</th>
                            <th style="width: 8%;">Internship Fee</th>
                            <th style="width: 8%;">Final Project Fee</th>
                            <th style="width: 8%;">Graduation Fee</th>
                            <th style="width: 3%;">Semesters</th>
                            <th style="width: 3%;">Internships</th>
                            <th style="width: 5%;">Tuition/Sem</th>
                            <th style="width: 5%;">Tuition/Year</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$tbody}
                    </tbody>
                </table>

                <div class="footer">
                    <p>Academic Year: {$acYear} | Generated: {$generatedDate}</p>
                    <p>For inquiries, contact the Finance Office</p>
                </div>
            </div>
        </body>
        </html>
        HTML;
    }
}
