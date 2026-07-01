<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates official CUR Degree/Diploma certificates as PDF.
 * EXACT design matching official CUR certificates - NO MODIFICATIONS.
 *
 * Supports three types:
 * - Bachelor's Degree - White background, blue title, bordered layout
 * - Postgraduate Diploma - Cream background, centered layout
 * - Undergraduate Degree - Cream background, centered layout with green title
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
            self::TYPE_PGDE => self::buildPgdeDiploma($student),
            self::TYPE_MASTERS, self::TYPE_PHD => self::buildUndergraduateDegree($student, $programme, $grade, $graduationDate),
            default => self::buildBachelorDegree($student, $programme, $grade, $graduationDate),
        };
    }

    /**
     * Bachelor's Degree Certificate
     * EXACT design: White background, blue "Degree" title (42pt, #2b7fb5), bordered layout
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
        $programme = strtoupper($programme ?: ($student['dep_name'] ?? $student['department'] ?? ''));
        $gradeText = $grade ? ", Grade: <strong>{$grade}</strong>" : '';
        $graduationDateText = $graduationDate ?: 'to be determined';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            color: #000;
            padding: 40px;
            line-height: 1.5;
            text-align: center;
            background: white;
          }
          .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo img {
            max-width: 100%;
            max-height: 100%;
          }
          .page {
            max-width: 850px;
            margin: 0 auto;
            border: 4px solid #000;
            padding: 40px 40px;
            background: white;
            position: relative;
            box-shadow: inset 0 0 0 2px #000, inset 4px 4px 0 -2px #000;
          }
          .header-border-top {
            border-top: 3px solid #000;
            margin-bottom: 10px;
            position: relative;
          }
          .header-border-top::before {
            content: '';
            position: absolute;
            top: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-bottom: none;
            transform: rotate(45deg);
          }
          .header-border-top::after {
            content: '';
            position: absolute;
            top: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-bottom: none;
            transform: rotate(-45deg);
          }
          .footer-border-bottom {
            border-bottom: 3px solid #000;
            margin-top: 10px;
            position: relative;
          }
          .footer-border-bottom::before {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-top: none;
            transform: rotate(45deg);
          }
          .footer-border-bottom::after {
            content: '';
            position: absolute;
            bottom: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-top: none;
            transform: rotate(-45deg);
          }
          .title {
            font-size: 42pt;
            font-weight: bold;
            color: #2b7fb5;
            margin: 30px 0 25px 0;
            letter-spacing: 1px;
          }
          .certification-text {
            font-size: 13pt;
            font-style: italic;
            margin: 15px 0;
          }
          .name {
            font-size: 16pt;
            font-weight: bold;
            text-decoration: underline;
            margin: 25px 0;
            letter-spacing: 0.5px;
          }
          .reg-number {
            font-size: 11pt;
            margin: 15px 0 20px 0;
          }
          .reg-label {
            font-weight: bold;
          }
          .body-text {
            font-size: 11pt;
            line-height: 1.7;
            margin: 20px 0;
            text-align: center;
          }
          .body-text strong {
            font-weight: bold;
          }
          .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            gap: 80px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
          }
          .sig-line {
            border-top: 1px solid #000;
            height: 50px;
            margin-bottom: 5px;
          }
          .sig-title {
            font-size: 11pt;
            font-weight: normal;
            line-height: 1.3;
          }
          .ref-number {
            font-size: 11pt;
            font-weight: bold;
            margin-top: 15px;
          }
        </style>
        </head>
        <body>
          <div class="logo">
            <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="#FFF" stroke="#000" stroke-width="2"/>
              <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="2"/>
              <path d="M 50 20 L 60 35 L 75 35 L 65 45 L 70 60 L 50 50 L 30 60 L 35 45 L 25 35 L 40 35 Z" fill="#FFD700" stroke="#000" stroke-width="1"/>
              <circle cx="50" cy="55" r="25" fill="#1a5d2f" stroke="#000" stroke-width="1"/>
              <text x="50" y="60" text-anchor="middle" font-size="12" font-weight="bold" fill="#FFD700">CUR</text>
              <path d="M 30 45 Q 50 30 70 45" fill="none" stroke="#228B22" stroke-width="2"/>
              <path d="M 30 55 Q 50 70 70 55" fill="none" stroke="#228B22" stroke-width="2"/>
            </svg>
          </div>
          <div class="page">
            <div class="header-border-top"></div>

            <div class="title">Degree</div>

            <p class="certification-text">This is to certify that</p>

            <div class="name">{$fullName}</div>

            <div class="reg-number">
              <span class="reg-label">Reg. No:</span> {$regnumber}
            </div>

            <div class="body-text">
              Having satisfied the requirements for the award of <strong>BACHELOR'S DEGREE<br>
              IN {$programme}</strong>{$gradeText}
            </div>

            <div class="body-text">
              Was conferred on the Degree in the <strong>Faculty of {$faculty}</strong> at the Congregation held at Gisagara Gymnasium<br>
              this {$graduationDateText}.
            </div>

            <div class="signatures">
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Vice Chancellor</p>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <div class="ref-number">BD 04232</div>

            <div class="footer-border-bottom"></div>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * PGDE Diploma Certificate
     * EXACT design: Cream background (#f5ede2), centered layout, bordered
     */
    private static function buildPgdeDiploma(array $student): string {
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            color: #000;
            padding: 40px;
            text-align: center;
            background-color: #f5ede2;
            line-height: 1.5;
          }
          .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo img {
            max-width: 100%;
            max-height: 100%;
          }
          .page {
            max-width: 850px;
            margin: 0 auto;
            border: 4px solid #000;
            padding: 40px 40px;
            background: #f5ede2;
            position: relative;
            box-shadow: inset 0 0 0 2px #000, inset 4px 4px 0 -2px #000;
          }
          .header-border-top {
            border-top: 3px solid #000;
            margin-bottom: 10px;
            position: relative;
          }
          .header-border-top::before {
            content: '';
            position: absolute;
            top: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-bottom: none;
            transform: rotate(45deg);
          }
          .header-border-top::after {
            content: '';
            position: absolute;
            top: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-bottom: none;
            transform: rotate(-45deg);
          }
          .footer-border-bottom {
            border-bottom: 3px solid #000;
            margin-top: 10px;
            position: relative;
          }
          .footer-border-bottom::before {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-top: none;
            transform: rotate(45deg);
          }
          .footer-border-bottom::after {
            content: '';
            position: absolute;
            bottom: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-top: none;
            transform: rotate(-45deg);
          }
          .title {
            font-size: 42pt;
            font-weight: bold;
            color: #000;
            margin: 30px 0 25px 0;
          }
          .certification-text {
            font-size: 13pt;
            font-style: italic;
            margin: 15px 0;
          }
          .name {
            font-size: 16pt;
            font-weight: bold;
            text-decoration: underline;
            margin: 25px 0;
          }
          .reg-number {
            font-size: 11pt;
            margin: 15px 0 20px 0;
          }
          .body-text {
            font-size: 11pt;
            line-height: 1.7;
            margin: 20px 0;
          }
          .body-text strong {
            font-weight: bold;
          }
          .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            gap: 80px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
          }
          .sig-line {
            border-top: 1px solid #000;
            height: 50px;
            margin-bottom: 5px;
          }
          .sig-title {
            font-size: 11pt;
            line-height: 1.3;
          }
          .ref-number {
            font-size: 11pt;
            font-weight: bold;
            margin-top: 15px;
          }
        </style>
        </head>
        <body>
          <div class="logo">
            <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="#FFF" stroke="#000" stroke-width="2"/>
              <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="2"/>
              <path d="M 50 20 L 60 35 L 75 35 L 65 45 L 70 60 L 50 50 L 30 60 L 35 45 L 25 35 L 40 35 Z" fill="#FFD700" stroke="#000" stroke-width="1"/>
              <circle cx="50" cy="55" r="25" fill="#1a5d2f" stroke="#000" stroke-width="1"/>
              <text x="50" y="60" text-anchor="middle" font-size="12" font-weight="bold" fill="#FFD700">CUR</text>
              <path d="M 30 45 Q 50 30 70 45" fill="none" stroke="#228B22" stroke-width="2"/>
              <path d="M 30 55 Q 50 70 70 55" fill="none" stroke="#228B22" stroke-width="2"/>
            </svg>
          </div>
          <div class="page">
            <div class="header-border-top"></div>

            <div class="title">Diploma</div>

            <p class="certification-text">This is to certify that</p>

            <div class="name">{$fullName}</div>

            <div class="reg-number">Reg. No: {$regnumber}</div>

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
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Vice Chancellor</p>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <div class="ref-number">PGDE 00558</div>

            <div class="footer-border-bottom"></div>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Undergraduate Degree Certificate
     * EXACT design: Cream background (#f5ede2), green title (42pt, #2d6b3f), centered layout
     */
    private static function buildUndergraduateDegree(
        array $student,
        string $programme = '',
        string $grade = '',
        string $graduationDate = ''
    ): string {
        $regnumber = $student['regnumber'] ?? '';
        $fullName = strtoupper(trim(($student['fname'] ?? '') . ' ' . ($student['lname'] ?? '')));
        $programme = strtoupper($programme ?: ($student['dep_name'] ?? $student['department'] ?? ''));
        $gradeText = $grade ? "<br><strong>Grade: {$grade}</strong>" : '';
        $graduationDateText = $graduationDate ?: 'to be determined';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            color: #000;
            padding: 40px;
            text-align: center;
            background-color: #f5ede2;
            line-height: 1.5;
          }
          .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo img {
            max-width: 100%;
            max-height: 100%;
          }
          .page {
            max-width: 850px;
            margin: 0 auto;
            border: 4px solid #000;
            padding: 40px 40px;
            background: #f5ede2;
            position: relative;
            box-shadow: inset 0 0 0 2px #000, inset 4px 4px 0 -2px #000;
          }
          .header-border-top {
            border-top: 3px solid #000;
            margin-bottom: 10px;
            position: relative;
          }
          .header-border-top::before {
            content: '';
            position: absolute;
            top: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-bottom: none;
            transform: rotate(45deg);
          }
          .header-border-top::after {
            content: '';
            position: absolute;
            top: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-bottom: none;
            transform: rotate(-45deg);
          }
          .footer-border-bottom {
            border-bottom: 3px solid #000;
            margin-top: 10px;
            position: relative;
          }
          .footer-border-bottom::before {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-right: none;
            border-top: none;
            transform: rotate(45deg);
          }
          .footer-border-bottom::after {
            content: '';
            position: absolute;
            bottom: -8px;
            right: 20px;
            width: 30px;
            height: 30px;
            border: 2px solid #000;
            border-left: none;
            border-top: none;
            transform: rotate(-45deg);
          }
          .title {
            font-size: 42pt;
            font-weight: bold;
            color: #2d6b3f;
            margin: 30px 0 25px 0;
          }
          .certification-text {
            font-size: 13pt;
            font-style: italic;
            margin: 15px 0;
          }
          .name {
            font-size: 16pt;
            font-weight: bold;
            text-decoration: underline;
            margin: 25px 0;
          }
          .reg-number {
            font-size: 11pt;
            margin: 15px 0 20px 0;
          }
          .body-text {
            font-size: 11pt;
            line-height: 1.7;
            margin: 20px 0;
          }
          .body-text strong {
            font-weight: bold;
          }
          .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            gap: 80px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
          }
          .sig-line {
            border-top: 1px solid #000;
            height: 50px;
            margin-bottom: 5px;
          }
          .sig-title {
            font-size: 11pt;
            line-height: 1.3;
          }
          .ref-number {
            font-size: 11pt;
            font-weight: bold;
            margin-top: 15px;
          }
        </style>
        </head>
        <body>
          <div class="logo">
            <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="#FFF" stroke="#000" stroke-width="2"/>
              <circle cx="50" cy="50" r="45" fill="none" stroke="#FFD700" stroke-width="2"/>
              <path d="M 50 20 L 60 35 L 75 35 L 65 45 L 70 60 L 50 50 L 30 60 L 35 45 L 25 35 L 40 35 Z" fill="#FFD700" stroke="#000" stroke-width="1"/>
              <circle cx="50" cy="55" r="25" fill="#1a5d2f" stroke="#000" stroke-width="1"/>
              <text x="50" y="60" text-anchor="middle" font-size="12" font-weight="bold" fill="#FFD700">CUR</text>
              <path d="M 30 45 Q 50 30 70 45" fill="none" stroke="#228B22" stroke-width="2"/>
              <path d="M 30 55 Q 50 70 70 55" fill="none" stroke="#228B22" stroke-width="2"/>
            </svg>
          </div>
          <div class="page">
            <div class="header-border-top"></div>

            <div class="title">Degree</div>

            <p class="certification-text">This is to certify that</p>

            <div class="name">{$fullName}</div>

            <div class="reg-number">Reg. No: {$regnumber}</div>

            <div class="body-text">
              Having satisfied the requirements for the award of <strong>BACHELOR WITH HONOURS IN {$programme}</strong>{$gradeText}
            </div>

            <div class="body-text">
              Was conferred on the Degree at the Congregation held at Huye this second day of July two thousand twenty-five.
            </div>

            <div class="signatures">
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Vice Chancellor</p>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-title">Deputy Vice Chancellor for<br>Academic and Research</p>
              </div>
            </div>

            <div class="ref-number">BD 04248</div>

            <div class="footer-border-bottom"></div>
          </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Output a PDF to the browser
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
            $dompdf->stream($filename, ['Attachment' => true]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    /**
     * Return PDF binary string for email attachments
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

        return $dompdf->output();
    }
}
