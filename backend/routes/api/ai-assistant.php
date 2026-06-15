<?php

declare(strict_types=1);

use App\Controllers\AiAssistantController;
use App\Middleware\AuthMiddleware;

/**
 * AI Assistant — chat endpoint.
 * Authenticated users only (any role); no special permission required.
 */
$router->group('/api/ai', function ($router) {
    $router->post('/chat', [AiAssistantController::class, 'chat']);
}, [AuthMiddleware::class]);
