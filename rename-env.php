<?php
// Simple utility to rename .env.production to .env
$source = '/home/curac/backend/.env.production';
$target = '/home/curac/backend/.env';

if (!file_exists($source)) {
    die('Source file not found: ' . $source);
}

if (rename($source, $target)) {
    echo 'ok';
} else {
    die('Failed to rename file');
}
?>