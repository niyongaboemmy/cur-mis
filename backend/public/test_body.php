<?php
// Quick diagnostic — DELETE this file after testing
header('Content-Type: text/plain');
$ct = $_SERVER['CONTENT_TYPE'] ?? 'NONE';
$raw = file_get_contents('php://input');
$decoded = json_decode($raw, true);
echo "Content-Type: $ct\n";
echo "Raw body: $raw\n";
echo "Decoded: " . print_r($decoded, true) . "\n";
echo "user_name: " . ($decoded['user_name'] ?? 'MISSING') . "\n";
echo "password: " . ($decoded['password'] ?? 'MISSING') . "\n";
