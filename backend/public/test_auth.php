<?php
// Quick diagnostic — DELETE this file after testing
$basePath = dirname(__DIR__);
require $basePath . '/vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable($basePath);
$dotenv->load();

$db = Core\Database::getInstance();

$username = 'bk_curac';
$password = '6523721wegyuw5327853278237gwd783';

$row = $db->fetchOne(
    'SELECT token, merchant_code, password AS stored_pw FROM api_authorization WHERE username = ? LIMIT 1',
    [$username]
);

header('Content-Type: text/plain');
echo "Row found: " . ($row ? 'YES' : 'NO') . "\n";
if ($row) {
    $stored = (string)$row['stored_pw'];
    echo "Stored pw length: " . strlen($stored) . "\n";
    echo "Input pw length:  " . strlen($password) . "\n";
    echo "Exact match:      " . ($password === $stored ? 'YES' : 'NO') . "\n";
    echo "MD5 match:        " . (md5($password) === $stored ? 'YES' : 'NO') . "\n";
    echo "SHA1 match:       " . (sha1($password) === $stored ? 'YES' : 'NO') . "\n";
    echo "SHA256 match:     " . (hash('sha256', $password) === $stored ? 'YES' : 'NO') . "\n";
    echo "Stored hex:       " . bin2hex($stored) . "\n";
    echo "Input hex:        " . bin2hex($password) . "\n";
    echo "Token preview:    " . substr((string)$row['token'], 0, 30) . "\n";
}
