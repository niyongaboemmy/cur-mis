<?php

declare(strict_types=1);

use App\Controllers\TranscriptController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/transcripts', function ($router) {
    // Admin: list and manage all requests
    $router->group('', function ($r) {
        $r->get('',                 [TranscriptController::class, 'list']);
        $r->put('/:id/review',      [TranscriptController::class, 'review']);
        $r->put('/:id/dispatch',    [TranscriptController::class, 'dispatch']);
    }, [new PermissionMiddleware(Permissions::MANAGE_TRANSCRIPT_REQUESTS)]);

    // Student self-service
    $router->group('/my', function ($r) {
        $r->get('',  [TranscriptController::class, 'myRequests']);
        $r->post('', [TranscriptController::class, 'create']);
    }, [new PermissionMiddleware(Permissions::ACCESS_STUDENT_PORTAL)]);
}, [AuthMiddleware::class]);
