<?php

declare(strict_types=1);

namespace App\Helpers;

class EmailTemplateHelper
{
    /**
     * Generate a modern HTML email wrapper.
     */
    public static function wrap(string $title, string $content, string $preheader = ''): string
    {
        $appName = getenv('APP_NAME') ?: 'CurMis';

        return "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset='utf-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <title>$title</title>
            <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0; color: #111827; }
                .wrapper { width: 100%; table-layout: fixed; background-color: #f9fafb; padding-bottom: 40px; }
                .main { background-color: #ffffff; margin: 40px auto; width: 100%; max-width: 600px; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px; text-align: center; }
                .header-logo { color: #ffffff; font-weight: 800; font-size: 24px; letter-spacing: -0.025em; text-decoration: none; }
                .body { padding: 40px 32px; }
                .title { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 16px; line-height: 1.25; }
                .text { font-size: 16px; line-height: 1.6; color: #4b5563; margin-bottom: 24px; }
                .otp-container { background-color: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 32px 0; border: 1px dashed #d1d5db; }
                .otp-code { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 36px; font-weight: 800; color: #1e40af; letter-spacing: 0.25em; }
                .footer { padding: 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }
                .footer-text { font-size: 13px; color: #9ca3af; line-height: 1.5; }
                .button { display: inline-block; padding: 12px 24px; background-color: #1e40af; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
            </style>
        </head>
        <body>
            <div class='wrapper'>
                <div class='main'>
                    <div class='header'>
                        <a href='#' class='header-logo'>$appName</a>
                    </div>
                    <div class='body'>
                        <h1 class='title'>$title</h1>
                        <div class='text'>
                            $content
                        </div>
                    </div>
                    <div class='footer'>
                        <p class='footer-text'>
                            © " . date('Y') . " $appName. All rights reserved.<br>
                            This is an automated message, please do not reply.
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        ";
    }

    /**
     * Template for OTP verification.
     */
    public static function otpTemplate(string $name, string $otp, string $expiry = '10 minutes'): string
    {
        $safeName = htmlspecialchars($name);
        $content = "
            Hello $safeName,<br><br>
            Please use the verification code below to complete your sign-in process. 
            This code is valid for <strong>$expiry</strong>.
            <div class='otp-container'>
                <div class='otp-code'>$otp</div>
            </div>
            If you did not request this code, you can safely ignore this email.
        ";

        return self::wrap("Verification Code", $content);
    }

    /**
     * Template: application received confirmation sent to applicant.
     */
    public static function applicationReceivedTemplate(string $name, string $appNumber, string $programName, ?string $verificationCode = null): string
    {
        $safeName = htmlspecialchars($name);
        $safeAppNumber = htmlspecialchars($appNumber);
        $safeProgramName = htmlspecialchars($programName);

        $verificationHtml = "";
        if ($verificationCode) {
            $verificationHtml = "
                <div style='background-color: #fff7ed; border: 1px solid #ffedd5; border-radius: 12px; padding: 20px; margin: 24px 0;'>
                    <p style='margin: 0 0 10px 0; font-weight: 600; color: #9a3412;'>Action Required: Verification Code</p>
                    <p style='margin: 0 0 15px 0; font-size: 14px; color: #c2410c;'>Please use this code in the application portal to verify your submission:</p>
                    <div style='font-family: monospace; font-size: 32px; font-weight: 800; color: #ea580c; letter-spacing: 0.2em;'>$verificationCode</div>
                </div>
            ";
        }

        $content = "
            Hello $safeName,<br><br>
            Thank you for applying to <strong>$safeProgramName</strong>. Your application has been received and is currently under review.<br><br>
            <strong>Your Application Number:</strong>
            <div class='otp-container'>
                <div class='otp-code' style='font-size:24px;'>$safeAppNumber</div>
            </div>
            $verificationHtml
            You can use this number to track the status of your application on our application portal at any time.<br><br>
            The next step is to upload all required documents. Please log in to the portal and complete your document submission.
        ";
        return self::wrap("Application Received — {$safeAppNumber}", $content);
    }

    /**
     * Template: one or more documents rejected — applicant must re-upload.
     *
     * @param array $rejectedDocs  Array of ['type_name' => '...', 'verification_comment' => '...']
     */
    public static function documentsRejectedTemplate(string $name, string $appNumber, array $rejectedDocs, string $adminMessage = ''): string
    {
        $safeName = htmlspecialchars($name);
        $safeAppNumber = htmlspecialchars($appNumber);
        $safeAdminMessage = htmlspecialchars($adminMessage);

        $list = '';
        foreach ($rejectedDocs as $doc) {
            $typeName = htmlspecialchars($doc['type_name'] ?? 'Document');
            $notes = htmlspecialchars($doc['verification_comment'] ?? 'Please re-upload.');
            $list .= "<li style='margin-bottom:8px;'><strong>{$typeName}</strong>: {$notes}</li>";
        }

        $messageHtml = "";
        if ($safeAdminMessage) {
            $messageHtml = "
                <div style='background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 20px; margin: 24px 0; color: #991b1b;'>
                    <p style='margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase; font-size: 11px; tracking: 0.1em;'>Message from Admissions Office:</p>
                    <p style='margin: 0; font-size: 15px; line-height: 1.5;'>$safeAdminMessage</p>
                </div>
            ";
        }

        $content = "
            Hello $safeName,<br><br>
            We have reviewed the documents for your application <strong>$safeAppNumber</strong>.
            Unfortunately, some of your documents could not be accepted.
            $messageHtml
            <strong>Required Corrections:</strong>
            <ul style='color:#374151;line-height:1.8; margin-top: 15px;'>$list</ul>
            Please log in to the application portal and re-upload the affected documents.
            Once all required documents are verified, your application will proceed to the next stage.
        ";
        return self::wrap("Action Required: Documents Need Attention — {$safeAppNumber}", $content);
    }

    /**
     * Template: all required documents verified successfully.
     */
    public static function documentsVerifiedTemplate(string $name, string $appNumber): string
    {
        $safeName = htmlspecialchars($name);
        $safeAppNumber = htmlspecialchars($appNumber);
        $content = "
            Hello $safeName,<br><br>
            Great news! All required documents for your application <strong>$safeAppNumber</strong> have been successfully verified.<br><br>
            Your application will now be evaluated as part of the merit ranking process.
            You will be notified of the outcome once the merit list has been finalised.
        ";
        return self::wrap("Documents Verified — {$safeAppNumber}", $content);
    }

    /**
     * Template: formal admission offer sent to applicant.
     */
    public static function admissionOfferTemplate(
        string $name,
        string $appNumber,
        string $programName,
        string $offerRef,
        string $expiresAt,
        string $portalUrl
    ): string {
        $safeName = htmlspecialchars($name);
        $safeAppNumber = htmlspecialchars($appNumber);
        $safeProgramName = htmlspecialchars($programName);
        $safeOfferRef = htmlspecialchars($offerRef);
        $safeExpires = htmlspecialchars($expiresAt);
        $content = "
            Dear $safeName,<br><br>
            Congratulations! We are delighted to offer you admission to the
            <strong>$safeProgramName</strong> programme at our institution.<br><br>
            <strong>Offer Reference:</strong> $safeOfferRef<br>
            <strong>Application Number:</strong> $safeAppNumber<br>
            <strong>Offer Expires:</strong> $safeExpires<br><br>
            Please visit the application portal to accept or decline this offer before the expiry date:
            <div style='text-align:center;margin:32px 0;'>
                <a href='$portalUrl' class='button'>Respond to Offer</a>
            </div>
            If you have any questions, please contact our admissions office.<br><br>
            We look forward to welcoming you.
        ";
        return self::wrap("Congratulations — Admission Offer ({$safeOfferRef})", $content);
    }

    /**
     * Template: applicant has accepted the offer.
     */
    public static function offerAcceptedConfirmationTemplate(string $name, string $programName): string
    {
        $safeName = htmlspecialchars($name);
        $safeProgramName = htmlspecialchars($programName);
        $content = "
            Dear $safeName,<br><br>
            We are pleased to confirm that you have accepted the offer of admission to the
            <strong>$safeProgramName</strong> programme.<br><br>
            Our admissions team will contact you shortly with further instructions regarding
            your enrollment and registration. Please ensure you have all required documents ready.
        ";
        return self::wrap("Enrollment Confirmed — Welcome!", $content);
    }

    /**
     * Template: enrollment complete, student registration number issued.
     */
    public static function enrollmentCompleteTemplate(string $name, string $regNumber, string $programName): string
    {
        $safeName = htmlspecialchars($name);
        $safeRegNumber = htmlspecialchars($regNumber);
        $safeProgramName = htmlspecialchars($programName);
        $content = "
            Dear $safeName,<br><br>
            Your enrollment in the <strong>$safeProgramName</strong> programme is now complete.<br><br>
            <strong>Your Student Registration Number:</strong>
            <div class='otp-container'>
                <div class='otp-code' style='font-size:24px;'>$safeRegNumber</div>
            </div>
            Please keep this number safe — you will need it for all future correspondence with the institution.
            Welcome to the institution. We wish you a successful academic journey!
        ";
        return self::wrap("Welcome — Your Registration Number is {$safeRegNumber}", $content);
    }

    /**
     * Template for Password Reset.
     */
    public static function passwordResetTemplate(string $name, string $link): string
    {
        $safeName = htmlspecialchars($name);
        $content = "
            Hello $safeName,<br><br>
            We received a request to reset your password. Click the button below to choose a new one:
            <div style='text-align: center; margin: 32px 0;'>
                <a href='$link' class='button'>Reset Password</a>
            </div>
            Or copy and paste this link into your browser:<br>
            <span style='font-size: 12px; color: #9ca3af;'>$link</span>
            <br><br>
            This link will expire in 1 hour. If you didn't request a password reset, no further action is required.
        ";

        return self::wrap("Password Reset Request", $content);
    }
}
