<?php
/**
 * POST /api/callback.php
 * UrubutoPay payment callback endpoint.
 *
 * UrubutoPay authenticates each callback by sending the Bearer token it
 * received from POST /api/token.php. The token guard in Rest.php validates it
 * against api_authorization before this handler runs.
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->claimCallback($input);
