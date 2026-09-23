<?php

declare(strict_types=1);

/**
 * SMTP diagnostic — sends one test message and prints the full SMTP conversation.
 *
 * Usage:
 *   php scripts/test_mail.php                       # sends to TEST_MAIL_TO or the default below
 *   php scripts/test_mail.php someone@example.com   # override recipient
 *
 * Run it on the cPanel server (not just locally) — the outbound path that is
 * failing is the server's, so that is where the answer is.
 */

define('BASE_PATH', dirname(__DIR__));
require BASE_PATH . '/vendor/autoload.php';

// Load .env.production by default (the file the cPanel deploy actually uses);
// override with:  php scripts/test_mail.php <recipient> <env-file>
$envFile = $argv[2] ?? '.env.production';
if (!is_file(BASE_PATH . '/' . $envFile)) {
    $envFile = '.env';
}
echo "Loading env from: {$envFile}\n";
Dotenv\Dotenv::createImmutable(BASE_PATH, $envFile)->load();

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$to = $argv[1] ?? ($_ENV['TEST_MAIL_TO'] ?? 'emmanuelniyongabo44@gmail.com');

echo "─────────────────────────────────────────────\n";
echo " SMTP test\n";
echo "─────────────────────────────────────────────\n";
echo " HOST      : " . ($_ENV['MAIL_HOST'] ?? '(unset)') . "\n";
echo " PORT      : " . ($_ENV['MAIL_PORT'] ?? '(unset)') . "\n";
echo " ENCRYPTION: " . ($_ENV['MAIL_ENCRYPTION'] ?? '(unset)') . "\n";
echo " USERNAME  : " . ($_ENV['MAIL_USERNAME'] ?? '(unset)') . "\n";
echo " FROM      : " . ($_ENV['MAIL_FROM_ADDRESS'] ?? '(unset)') . "\n";
echo " SSL_BYPASS: " . ($_ENV['MAIL_SSL_BYPASS'] ?? '(unset)') . "\n";
echo " TO        : {$to}\n";
echo "─────────────────────────────────────────────\n\n";

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->SMTPDebug  = 3;                       // full client<->server transcript
    $mail->Debugoutput = 'echo';
    $mail->Host       = $_ENV['MAIL_HOST'] ?? '';
    $mail->Port       = (int)($_ENV['MAIL_PORT'] ?? 587);
    $mail->SMTPAuth   = true;
    $mail->Username   = $_ENV['MAIL_USERNAME'] ?? '';
    $mail->Password   = $_ENV['MAIL_PASSWORD'] ?? '';
    $mail->SMTPSecure = $_ENV['MAIL_ENCRYPTION'] ?? PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout    = 15;

    if (($_ENV['MAIL_SSL_BYPASS'] ?? 'false') === 'true') {
        $mail->SMTPOptions = ['ssl' => [
            'verify_peer'       => false,
            'verify_peer_name'  => false,
            'allow_self_signed' => true,
        ]];
    }

    $mail->setFrom($_ENV['MAIL_FROM_ADDRESS'] ?? 'no-reply@localhost', $_ENV['MAIL_FROM_NAME'] ?? 'Mail Test');
    $mail->addAddress($to);
    $mail->Subject = 'CUR-MIS SMTP test — ' . date('Y-m-d H:i:s');
    $mail->Body    = "This is a plain-text SMTP diagnostic sent at " . date('c') . " from " . gethostname() . ".";

    $ok = $mail->send();

    echo "\n─────────────────────────────────────────────\n";
    echo $ok ? "✅ send() returned TRUE — server ACCEPTED the message for delivery.\n"
             : "❌ send() returned FALSE.\n";
    echo "   ErrorInfo: " . ($mail->ErrorInfo ?: '(none)') . "\n";
} catch (Exception $e) {
    echo "\n─────────────────────────────────────────────\n";
    echo "❌ Exception: " . $e->getMessage() . "\n";
    echo "   ErrorInfo: " . $mail->ErrorInfo . "\n";
}

echo "\n";
echo "If the transcript shows the server rejecting `RCPT TO` with a 4xx code\n";
echo "(\"451 Temporary local problem - please try later\"), the message never\n";
echo "left the sending server — this is an Exim / hosting-provider problem,\n";
echo "not an application bug. Next checks ON THIS SERVER:\n";
echo "  grep 'nirerealphons\\|{$to}' /var/log/exim_mainlog | tail -40\n";
echo "  exim -bp                     # is anything stuck in the queue?\n";
echo "  nc -vz gmail-smtp-in.l.google.com 25   # is outbound port 25 blocked?\n";
echo "  WHM > Exim Configuration Manager > disable *recipient callout verification*\n";
