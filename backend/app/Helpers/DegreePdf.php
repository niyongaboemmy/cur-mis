<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates official CUR Degree/Diploma certificates as PDF.
 * Same rendering for preview and download.
 */
class DegreePdf
{
    public const TYPE_BACHELOR = 'bachelor';
    public const TYPE_PGDE = 'pgde';
    public const TYPE_MASTERS = 'masters';
    public const TYPE_PHD = 'phd';

    public static function buildHtml(
        array $student,
        string $type = self::TYPE_BACHELOR,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        return match($type) {
            self::TYPE_BACHELOR => self::buildBachelorDegree($student, $programme, $grade, $graduationDate),
            self::TYPE_PGDE => self::buildPgdeDiploma($student),
            self::TYPE_MASTERS, self::TYPE_PHD => self::buildUndergraduateDegree($student, $programme, $grade, $graduationDate),
            default => self::buildBachelorDegree($student, $programme, $grade, $graduationDate),
        };
    }

    /**
     * Bachelor's Degree Certificate - Professional design
     */
    private static function buildBachelorDegree(
        array $student,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        $name = htmlspecialchars(strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''))), ENT_QUOTES);
        $regNo = htmlspecialchars($student['regnumber'] ?? '', ENT_QUOTES);
        $faculty = htmlspecialchars($student['fac_name'] ?? $student['faculty'] ?? '', ENT_QUOTES);
        $programme = htmlspecialchars(strtoupper($programme ?: ($student['dep_name'] ?? '')), ENT_QUOTES);
        // A degree carries a *classification*, not a grade — "Grade: Second
        // Class Honours, Upper Division (2i)" reads as a marking error on a
        // document that is checked by employers and foreign registries.
        $gradeText = $grade ? " | Class: {$grade}" : '';
        $date = htmlspecialchars($graduationDate ?: 'to be determined', ENT_QUOTES);
        $programmeText = $programme ? "BACHELOR'S DEGREE IN {$programme}" : 'BACHELOR\'S DEGREE';

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Degree Certificate</title>
<style>
html { margin: 0; padding: 0; width: 100%; }
body { margin: 0; padding: 0.5in; width: auto; font-family: 'Times New Roman', serif; background: white; }
.container { width: 6.5in; margin: 0 auto; padding: 0; }
.cert { border: 1px solid #333; padding: 0.7in 0.9in; background: white; text-align: center; page-break-after: avoid; }
.logo { font-size: 11pt; font-weight: bold; letter-spacing: 0.08in; color: #1a5d2f; margin-bottom: 0.3in; }
.title { font-size: 42pt; font-weight: bold; color: #2b7fb5; margin: 0.15in 0; line-height: 0.9; }
.subtitle { font-size: 11pt; font-style: italic; color: #333; margin: 0.15in 0 0.25in; }
.name { font-size: 15pt; font-weight: bold; text-decoration: underline; margin: 0.3in 0 0.1in; letter-spacing: 0.02in; }
.reg-no { font-size: 9pt; color: #555; margin-bottom: 0.3in; }
.body-text { font-size: 10pt; line-height: 1.6; margin: 0.15in 0; color: #1a1a1a; }
.programme { font-weight: bold; }
.signatures { display: flex; justify-content: space-between; margin: 0.5in 0 0; padding-top: 0.3in; border-top: 1px solid #ddd; }
.sig { flex: 1; text-align: center; }
.sig-space { height: 0.5in; }
.sig-line { border-top: 1px solid #000; }
.sig-name { font-size: 8.5pt; margin-top: 0.05in; font-weight: 500; color: #1a1a1a; }
.footer { text-align: center; margin-top: 0.2in; font-size: 8pt; font-weight: bold; color: #333; }
</style>
</head>
<body>
<div class="container">
  <div class="cert">
    <div class="logo">CATHOLIC UNIVERSITY OF RWANDA</div>
    <div class="title">Degree</div>
    <p class="subtitle">This is to certify that</p>

    <div class="name">{$name}</div>
    <div class="reg-no">Registration No: {$regNo}</div>

    <div class="body-text">
      Having satisfied the requirements for the award of a
    </div>
    <div class="body-text">
      <span class="programme">{$programmeText}</span>{$gradeText}
    </div>

    <div class="body-text" style="margin-top: 0.3in;">
      Has been conferred this degree in the Faculty of {$faculty}<br>
      at the Academic Congregation held at Gisagara on {$date}
    </div>

    <div class="signatures">
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Vice Chancellor</p>
      </div>
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Deputy Vice Chancellor<br>Academic & Research</p>
      </div>
    </div>

    <div class="footer">BD 04232</div>
  </div>
</div>
</body>
</html>
HTML;
    }

    /**
     * PGDE Diploma Certificate - Cream background
     */
    private static function buildPgdeDiploma(array $student): string {
        $name = htmlspecialchars(strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''))), ENT_QUOTES);
        $regNo = htmlspecialchars($student['regnumber'] ?? '', ENT_QUOTES);

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Diploma Certificate</title>
<style>
html { margin: 0; padding: 0; width: 100%; }
body { margin: 0; padding: 0.5in; width: auto; font-family: 'Times New Roman', serif; background: #f5ede2; }
.container { width: 6.5in; margin: 0 auto; padding: 0; }
.cert { border: 1px solid #333; padding: 0.7in 0.9in; background: #f5ede2; text-align: center; page-break-after: avoid; }
.logo { font-size: 11pt; font-weight: bold; letter-spacing: 0.08in; color: #1a5d2f; margin-bottom: 0.15in; }
.title { font-size: 42pt; font-weight: bold; color: #333; margin: 0.15in 0; line-height: 0.9; }
.subtitle { font-size: 11pt; font-style: italic; color: #333; margin: 0.15in 0 0.25in; }
.name { font-size: 15pt; font-weight: bold; text-decoration: underline; margin: 0.3in 0 0.1in; letter-spacing: 0.02in; }
.reg-no { font-size: 9pt; color: #555; margin-bottom: 0.3in; }
.body-text { font-size: 10pt; line-height: 1.6; margin: 0.15in 0; color: #1a1a1a; }
.programme { font-weight: bold; }
.signatures { display: flex; justify-content: space-between; margin: 0.5in 0 0; padding-top: 0.3in; border-top: 1px solid #ddd; }
.sig { flex: 1; text-align: center; }
.sig-space { height: 0.5in; }
.sig-line { border-top: 1px solid #000; }
.sig-name { font-size: 8.5pt; margin-top: 0.05in; font-weight: 500; color: #1a1a1a; }
.footer { text-align: center; margin-top: 0.2in; font-size: 8pt; font-weight: bold; color: #666; }
</style>
</head>
<body>
<div class="container">
  <div class="cert">
    <div class="logo">CATHOLIC UNIVERSITY OF RWANDA</div>
    <div class="title">Diploma</div>
    <p class="subtitle">This is to certify that</p>

    <div class="name">{$name}</div>
    <div class="reg-no">Registration No: {$regNo}</div>

    <div class="body-text">
      Having satisfied the requirements for the award of a
    </div>
    <div class="body-text">
      <span class="programme">POSTGRADUATE DIPLOMA IN EDUCATION</span>
    </div>

    <div class="body-text" style="margin-top: 0.3in;">
      Has been conferred this diploma<br>
      at the Academic Congregation held on this second day of July, two thousand twenty-five
    </div>

    <div class="signatures">
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Vice Chancellor</p>
      </div>
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Deputy Vice Chancellor<br>Academic & Research</p>
      </div>
    </div>

    <div class="footer">PGDE 00558</div>
  </div>
</div>
</body>
</html>
HTML;
    }

    /**
     * Undergraduate Degree Certificate - Cream background
     */
    private static function buildUndergraduateDegree(
        array $student,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        $name = htmlspecialchars(strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? ''))), ENT_QUOTES);
        $regNo = htmlspecialchars($student['regnumber'] ?? '', ENT_QUOTES);
        $programme = htmlspecialchars(strtoupper($programme ?: ($student['dep_name'] ?? '')), ENT_QUOTES);
        // A degree carries a *classification*, not a grade — "Grade: Second
        // Class Honours, Upper Division (2i)" reads as a marking error on a
        // document that is checked by employers and foreign registries.
        $gradeText = $grade ? " | Class: {$grade}" : '';
        $date = htmlspecialchars($graduationDate ?: 'to be determined', ENT_QUOTES);
        $programmeText = $programme ? "BACHELOR WITH HONOURS IN {$programme}" : 'BACHELOR WITH HONOURS';

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Degree Certificate</title>
<style>
html { margin: 0; padding: 0; width: 100%; }
body { margin: 0; padding: 0.5in; width: auto; font-family: 'Times New Roman', serif; background: #f5ede2; }
.container { width: 6.5in; margin: 0 auto; padding: 0; }
.cert { border: 1px solid #333; padding: 0.7in 0.9in; background: #f5ede2; text-align: center; page-break-after: avoid; }
.logo { font-size: 11pt; font-weight: bold; letter-spacing: 0.08in; color: #1a5d2f; margin-bottom: 0.15in; }
.logo-badge { font-size: 18pt; color: #1a5d2f; margin: 0.08in 0; letter-spacing: 0.15in; }
.title { font-size: 42pt; font-weight: bold; color: #2d6b3f; margin: 0.15in 0; line-height: 0.9; }
.subtitle { font-size: 11pt; font-style: italic; color: #333; margin: 0.15in 0 0.25in; }
.name { font-size: 15pt; font-weight: bold; text-decoration: underline; margin: 0.3in 0 0.1in; letter-spacing: 0.02in; }
.reg-no { font-size: 9pt; color: #555; margin-bottom: 0.3in; }
.body-text { font-size: 10pt; line-height: 1.6; margin: 0.15in 0; color: #1a1a1a; }
.programme { font-weight: bold; }
.signatures { display: flex; justify-content: space-between; margin: 0.5in 0 0; padding-top: 0.3in; border-top: 1px solid #ddd; }
.sig { flex: 1; text-align: center; }
.sig-space { height: 0.5in; }
.sig-line { border-top: 1px solid #000; }
.sig-name { font-size: 8.5pt; margin-top: 0.05in; font-weight: 500; color: #1a1a1a; }
.footer { text-align: center; margin-top: 0.2in; font-size: 8pt; font-weight: bold; color: #666; }
</style>
</head>
<body>
<div class="container">
  <div class="cert">
    <div class="logo">CATHOLIC UNIVERSITY OF RWANDA</div>
    <div class="title">Degree</div>
    <p class="subtitle">This is to certify that</p>

    <div class="name">{$name}</div>
    <div class="reg-no">Registration No: {$regNo}</div>

    <div class="body-text">
      Having satisfied the requirements for the award of a
    </div>
    <div class="body-text">
      <span class="programme">{$programmeText}</span>{$gradeText}
    </div>

    <div class="body-text" style="margin-top: 0.3in;">
      Has been conferred this degree<br>
      at the Academic Congregation held on {$date}
    </div>

    <div class="signatures">
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Vice Chancellor</p>
      </div>
      <div class="sig">
        <div class="sig-space"></div>
        <div class="sig-line"></div>
        <p class="sig-name">Deputy Vice Chancellor<br>Academic & Research</p>
      </div>
    </div>

    <div class="footer">BD 04248</div>
  </div>
</div>
</body>
</html>
HTML;
    }

    public static function streamPdf(
        array $student,
        string $type = self::TYPE_BACHELOR,
        string $programme = '',
        string $grade = '',
        string $graduationDate = '',
        string $filename = 'degree-certificate.pdf'
    ): void {
        $html = self::buildHtml($student, $type, $programme, $grade, $graduationDate);

        if (class_exists('\Dompdf\Dompdf')) {
            $options = new \Dompdf\Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', true);
            $options->set('defaultFont', 'Times New Roman');
            $options->set('baseUrl', dirname(__DIR__, 2) . '/public/');

            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            $dompdf->stream($filename, ['Attachment' => false]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    public static function renderPdfBinary(
        array $student,
        string $type = self::TYPE_BACHELOR,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): ?string {
        if (!class_exists('\Dompdf\Dompdf')) {
            return null;
        }

        $html = self::buildHtml($student, $type, $programme, $grade, $graduationDate);
        $options = new \Dompdf\Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', true);
        $options->set('defaultFont', 'Times New Roman');
        $options->set('baseUrl', dirname(__DIR__, 2) . '/public/');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }
}
