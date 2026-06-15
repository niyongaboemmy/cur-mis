<?php
// Extracts a zip uploaded to the home root into a home subdirectory.
// Script is placed in a public_html subdir; DEPLOY_OFFSET traverses up to home.
// TOKEN, OFFSET, ZIP name, and DEST dir are injected via sed before upload.
if (($_GET['token'] ?? '') !== 'DEPLOY_TOKEN') { http_response_code(403); die('forbidden'); }
$home = realpath(__DIR__ . '/DEPLOY_OFFSET');
$zip  = $home . '/DEPLOY_ZIP_NAME';
$dest = $home . '/DEPLOY_DEST_DIR';
if (!is_dir($dest)) { mkdir($dest, 0755, true); }
$z = new ZipArchive;
if ($z->open($zip) === TRUE) {
    $z->extractTo($dest);
    $z->close();
    unlink($zip);
    unlink(__FILE__);
    echo 'ok';
} else {
    http_response_code(500);
    echo 'failed: ' . $z->getStatusString();
}
