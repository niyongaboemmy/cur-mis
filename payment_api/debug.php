<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Show everything the server received
$body = file_get_contents('php://input');

echo json_encode([
    'method'       => $_SERVER['REQUEST_METHOD'],
    'headers'      => getallheaders(),
    'server_keys'  => array_filter(
        $_SERVER,
        fn($k) => str_starts_with($k, 'HTTP_') || in_array($k, ['CONTENT_TYPE','CONTENT_LENGTH']),
        ARRAY_FILTER_USE_KEY
    ),
    'body_raw'     => $body,
    'body_decoded' => json_decode($body, true),
], JSON_PRETTY_PRINT);
