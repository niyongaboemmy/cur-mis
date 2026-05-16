<?php
/**
 * POST /api/claimtoken.php
 * Body: { "user_name": "...", "password": "..." }
 * Returns: { token, merchant_code }
 */

ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Max-Age: 3600');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

ob_start();
require_once '../class/token.php';
ob_end_clean();

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Method Not Allowed', 'status' => 405]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (empty($data)) {
    http_response_code(400);
    echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Invalid or empty JSON body', 'status' => 400]);
    exit;
}

$api = new Rest();
$api->claimtoken($data);
