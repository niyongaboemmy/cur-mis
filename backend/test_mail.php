<?php
require_once __DIR__ . '/vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

use App\Services\MailService;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

echo "Testing Mail Service with Debug enabled...\n";

// We'll create a manual test here to see debug output
$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->SMTPDebug = SMTP::DEBUG_SERVER;
    $mail->isSMTP();
    $mail->Host       = $_ENV['MAIL_HOST'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $_ENV['MAIL_USERNAME'];
    $mail->Password   = $_ENV['MAIL_PASSWORD'];
    $mail->SMTPSecure = $_ENV['MAIL_ENCRYPTION'];
    $mail->Port       = $_ENV['MAIL_PORT'];

    if ($_ENV['MAIL_SSL_BYPASS'] === 'true') {
        $mail->SMTPOptions = array(
            'ssl' => array(
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            )
        );
    }

    // Recipients
    $mail->setFrom($_ENV['MAIL_FROM_ADDRESS'], $_ENV['MAIL_FROM_NAME']);
    $mail->addAddress("niyongaboemmy@gmail.com");

    // Content
    $mail->isHTML(true);
    $mail->Subject = 'Test OTP Debug';
    $mail->Body    = 'Your OTP is 123456';

    $mail->send();
    echo "✅ Message has been sent\n";
} catch (Exception $e) {
    echo "🚨 Message could not be sent. Mailer Error: {$mail->ErrorInfo}\n";
}
