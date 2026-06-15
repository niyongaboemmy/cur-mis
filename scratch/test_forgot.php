<?php
/**
 * Quick test: hit the forgot-password endpoint via cURL to verify
 * the backend boots and processes the request properly.
 */

// Simulate what Apache would do — bootstrap the backend.
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REQUEST_URI']    = '/cur-mis/backend/public/api/auth/forgot-password';
$_SERVER['REMOTE_ADDR']    = '127.0.0.1';
$_SERVER['HTTP_ORIGIN']    = 'http://localhost:5173';

// Feed a JSON body
$inputJson = json_encode(['email' => 'faustinganzasheila@gmail.com']);

// We'll use cURL to hit the actual Apache endpoint instead
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => 'http://localhost/cur-mis/backend/public/api/auth/forgot-password',
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $inputJson,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Origin: http://localhost:5173',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error    = curl_error($ch);
curl_close($ch);

echo "HTTP Status: {$httpCode}\n";
if ($error) {
    echo "cURL Error: {$error}\n";
}
echo "Response:\n{$response}\n";
