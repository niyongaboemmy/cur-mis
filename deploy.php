<?php
/**
 * Deployment Script - Auto-pull and rebuild on demand
 *
 * Access: https://cur.ac.rw/umis/deploy.php?token=YOUR_SECRET_TOKEN
 *
 * IMPORTANT: Change TOKEN value below to something secret!
 */

define('DEPLOY_TOKEN', 'deploy_secret_2026_change_me');
define('PROJECT_ROOT', __DIR__);

// Security: Verify token
$token = $_GET['token'] ?? '';
if ($token !== DEPLOY_TOKEN) {
    http_response_code(403);
    die(json_encode(['error' => 'Unauthorized', 'status' => 'FAILED']));
}

// Set content type
header('Content-Type: application/json');

$output = [];
$success = true;

try {
    // Step 1: Git pull
    $output[] = ['step' => 'git pull', 'status' => 'running'];
    $cmd = "cd " . escapeshellarg(PROJECT_ROOT) . " && git pull origin main 2>&1";
    $result = shell_exec($cmd);
    $output[] = ['step' => 'git pull', 'status' => 'done', 'output' => trim($result)];

    // Step 2: Frontend build
    $output[] = ['step' => 'npm install', 'status' => 'running'];
    $cmd = "cd " . escapeshellarg(PROJECT_ROOT . '/frontend') . " && npm install 2>&1";
    $result = shell_exec($cmd);
    $output[] = ['step' => 'npm install', 'status' => 'done', 'output' => trim($result)];

    // Step 3: Build
    $output[] = ['step' => 'npm run build', 'status' => 'running'];
    $cmd = "cd " . escapeshellarg(PROJECT_ROOT . '/frontend') . " && npm run build 2>&1";
    $result = shell_exec($cmd);
    $output[] = ['step' => 'npm run build', 'status' => 'done', 'output' => trim($result)];

    // Step 4: Verify build
    if (file_exists(PROJECT_ROOT . '/frontend/dist/index.html')) {
        $output[] = ['step' => 'verify build', 'status' => 'success', 'message' => 'dist/index.html found'];
    } else {
        throw new Exception('Build failed: dist/index.html not found');
    }

    echo json_encode([
        'status' => 'SUCCESS',
        'message' => 'Deployment completed successfully',
        'steps' => $output,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'FAILED',
        'error' => $e->getMessage(),
        'steps' => $output,
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}
