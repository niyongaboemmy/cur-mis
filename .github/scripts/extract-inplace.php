<?php
// Extracts DEPLOY_ZIP_NAME into the same directory as this script, then self-destructs.
// TOKEN and ZIP name are injected via sed before upload.
if (($_GET['token'] ?? '') !== 'DEPLOY_TOKEN') { http_response_code(403); die('forbidden'); }
$zip = __DIR__ . '/DEPLOY_ZIP_NAME';
$z = new ZipArchive;
if ($z->open($zip) === TRUE) {
    $z->extractTo(__DIR__);
    $z->close();
    unlink($zip);
    unlink(__FILE__);
    echo 'ok';
} else {
    http_response_code(500);
    echo 'failed: ' . $z->getStatusString();
}
