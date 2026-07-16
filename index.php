<?php
/**
 * CUR-MIS Router
 *
 * Routes requests to either:
 * 1. Backend API (/api/*) - to backend/public/index.php
 * 2. Frontend - to frontend/dist/index.html
 */

$request_path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Remove /cur-mis prefix to get the actual request path
$base_path = '/cur-mis';
if (str_starts_with($request_path, $base_path)) {
    $request_path = substr($request_path, strlen($base_path));
}
if (empty($request_path)) {
    $request_path = '/';
}

// Check if it's an API request
if (str_starts_with($request_path, '/api/')) {
    // Route to backend API
    $_SERVER['REQUEST_URI'] = $request_path;
    $_SERVER['SCRIPT_NAME'] = '/backend/public/index.php';
    $_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/backend/public/index.php';
    $_SERVER['PHP_SELF'] = '/backend/public/index.php';

    // Include and execute the backend
    chdir(__DIR__ . '/backend/public');
    require __DIR__ . '/backend/public/index.php';
    exit;
}

// Check if it's a static file or asset
$file_path = __DIR__ . '/frontend/dist' . $request_path;

// If file exists and is not a directory, serve it
if (is_file($file_path)) {
    $mime_types = [
        'js'   => 'application/javascript; charset=UTF-8',
        'css'  => 'text/css; charset=UTF-8',
        'json' => 'application/json',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'svg'  => 'image/svg+xml',
        'html' => 'text/html; charset=UTF-8',
        'woff' => 'font/woff',
        'woff2'=> 'font/woff2',
        'ttf'  => 'font/ttf',
        'eot'  => 'application/vnd.ms-fontobject',
    ];

    $ext = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
    $mime = $mime_types[$ext] ?? 'application/octet-stream';

    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=31536000'); // 1 year for assets
    readfile($file_path);
    exit;
}

// For any other request, serve the frontend index.html
// This allows React Router to handle client-side routing
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
readfile(__DIR__ . '/frontend/dist/index.html');
