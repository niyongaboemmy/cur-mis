<?php

declare(strict_types=1);

use App\Controllers\PublicController;
use App\Middleware\RateLimitMiddleware;

/**
 * Public, unauthenticated endpoints (no AuthMiddleware) — used by the open
 * student-card verification page that the QR code on a printed card opens.
 */
$router->get('/api/public/student-verify', [PublicController::class, 'verifyStudent']);
$router->get('/api/public/student-photo',  [PublicController::class, 'studentPhoto']);

// The page a transcript's QR code opens. Rate-limited: codes cannot be guessed,
// but there is no reason to let anyone try. Its own bucket, so verification
// checks from a shared campus IP never count against that IP's logins.
$router->get('/api/public/transcript-verify', [PublicController::class, 'verifyTranscript'], [new RateLimitMiddleware(60, 60, 'transcript-verify')]);
