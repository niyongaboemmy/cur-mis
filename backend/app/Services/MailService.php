<?php

declare(strict_types=1);

namespace App\Services;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

class MailService
{
    private PHPMailer $mailer;

    public function __construct()
    {
        $this->mailer = new PHPMailer(true);

        // Server settings
        $driver = $_ENV['MAIL_DRIVER'] ?? 'smtp';
        if ($driver === 'smtp') {
            $this->mailer->isSMTP();
            $this->mailer->Host       = $_ENV['MAIL_HOST'] ?? 'mail.hts.rw';
            $this->mailer->SMTPAuth   = true;
            $this->mailer->Username   = $_ENV['MAIL_USERNAME'] ?? 'info@hts.rw';
            $this->mailer->Password   = $_ENV['MAIL_PASSWORD'] ?? '';
            $this->mailer->SMTPSecure = $_ENV['MAIL_ENCRYPTION'] ?? PHPMailer::ENCRYPTION_SMTPS;
            $this->mailer->Port       = (int)($_ENV['MAIL_PORT'] ?? 465);
            $this->mailer->SMTPDebug  = 0;
            // Short timeout — prevents requests from blocking when SMTP host is unreachable.
            $this->mailer->Timeout    = (int)($_ENV['MAIL_TIMEOUT'] ?? 6);

            // Bypass SSL for specific servers if requested in .env
            if (($_ENV['MAIL_SSL_BYPASS'] ?? 'false') === 'true') {
                $this->mailer->SMTPOptions = array(
                    'ssl' => array(
                        'verify_peer' => false,
                        'verify_peer_name' => false,
                        'allow_self_signed' => true
                    )
                );
            }
        }

        $fromAddress = $_ENV['MAIL_FROM_ADDRESS'] ?? 'info@hts.rw';
        $fromName    = $_ENV['MAIL_FROM_NAME'] ?? 'CUR UMS';
        $this->mailer->setFrom($fromAddress, $fromName);

        $replyTo = $_ENV['MAIL_REPLY_TO'] ?? '';
        if (!empty($replyTo)) {
            $this->mailer->addReplyTo($replyTo, 'No Reply');
        }
    }

    /**
     * Send an email.
     *
     * @param string|array $to Single email or array of ['email' => '...', 'name' => '...']
     * @param string $subject The email subject
     * @param string $body The HTML body of the email
     * @param string $altBody The plain text alternative body
     * @return bool True if the email was sent successfully
     */
    public function send(array|string $to, string $subject, string $body, string $altBody = ''): bool
    {
        try {
            $this->mailer->clearAddresses();
            $this->mailer->clearAttachments();

            if (is_array($to) && isset($to['email'])) {
                $this->mailer->addAddress($to['email'], $to['name'] ?? '');
            } elseif (is_string($to)) {
                $this->mailer->addAddress($to);
            }

            $this->mailer->isHTML(true);
            $this->mailer->Subject = $subject;
            $this->mailer->Body    = $body;
            $this->mailer->AltBody = $altBody ?: strip_tags($body);

            return (bool) $this->mailer->send();
        } catch (Exception $e) {
            error_log("Mailer Error: {$this->mailer->ErrorInfo}");
            return false;
        }
    }

    /**
     * Send an email with an in-memory binary attachment (e.g. PDF bytes).
     */
    public function sendWithAttachment(array|string $to, string $subject, string $body, string $altBody, string $binaryData, string $filename): bool
    {
        try {
            $this->mailer->clearAddresses();
            $this->mailer->clearAttachments();

            if (is_array($to) && isset($to['email'])) {
                $this->mailer->addAddress($to['email'], $to['name'] ?? '');
            } elseif (is_string($to)) {
                $this->mailer->addAddress($to);
            }

            $this->mailer->isHTML(true);
            $this->mailer->Subject = $subject;
            $this->mailer->Body    = $body;
            $this->mailer->AltBody = $altBody ?: strip_tags($body);

            // Attach from string
            $this->mailer->addStringAttachment($binaryData, $filename, 'base64', 'application/pdf');

            return (bool) $this->mailer->send();
        } catch (Exception $e) {
            error_log("Mailer Error (attachment): {$this->mailer->ErrorInfo}");
            return false;
        }
    }
}
