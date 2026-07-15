<?php
/**
 * CUR-MIS API Router
 *
 * This file acts as a simple entry point for all API requests.
 * Routes like /umis/api/auth/login automatically map here due to .htaccess rewrite.
 *
 * Without this, Apache can't find the actual backend/public/index.php
 */

// Pass control to the actual backend router
require __DIR__ . '/backend/public/index.php';
