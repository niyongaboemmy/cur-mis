<?php

declare(strict_types=1);

use App\Controllers\SearchController;
use App\Middleware\AuthMiddleware;

/**
 * Global (deep) search — every authenticated user can call this; per-entity
 * results are filtered inside SearchController based on the caller's own
 * permissions, since a single user may be allowed some entities and not
 * others (same OR-permission shape used by the sidebar/nav).
 */
$router->group('/api/search', function ($router) {
    $router->get('', [SearchController::class, 'query']);
}, [AuthMiddleware::class]);
