<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates official CUR Degree/Diploma certificates as PDF.
 * Matches exact official CUR certificate designs.
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
        $name = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $regNo = $student['regnumber'] ?? '';
        $faculty = $student['fac_name'] ?? $student['faculty'] ?? '';
        $programme = strtoupper($programme ?: ($student['dep_name'] ?? ''));
        $gradeText = $grade ? ", Grade: {$grade}" : '';
        $date = $graduationDate ?: 'to be determined';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: 'Times New Roman', serif; margin: 0; padding: 40px; text-align: center; }
.certificate { border: 3px solid #000; padding: 50px 40px; max-width: 900px; margin: 0 auto; background: white; }
.logo-container { margin-bottom: 20px; }
.logo-container svg { width: 80px; height: 80px; }
.title { font-size: 48px; color: #2b7fb5; font-weight: bold; margin: 20px 0; }
.subtitle { font-size: 13px; font-style: italic; margin: 15px 0; }
.name { font-size: 18px; font-weight: bold; text-decoration: underline; margin: 30px 0; }
.reg-no { font-size: 12px; margin: 15px 0 25px 0; }
.body-text { font-size: 12px; line-height: 1.8; margin: 20px 0; }
.signatures { display: flex; justify-content: space-between; margin-top: 60px; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 5px; }
.sig-name { font-size: 11px; }
.ref { font-size: 11px; font-weight: bold; margin-top: 20px; }
</style>
</head>
<body>
<div class="certificate">
  <div class="logo-container">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="white" stroke="black" stroke-width="2"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="1.5"/>
      <path d="M 50 18 L 61 38 L 83 38 L 65 52 L 76 72 L 50 58 L 24 72 L 35 52 L 17 38 L 39 38 Z" fill="#FFD700" stroke="black" stroke-width="0.5"/>
      <circle cx="50" cy="58" r="22" fill="#1a5d2f" stroke="black" stroke-width="1"/>
      <text x="50" y="65" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFD700" font-family="Arial">CUR</text>
      <path d="M 32 50 Q 50 35 68 50" fill="none" stroke="#228B22" stroke-width="1.5"/>
      <path d="M 32 60 Q 50 75 68 60" fill="none" stroke="#228B22" stroke-width="1.5"/>
    </svg>
  </div>

  <div class="title">Degree</div>

  <p class="subtitle">This is to certify that</p>

  <div class="name">{$name}</div>

  <div class="reg-no">Reg. No: {$regNo}</div>

  <div class="body-text">
    Having satisfied the requirements for the award of <strong>BACHELOR'S DEGREE<br>IN {$programme}</strong>{$gradeText}
  </div>

  <div class="body-text">
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
        $name = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $regNo = $student['regnumber'] ?? '';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: 'Times New Roman', serif; margin: 0; padding: 40px; text-align: center; background-color: #f5ede2; }
.certificate { border: 3px solid #000; padding: 50px 40px; max-width: 900px; margin: 0 auto; background: #f5ede2; }
.logo-container { margin-bottom: 20px; }
.logo-container svg { width: 80px; height: 80px; }
.title { font-size: 48px; color: #000; font-weight: bold; margin: 20px 0; }
.subtitle { font-size: 13px; font-style: italic; margin: 15px 0; }
.name { font-size: 18px; font-weight: bold; text-decoration: underline; margin: 30px 0; }
.reg-no { font-size: 12px; margin: 15px 0 25px 0; }
.body-text { font-size: 12px; line-height: 1.8; margin: 20px 0; }
.signatures { display: flex; justify-content: space-between; margin-top: 60px; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 5px; }
.sig-name { font-size: 11px; }
.ref { font-size: 11px; font-weight: bold; margin-top: 20px; }
</style>
</head>
<body>
<div class="certificate">
  <div class="logo-container">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="white" stroke="black" stroke-width="2"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="1.5"/>
      <path d="M 50 18 L 61 38 L 83 38 L 65 52 L 76 72 L 50 58 L 24 72 L 35 52 L 17 38 L 39 38 Z" fill="#FFD700" stroke="black" stroke-width="0.5"/>
      <circle cx="50" cy="58" r="22" fill="#1a5d2f" stroke="black" stroke-width="1"/>
      <text x="50" y="65" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFD700" font-family="Arial">CUR</text>
      <path d="M 32 50 Q 50 35 68 50" fill="none" stroke="#228B22" stroke-width="1.5"/>
      <path d="M 32 60 Q 50 75 68 60" fill="none" stroke="#228B22" stroke-width="1.5"/>
    </svg>
  </div>

  <div class="title">Diploma</div>

  <p class="subtitle">This is to certify that</p>

  <div class="name">{$name}</div>

  <div class="reg-no">Reg. No: {$regNo}</div>

  <div class="body-text">
    Having satisfied the requirements for the award of
  </div>

  <div class="body-text">
    <strong>POSTGRADUATE DIPLOMA IN EDUCATION</strong>
  </div>

  <div class="body-text">
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
        $name = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $regNo = $student['regnumber'] ?? '';
        $programme = strtoupper($programme ?: ($student['dep_name'] ?? ''));
        $gradeText = $grade ? "<br>Grade: {$grade}" : '';
        $date = $graduationDate ?: 'to be determined';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: 'Times New Roman', serif; margin: 0; padding: 40px; text-align: center; background-color: #f5ede2; }
.certificate { border: 3px solid #000; padding: 50px 40px; max-width: 900px; margin: 0 auto; background: #f5ede2; }
.logo-container { margin-bottom: 20px; }
.logo-container svg { width: 80px; height: 80px; }
.title { font-size: 48px; color: #2d6b3f; font-weight: bold; margin: 20px 0; }
.subtitle { font-size: 13px; font-style: italic; margin: 15px 0; }
.name { font-size: 18px; font-weight: bold; text-decoration: underline; margin: 30px 0; }
.reg-no { font-size: 12px; margin: 15px 0 25px 0; }
.body-text { font-size: 12px; line-height: 1.8; margin: 20px 0; }
.signatures { display: flex; justify-content: space-between; margin-top: 60px; }
.sig { flex: 1; text-align: center; }
.sig-line { border-top: 1px solid #000; height: 50px; margin-bottom: 5px; }
.sig-name { font-size: 11px; }
.ref { font-size: 11px; font-weight: bold; margin-top: 20px; }
</style>
</head>
<body>
<div class="certificate">
  <div class="logo-container">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="white" stroke="black" stroke-width="2"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="1.5"/>
      <path d="M 50 18 L 61 38 L 83 38 L 65 52 L 76 72 L 50 58 L 24 72 L 35 52 L 17 38 L 39 38 Z" fill="#FFD700" stroke="black" stroke-width="0.5"/>
      <circle cx="50" cy="58" r="22" fill="#1a5d2f" stroke="black" stroke-width="1"/>
      <text x="50" y="65" text-anchor="middle" font-size="11" font-weight="bold" fill="#FFD700" font-family="Arial">CUR</text>
      <path d="M 32 50 Q 50 35 68 50" fill="none" stroke="#228B22" stroke-width="1.5"/>
      <path d="M 32 60 Q 50 75 68 60" fill="none" stroke="#228B22" stroke-width="1.5"/>
    </svg>
  </div>

  <div class="title">Degree</div>

  <p class="subtitle">This is to certify that</p>

  <div class="name">{$name}</div>

  <div class="reg-no">Reg. No: {$regNo}</div>

  <div class="body-text">
    Having satisfied the requirements for the award of <strong>BACHELOR WITH HONOURS IN {$programme}</strong>{$gradeText}
  </div>

  <div class="body-text">
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
            $dompdf->stream($filename, ['Attachment' => true]);
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
