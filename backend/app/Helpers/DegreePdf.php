<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates official CUR Degree/Diploma certificates as PDF.
 *
 * Supports three types:
 * - Bachelor's Degree (Undergraduate)
 * - Postgraduate Diploma (PGDE)
 * - Master's Degree
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
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $faculty = $student['fac_name'] ?? $student['faculty'] ?? '';
        $programme = $programme ?: ($student['dep_name'] ?? $student['department'] ?? '');

        // Determine certificate label and text based on type
        $certificateTitle = match($type) {
            self::TYPE_BACHELOR => 'Degree',
            self::TYPE_PGDE => 'Diploma',
            self::TYPE_MASTERS => 'Degree',
            self::TYPE_PHD => 'Degree',
            default => 'Degree',
        };

        $qualificationText = match($type) {
            self::TYPE_BACHELOR => "BACHELOR'S DEGREE IN " . strtoupper($programme),
            self::TYPE_PGDE => "POSTGRADUATE DIPLOMA IN EDUCATION",
            self::TYPE_MASTERS => "MASTER'S DEGREE IN " . strtoupper($programme),
            self::TYPE_PHD => "DOCTOR OF PHILOSOPHY (PhD) IN " . strtoupper($programme),
            default => strtoupper($programme),
        };

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
            padding: 40px;
            line-height: 1.6;
            position: relative;
            text-align: center;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
          }
          .certificate-title {
            font-size: 32pt;
            font-weight: bold;
            color: #1e5a8e;
            margin: 60px 0 40px 0;
            letter-spacing: 2px;
          }
          .certification-text {
            font-size: 16pt;
            font-style: italic;
            margin: 30px 0;
            letter-spacing: 1px;
          }
          .name-box {
            margin: 50px 0;
            text-decoration: underline;
            font-weight: bold;
            font-size: 18pt;
            letter-spacing: 1px;
          }
          .qualification {
            font-size: 13pt;
            margin: 30px 0;
            line-height: 1.8;
          }
          .faculty-text {
            font-size: 12pt;
            margin: 20px 0;
            line-height: 1.7;
          }
          .regnumber {
            margin: 30px 0;
            font-size: 11pt;
          }
          .registration-label {
            font-weight: bold;
            font-size: 10pt;
            letter-spacing: 1px;
          }
          .signature-section {
            margin-top: 80px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 40px;
          }
          .signature-block {
            flex: 1;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #000;
            margin: 60px 0 10px 0;
            min-height: 80px;
          }
          .signature-title {
            font-weight: bold;
            font-size: 11pt;
            letter-spacing: 0.5px;
          }
          .reference-number {
            position: absolute;
            bottom: 30px;
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
          <div class="container" style="position: relative; z-index: 1;">
            {$header}

            <h1 class="certificate-title">{$certificateTitle}</h1>

            <p class="certification-text">This is to certify that</p>

            <div class="name-box">{$fullName}</div>

            <div class="regnumber">
              <span class="registration-label">Reg. No:</span> {$regnumber}
            </div>

            <div class="qualification">
              Having satisfied the requirements for the award of<br>
              <strong>{$qualificationText}</strong>{$gradeText}
            </div>

            <div class="faculty-text">
              Was conferred on the Degree in the <strong>Faculty of {$faculty}</strong><br>
              at the Congregation held at Gisagara Gymnasium<br>
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
