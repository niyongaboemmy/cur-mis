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
     * Bachelor's Degree Certificate - White background with blue title
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
        $gradeText = $grade ? ", Grade: {$grade}" : '';
        $date = htmlspecialchars($graduationDate ?: 'to be determined', ENT_QUOTES);

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Times New Roman', 'Times', serif; background: white; padding: 40px; text-align: center; }
.cert { border: 3px solid #000; padding: 40px; max-width: 850px; margin: 0 auto; background: white; }
.logo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin-bottom: 20px; color: #1a5d2f; }
.title { font-size: 44px; color: #2b7fb5; font-weight: bold; margin: 15px 0 10px; }
.subtitle { font-size: 13px; font-style: italic; margin: 10px 0; }
.name { font-size: 16px; font-weight: bold; text-decoration: underline; margin: 25px 0; }
.reg-no { font-size: 11px; margin: 10px 0 20px; }
.body { font-size: 11px; line-height: 1.8; margin: 15px 0; }
.signatures { display: flex; justify-content: space-between; margin: 50px 0 0; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 3px; }
.sig-name { font-size: 10px; line-height: 1.4; }
.ref { font-size: 10px; font-weight: bold; margin: 15px 0 0; }
</style>
</head>
<body>
<div class="cert">
  <div class="logo">✦ CATHOLIC UNIVERSITY OF RWANDA ✦</div>
  <div class="title">Degree</div>
  <p class="subtitle">This is to certify that</p>
  <div class="name">{$name}</div>
  <div class="reg-no">Reg. No: {$regNo}</div>
  <div class="body">
    Having satisfied the requirements for the award of <strong>BACHELOR'S DEGREE<br>IN {$programme}</strong>{$gradeText}
  </div>
  <div class="body">
    Was conferred on the Degree in the <strong>Faculty of {$faculty}</strong> at the Congregation held at Gisagara Gymnasium<br>this {$date}.
  </div>
  <div class="signatures">
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Vice Chancellor</p>
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Deputy Vice Chancellor for<br>Academic and Research</p>
    </div>
  </div>
  <div class="ref">BD 04232</div>
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
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Times New Roman', 'Times', serif; background: #f5ede2; padding: 40px; text-align: center; }
.cert { border: 3px solid #000; padding: 40px; max-width: 850px; margin: 0 auto; background: #f5ede2; }
.logo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin-bottom: 20px; color: #1a5d2f; }
.title { font-size: 44px; color: #000; font-weight: bold; margin: 15px 0 10px; }
.subtitle { font-size: 13px; font-style: italic; margin: 10px 0; }
.name { font-size: 16px; font-weight: bold; text-decoration: underline; margin: 25px 0; }
.reg-no { font-size: 11px; margin: 10px 0 20px; }
.body { font-size: 11px; line-height: 1.8; margin: 15px 0; }
.signatures { display: flex; justify-content: space-between; margin: 50px 0 0; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 3px; }
.sig-name { font-size: 10px; line-height: 1.4; }
.ref { font-size: 10px; font-weight: bold; margin: 15px 0 0; }
</style>
</head>
<body>
<div class="cert">
  <div class="logo">✦ CATHOLIC UNIVERSITY OF RWANDA ✦</div>
  <div class="title">Diploma</div>
  <p class="subtitle">This is to certify that</p>
  <div class="name">{$name}</div>
  <div class="reg-no">Reg. No: {$regNo}</div>
  <div class="body">Having satisfied the requirements for the award of</div>
  <div class="body"><strong>POSTGRADUATE DIPLOMA IN EDUCATION</strong></div>
  <div class="body">
    Was conferred on the Diploma at the Congregation held at Huye this second day of July two thousand twenty-five.
  </div>
  <div class="signatures">
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Vice Chancellor</p>
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Deputy Vice Chancellor for<br>Academic and Research</p>
    </div>
  </div>
  <div class="ref">PGDE 00558</div>
</div>
</body>
</html>
HTML;
    }

    /**
     * Undergraduate Degree Certificate - Cream background with green title
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
        $gradeText = $grade ? "<br>Grade: {$grade}" : '';
        $date = htmlspecialchars($graduationDate ?: 'to be determined', ENT_QUOTES);

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Times New Roman', 'Times', serif; background: #f5ede2; padding: 40px; text-align: center; }
.cert { border: 3px solid #000; padding: 40px; max-width: 850px; margin: 0 auto; background: #f5ede2; }
.logo { font-size: 14px; font-weight: bold; letter-spacing: 1px; margin-bottom: 20px; color: #1a5d2f; }
.title { font-size: 44px; color: #2d6b3f; font-weight: bold; margin: 15px 0 10px; }
.subtitle { font-size: 13px; font-style: italic; margin: 10px 0; }
.name { font-size: 16px; font-weight: bold; text-decoration: underline; margin: 25px 0; }
.reg-no { font-size: 11px; margin: 10px 0 20px; }
.body { font-size: 11px; line-height: 1.8; margin: 15px 0; }
.signatures { display: flex; justify-content: space-between; margin: 50px 0 0; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 3px; }
.sig-name { font-size: 10px; line-height: 1.4; }
.ref { font-size: 10px; font-weight: bold; margin: 15px 0 0; }
</style>
</head>
<body>
<div class="cert">
  <div class="logo">✦ CATHOLIC UNIVERSITY OF RWANDA ✦</div>
  <div class="title">Degree</div>
  <p class="subtitle">This is to certify that</p>
  <div class="name">{$name}</div>
  <div class="reg-no">Reg. No: {$regNo}</div>
  <div class="body">
    Having satisfied the requirements for the award of <strong>BACHELOR WITH HONOURS IN {$programme}</strong>{$gradeText}
  </div>
  <div class="body">
    Was conferred on the Degree at the Congregation held at Huye this second day of July two thousand twenty-five.
  </div>
  <div class="signatures">
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Vice Chancellor</p>
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <p class="sig-name">Deputy Vice Chancellor for<br>Academic and Research</p>
    </div>
  </div>
  <div class="ref">BD 04248</div>
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
            $options->set('isRemoteEnabled', false);
            $options->set('defaultFont', 'Times New Roman');

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
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'Times New Roman');

        $dompdf = new \Dompdf\Dompdf($options);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }
}
