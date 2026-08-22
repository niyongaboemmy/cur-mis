<?php
/**
 * Development server router for PHP built-in server
 * Start with: php dev-server.php
 * This properly routes /api/* requests through public/index.php
 */

$rootPath = __DIR__;
$publicPath = $rootPath . '/public';

// Get the requested URI (without query string)
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$queryString = parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);

// Remove the leading slash
$uri = ltrim($uri, '/');

// If requesting a file or directory that exists in public, serve it directly
$filePath = $publicPath . '/' . $uri;
if (file_exists($filePath) && is_file($filePath)) {
    return false; // Let PHP's built-in server serve the file
}

// Otherwise, route everything through public/index.php
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $publicPath . '/index.php';
$_SERVER['REQUEST_URI'] = '/' . $uri . ($queryString ? '?' . $queryString : '');
$_SERVER['DOCUMENT_ROOT'] = $publicPath;

// Set PATH_INFO for the router to parse
$_SERVER['PATH_INFO'] = '/' . $uri;

require $publicPath . '/index.php';
?>
