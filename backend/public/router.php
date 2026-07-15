<?php
// Dev-only router for PHP's built-in server (php -S), used to run the RBAC
// regression suite without needing full MAMP/Apache running. Mirrors the
// .htaccess rewrite-everything-to-index.php rule.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;
if ($path !== '/' && file_exists($file) && !is_dir($file)) {
    return false;
}
require __DIR__ . '/index.php';
