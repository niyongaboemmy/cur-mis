<?php
// Simple PHP dev server for the backend
// Run with: php backend-dev-server.php
// Listens on http://localhost:9000

$serverUrl = "127.0.0.1:9000";
echo "Starting PHP development server at http://$serverUrl\n";
echo "Backend API will be available at http://localhost:9000/api/*\n";
echo "Press Ctrl+C to stop.\n\n";

chdir(__DIR__ . '/backend/public');
passthru('php -S ' . $serverUrl);
?>
