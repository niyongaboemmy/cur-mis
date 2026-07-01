<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates official CUR Degree/Diploma certificates as PDF.
 *
 * Supports three types with distinct layouts:
 * - Bachelor's Degree (Undergraduate) - Blue title, centered layout
 * - Postgraduate Diploma (PGDE) - Rotated layout with cream background
 * - Undergraduate Degree (Alternative) - Rotated layout with cream background
 */
class DegreePdf
{
    // Certificate types
    public const TYPE_BACHELOR = 'bachelor';
    public const TYPE_PGDE = 'pgde';
    public const TYPE_MASTERS = 'masters';
    public const TYPE_PHD = 'phd';

    /**
     * Build the full certificate HTML by mapping student data.
     *
     * @param array $student Student row with regnumber, fname, lname, etc.
     * @param string $type Certificate type (bachelor|pgde|masters|phd)
     * @param string $programme Programme/course name
     * @param string $grade Grade achieved (e.g., "Second Class Honours, Upper Division")
     * @param string $graduationDate Date of graduation (e.g., "eighteenth day of September two thousand twenty-four")
     */
    public static function buildHtml(
        array $student,
        string $type = self::TYPE_BACHELOR,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        return match($type) {
            self::TYPE_BACHELOR => self::buildBachelorDegree($student, $programme, $grade, $graduationDate),
            self::TYPE_PGDE => self::buildPgdeDiploma($student, $programme),
            self::TYPE_MASTERS, self::TYPE_PHD => self::buildUndergraduateDegree($student, $programme, $grade, $graduationDate),
            default => self::buildBachelorDegree($student, $programme, $grade, $graduationDate),
        };
    }

    /**
     * Bachelor's Degree - Modern centered layout with blue title (matching FSW-WSD DEGREE.pdf)
     */
    private static function buildBachelorDegree(
        array $student,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $faculty = $student['fac_name'] ?? $student['faculty'] ?? '';
        $programme = $programme ?: ($student['dep_name'] ?? $student['department'] ?? '');
        $gradeText = $grade ? ", Grade: {$grade}" : '';
        $graduationDateText = $graduationDate ?: 'to be determined';

        $header = PdfLayout::headerHtml();
        $pageCss = PdfLayout::pageCss(44, 28);

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
            padding: 20px 40px;
            line-height: 1.6;
            position: relative;
            text-align: center;
          }
          .container {
            max-width: 850px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
          }
          .certificate-title {
            font-size: 48pt;
            font-weight: bold;
            color: #2b7fb5;
            margin: 40px 0 30px 0;
            letter-spacing: 2px;
          }
          .certification-text {
            font-size: 14pt;
            font-style: italic;
            margin: 20px 0;
          }
          .name-box {
            margin: 30px 0;
            text-decoration: underline;
            font-weight: bold;
            font-size: 16pt;
            letter-spacing: 0.5px;
          }
          .regnumber {
            margin: 20px 0 30px 0;
            font-size: 11pt;
          }
          .registration-label {
            font-weight: bold;
            font-size: 10pt;
          }
          .qualification {
            font-size: 12pt;
            margin: 25px 0;
            line-height: 1.7;
          }
          .faculty-text {
            font-size: 11pt;
            margin: 20px 0 30px 0;
            line-height: 1.6;
          }
          .signature-section {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 60px;
          }
          .signature-block {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000;
            margin: 50px 0 8px 0;
            min-height: 60px;
          }
          .signature-title {
            font-size: 11pt;
            line-height: 1.4;
          }
          .reference-number {
            position: absolute;
            bottom: 20px;
            right: 40px;
            font-size: 10pt;
            font-weight: bold;
          }
          .watermark {
            position: fixed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120pt;
            color: rgba(200, 0, 0, 0.08);
            white-space: nowrap;
            z-index: 0;
            pointer-events: none;
            font-weight: bold;
          }
        </style>
        </head>
        <body>
          <div class="watermark">CERTIFIED</div>
          <div class="container">
            {$header}

            <h1 class="certificate-title">Degree</h1>

            <p class="certification-text">This is to certify that</p>

            <div class="name-box">{$fullName}</div>

            <div class="regnumber">
              <span class="registration-label">Reg. No:</span> {$regnumber}
            </div>

            <div class="qualification">
              Having satisfied the requirements for the award of <strong>BACHELOR'S DEGREE<br>
              IN {$programme}</strong>{$gradeText}
            </div>

            <div class="faculty-text">
              Was conferred on the Degree in the <strong>Faculty of {$faculty}</strong> at the Congregation held at Gisagara Gymnasium<br>
              this {$graduationDateText}.
            </div>

