<?php
/**
 * POST /api/token.php
 * Claim a bearer token. No Authorization header required.
 *
 * Body: { "user_name": "bk_csgd", "password": "..." }
 */
define('SKIP_TOKEN_CHECK', true);
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->claimtoken($input);
