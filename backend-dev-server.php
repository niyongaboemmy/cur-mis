<?php
// Simple PHP dev server for the backend
// Run with: php backend-dev-server.php
// Listens on http://localhost:9000

$serverUrl = "127.0.0.1:9000";
echo "Starting PHP development server at http://$serverUrl\n";
echo "Backend API will be available at http://localhost:9000/api/*\n";
echo "Press Ctrl+C to stop.\n\n";

chdir(__DIR__ . '/backend/public');
// Spawn the server with the SAME interpreter that is running this script, not
// whatever `php` happens to be first on PATH. On macOS/MAMP those differ: the
// PATH php is often 8.5, where PDO::MYSQL_ATTR_FOUND_ROWS (core/Database.php)
// is deprecated — and ExceptionHandler promotes deprecations to exceptions, so
// every request 500s before it reaches a controller.
passthru(escapeshellarg(PHP_BINARY) . ' -S ' . $serverUrl);
?>