            <div class="signature-section">
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Vice Chancellor</p>
              </div>
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <p class="reference-number">BD 04232</p>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * PGDE Diploma - Rotated layout with cream/beige background (matching PGDE Diploma.pdf)
     */
    private static function buildPgdeDiploma(
        array $student,
        string $programme = ''
    ): string {
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));

        $header = PdfLayout::headerHtml();
        $pageCss = PdfLayout::pageCss(44, 28);

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            background-color: #f5f0e8;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(90deg);
            transform-origin: center;
            position: relative;
          }
          .container {
            width: 100%;
            height: 100%;
            padding: 60px;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
            z-index: 1;
          }
          .title-vertical {
            font-size: 36pt;
            font-weight: bold;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            position: absolute;
            left: 40px;
            top: 50%;
            transform: translateY(-50%) rotate(180deg);
            letter-spacing: 8px;
          }
          .diploma-word {
            font-size: 24pt;
            font-weight: bold;
            margin: 20px 0;
          }
          .certification-text {
            font-size: 13pt;
            font-style: italic;
            margin: 20px 0;
          }
          .name-box {
            margin: 30px 0;
            text-decoration: underline;
            font-weight: bold;
            font-size: 14pt;
          }
          .regnumber {
            margin: 15px 0 25px 0;
            font-size: 10pt;
          }
          .qualification {
            font-size: 11pt;
            margin: 20px 0;
            line-height: 1.6;
          }
          .qualification-text {
            font-weight: bold;
            font-size: 12pt;
          }
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-around;
            align-items: flex-start;
            gap: 40px;
          }
          .signature-block {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000;
            margin: 40px 0 5px 0;
            min-height: 50px;
          }
          .signature-title {
            font-size: 10pt;
            line-height: 1.3;
          }
          .reference-number {
            position: absolute;
            bottom: 40px;
            right: 40px;
            font-size: 9pt;
            font-weight: bold;
          }
          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100pt;
            color: rgba(200, 0, 0, 0.06);
            white-space: nowrap;
            z-index: 0;
            pointer-events: none;
            font-weight: bold;
          }
        </style>
        </head>
        <body>
          <div class="watermark">CERTIFIED</div>
          <div class="container">
            <div class="title-vertical">CATHOLIC UNIVERSITY OF RWANDA</div>

            {$header}

            <div class="diploma-word">Diploma</div>

            <p class="certification-text">This is to certify that</p>

            <div class="name-box">{$fullName}</div>

            <div class="regnumber">
              Reg No: {$regnumber}
            </div>

            <div class="qualification">
              Having satisfied the requirements for the award of
            </div>

            <div class="qualification-text">
              POSTGRADUATE DIPLOMA IN EDUCATION
            </div>

            <div class="qualification">
              Was conferred on the Postgraduate Congregation held at Gisagara Gymnasium<br>
              this second day of July two thousand twenty-four.
            </div>

            <div class="signature-section">
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Vice Chancellor</p>
              </div>
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <p class="reference-number">PGDE 00559</p>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Undergraduate Degree - Rotated layout with cream background (matching Undergraduate degree.pdf)
     */
    private static function buildUndergraduateDegree(
        array $student,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));

        $header = PdfLayout::headerHtml();
        $pageCss = PdfLayout::pageCss(44, 28);

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          {$pageCss}
          * { box-sizing:border-box; margin:0; padding:0; }
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            color: #000;
            background-color: #f5f0e8;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(90deg);
            transform-origin: center;
            position: relative;
          }
          .container {
            width: 100%;
            height: 100%;
            padding: 60px;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
            z-index: 1;
          }
          .title-vertical {
            font-size: 36pt;
            font-weight: bold;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            position: absolute;
            left: 40px;
            top: 50%;
            transform: translateY(-50%) rotate(180deg);
            letter-spacing: 8px;
          }
          .degree-word {
            font-size: 28pt;
            color: #1a5d2f;
            font-weight: bold;
            margin: 20px 0;
          }
          .certification-text {
            font-size: 13pt;
            font-style: italic;
            margin: 20px 0;
          }
          .name-box {
            margin: 30px 0;
            text-decoration: underline;
            font-weight: bold;
            font-size: 14pt;
          }
          .regnumber {
            margin: 15px 0 25px 0;
            font-size: 10pt;
          }
          .qualification {
            font-size: 11pt;
            margin: 20px 0;
            line-height: 1.6;
          }
          .qualification-text {
            font-weight: bold;
            font-size: 12pt;
          }
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-around;
            align-items: flex-start;
            gap: 40px;
          }
          .signature-block {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000;
            margin: 40px 0 5px 0;
            min-height: 50px;
          }
          .signature-title {
            font-size: 10pt;
            line-height: 1.3;
          }
          .reference-number {
            position: absolute;
            bottom: 40px;
            right: 40px;
            font-size: 9pt;
            font-weight: bold;
          }
          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100pt;
            color: rgba(200, 0, 0, 0.06);
            white-space: nowrap;
            z-index: 0;
            pointer-events: none;
            font-weight: bold;
          }
        </style>
        </head>
        <body>
          <div class="watermark">CERTIFIED</div>
          <div class="container">
            <div class="title-vertical">CATHOLIC UNIVERSITY OF RWANDA</div>

            {$header}

            <div class="degree-word">Degree</div>

            <p class="certification-text">This is to certify that</p>

            <div class="name-box">{$fullName}</div>

            <div class="regnumber">
              Reg No: {$regnumber}
            </div>

            <div class="qualification">
              Having satisfied the requirements for the award of
            </div>

            <div class="qualification-text">
              BACHELOR'S DEGREE IN {$programme}
            </div>

            <div class="qualification">
              Was conferred on the Degree at the Congregation held at Gisagara Gymnasium<br>
              this second day of July two thousand twenty-four.
            </div>

            <div class="signature-section">
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Vice Chancellor</p>
              </div>
              <div class="signature-block">
                <div class="signature-line"></div>
                <p class="signature-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <p class="reference-number">BD 04248</p>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Output a PDF to the browser (Content-Type: application/pdf).
     * Requires dompdf. Falls back to HTML if unavailable.
     */
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
            PdfLayout::stampHeader($dompdf);
            $dompdf->stream($filename, ['Attachment' => true]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    /**
     * Return PDF binary string (for email attachments).
     * Returns null if dompdf is not available.
     */
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
        PdfLayout::stampHeader($dompdf);

        return $dompdf->output();
    }
}
