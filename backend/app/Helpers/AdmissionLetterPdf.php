<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Generates admission letter HTML / PDF content.
 *
 * Supports two render modes:
 *   - html  : returns styled HTML string (for email embedding or browser render)
 *   - pdf   : streams a PDF via dompdf (if installed), otherwise falls back to HTML
 */
class AdmissionLetterPdf
{
    /**
     * Build the full letter HTML.
     *
     * @param array $data {
     *   offer_letter_reference, first_name, last_name, email, phone,
     *   application_number, department_name, faculty_name,
     *   offered_at, expires_at, intake, academic_year,
     *   institution_name, registrar_name, registrar_title
     * }
     */
    public static function buildHtml(array $data): string
    {
        $appName       = htmlspecialchars(getenv('APP_NAME') ?: 'CUR-MIS');
        $institutionFull = htmlspecialchars($data['institution_name'] ?? 'Catholic University of Rwanda');
        $ref           = htmlspecialchars($data['offer_letter_reference'] ?? '—');
        $fullName      = htmlspecialchars(trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')));
        $firstName     = htmlspecialchars($data['first_name'] ?? '');
        $email         = htmlspecialchars($data['email'] ?? '');
        $phone         = htmlspecialchars($data['phone'] ?? '');
        $appNumber     = htmlspecialchars($data['application_number'] ?? '—');
        $deptName      = htmlspecialchars($data['department_name'] ?? '—');
        $facultyName   = htmlspecialchars($data['faculty_name'] ?? '');
        $intake        = htmlspecialchars($data['intake'] ?? '');
        $academicYear  = htmlspecialchars($data['academic_year'] ?? date('Y'));
        $registrar     = htmlspecialchars($data['registrar_name'] ?? 'The Registrar');
        $registrarTitle = htmlspecialchars($data['registrar_title'] ?? 'Academic Registrar');
        $issueDate     = date('j F Y');
        $expiresDate   = '';
        if (!empty($data['expires_at'])) {
            try {
                $expiresDate = (new \DateTime($data['expires_at']))->format('j F Y');
            } catch (\Exception $e) {
                $expiresDate = htmlspecialchars($data['expires_at']);
            }
        }

        // Pre-compute optional table rows (PHP heredoc doesn't support ternary inside {})
        $facultyRow  = $facultyName
            ? "<tr><td>School / Faculty</td><td>{$facultyName}</td></tr>"
            : '';
        $intakeRow   = $intake
            ? "<tr><td>Intake</td><td>{$intake}</td></tr>"
            : '';
        $expiresRow  = $expiresDate
            ? "<tr><td>Offer Expires</td><td><strong style='color:#dc2626'>{$expiresDate}</strong></td></tr>"
            : '';

        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Admission Letter — {$ref}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #1a1a1a;
    background: #fff;
    padding: 0;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 22mm 20mm 22mm;
    background: #fff;
    position: relative;
  }
  /* Watermark */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 80pt;
    font-weight: 900;
    color: rgba(30, 64, 175, 0.04);
    font-family: Arial, sans-serif;
    pointer-events: none;
    letter-spacing: -0.05em;
    white-space: nowrap;
    z-index: 0;
  }
  .content { position: relative; z-index: 1; }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14pt;
    border-bottom: 3pt solid #1e3a8a;
    margin-bottom: 18pt;
  }
  .header-logo { }
  .logo-name {
    font-size: 22pt;
    font-weight: 900;
    color: #1e3a8a;
    letter-spacing: -0.04em;
    font-family: Arial, sans-serif;
    line-height: 1;
  }
  .logo-tagline {
    font-size: 7pt;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #6b7280;
    margin-top: 3pt;
    font-family: Arial, sans-serif;
  }
  .header-contact {
    text-align: right;
    font-size: 8pt;
    color: #6b7280;
    line-height: 1.8;
    font-family: Arial, sans-serif;
  }
  .header-contact strong {
    color: #374151;
  }

  /* Decorative rule */
  .accent-bar {
    height: 4pt;
    background: linear-gradient(to right, #1e3a8a, #3b82f6, #93c5fd);
    border-radius: 2pt;
    margin-bottom: 18pt;
  }

  /* Meta row */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 22pt;
  }
  .ref-block .label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #9ca3af;
    font-family: Arial, sans-serif;
    margin-bottom: 2pt;
  }
  .ref-block .value {
    font-size: 11pt;
    font-family: 'Courier New', monospace;
    font-weight: 700;
    color: #1e3a8a;
  }
  .date-block {
    font-size: 10pt;
    color: #374151;
  }

  /* Addressee */
  .addressee {
    margin-bottom: 18pt;
    padding: 14pt 18pt;
    background: #f0f4ff;
    border-left: 4pt solid #1e3a8a;
    border-radius: 0 6pt 6pt 0;
  }
  .addressee .to-label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
    font-family: Arial, sans-serif;
    margin-bottom: 4pt;
  }
  .addressee .full-name {
    font-size: 14pt;
    font-weight: 900;
    color: #1e3a8a;
    font-family: Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .addressee .app-ref {
    font-size: 9pt;
    color: #6b7280;
    font-family: Arial, sans-serif;
    margin-top: 3pt;
  }

  /* Title banner */
  .letter-title {
    text-align: center;
    padding: 10pt 0;
    border-top: 1pt solid #d1d5db;
    border-bottom: 1pt solid #d1d5db;
    margin-bottom: 20pt;
  }
  .letter-title h2 {
    font-size: 14pt;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #1e3a8a;
    font-family: Arial, sans-serif;
  }
  .letter-title .subtitle {
    font-size: 9pt;
    color: #6b7280;
    font-family: Arial, sans-serif;
    margin-top: 3pt;
    letter-spacing: 0.05em;
  }

  /* Body */
  .body-text p {
    margin-bottom: 12pt;
    line-height: 1.7;
    color: #1f2937;
    font-size: 11pt;
  }
  .body-text strong { color: #111827; }
  .body-text .highlight {
    color: #1e3a8a;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2pt;
    text-decoration-color: #93c5fd;
  }

  /* Program info box */
  .program-box {
    margin: 16pt 0;
    padding: 14pt 18pt;
    background: #f9fafb;
    border: 1pt solid #e5e7eb;
    border-radius: 6pt;
  }
  .program-box table { width: 100%; border-collapse: collapse; }
  .program-box td { padding: 5pt 0; font-size: 10pt; vertical-align: top; }
  .program-box td:first-child {
    font-family: Arial, sans-serif;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9ca3af;
    width: 38%;
  }
  .program-box td:last-child { color: #111827; font-weight: 700; }

  /* Conditions box */
  .conditions {
    margin: 14pt 0;
    padding: 12pt 16pt;
    background: #fff7ed;
    border: 1pt solid #fed7aa;
    border-radius: 6pt;
    font-size: 10pt;
  }
  .conditions .cond-title {
    font-family: Arial, sans-serif;
    font-size: 8pt;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #92400e;
    margin-bottom: 6pt;
  }
  .conditions ol { padding-left: 18pt; color: #78350f; line-height: 1.8; }

  /* Signature */
  .signature-block {
    margin-top: 28pt;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .sig-left { min-width: 200pt; }
  .sig-line {
    border-bottom: 1pt solid #9ca3af;
    height: 36pt;
    margin-bottom: 6pt;
    position: relative;
  }
  .sig-e-signed {
    position: absolute;
    bottom: 3pt;
    right: 0;
    font-size: 7pt;
    color: #d1d5db;
    font-style: italic;
    font-family: Arial, sans-serif;
  }
  .sig-name {
    font-size: 11pt;
    font-weight: 900;
    color: #111827;
    font-family: Arial, sans-serif;
  }
  .sig-title {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6b7280;
    font-family: Arial, sans-serif;
    margin-top: 3pt;
  }
  .seal-box {
    text-align: center;
    padding: 12pt;
    border: 1pt solid #e5e7eb;
    border-radius: 8pt;
    background: #f9fafb;
  }
  .seal-circle {
    width: 70pt;
    height: 70pt;
    border-radius: 50%;
    border: 2pt dashed #9ca3af;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 6pt;
  }
  .seal-text {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9ca3af;
    font-family: Arial, sans-serif;
  }
  .seal-verify {
    font-size: 6pt;
    font-family: 'Courier New', monospace;
    color: #d1d5db;
    margin-top: 3pt;
  }

  /* Footer */
  .letter-footer {
    margin-top: 24pt;
    padding-top: 10pt;
    border-top: 1pt solid #e5e7eb;
    text-align: center;
    font-size: 8pt;
    color: #9ca3af;
    font-family: Arial, sans-serif;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  @media print {
    body { background: white; }
    .page { padding: 15mm 20mm; width: 100%; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="watermark">{$appName}</div>
  <div class="content">

    <!-- Header -->
    <div class="header">
      <div class="header-logo">
        <div class="logo-name">{$appName}</div>
        <div class="logo-tagline">{$institutionFull}</div>
      </div>
      <div class="header-contact">
        <strong>Office of Academic Registrar</strong><br>
        KN 78 Street, Kigali, Rwanda<br>
        admissions@cur-mis.ac.rw<br>
        +250 788 000 000<br>
        www.cur-mis.ac.rw
      </div>
    </div>

    <div class="accent-bar"></div>

    <!-- Reference & Date -->
    <div class="meta-row">
      <div class="ref-block">
        <div class="label">Letter Reference</div>
        <div class="value">{$ref}</div>
      </div>
      <div class="date-block">Date: <strong>{$issueDate}</strong></div>
    </div>

    <!-- Addressee -->
    <div class="addressee">
      <div class="to-label">Addressed To</div>
      <div class="full-name">{$fullName}</div>
      <div class="app-ref">Application No: {$appNumber} &nbsp;|&nbsp; {$email}{$phone}</div>
    </div>

    <!-- Title -->
    <div class="letter-title">
      <h2>Letter of Provisional Admission</h2>
      <div class="subtitle">Academic Year {$academicYear}{$intake}</div>
    </div>

    <!-- Body -->
    <div class="body-text">
      <p>Dear <strong>{$firstName}</strong>,</p>

      <p>
        On behalf of the <strong>{$institutionFull}</strong>, it is my great pleasure to
        inform you that, following a thorough review of your application and academic credentials,
        you have been granted <strong>Provisional Admission</strong> to the following programme:
      </p>

      <div class="program-box">
        <table>
          <tr>
            <td>Programme</td>
            <td>{$deptName}</td>
          </tr>
          {$facultyRow}
          <tr>
            <td>Academic Year</td>
            <td>{$academicYear}</td>
          </tr>
          {$intakeRow}
          {$expiresRow}
        </table>
      </div>

      <p>
        This offer of admission is <span class="highlight">provisional</span> and is subject to the
        successful verification of your original academic certificates and the fulfillment of all
        administrative and financial requirements stipulated by the institution.
      </p>

      <p>
        To secure your place, you must formally <strong>accept this offer</strong> via the Applicant
        Portal before the expiry date shown above. Failure to respond by the deadline will result in
        the automatic withdrawal of this offer.
      </p>

      <div class="conditions">
        <div class="cond-title">Conditions of Admission</div>
        <ol>
          <li>Submission and physical verification of all original academic documents.</li>
          <li>Payment of applicable registration and tuition fees by the due date.</li>
          <li>Compliance with all university regulations, policies, and Code of Conduct.</li>
          <li>This offer is non-transferable and applies to the stated programme and intake only.</li>
        </ol>
      </div>

      <p>
        Upon fulfilling all conditions and completing enrollment, you will be issued a permanent
        <strong>Student Registration Number</strong> along with further orientation information.
      </p>

      <p>
        We congratulate you on this achievement and look forward to welcoming you to our academic
        community. We are confident that your time at <strong>{$institutionFull}</strong> will be
        both rewarding and enriching.
      </p>
    </div>

    <!-- Signature -->
    <div class="signature-block">
      <div class="sig-left">
        <div class="sig-line">
          <span class="sig-e-signed">Electronically Signed</span>
        </div>
        <div class="sig-name">{$registrar}</div>
        <div class="sig-title">{$registrarTitle} &mdash; {$appName}</div>
      </div>
      <div class="seal-box">
        <div class="seal-circle">
          <div style="font-size:7pt;color:#9ca3af;text-align:center;font-family:Arial,sans-serif;text-transform:uppercase;line-height:1.4;">OFFICIAL<br>SEAL</div>
        </div>
        <div class="seal-text">{$appName}</div>
        <div class="seal-verify">REF: {$ref}</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="letter-footer">
      {$institutionFull} &mdash; Innovating Excellence in Higher Education
    </div>

  </div>
</div>
</body>
</html>
HTML;
    }

    /**
     * Output a PDF to the browser (Content-Type: application/pdf).
     * Requires dompdf/dompdf in vendor. Falls back to HTML if unavailable.
     */
    public static function streamPdf(array $data, string $filename = 'admission-letter.pdf'): void
    {
        $html = self::buildHtml($data);

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

        // Fallback: serve HTML with print-as-PDF instruction
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    /**
     * Return PDF binary string (for email attachments).
     * Returns null if dompdf is not available.
     */
    public static function renderPdfBinary(array $data): ?string
    {
        if (!class_exists('\Dompdf\Dompdf')) {
            return null;
        }

        $html    = self::buildHtml($data);
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
