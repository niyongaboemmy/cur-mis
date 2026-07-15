<?php
/**
 * ============================================================================
 * CUR-MIS Unified API Router
 * ============================================================================
 *
 * This file handles ALL API requests and routes them to the backend.
 * It works for both:
 * - Production: https://cur.ac.rw/umis/api/*
 * - Local: http://localhost/cur-mis/api/*
 *
 * The .htaccess rewrites all /api/* requests to this file, which then
 * includes and executes the actual backend router.
 */

// Prevent direct execution checks
if (php_sapi_name() === 'cli') {
    die("CLI access not allowed\n");
}

// Get the request path
$request_uri = $_SERVER['REQUEST_URI'] ?? '/';
$request_method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Debug logging (remove in production after verifying)
error_log(sprintf(
    '[API Router] %s %s from %s',
    $request_method,
    $request_uri,
    $_SERVER['REMOTE_ADDR'] ?? 'unknown'
));

// Try multiple backend entry points to handle different server configs
$backend_paths = [
    // Standard structure: /umis/backend/public/index.php
    __DIR__ . '/backend/public/index.php',

    // Alternative structure: /backend/public/index.php at same level
    dirname(__DIR__) . '/backend/public/index.php',

    // For cPanel split layout: /home/user/backend/public/index.php
    str_replace('public_html', 'backend', dirname(__DIR__)) . '/public/index.php',
];

$backend_found = false;

foreach ($backend_paths as $path) {
    if (file_exists($path)) {
        error_log('[API Router] Found backend at: ' . $path);
        $backend_found = true;

        // Set up environment for backend
        $_SERVER['SCRIPT_FILENAME'] = $path;
        $_SERVER['SCRIPT_NAME'] = '/api-router.php';
        $_SERVER['PHP_SELF'] = '/api-router.php';

        // Change to backend directory for relative includes
        chdir(dirname($path));

        // Execute backend
        require $path;
        exit(0);
    }
}

// If we get here, backend wasn't found
http_response_code(500);
header('Content-Type: application/json');
echo json_encode([
    'success' => false,
    'message' => 'Backend configuration error: API router cannot locate backend entry point',
    'debug' => [
        'paths_checked' => $backend_paths,
        'request_uri' => $request_uri,
        'script_filename' => __FILE__,
    ]
]);

error_log('[API Router] ERROR: Backend not found at any of: ' . implode(', ', $backend_paths));
exit(1);
