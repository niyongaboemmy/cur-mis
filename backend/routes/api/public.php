<?php

declare(strict_types=1);

use App\Controllers\PublicController;

/**
 * Public, unauthenticated endpoints (no AuthMiddleware) — used by the open
 * student-card verification page that the QR code on a printed card opens.
 */
$router->get('/api/public/student-verify', [PublicController::class, 'verifyStudent']);
$router->get('/api/public/student-photo',  [PublicController::class, 'studentPhoto']);
