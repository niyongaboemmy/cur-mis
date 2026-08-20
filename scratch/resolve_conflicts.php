<?php
$files = [
    'backend/app/Controllers/UrubutoPayController.php',
    'backend/app/Services/UrubutoPayService.php',
    'backend/app/Middleware/UrubutoPayWebhookMiddleware.php',
];

foreach ($files as $file) {
    $path = __DIR__ . '/../' . $file;
    if (!file_exists($path)) {
        echo "MISSING: $path\n";
        continue;
    }
    $contents = file_get_contents($path);
    $pattern = '/<<<<<<< HEAD.*?=======\r?\n(.*?)>>>>>>> emmy\/emmy\r?\n/s';
    $updated = preg_replace($pattern, '$1', $contents);
    if ($updated === null) {
        echo "PATTERN FAIL: $file\n";
        continue;
    }
    if ($updated === $contents) {
        echo "NO CHANGE: $file\n";
        continue;
    }
    file_put_contents($path, $updated);
    echo "UPDATED: $file\n";
}
